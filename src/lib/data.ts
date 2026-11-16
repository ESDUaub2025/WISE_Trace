import { flushDiagnostics, captureDiagnostic } from './telemetry';
import { TZDate } from '@date-fns/tz';
import {
  incrementalSnapshot,
  scopedReadClient,
  commitSnapshot,
  withSnapshotLock,
  checkSnapshotAccess,
} from './snapshot-sync';
import { flushNotificationReads } from '../full/notifications';
import { db, enqueue, syncOutbox, revokeLocalDevice, type OutboxEntry } from '../offline/db';
import { fileCanWrite, fileTesting, readFileWorkspace, sendFileAction } from '../testing/file-backend';
import { settleTestBatches } from '../testing/batch-status';
import { emptyTestWorkspace } from '../testing/empty-workspace';
import { ApiError, demo, api } from './api';
import { isOnline } from '../connectivity/connectivity';
import { getDevice } from '../session/device';
import { rememberLimits } from '../session/session-policy';
import { syncStatus } from '../offline/sync-status';
import { signOfflineDecision } from '../session/offline-signoff';
import { localProductionTasks, lotConfig } from './schedules';
import { introTrainingContent, introAssessment } from './learning-demo';
import { demoConfig, demoEdges, demoIdentity, demoLots, demoSuppliers, demoTasks, ids } from './demo';

export { getDevice };
import {
  actionClass,
  envelopeSchema,
  type Config,
  type Envelope,
  type Identity,
  type Lot,
  type Supplier,
  type Task,
} from './domain';
export interface Snapshot {
  sharedActionIds?: string[];
  setupPending?: boolean;
  materialBalances: Row[];
  dispositions: Row[];
  trainingHistory: Row[];
  trainingAssets: Row[];
  cooperatives: Row[];
  lots: Lot[];
  suppliers: Supplier[];
  tasks: Task[];
  config: Config;
  records: Row[];
  stageEvents: Row[];
  attachments: Row[];
  deviations: Row[];
  equipment: Row[];
  training: Row[];
  completions: Row[];
  packaging: Row[];
  sales: Row[];
  recalls: Row[];
  notifications: Row[];
  audits: Row[];
  members: Row[];
  devices: Row[];
  configs: Row[];
  edges: { input_lot_id: string; output_lot_id: string; quantity?: number; unit?: string }[];
}
export type Row = Record<string, unknown> & { id?: string };
/**
 * The person's data: fresh from the server when it is reachable, otherwise what is stored on the device.
 * Records saved on the device but not sent yet are always layered on top (see overlay).
 */
