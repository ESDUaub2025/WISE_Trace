import { isOnline } from '../connectivity/connectivity';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { api, demo } from '../lib/api';
import type { Snapshot, Row } from '../lib/data';
import type { Lot } from '../lib/domain';
import { Label, Status } from './FullWorkspace';
export function ArchiveSearch({ data, onOpen }: { data: Snapshot; onOpen: (data: Snapshot, lot: Lot) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(''),
    [matches, setMatches] = useState<Lot[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function open(lot: Lot) {
    setBusy(true);
    setError('');
    try {
      if (!api || !isOnline()) throw new Error('onlineRequired');
      const [back, forward] = await Promise.all([
        api.rpc('genealogy', { target: lot.id, direction: 'back' }),
        api.rpc('genealogy', { target: lot.id, direction: 'forward' }),
      ]);
      if (back.error || forward.error) throw back.error ?? forward.error;
      const ids = [...new Set([...back.data, ...forward.data].map((row: Row) => String(row.id)))];
      if (ids.length > 500) throw new Error('archiveTooLarge');
      async function read(table: string, column: string, targets: string[]) {
        const rows: Row[] = [];
        for (let offset = 0; offset < targets.length; offset += 100) {
          for (let page = 0; ; page++) {
            const reply = await api!
              .from(table)
              .select('*')
              .in(column, targets.slice(offset, offset + 100))
              .order(table === 'packaging_detail' ? 'lot_id' : 'id')
              .range(page * 1000, page * 1000 + 999);
            if (reply.error) throw reply.error;
            rows.push(...reply.data);
            if (reply.data.length < 1000) break;
            if (rows.length > 100000) throw new Error('archiveTooLarge');
          }
        }
        return rows;
      }
      const lots = (await read('lot', 'id', ids)) as unknown as Lot[];
      const tables: [keyof Snapshot, string, string][] = [
        ['records', 'operational_record', 'lot_id'],
        ['stageEvents', 'stage_event', 'lot_id'],
        ['deviations', 'deviation', 'lot_id'],
        ['packaging', 'packaging_detail', 'lot_id'],
        ['sales', 'sale', 'packaging_lot_id'],
        ['dispositions', 'material_disposition', 'lot_id'],
        ['edges', 'consumption', 'output_lot_id'],
        ['configs', 'config_version', 'id'],
      ];
      const result = structuredClone(data);
      for (const [key, table, column] of tables) {
        const targetIds = key === 'configs' ? [...new Set(lots.map((l) => l.config_version_id))] : ids;
        const rows = await read(table, column, targetIds);
        (result[key] as unknown[]) = rows;
      }
      const balance = await api.rpc('snapshot_balances', { targets: ids });
      if (balance.error) throw balance.error;
      for (const l of lots) l.available = Number(balance.data.find((b: Row) => b.id === l.id)?.available ?? 0);
      result.lots = lots;
      result.materialBalances = balance.data.filter((b: Row) => b.material).map((b: Row) => b.material);
      const recordIds = [...ids, ...result.records.map((r) => String(r.id))];
      const [attachments, audits] = await Promise.all([
        read('attachment', 'record_id', recordIds),
        read('audit_event', 'object_id', recordIds),
      ]);
      result.attachments = attachments;
      result.audits = audits;
      onOpen(result, lots.find((l) => l.id === lot.id) ?? lot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="card">
      <summary>{t('archiveSearch')}</summary>
      <p>{t('archiveSearchHelp')}</p>
      <form
        className="record-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            if (!api || demo || !isOnline()) throw new Error('onlineRequired');
            const reply = await api
              .from('lot')
              .select('*')
              .ilike('code', '%' + query.replace(/[%_]/g, '') + '%')
              .order('observed_at', { ascending: false })
              .limit(20);
            if (reply.error) throw reply.error;
            setMatches(reply.data as Lot[]);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {t('code')}
          <input value={query} onChange={(e) => setQuery(e.target.value)} required minLength={3} />
        </label>
        <Button disabled={busy || demo || !isOnline()}>{t('search')}</Button>
      </form>
      <div className="task-list">
        {matches.map((l) => (
          <button key={l.id} className="task-card" disabled={busy} onClick={() => void open(l)}>
            <Label code={l.code} />
            <Status value={l.state} />
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error-box">
          {t(error)}
        </p>
      )}
    </details>
  );
}
