import { describe, it, expect } from 'vitest';
import { localProductionTasks, stageTimeline } from './schedules';
import { demoConfig, demoLots } from './demo';
import type { Snapshot } from './data';

describe('cached production schedules', () => {
  it('starts recurring checks from the current stage rather than batch creation', () => {
    const lot = {
      ...demoLots.find((l) => l.type === 'batch')!,
      stage: 'drying',
      state: 'in_production',
      observed_at: '2026-01-01T00:00:00Z',
    };
    const data = {
      lots: [lot],
      config: demoConfig,
      configs: [demoConfig],
      stageEvents: [{ lot_id: lot.id, stage: 'drying', observed_at: '2026-01-03T00:00:00Z' }],
      records: [],
    } as unknown as Snapshot;
    expect(localProductionTasks(data)[0].due_at).toBe('2026-01-03T00:00:00.000Z');
    data.records.push({ lot_id: lot.id, definition_key: 'drying_temperature', observed_at: '2026-01-03T01:00:00Z' });
    expect(localProductionTasks(data)[0].due_at).toBe('2026-01-03T13:00:00.000Z');
  });
  it('shows stage ends and marks only the ongoing stage overdue', () => {
    const lot = demoLots.find((l) => l.type === 'batch')!;
    const config = structuredClone(demoConfig);
    config.definition.stages[0].expected_hours = 2;
    config.definition.stages[1].expected_hours = 2;
    const events = [
      { lot_id: lot.id, stage: 'preparation', observed_at: '2026-01-01T00:00:00Z' },
      { lot_id: lot.id, stage: 'mixing', observed_at: '2026-01-01T01:00:00Z' },
    ];
    const timeline = stageTimeline(lot, events, config, Date.parse('2026-01-01T04:00:00Z'));
    expect(timeline[0]).toMatchObject({ elapsed_hours: 1, ended_at: '2026-01-01T01:00:00.000Z', overdue: false });
    expect(timeline[1]).toMatchObject({ elapsed_hours: 3, overdue: true });
  });
});