export async function snapshot(identity: Identity): Promise<Snapshot> {
  return withSnapshotLock(identity.id, async () => {
    try {
      return await readSnapshot(identity);
    } catch (error) {
      // The connection dropped in the middle of a download: keep working from the device.
      const cached = (await db.cache.get(`snapshot:${identity.id}`))?.value as Snapshot | undefined;
      if (cached && error instanceof Error && error.message === 'serverUnreachable') return overlay(cached, identity);
      throw error;
    }
  });
}
async function readSnapshot(identity: Identity): Promise<Snapshot> {
  const key = `snapshot:${identity.id}`;
  let result: Snapshot;
  let replicaGeneration: string | undefined;
  if (fileTesting) {
    const { actions, members } = await readFileWorkspace();
    result = await overlay(
      emptyTestWorkspace(members),
      identity,
      actions.map((envelope, sequence) => ({
        id: envelope.id,
        envelope,
        sequence,
        attempts: 0,
        status: 'synced',
      })),
    );
    result.sharedActionIds = actions.map((action) => action.id);
  } else if (demo)
    result = {
      materialBalances: [],
      dispositions: [],
      trainingHistory: [],
      trainingAssets: [],
      cooperatives: [{ id: ids.coop, name: 'Akkar Harvest', code: 'AKR01', region: 'Akkar', status: 'active' }],
      lots: demoLots,
      suppliers: demoSuppliers,
      tasks: demoTasks,
      config: demoConfig,
      records: [],
      stageEvents: [],
      attachments: [],
      deviations: [],
      equipment: [
        { id: 'eq-1', label: 'PH-02', type: 'pH meter', next_due_at: new Date(Date.now() + 86400000).toISOString() },
      ],
      training: [
        {
          id: '70000000-0000-4000-8000-000000000001',
          module_key: 'gmp',
          version: 1,
          content: introTrainingContent,
          assessment: introAssessment,
        },
      ],
      completions: [],
      packaging: [],
      sales: [],
      recalls: [],
      notifications: [],
      audits: [],
      members: [{ ...demoIdentity }],
      devices: [{ id: ids.device, label: 'Cooperative phone 1' }],
      configs: [{ ...demoConfig }],
      edges: demoEdges,
    };
  else {
    const cached = (await db.cache.get(key))?.value as Snapshot | undefined;
    if (!isOnline()) {
      if (cached) return overlay(cached, identity);
      throw new Error('userNotCached');
    }
    if (!api) throw new Error('setup');
    const device = await getDevice();
    const client = await scopedReadClient(identity);
    const revocation = await client.from('device').select('revoked_at').eq('id', device).maybeSingle();
    if (revocation.data?.revoked_at) {
      await revokeLocalDevice();
      throw new Error('deviceRevoked');
    }
    const partnerScope = identity.roles.includes('partner') ? await client.from('cooperative').select('id') : null;
    if (partnerScope?.error) throw partnerScope.error;
    if (identity.roles.includes('donor') || (identity.roles.includes('partner') && !partnerScope?.data?.length)) {
      await checkSnapshotAccess(identity, client);
      const viewer: Snapshot = {
        materialBalances: [],
        dispositions: [],
        trainingHistory: [],
        trainingAssets: [],
        cooperatives: [],
        lots: [],
        suppliers: [],
        tasks: [],
        records: [],
        stageEvents: [],
        attachments: [],
        deviations: [],
        equipment: [],
        training: [],
        completions: [],
        packaging: [],
        sales: [],
        recalls: [],
        notifications: [],
        audits: [],
        members: [],
        devices: [],
        configs: [],
        edges: [],
        config: {
          id: '',
          placeholder: false,
          definition: {
            stages: [],
            checkpoints: [],
            whey_max_age_hours: 0,
            shelf_life_days: 0,
            multi_lot: false,
            blending_enabled: false,
            self_release: false,
            lab_before_release: false,
          },
        },
      };
      await db.cache.put({ key, value: viewer });
      return viewer;
    }
    const replica = await incrementalSnapshot(identity, client);
    const rows = replica.rows;
    replicaGeneration = replica.generation;
    const reads = await client
      .from('notification_receipt')
      .select('notification_id,read_at')
      .eq('user_id', identity.id);
    if (reads.error) throw reads.error;
    const configs = rows[15] as unknown as Config[];
    const config = configs
      .filter(
        (c) =>
          ((c as unknown as Row).cooperative_id == null ||
            (c as unknown as Row).cooperative_id === identity.cooperative_id) &&
          (c as unknown as Row).kind === 'sop' &&
          (c as unknown as Row).status === 'approved' &&
          Date.parse(String((c as unknown as Row).effective_at)) <= Date.now(),
      )
      .sort(
        (a, b) =>
          Number((b as unknown as Row).cooperative_id === identity.cooperative_id) -
            Number((a as unknown as Row).cooperative_id === identity.cooperative_id) ||
          Number((b as unknown as Row).version) - Number((a as unknown as Row).version),
      )[0];
    const setupDraft =
      !config && identity.roles.some((r) => ['admin', 'food_safety'].includes(r))
        ? configs.find((c) => (c as unknown as Row).status === 'draft' && (c as unknown as Row).kind === 'sop')
        : undefined;
    if (!config && !setupDraft && !identity.roles.includes('manager')) throw new Error('setup');
    const effectiveConfig: Config = config ??
      setupDraft ?? {
        id: '',
        placeholder: true,
        definition: {
          stages: [],
          checkpoints: [],
          whey_max_age_hours: 0,
          shelf_life_days: 0,
          multi_lot: false,
          blending_enabled: false,
          self_release: false,
          lab_before_release: false,
        },
      };
    const lots = rows[0] as unknown as Lot[];
    const byId = new Map<string, number>(
      replica.balanceIds === null ? [] : (cached?.lots ?? []).map((lot) => [lot.id, lot.available ?? 0]),
    );
    const materialById = new Map<string, Row>(
      replica.balanceIds === null ? [] : (cached?.materialBalances ?? []).map((row) => [String(row.id), row]),
    );
    const targets = replica.balanceIds ?? lots.map((lot) => lot.id);
    for (let offset = 0; offset < targets.length; offset += 500) {
      const ids = targets.slice(offset, offset + 500);
      for (const id of ids) {
        byId.delete(id);
        materialById.delete(id);
      }
      const reply = await client.rpc('snapshot_balances', { targets: ids });
      if (reply.error) throw new Error(reply.error.message);
      for (const row of reply.data as { id: string; available: number; material: Row | null }[]) {
        byId.set(row.id, Number(row.available));
        if (row.material) materialById.set(row.id, row.material);
      }
    }
    lots.forEach((lot) => {
      lot.available = byId.get(lot.id) ?? 0;
      lot.sync_status = 'synced';
    });
    const lotIds = new Set(lots.map((lot) => lot.id)),
      materialBalances = [...materialById.values()].filter((row) => lotIds.has(String(row.id)));
    result = {
      setupPending: !config,
      materialBalances,
      dispositions: rows[21],
      trainingHistory: rows[6],
      trainingAssets: rows[20],
      cooperatives: rows[19],
      lots,
      suppliers: rows[1] as unknown as Supplier[],
      tasks: rows[2] as unknown as Task[],
      records: rows[3],
      stageEvents: rows[17],
      attachments: rows[18],
      deviations: rows[4],
      equipment: rows[5],
      training: rows[6].filter(
        (module) =>
          module.config_version_id === effectiveConfig.id &&
          (String(module.effective_at) === '-infinity' || Date.parse(String(module.effective_at)) <= Date.now()) &&
          !rows[6].some(
            (newer) =>
              newer.module_key === module.module_key &&
              newer.config_version_id === module.config_version_id &&
              Number(newer.version) > Number(module.version) &&
              (String(newer.effective_at) === '-infinity' || Date.parse(String(newer.effective_at)) <= Date.now()),
          ),
      ),
      completions: rows[7],
      packaging: rows[8],
      sales: rows[9],
      recalls: rows[10],
      notifications: rows[11].map((row) => ({
        ...row,
        read_at: reads.data.find((read: Row) => read.notification_id === row.id)?.read_at ?? null,
      })),
      audits: rows[12],
      members: rows[13],
      devices: rows[14],
      configs: rows[15],
      edges: rows[16] as unknown as Snapshot['edges'],
      config: effectiveConfig,
    };
  }
  rememberLimits(identity.id, result.config.definition);
  await commitSnapshot(identity, result, replicaGeneration);
  return overlay(result, identity);
}
export async function overlay(data: Snapshot, identity: Identity, sharedEntries?: OutboxEntry[]) {
  const result = structuredClone(data);
  for (const read of await db.cache.where('key').startsWith(`notification-read:${identity.id}:`).toArray()) {
    const notification = result.notifications.find((row) => row.id === read.key.split(':').at(-1));
    if (notification) notification.read_at = read.value;
  }
  const entries =
    sharedEntries ??
    (await db.outbox
      .filter(
        (e) =>
          e.envelope.author_id === identity.id &&
          (demo || e.status !== 'synced') &&
          !data.sharedActionIds?.includes(e.id),
      )
      .toArray());
  entries.sort(
    (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0) || a.envelope.observed_at.localeCompare(b.envelope.observed_at),
  );
  for (const entry of entries) {
    const e = entry.envelope;
    const p = e.payload;
    if (fileTesting && e.action === 'testing_registry' && ['supplier', 'equipment'].includes(String(p.entity))) {
      const collection: Row[] = p.entity === 'supplier' ? (result.suppliers as unknown as Row[]) : result.equipment;
      const value = p.value as Record<string, unknown>;
      const row = { ...value, id: String(p.target), cooperative_id: e.cooperative_id };
      const index = collection.findIndex((item) => item.id === row.id);
      if (index === -1) collection.push(row);
      else collection[index] = row;
    }
    if (
      ['receipt', 'batch', 'packaging'].includes(e.action) &&
      (!fileTesting || entry.status !== 'conflict') &&
      !result.lots.some((l) => l.id === e.id)
    )
      result.lots.unshift({
        id: e.id,
        cooperative_id: e.cooperative_id,
        type: e.action === 'batch' ? 'batch' : e.action === 'packaging' ? 'packaging' : String(p.type),
        code: entry.code ?? `~${e.action === 'batch' ? 'KB' : 'WL'}-${e.id.slice(0, 6)}`,
        state: e.action === 'batch' ? 'draft' : 'received',
        unit: String(p.unit ?? 'kg'),
        initial_quantity: Number(p.quantity ?? 0),
        available: Number(p.quantity ?? 0),
        producer_id: e.author_id,
        device_id: e.device_id,
        config_version_id: e.config_version_id,
        observed_at: e.observed_at,
        generation_at: p.generation_at as string | undefined,
        supplier_id: p.supplier_id as string | undefined,
        stage:
          e.action === 'batch'
            ? (
                (result.configs.find((config) => config.id === e.config_version_id) as unknown as Config)?.definition ??
                result.config.definition
              ).stages[0]?.key
            : undefined,
        facts: (p.facts as Record<string, unknown>) ?? {},
        sync_status: entry.status,
      });
    if (
      e.action === 'receipt' &&
      entry.status !== 'conflict' &&
      !result.materialBalances.some((balance) => balance.id === e.id)
    )
      result.materialBalances.push({
        id: e.id,
        received: Number(p.quantity ?? 0),
        accepted: 0,
        rejected: 0,
        on_hold: 0,
        allocated: 0,
        disposed: 0,
        diverted: 0,
        lost: 0,
        measurement_difference: 0,
        remaining: Number(p.quantity ?? 0),
        valorized: 0,
        sync_status: entry.status,
      });
    if (
      (e.action === 'whey_decision' || (fileTesting && e.action === 'testing_review')) &&
      entry.status !== 'conflict'
    ) {
      const lot = result.lots.find((l) => l.id === p.lot_id);
      if (lot) {
        lot.state = String(p.outcome);
        lot.sync_status = entry.status;
        if (lot.generation_at && p.outcome === 'accepted')
          lot.expires_at = new Date(
            Date.parse(lot.generation_at) + lotConfig(result, lot).definition.whey_max_age_hours * 3600000,
          ).toISOString();
        const balance = result.materialBalances.find((row) => row.id === lot.id);
        if (balance) {
          for (const key of ['accepted', 'rejected', 'on_hold']) balance[key] = 0;
          balance[p.outcome === 'hold' ? 'on_hold' : String(p.outcome)] = Number(balance.received);
          balance.sync_status = entry.status;
        }
      }
      if (fileTesting && e.action === 'testing_review')
        result.records.push({
          id: e.id,
          lot_id: p.lot_id,
          kind: 'testing_review',
          observed_at: e.observed_at,
          author_id: e.author_id,
          payload: { reason: p.reason, outcome: p.outcome, test_only: true },
          sync_status: entry.status,
        });
    }
    if (fileTesting && e.action === 'testing_resolve' && entry.status !== 'conflict') {
      for (const issue of result.deviations.filter((d) => d.lot_id === p.lot_id)) issue.status = 'resolved';
      result.records.push({
        id: e.id,
        lot_id: p.lot_id,
        kind: 'testing_review',
        observed_at: e.observed_at,
        author_id: e.author_id,
        payload: { reason: p.reason, resolved: true, test_only: true },
        sync_status: entry.status,
      });
    }
    if (
      [
        'measurement',
        'checklist',
        'storage_inspection',
        'note',
        'sample',
        'lab',
        'calibration',
        'complaint',
        'handover',
      ].includes(e.action)
    )
      result.records.push({
        id: e.id,
        lot_id: p.lot_id,
        kind: e.action,
        definition_key: p.definition_key,
        payload: p.values ?? p,
        observed_at: e.observed_at,
        author_id: e.author_id,
        sync_status: entry.status,
      });
    if (e.action === 'checkpoint') {
      result.records.push({
        id: e.id,
        lot_id: p.lot_id,
        kind: e.action,
        definition_key: p.definition_key,
        payload: p.values,
        observed_at: e.observed_at,
        author_id: e.author_id,
        sync_status: entry.status,
      });
      if (entry.status !== 'conflict')
        result.tasks = result.tasks.filter(
          (task) => !(task.lot_id === p.lot_id && task.details.definition_key === p.definition_key),
        );
      // The WISE server opens a deviation for a check that did not pass. The testing file has no server,
      // so the same consequence is derived here: an open problem that must be resolved before release.
      if (fileTesting && entry.status !== 'conflict' && (p.values as Row | undefined)?.all_ok === false)
        result.deviations.push({
          id: `check:${e.id}`,
          lot_id: p.lot_id,
          source: 'checkpoint',
          definition_key: p.definition_key,
          status: 'open',
          observed_at: e.observed_at,
          author_id: e.author_id,
          sync_status: entry.status,
        });
    }
    if (e.action === 'stage' && entry.status !== 'conflict') {
      const lot = result.lots.find((l) => l.id === p.lot_id);
      if (lot) {
        lot.stage = String(p.next_stage);
        lot.state = 'in_production';
        result.stageEvents.push({
          id: e.id,
          lot_id: lot.id,
          stage: lot.stage,
          observed_at: e.observed_at,
          author_id: e.author_id,
        });
      }
    }
    if (e.action === 'handover' && entry.status !== 'conflict') {
      const lot = result.lots.find((l) => l.id === p.lot_id);
      if (lot) lot.facts.responsible_producer = p.next_producer;
    }
    if (e.action === 'abandon' && entry.status !== 'conflict') {
      const lot = result.lots.find((l) => l.id === p.lot_id);
      if (lot) {
        lot.state = 'rejected';
        lot.facts.abandoned = true;
        lot.sync_status = entry.status;
        result.records.push({
          id: e.id,
          lot_id: lot.id,
          kind: 'abandon',
          observed_at: e.observed_at,
          author_id: e.author_id,
          payload: { reason: p.reason },
          sync_status: entry.status,
        });
      }
    }
    if (e.action === 'deviation')
      result.deviations.push({ id: e.id, ...p, author_id: e.author_id, sync_status: entry.status });
    if (e.action === 'training' && entry.status !== 'conflict')
      result.completions.push({ id: e.id, user_id: e.author_id, ...p });
    if (e.action === 'packaging' && entry.status !== 'conflict') {
      const lot = result.lots.find((l) => l.id === e.id);
      if (lot) {
        lot.state = 'awaiting_review';
        lot.unit = 'unit';
        lot.initial_quantity = Number(p.package_count);
        lot.available = Number(p.package_count);
        const [year, month, day] = String(p.best_before).split('-').map(Number);
        lot.expires_at = new TZDate(year, month - 1, day + 1, 0, 0, 0, 'Asia/Beirut').toISOString();
        lot.facts = { ...p };
      }
      result.packaging ??= [];
      result.packaging.push({
        lot_id: e.id,
        batch_id: p.batch_id,
        package_type: p.package_type,
        size_kg: p.size_kg,
        package_count: p.package_count,
        mass_kg: Number(p.size_kg) * Number(p.package_count),
        best_before: p.best_before,
        storage_location: p.storage_location,
        label: p.label,
      });
      const batch = result.lots.find((l) => l.id === p.batch_id);
      if (batch) batch.state = 'awaiting_review';
      const material = result.lots.find((l) => l.id === p.packaging_material_id);
      if (material) material.available = (material.available ?? 0) - Number(p.package_count);
      result.edges.push(
        {
          input_lot_id: String(p.batch_id),
          output_lot_id: e.id,
          quantity: Number(p.package_count) * Number(p.size_kg),
          unit: 'kg',
        },
        {
          input_lot_id: String(p.packaging_material_id),
          output_lot_id: e.id,
          quantity: Number(p.package_count),
          unit: 'unit',
        },
      );
    }
    if (e.action === 'sale') {
      result.sales ??= [];
      result.sales.push({
        id: e.id,
        ...p,
        observed_at: e.observed_at,
        author_id: e.author_id,
        sync_status: entry.status,
      });
      if (entry.status !== 'conflict') {
        const lot = result.lots.find((l) => l.id === p.packaging_lot_id);
        if (lot) lot.available = (lot.available ?? 0) + (p.transaction_type === 'return' ? 1 : -1) * Number(p.quantity);
      }
    }
    if (e.action === 'movement' && entry.status !== 'conflict') {
      const lot = result.lots.find((l) => l.id === p.lot_id);
      if (lot) lot.available = (lot.available ?? 0) + Number(p.quantity);
    }
    if (e.action === 'material_disposition' && entry.status !== 'conflict') {
      const lot = result.lots.find((l) => l.id === p.lot_id);
      if (lot) {
        lot.available = (lot.available ?? 0) - Number(p.quantity);
        if (p.close_lot) lot.state = 'closed';
      }
      const balance = result.materialBalances?.find((b) => b.id === p.lot_id);
      if (balance) {
        balance.remaining = Number(balance.remaining) - Number(p.quantity);
        balance[String(p.kind)] = Number(balance[String(p.kind)] ?? 0) + Number(p.quantity);
      }
      result.dispositions ??= [];
      result.dispositions.push({ id: e.id, ...p, observed_at: e.observed_at, sync_status: entry.status });
    }
    const allocations: Record<string, unknown>[] =
      e.action === 'allocation'
        ? [p]
        : fileTesting && e.action === 'batch' && Array.isArray(p.allocations)
          ? p.allocations.map((a: Record<string, unknown>) => ({ ...a, output_lot_id: e.id }))
          : [];
    for (const allocation of entry.status !== 'conflict' ? allocations : []) {
      const p = allocation;
      result.edges.push({
        input_lot_id: String(p.input_lot_id),
        output_lot_id: String(p.output_lot_id),
        quantity: Number(p.quantity),
        unit: String(p.unit),
      });
      const input = result.lots.find((l) => l.id === p.input_lot_id);
      if (input) input.available = (input.available ?? 0) - Number(p.quantity);
      const balance = result.materialBalances?.find((b) => b.id === p.input_lot_id);
      if (balance) {
        balance.allocated = Number(balance.allocated) + Number(p.quantity);
        balance.remaining = Number(balance.remaining) - Number(p.quantity);
      }
    }
    if (entry.status === 'conflict')
      result.tasks.unshift({
        id: `conflict:${e.id}`,
        kind: 'sync_conflict',
        status: 'open',
        due_at: e.observed_at,
        details: { error: entry.error, receipt_id: e.id },
      });
  }
  if (fileTesting) settleTestBatches(result.lots);
  if (fileTesting || (!demo && !isOnline())) {
    result.tasks = result.tasks.filter((task) => !['checkpoint_due', 'stage_overdue'].includes(task.kind));
    result.tasks.push(...localProductionTasks(result));
  }
  return result;
}
export async function saveAction(
  identity: Identity,
  config: Config,
  action: string,
  payload: Record<string, unknown>,
  media: { blob: Blob; type: string }[] = [],
  offlinePin?: string,
  observedAt?: string,
) {
  if (fileTesting) {
    if (!fileCanWrite()) throw new Error('fileReadOnly');
    if (media.length) throw new Error('filePhotosUnavailable');
    if (action === 'whey_decision') throw new Error('fileActionUnavailable');
  }
  if (actionClass(action) === 'online' && !(fileTesting && ['testing_review', 'testing_resolve'].includes(action)))
    throw new Error('onlineRequired');
  const envelope = envelopeSchema.parse({
    id: crypto.randomUUID(),
    author_id: identity.id,
    cooperative_id: identity.cooperative_id,
    device_id: await getDevice(),
    config_version_id: config.id,
    observed_at: observedAt ?? new Date().toISOString(),
    action,
    payload,
  });
  if (action === 'whey_decision') {
    if (!offlinePin || demo) throw new Error('offlineSignatureMissing');
    Object.assign(envelope.payload, await signOfflineDecision(envelope, offlinePin));
  }
  await enqueue(
    envelope,
    media.map((item) => ({
      id: crypto.randomUUID(),
      record_id: envelope.id,
      cooperative_id: identity.cooperative_id,
      ...item,
      uploaded: false,
    })),
  );
  void syncStatus.recount(identity.id);
  return envelope.id;
}
/**
 * Sends this person's waiting records, then their photos, then small housekeeping.
 * Order matters: a photo is only uploaded once the record it belongs to was accepted.
 * Progress is published through src/offline/sync-status.ts.
 */
