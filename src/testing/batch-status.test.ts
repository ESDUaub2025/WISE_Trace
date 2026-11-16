import { describe, expect, it } from 'vitest';
import { lot } from '../simple/fixtures.test-helpers';
import { settleTestBatches } from './batch-status';

const batch = () => lot({ id: 'batch', type: 'batch', state: 'awaiting_review' });
const pack = (id: string, state: string, available: number) =>
  lot({ id, type: 'packaging', state, available, facts: { batch_id: 'batch' } });
const settled = (...packs: ReturnType<typeof pack>[]) => {
  const lots = [batch(), ...packs];
  settleTestBatches(lots);
  return lots[0].state;
};

describe('a batch follows what happened to its packed kishk', () => {
  it('waits while any pack still needs a review', () => {
    expect(settled(pack('a', 'released', 10), pack('b', 'awaiting_review', 5))).toBe('awaiting_review');
  });
  it('is released while released stock remains, and closed once it is all gone', () => {
    expect(settled(pack('a', 'released', 3))).toBe('released');
    expect(settled(pack('a', 'released', 0))).toBe('closed');
    expect(settled(pack('a', 'released', 0), pack('b', 'rejected', 5))).toBe('closed');
  });
  it('is on hold or rejected when no pack was released', () => {
    expect(settled(pack('a', 'hold', 5), pack('b', 'rejected', 5))).toBe('hold');
    expect(settled(pack('a', 'rejected', 5))).toBe('rejected');
  });
  it('leaves unpacked and stopped batches as they are', () => {
    const lots = [
      lot({ id: 'batch', type: 'batch', state: 'in_production' }),
      lot({ id: 'stopped', type: 'batch', state: 'rejected', facts: { abandoned: true } }),
      lot({ id: 'x', type: 'packaging', state: 'released', available: 2, facts: { batch_id: 'stopped' } }),
    ];
    settleTestBatches(lots);
    expect(lots.map((l) => l.state)).toEqual(['in_production', 'rejected', 'released']);
  });
});
