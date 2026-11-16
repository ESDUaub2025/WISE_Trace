import { describe, expect, it } from 'vitest';
import type { Envelope } from '../lib/domain';
import { demoConfig, ids } from '../lib/demo';
import { validateTestAction } from './action-validation';

const now = Date.parse('2026-11-15T10:00:00Z');
let index = 0;
const event = (action: string, payload: Record<string, unknown>, id = `event-${++index}`): Envelope => ({
  id,
  action,
  payload,
  author_id: ids.producer,
  cooperative_id: ids.coop,
  device_id: ids.device,
  config_version_id: ids.config,
  observed_at: '2026-11-15T09:00:00Z',
});
const receipt = event(
  'receipt',
  {
    type: 'whey',
    quantity: 120,
    unit: 'kg',
    generation_at: '2026-11-15T08:00:00Z',
    facts: { ph: 5.2, reception_temperature: 6 },
  },
  'whey',
);
const accepted = event('testing_review', {
  lot_id: 'whey',
  outcome: 'accepted',
  reason: 'Checked sample readings',
  test_only: true,
});
const batch = event('batch', { allocations: [{ input_lot_id: 'whey', quantity: 40, unit: 'kg' }] }, 'batch');
const material = event('receipt', { type: 'packaging_material', quantity: 100, unit: 'unit' }, 'material');
const packed = event(
  'packaging',
  { batch_id: 'batch', packaging_material_id: 'material', package_count: 10, size_kg: 0.5, best_before: '2027-01-01' },
  'packed',
);
const release = event('testing_review', {
  lot_id: 'packed',
  outcome: 'released',
  reason: 'Reviewed for testing',
  test_only: true,
});
const checks = demoConfig.definition.checkpoints
  .filter((c) => c.required)
  .map((c) => event('checkpoint', { lot_id: 'batch', definition_key: c.key, values: { all_ok: true } }));