export async function synchronize(identity: Identity) {
  if (fileTesting) {
    if (!isOnline()) return;
    syncStatus.sending();
    try {
      await syncOutbox(sendFileAction, identity.id);
      const remaining = await db.outbox
        .filter((entry) => entry.envelope.author_id === identity.id && ['saved', 'syncing'].includes(entry.status))
        .first();
      if (remaining) throw new Error(remaining.error || 'fileRequestFailed');
      const sentAt = new Date().toISOString();
      await db.cache.put({ key: `last-sync:${identity.id}`, value: sentAt });
      syncStatus.sent(sentAt);
    } catch (error) {
      syncStatus.failed(error instanceof Error ? error.message : 'fileRequestFailed');
      throw error;
    } finally {
      await syncStatus.recount(identity.id);
    }
    return;
  }
  if (demo || !api || !isOnline()) return;
  syncStatus.sending();
  try {
    await flushDiagnostics();
    await syncOutbox(async (envelope: Envelope) => {
      const { data, error } = await api!.functions.invoke('sync', { body: { records: [envelope] } });
      if (error) {
        void captureDiagnostic('sync_failure');
        throw error;
      }
      return data.receipts[0];
    }, identity.id);
    await uploadWaitingMedia(identity);
    const sentAt = new Date().toISOString();
    await db.cache.put({ key: `last-sync:${identity.id}`, value: sentAt });
    syncStatus.sent(sentAt);
    // A stale notification acknowledgment must never block traceability or media.
    // Failed acknowledgments remain queued and can be retried independently.
    await flushNotificationReads(identity).catch(() => {});
  } catch (error) {
    syncStatus.failed(error instanceof Error ? error.message : 'error');
    throw error;
  } finally {
    await syncStatus.recount(identity.id);
  }
}

