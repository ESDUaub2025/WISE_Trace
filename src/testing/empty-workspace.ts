import type { Snapshot } from '../lib/data';
import type { Identity } from '../lib/domain';
import { demoConfig, ids } from '../lib/demo';
import { introAssessment, introTrainingContent } from '../lib/learning-demo';

// Procedure defaults and learning content are templates. No people's records are seeded.
export function emptyTestWorkspace(members: Identity[]): Snapshot {
  return {
    materialBalances: [],
    dispositions: [],
    trainingHistory: [],
    trainingAssets: [],
    cooperatives: [{ id: ids.coop, name: 'Testing workspace', code: 'TEST', region: '', status: 'active' }],
    lots: [],
    suppliers: [],
    tasks: [],
    config: structuredClone(demoConfig),
    records: [],
    stageEvents: [],
    attachments: [],
    deviations: [],
    equipment: [],
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
    members: members.map((person) => ({ ...person })),
    devices: [],
    configs: [{ ...structuredClone(demoConfig) }],
    edges: [],
  };
}
