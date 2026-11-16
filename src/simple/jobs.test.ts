import { describe, expect, it } from 'vitest';
import { defaultSettings, mergeSettings } from './settings';
import { jobsFor, journeys, missingChecks, nextForBatch, resolveJob } from './jobs';
import { config, karim, lot, now, rima, salma, snapshot, task } from './fixtures.test-helpers';

const batch = lot({ id: 'kb-1', type: 'batch', state: 'in_production', stage: 'preparation' });
const salmaBatch = lot({ id: 'kb-2', type: 'batch', state: 'in_production', stage: 'drying', producer_id: salma.id });
const whey = lot({ id: 'wl-1', type: 'whey', state: 'received' });

describe('next jobs', () => {
  it('does not reopen a completed drying check until its next due time', () => {
    const data = snapshot({
      lots: [salmaBatch],
      records: [
        {
          id: 'check',
          lot_id: salmaBatch.id,
          definition_key: 'drying_temperature',
          payload: { all_ok: true },
          observed_at: now.toISOString(),
        },
      ],
      tasks: [
        task({
          id: 'later',
          kind: 'checkpoint_due',
          lot_id: salmaBatch.id,
          due_at: new Date(now.getTime() + 12 * 3600000).toISOString(),
          details: { definition_key: 'drying_temperature' },
        }),
      ],
    });
    expect(nextForBatch(data, salmaBatch, now).pipeline).toBe('stage');
    expect(nextForBatch(data, salmaBatch, new Date(now.getTime() + 13 * 3600000)).pipeline).toBe('check');
  });
  it('turns a due check into the check pipeline for that batch and check', () => {
    const data = snapshot({
      lots: [batch],
      tasks: [task({ id: 't1', kind: 'checkpoint_due', lot_id: batch.id, details: { definition_key: 'hygiene' } })],
    });
    expect(jobsFor(data, rima, defaultSettings, 'AKR01', now)).toEqual([
      expect.objectContaining({ pipeline: 'check', lotId: batch.id, checkpoint: 'hygiene', overdue: true }),
    ]);
  });
  it('sends whey decisions only to people allowed to decide', () => {
    const data = snapshot({ lots: [whey], tasks: [task({ id: 't', kind: 'awaiting_decision', lot_id: whey.id })] });
    expect(jobsFor(data, karim, defaultSettings, 'AKR01', now)[0]).toMatchObject({
      pipeline: 'decide',
      lotId: whey.id,
    });
    expect(
      jobsFor(data, { ...salma, roles: ['producer', 'supervisor'] }, defaultSettings, 'AKR01', now)[0]?.pipeline,
    ).toBe('decide');
    expect(
      jobsFor(
        snapshot({
          lots: [whey],
          tasks: [task({ id: 't', kind: 'awaiting_decision', lot_id: whey.id, user_id: salma.id })],
        }),
        salma,
        defaultSettings,
        'AKR01',
        now,
      ),
    ).toEqual([]);
  });
  it('turns expiring accepted whey into "start a batch with it"', () => {
    const accepted = { ...whey, state: 'accepted', available: 40 };
    const data = snapshot({ lots: [accepted], tasks: [task({ id: 't', kind: 'expiry', lot_id: accepted.id })] });
    expect(jobsFor(data, rima, defaultSettings, 'AKR01', now)[0]).toMatchObject({
      pipeline: 'batch',
      lotId: accepted.id,
    });
  });
  it('never suggests producing with expired whey', () => {
    const expired = { ...whey, state: 'accepted', available: 10, expires_at: '2026-04-11T00:00:00Z' };
    const data = snapshot({ lots: [expired], tasks: [task({ id: 't', kind: 'expiry', lot_id: expired.id })] });
    expect(jobsFor(data, rima, defaultSettings, 'AKR01', now)[0]).toMatchObject({
      pipeline: 'full_app',
      lotId: expired.id,
    });
  });
  it('opens the full app for work the simple app does not cover, after work it does', () => {
    const data = snapshot({
      lots: [batch],
      tasks: [
        task({ id: 'cal', kind: 'calibration', due_at: '2026-10-01T00:00:00Z' }),
        task({
          id: 't1',
          kind: 'checkpoint_due',
          lot_id: batch.id,
          details: { definition_key: 'hygiene' },
          due_at: '2026-10-28T00:00:00Z',
        }),
      ],
    });
    expect(jobsFor(data, rima, defaultSettings, 'AKR01', now).map((j) => j.pipeline)).toEqual(['check', 'full_app']);
  });
  it('gives a designated recorder every batch, and other producers none', () => {
    const settings = mergeSettings(defaultSettings, {
      recording: { mode: 'designated', recorders: { AKR01: ['rima'] } },
    });
    const data = snapshot({
      lots: [salmaBatch],
      tasks: [
        task({
          id: 't',
          kind: 'checkpoint_due',
          lot_id: salmaBatch.id,
          details: { definition_key: 'drying_temperature' },
        }),
      ],
    });
    expect(jobsFor(data, rima, defaultSettings, 'AKR01', now)).toEqual([]);
    expect(jobsFor(data, rima, settings, 'AKR01', now)[0]).toMatchObject({ pipeline: 'check', lotId: salmaBatch.id });
    expect(jobsFor(data, salma, settings, 'AKR01', now)).toEqual([]);
    const expired = lot({
      id: 'old',
      type: 'whey',
      state: 'accepted',
      available: 5,
      expires_at: '2026-01-01T00:00:00Z',
    });
    expect(
      jobsFor(
        snapshot({ lots: [expired], tasks: [task({ id: 'e', kind: 'expiry', lot_id: expired.id })] }),
        salma,
        settings,
        'AKR01',
        now,
      ),
    ).toEqual([]);
    expect(journeys(data, rima, settings, 'AKR01', now).map((j) => j.lot.id)).toEqual([salmaBatch.id]);
    expect(journeys(data, salma, settings, 'AKR01', now)).toEqual([]);
  });
});

