import type { Snapshot } from '../lib/data';
import type { Identity, Lot, Supplier, Task } from '../lib/domain';
import { demoConfig } from '../lib/demo';

export const now = new Date('2026-10-27T09:00:00Z');
export const config = demoConfig;
export const rima: Identity = {
  id: '20000000-0000-4000-8000-000000000001',
  cooperative_id: '10000000-0000-4000-8000-000000000001',
  username: 'rima',
  display_name: 'Rima Haddad',
  roles: ['producer'],
  authorizations: { receive_whey: true },
};
export const salma: Identity = {
  ...rima,
  id: '20000000-0000-4000-8000-000000000099',
  username: 'salma',
  display_name: 'Salma',
  authorizations: {},
};
export const karim: Identity = {
  ...rima,
  id: '20000000-0000-4000-8000-000000000002',
  username: 'karim',
  display_name: 'Karim Nassar',
  roles: ['supervisor'],
};
export const cedar: Supplier = {
  id: '50000000-0000-4000-8000-000000000001',
  name: 'Cedar Dairy',
  type: 'dairy',
  status: 'approved',
  cooperative_id: rima.cooperative_id,
  declarations: { pasteurized: true, starter_culture: 'Cultured labneh' },
};

export function lot(values: Partial<Lot> & Pick<Lot, 'id' | 'type'>): Lot {
  return {
    cooperative_id: rima.cooperative_id,
    code: values.id.toUpperCase(),
    state: 'received',
    unit: 'kg',
    initial_quantity: 0,
    producer_id: rima.id,
    device_id: '30000000-0000-4000-8000-000000000001',
    config_version_id: config.id,
    observed_at: '2026-10-20T08:00:00Z',
    facts: {},
    ...values,
  };
}
export function task(values: Partial<Task> & Pick<Task, 'id' | 'kind'>): Task {
  return { status: 'open', due_at: '2026-10-27T08:00:00Z', details: {}, ...values };
}

export function snapshot(values: Partial<Snapshot> = {}): Snapshot {
  return {
    materialBalances: [],
    dispositions: [],
    trainingHistory: [],
    trainingAssets: [],
    cooperatives: [{ id: rima.cooperative_id, code: 'AKR01', name: 'Akkar Harvest' }],
    lots: [],
    suppliers: [cedar],
    tasks: [],
    config,
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
    configs: [config as unknown as Snapshot['configs'][number]],
    edges: [],
    ...values,
  };
}
