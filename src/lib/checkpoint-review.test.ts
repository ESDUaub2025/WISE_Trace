import { describe, it, expect } from 'vitest';
import { checkpointReview } from './schedules';
import { demoConfig, demoLots } from './demo';
import type { Snapshot } from './data';
describe('recurring checkpoint review', () => {
  it('counts interval coverage rather than duplicate readings in one interval', () => {
    const lot = { ...demoLots.find((l) => l.type === 'batch')!, stage: 'drying' };
    const start = Date.UTC(2026, 0, 1);
    const config = {
      ...demoConfig,
      definition: {
        ...demoConfig.definition,
        checkpoints: [
          {
            key: 'temperature',
            stage: 'drying',
            required: true,
            interval_hours: 12,
            label: { en: 'Temperature', ar: 'Temperature' },
          },
        ],
      },
    };
    const data = {
      config,
      configs: [config],
      stageEvents: [
        { lot_id: lot.id, stage: 'drying', observed_at: new Date(start).toISOString() },
        { lot_id: lot.id, stage: 'packing', observed_at: new Date(start + 24 * 3600000).toISOString() },
      ],
      records: [1, 2].map((hour) => ({
        lot_id: lot.id,
        definition_key: 'temperature',
        observed_at: new Date(start + hour * 3600000).toISOString(),
      })),
      attachments: [],
    } as unknown as Snapshot;
    expect(checkpointReview(data, lot, start + 24 * 3600000)[0]).toMatchObject({
      expected: 2,
      completed: 1,
      missing: 1,
    });
    data.records.push({
      lot_id: lot.id,
      definition_key: 'temperature',
      observed_at: new Date(start + 13 * 3600000).toISOString(),
    });
    expect(checkpointReview(data, lot, start + 24 * 3600000)[0].missing).toBe(0);
  });
});
