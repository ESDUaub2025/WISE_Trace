import { readFile } from 'node:fs/promises';
import { authenticate, cors, json } from '../_shared/http.mjs';
import ExcelJS from 'exceljs';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { z } from 'zod';
import { TZDate } from '@date-fns/tz';
function midnight(date, extraDays = 0) {
  const [y, m, d] = date.split('-').map(Number);
  return new TZDate(y, m - 1, d + extraDays, 0, 0, 0, 'Asia/Beirut').toISOString();
}
const schema = z.object({
  status_filter: z.string().max(40).optional(),
  product_filter: z.string().max(120).optional(),
  report: z.enum([
    'lot',
    'operational_record',
    'deviation',
    'inventory_movement',
    'sale',
    'training_completion',
    'equipment',
    'audit_event',
    'recall',
    'impact',
    'traceability',
    'production_record',
    'calibration',
    'material_disposition',
    'data_quality',
    'cooperative_data',
  ]),
  format: z.enum(['csv', 'xlsx', 'pdf']),
  target: z.uuid().optional(),
  cooperative_id: z.uuid().optional(),
  region: z.string().max(120).optional(),
  lot_type: z.enum(['whey', 'ingredient', 'batch', 'packaging', 'packaging_material']).optional(),
  config_version_id: z.uuid().optional(),
  from_date: z.iso.date().default(`${new Date().getFullYear()}-01-01`),
  to_date: z.iso.date().default(new Date().toISOString().slice(0, 10)),
});
const text = (v) => (typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
export default async (request) => {
  if (request.method === 'OPTIONS') return json({});
  try {
    const { user, identity } = await authenticate(request);
    const body = schema.parse(await request.json());
    let rows = [];
    if (body.region && body.report !== 'impact') throw new Error('Region filter is supported for impact reports');
    if (body.config_version_id && body.report === 'impact')
      throw new Error('SOP filter is not supported for impact indicators');
    if (body.config_version_id && ['equipment', 'calibration'].includes(body.report))
      throw new Error('Equipment records are independent of SOP versions');
    if (body.from_date > body.to_date) throw new Error('Invalid reporting period');
    const member = await user.from('membership').select('roles,status').eq('user_id', identity.id).single();
    if (member.error || member.data.status !== 'active') throw new Error('Active account required');
    if (member.data.roles.includes('donor') && body.report !== 'impact')
      throw new Error('Donor reports are aggregate only');
    async function read(table, reference, period = false) {
      if (reference && reference.ids.length > 100) {
        const combined = [];
        for (let offset = 0; offset < reference.ids.length; offset += 100) {
          combined.push(
            ...(await read(
              table,
              { column: reference.column, ids: reference.ids.slice(offset, offset + 100) },
              period,
            )),
          );
          if (combined.length > 100000) throw new Error('Report is too large; choose a shorter period');
        }
        return combined;
      }
      const result = [];
      const dates = {
        training_completion: 'completed_at',
        equipment: 'calibrated_at',
        recall: 'started_at',
        audit_event: 'recorded_at',
      };
      for (let offset = 0; offset <= 100000; offset += 1000) {
        let query = user
          .from(table)
          .select('*')
          .order(table === 'membership' ? 'user_id' : table === 'packaging_detail' ? 'lot_id' : 'id')
          .range(offset, offset + 999);
        if (reference) {
          if (!reference.ids.length) return result;
          query = query.in(reference.column, reference.ids);
        }
        if (body.cooperative_id) {
          if (table === 'cooperative') query = query.eq('id', body.cooperative_id);
          else if (table === 'config_version') query = query.nullOrEq('cooperative_id', body.cooperative_id);
          else if (!['training_module', 'training_asset', 'kpi_definition'].includes(table))
            query = query.eq('cooperative_id', body.cooperative_id);
        }
        if (period) {
          const date = dates[table] ?? 'observed_at';
          query = query.gte(date, midnight(body.from_date)).lt(date, midnight(body.to_date, 1));
        }
        if (table === 'lot' && body.lot_type) query = query.eq('type', body.lot_type);
        if (table === 'operational_record' && body.report === 'calibration') query = query.eq('kind', 'calibration');
        if (
          body.config_version_id &&
          ['lot', 'operational_record'].includes(table) &&
          !['traceability', 'production_record'].includes(body.report)
        )
          query = query.eq('config_version_id', body.config_version_id);
        const response = await query;
        if (response.error) throw response.error;
        if (offset === 100000 && response.data.length) throw new Error('Report is too large; choose a shorter period');
        result.push(...response.data);
        if (response.data.length < 1000) return result;
      }
      return result;
    }
    if (body.report === 'impact') {
      const response = await user.rpc('impact_metrics_cohort', {
        from_date: body.from_date,
        to_date: body.to_date,
        cooperative_filter: body.cooperative_id ?? null,
        region_filter: body.region ?? null,
        status_filter: body.status_filter ?? null,
        product_filter: body.product_filter ?? null,
      });
      if (response.error) throw response.error;
      rows = response.data;
    } else if (['traceability', 'production_record'].includes(body.report)) {
      if (!body.target) throw new Error('Lot required');
      const target = await user
        .from('lot')
        .select('id,config_version_id,cooperative_id,observed_at')
        .eq('id', body.target)
        .single();
      if (target.error) throw target.error;
      if (body.cooperative_id && target.data.cooperative_id !== body.cooperative_id)
        throw new Error('Selected batch is outside the cooperative filter');
      if (
        Date.parse(target.data.observed_at) < Date.parse(midnight(body.from_date)) ||
        Date.parse(target.data.observed_at) >= Date.parse(midnight(body.to_date, 1))
      )
        throw new Error('Selected batch is outside the reporting period');
      if (body.config_version_id && target.data.config_version_id !== body.config_version_id)
        throw new Error('Selected batch does not use this SOP version');
      const back = await user.rpc('genealogy', { target: body.target, direction: 'back' }),
        forward = await user.rpc('genealogy', { target: body.target, direction: 'forward' });
      if (back.error || forward.error) throw back.error ?? forward.error;
      const ids = [...new Set([...back.data, ...forward.data].map((r) => r.id))];
      if (!ids.length) throw new Error('Lot unavailable');
      rows = await read('lot', { column: 'id', ids });
      rows = rows.map((row) => ({ record_type: 'lot', ...row }));
      const recordIds = [...ids];
      for (const table of [
        'operational_record',
        'deviation',
        'inventory_movement',
        'material_disposition',
        'decision',
        'amendment',
        'lot_state_event',
        'stage_event',
        'packaging_detail',
        'sale',
      ]) {
        const found = await read(table, {
          column: table === 'sale' ? 'packaging_lot_id' : table === 'amendment' ? 'object_id' : 'lot_id',
          ids,
        });
        recordIds.push(
          ...found
            .filter((r) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(r.id)))
            .map((r) => String(r.id)),
        );
        rows.push(...found.map((r) => ({ record_type: table, ...r })));
      }
      const allocations = await read('consumption', { column: 'output_lot_id', ids });
      recordIds.push(...allocations.map((row) => String(row.id)));
      rows.push(...allocations.map((row) => ({ record_type: 'consumption', ...row })));
      rows.push(
        ...(await read('attachment', { column: 'record_id', ids: recordIds })).map((row) => ({
          record_type: 'attachment',
          ...row,
        })),
        ...(await read('audit_event', { column: 'object_id', ids: recordIds })).map((row) => ({
          record_type: 'audit_event',
          ...row,
        })),
      );
    } else if (body.report === 'cooperative_data') {
      if (!member.data.roles.some((role) => ['manager', 'admin', 'food_safety'].includes(role)))
        throw new Error('Cooperative export permission required');
      const configurations = await read('config_version'),
        configurationIds = configurations.map((row) => String(row.id));
      const modules = await read('training_module', { column: 'config_version_id', ids: configurationIds });
      const assets = await read('training_asset', { column: 'config_version_id', ids: configurationIds });
      for (const table of [
        'cooperative',
        'membership',
        'supplier',
        'lot',
        'consumption',
        'inventory_movement',
        'operational_record',
        'deviation',
        'packaging_detail',
        'sale',
        'equipment',
        'recall',
        'recall_action',
        'attachment',
        'amendment',
        'decision',
        'audit_event',
        'training_completion',
        'stage_event',
        'lot_state_event',
        'material_disposition',
        'kpi_definition',
      ])
        rows.push(...(await read(table)).map((row) => ({ record_type: table, ...row })));
      for (const [table, items] of [
        ['config_version', configurations],
        ['training_module', modules],
        ['training_asset', assets],
      ])
        rows.push(...items.map((row) => ({ record_type: table, ...row })));
    } else if (body.report === 'data_quality') {
      const response = await user.rpc('operational_dashboard', {
        from_date: body.from_date,
        to_date: body.to_date,
        cooperative_filter: body.cooperative_id ?? null,
      });
      if (response.error) throw response.error;
      rows = response.data.cooperatives.map((row) => ({
        cooperative: row.name,
        region: row.region,
        warnings_overridden: row.warnings_overridden,
        late_records: row.late_records,
        sync_conflicts: row.sync_conflicts,
        stale_devices: row.stale_devices,
        open_deviations: row.open_deviations,
      }));
    } else {
      const table = body.report === 'calibration' ? 'operational_record' : body.report;
      let reference;
      if (body.config_version_id && !['lot', 'operational_record'].includes(table)) {
        const lotIds = (await read('lot')).map((r) => String(r.id));
        if (table === 'training_completion') {
          const modules = await user
            .from('training_module')
            .select('id')
            .eq('config_version_id', body.config_version_id);
          if (modules.error) throw modules.error;
          reference = { column: 'module_id', ids: modules.data.map((r) => r.id) };
        } else if (table === 'recall') reference = { column: 'trigger_lot_id', ids: lotIds };
        else if (table === 'sale') reference = { column: 'packaging_lot_id', ids: lotIds };
        else if (table === 'audit_event') {
          const objects = [...lotIds];
          for (const related of [
            'operational_record',
            'deviation',
            'sale',
            'inventory_movement',
            'material_disposition',
          ]) {
            const found = await read(related, {
              column: related === 'sale' ? 'packaging_lot_id' : 'lot_id',
              ids: lotIds,
            });
            objects.push(...found.map((r) => String(r.id)));
          }
          reference = { column: 'object_id', ids: objects };
        } else reference = { column: 'lot_id', ids: lotIds };
      }
      rows = await read(table, reference, true);
    }
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    let bytes;
    let type;
    if (body.format === 'csv') {
      const cell = (v) =>
        `"${text(v)
          .replace(/^[=+@-]/, "'$&")
          .replaceAll('"', '""')}"`;
      bytes =
        '\uFEFF' +
        [columns.map(cell).join(','), ...rows.map((row) => columns.map((key) => cell(row[key])).join(','))].join(
          '\r\n',
        );
      type = 'text/csv;charset=utf-8';
    } else if (body.format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('WISE');
      sheet.columns = columns.map((key) => ({ header: key, key, width: 24 }));
      for (const row of rows) sheet.addRow(Object.fromEntries(columns.map((key) => [key, text(row[key])])));
      sheet.getRow(1).font = { bold: true };
      bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
      type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      const pdf = await PDFDocument.create();
      pdf.registerFontkit(fontkit);
      const fontBytes = await readFile(new URL('../_shared/plex-arabic.ttf', import.meta.url));
      const font = await pdf.embedFont(fontBytes, { subset: false });
      let page = pdf.addPage([595, 842]);
      let y = 800;
      const line = (value, size = 9) => {
        const chunks = value.match(/.{1,85}/gu) ?? [''];
        for (const chunk of chunks) {
          if (y < 45) {
            page = pdf.addPage([595, 842]);
            y = 800;
          }
          page.drawText(chunk, { x: 35, y, size, font, color: rgb(0.18, 0.24, 0.15) });
          y -= size + 6;
        }
      };
      line(`WISE — ${body.report}`, 16);
      line(`${body.from_date} — ${body.to_date}`);
      for (const row of rows) {
        y -= 10;
        for (const key of columns) if (row[key] !== undefined) line(`${key}: ${text(row[key])}`);
      }
      bytes = await pdf.save();
      type = 'application/pdf';
    }
    return new Response(bytes, {
      headers: {
        ...cors,
        'Content-Type': type,
        'Content-Disposition': `attachment; filename="wise-${body.report}.${body.format}"`,
      },
    });
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error
            ? e.message
            : typeof e === 'object' && e !== null && 'message' in e
              ? String(e.message)
              : 'Report failed',
      },
      400,
    );
  }
};