describe('what finishes a batch stage', () => {
  it('asks for a missing required check before moving on', () => {
    expect(missingChecks(snapshot(), config, batch).map((c) => c.key)).toEqual(['hygiene']);
    expect(nextForBatch(snapshot({ lots: [batch] }), batch, now)).toMatchObject({
      pipeline: 'check',
      checkpoint: 'hygiene',
      overdue: false,
    });
  });
  it('moves to the next stage once checks exist, and packs at the last stage', () => {
    const data = snapshot({ lots: [batch], records: [{ lot_id: batch.id, definition_key: 'hygiene' }] });
    expect(nextForBatch(data, batch, now).pipeline).toBe('stage');
    const ready = { ...batch, stage: 'packing' };
    expect(nextForBatch(snapshot({ lots: [ready] }), ready, now).pipeline).toBe('pack');
  });
  it('shows progress through the procedure stages', () => {
    const drying = { ...batch, stage: 'drying' };
    expect(journeys(snapshot({ lots: [drying] }), rima, defaultSettings, 'AKR01', now)[0]).toMatchObject({
      stageIndex: 3,
      stageCount: 6,
    });
  });
});

describe('opening a job', () => {
  it('opens the missing check or packing instead of a stage move the server would refuse', () => {
    const stage = { key: 'stage:kb-1', pipeline: 'stage' as const, lotId: batch.id, overdue: false };
    expect(resolveJob(snapshot({ lots: [batch] }), stage, now)).toMatchObject({
      pipeline: 'check',
      checkpoint: 'hygiene',
    });
    expect(
      resolveJob(snapshot({ lots: [batch], records: [{ lot_id: batch.id, definition_key: 'hygiene' }] }), stage, now)
        .pipeline,
    ).toBe('stage');
    expect(resolveJob(snapshot({ lots: [{ ...batch, stage: 'packing' }] }), stage, now).pipeline).toBe('pack');
    expect(resolveJob(snapshot(), { key: 'sell', pipeline: 'sell', overdue: false }, now).pipeline).toBe('sell');
  });
});