describe('shared testing workflow consistency', () => {
  it('accepts an explicit in-range decision and an atomic batch with the selected amount', () => {
    expect(validateTestAction([receipt], accepted, now)).toBeUndefined();
    expect(validateTestAction([receipt, accepted], batch, now)).toBeUndefined();
  });
  it('checks the latest shared quantities when another tester has consumed stock', () => {
    const second = event('batch', { allocations: [{ input_lot_id: 'whey', quantity: 81, unit: 'kg' }] });
    expect(validateTestAction([receipt, accepted, batch], second, now)).toBe('over_allocation');
  });
  it('adds duplicate allocations before validating instead of accepting each separately', () => {
    expect(
      validateTestAction(
        [receipt, accepted],
        event('batch', {
          allocations: [
            { input_lot_id: 'whey', quantity: 80, unit: 'kg' },
            { input_lot_id: 'whey', quantity: 80, unit: 'kg' },
          ],
        }),
        now,
      ),
    ).toBe('over_allocation');
  });
  it('rejects unaccepted, expired and mismatched-unit inputs', () => {
    expect(validateTestAction([receipt], batch, now)).toBe('wheyNotAccepted');
    expect(validateTestAction([receipt, accepted], batch, now + 72 * 3600000)).toBe('wheyNotAccepted');
    expect(
      validateTestAction(
        [receipt, accepted],
        event('allocation', { input_lot_id: 'whey', quantity: 1, unit: 'L' }),
        now,
      ),
    ).toBe('allocationUnitMismatch');
  });
  it('does not treat missing or out-of-range measurements as an acceptance', () => {
    expect(
      validateTestAction(
        [{ ...receipt, payload: { ...receipt.payload, facts: { ph: 7, reception_temperature: 6 } } }],
        accepted,
        now,
      ),
    ).toBe('reviewOutsideLimits');
    expect(validateTestAction([{ ...receipt, payload: { ...receipt.payload, facts: { ph: 5 } } }], accepted, now)).toBe(
      'receptionMeasurementRequired',
    );
  });
  it('requires test provenance and a decision reason', () => {
    expect(
      validateTestAction([receipt], { ...accepted, payload: { ...accepted.payload, test_only: false } }, now),
    ).toBe('reasonRequired');
  });
  it('keeps packing separate from test release and prevents overselling', () => {
    const history = [receipt, accepted, batch, material, packed];
    const sale = event('sale', { packaging_lot_id: 'packed', quantity: 2 });
    expect(validateTestAction(history, sale, now)).toBe('notReleased');
    expect(validateTestAction([...history, ...checks], release, now)).toBeUndefined();
    expect(
      validateTestAction([...history, release, sale], event('sale', { packaging_lot_id: 'packed', quantity: 9 }), now),
    ).toBe('saleExceedsStock');
  });
  it('requires completed checks and resolved problems before test release', () => {
    const history = [receipt, accepted, batch, material, packed];
    expect(validateTestAction(history, release, now)).toBe('reviewChecksFirst');
    const problem = event('deviation', { lot_id: 'batch', description: 'Needs checking', status: 'open' });
    expect(validateTestAction([...history, ...checks, problem], release, now)).toBe('reviewProblemsFirst');
    expect(
      validateTestAction(
        [...history, ...checks, problem, event('testing_resolve', { lot_id: 'batch', reason: 'Checked' })],
        release,
        now,
      ),
    ).toBeUndefined();
    expect(
      validateTestAction(
        [
          ...history,
          ...checks,
          event('checkpoint', {
            lot_id: 'batch',
            definition_key: demoConfig.definition.checkpoints[0].key,
            values: { all_ok: false },
          }),
        ],
        release,
        now,
      ),
    ).toBe('reviewProblemsFirst');
  });
  it('keeps a failed check as an open problem until someone records how it was resolved', () => {
    const key = demoConfig.definition.checkpoints[0].key;
    const failed = event('checkpoint', { lot_id: 'batch', definition_key: key, values: { all_ok: false } });
    const redone = event('checkpoint', { lot_id: 'batch', definition_key: key, values: { all_ok: true } });
    const history = [receipt, accepted, batch, material, packed, ...checks, failed, redone];
    // Repeating the check with a good result does not erase that it once failed.
    expect(validateTestAction(history, release, now)).toBe('reviewProblemsFirst');
    expect(
      validateTestAction(
        [...history, event('testing_resolve', { lot_id: 'batch', reason: 'Cleaned and checked again' })],
        release,
        now,
      ),
    ).toBeUndefined();
  });
  it('names the missing check when a step is finished too early', () => {
    const move = event('stage', { lot_id: 'batch', next_stage: demoConfig.definition.stages[1].key });
    expect(validateTestAction([receipt, accepted, batch], move, now)).toBe('stageChecksFirst');
    expect(validateTestAction([receipt, accepted, batch, checks[0]], move, now)).toBeUndefined();
  });
  it('lets a batch be stopped with a reason before packing, and closes it to further records', () => {
    const stop = (reason: string) => event('abandon', { lot_id: 'batch', reason });
    const history = [receipt, accepted, batch];
    expect(validateTestAction(history, stop(''), now)).toBe('reasonRequired');
    expect(validateTestAction(history, stop('Mould found while drying'), now)).toBeUndefined();
    expect(validateTestAction([...history, material, packed], stop('Too late'), now)).toBe('batchAlreadyPacked');
    const stopped = [...history, stop('Mould found while drying')];
    expect(validateTestAction(stopped, checks[0], now)).toBe('batchStopped');
    expect(validateTestAction(stopped, event('stage', { lot_id: 'batch', next_stage: 'mixing' }), now)).toBe(
      'batchStopped',
    );
  });
  it('asks for a reason when the packed mass cannot come from the recorded inputs', () => {
    const lastStage = event('stage', { lot_id: 'batch', next_stage: demoConfig.definition.stages.at(-1)!.key });
    const history = [receipt, accepted, batch, material, lastStage];
    const pack = (count: number, reason = '') =>
      event('packaging', { ...packed.payload, package_count: count, size_kg: 1, reason });
    // 40 kg of whey went in; the sample procedure expects 0.1 to 2 times that.
    expect(validateTestAction(history, pack(20), now)).toBeUndefined();
    expect(validateTestAction(history, pack(90), now)).toBe('yieldReasonRequired');
    expect(validateTestAction(history, pack(90, 'Bulgur was added but not recorded'), now)).toBeUndefined();
    // Earlier packing sessions of the same batch count towards the total.
    expect(validateTestAction([...history, pack(60)], pack(30), now)).toBe('yieldReasonRequired');
  });
  it('requires the packaging material count to cover the packed units', () => {
    expect(
      validateTestAction(
        [batch, material, event('stage', { lot_id: 'batch', next_stage: demoConfig.definition.stages.at(-1)!.key })],
        event('packaging', { ...packed.payload, package_count: 101 }),
        now,
      ),
    ).toBe('noPackagingMaterial');
  });
});