async function uploadWaitingMedia(identity: Identity) {
  const media = await db.media.filter((m) => !m.uploaded).toArray();
  for (const entry of media) {
    const receipt = await db.outbox.get(entry.record_id);
    if (receipt?.status !== 'synced' || receipt.envelope.author_id !== identity.id) continue;
    const path = `${entry.cooperative_id}/${entry.id}.${entry.type.startsWith('image') ? 'jpg' : 'webm'}`;
    const { error } = await api!.storage.from('evidence').upload(path, entry.blob);
    // 409: the file arrived on an earlier attempt whose answer was lost; only the registration is missing.
    if (error && (error as ApiError).status !== 409) continue;
    const metadata = await api!.rpc('register_attachment', {
      target: entry.id,
      record: entry.record_id,
      path,
      media_type: entry.type,
    });
    if (!metadata.error) await db.media.update(entry.id, { uploaded: true });
  }
}
export async function signedAction(
  identity: Identity,
  action: string,
  target: string,
  pin: string,
  args: Record<string, unknown>,
) {
  if (fileTesting) throw new Error('fileActionUnavailable');
  if (!isOnline() || !api || demo) throw new Error('onlineRequired');
  const { data: sign, error } = await api.rpc('pin_signoff', {
    pin,
    device: await getDevice(),
    action,
    object_id: target,
  });
  if (error || !sign) throw new Error('pinFailed');
  const endpoint = action === 'decision' ? 'transition_lot' : action === 'recall' ? 'start_recall' : 'close_deviation';
  const reply = await api.rpc(endpoint, { target, sign, ...args });
  if (reply.error) throw new Error(reply.error.message);
  return reply.data;
}
