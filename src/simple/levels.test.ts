import { describe, expect, it } from 'vitest';
import { defaultSettings, mergeSettings } from './settings';
import { newlyUnlocked, unlockedActions } from './levels';
import { homeItems } from './jobs';
import { decisionPlan, suggestDecision } from './payloads';
import { friendlyName, dayLabel } from './names';
import { cedar, config, karim, lot, now, salma, snapshot } from './fixtures.test-helpers';

const nadia = { ...salma, authorizations: { receive_whey: true } };

describe('training-wheel levels', () => {
  it('starts a new person with only receiving whey', () => {
    expect(unlockedActions(snapshot(), nadia, defaultSettings)).toEqual(['receive']);
  });
  it("unlocks each action after the work that leads to it, counting only that person's work", () => {
    const mine = (values: Parameters<typeof lot>[0]) => lot({ ...values, producer_id: nadia.id });
    expect(
      unlockedActions(snapshot({ lots: [mine({ id: 'w', type: 'whey', state: 'accepted' })] }), nadia, defaultSettings),
    ).toEqual(['receive', 'batch']);
    expect(
      unlockedActions(
        snapshot({ lots: [mine({ id: 'b', type: 'batch', state: 'in_production', stage: 'packing' })] }),
        nadia,
        defaultSettings,
      ),
    ).toEqual(['receive', 'batch', 'pack']);
    expect(
      unlockedActions(
        snapshot({
          lots: [
            mine({ id: 'b', type: 'batch', state: 'released' }),
            mine({ id: 'p', type: 'packaging', state: 'released' }),
          ],
        }),
        nadia,
        defaultSettings,
      ),
    ).toEqual(['receive', 'batch', 'pack', 'sell']);
    // Someone else's accepted whey does not count for this person.
    expect(
      unlockedActions(snapshot({ lots: [lot({ id: 'w', type: 'whey', state: 'accepted' })] }), nadia, defaultSettings),
    ).toEqual(['receive']);
  });
  it('can count the whole cooperative instead, or show everything', () => {
    const data = snapshot({ lots: [lot({ id: 'w', type: 'whey', state: 'accepted' })] });
    expect(unlockedActions(data, nadia, mergeSettings(defaultSettings, { levels: { basis: 'cooperative' } }))).toEqual([
      'receive',
      'batch',
    ]);
    expect(unlockedActions(snapshot(), nadia, mergeSettings(defaultSettings, { levels: { mode: 'all' } }))).toEqual([
      'receive',
      'batch',
      'pack',
      'sell',
    ]);
    expect(
      unlockedActions(snapshot(), nadia, mergeSettings(defaultSettings, { levels: { experienced: [nadia.username] } })),
    ).toHaveLength(4);
    expect(unlockedActions(snapshot(), karim, defaultSettings)).toHaveLength(4);
  });
  it('celebrates only what is new since the last visit', () => {
    expect(newlyUnlocked(null, ['receive'])).toEqual([]);
    expect(newlyUnlocked(['receive'], ['receive', 'batch'])).toEqual(['batch']);
  });
});

describe('the home screen leads with one thing', () => {
  it('invites a first-day person to receive whey', () => {
    expect(homeItems([], [], ['receive'], snapshot(), now)).toEqual([{ kind: 'invite', action: 'receive' }]);
  });
  it('prefers due work, then batches in progress, then using whey that is ready', () => {
    const whey = lot({ id: 'w', type: 'whey', state: 'accepted', available: 40, expires_at: '2026-10-29T00:00:00Z' });
    const check = {
      key: 'check:b:hygiene',
      pipeline: 'check' as const,
      lotId: 'b',
      checkpoint: 'hygiene',
      overdue: true,
    };
    const items = homeItems(
      [check, { key: 'cal', pipeline: 'full_app', overdue: true }],
      [
        { lot: lot({ id: 'b', type: 'batch' }), stageIndex: 0, stageCount: 6, next: check },
        {
          lot: lot({ id: 'c', type: 'batch' }),
          stageIndex: 2,
          stageCount: 6,
          next: { key: 'stage:c', pipeline: 'stage', lotId: 'c', overdue: false },
        },
      ],
      ['receive', 'batch'],
      snapshot({ lots: [whey] }),
      now,
    );
    expect(items.map((i) => (i.kind === 'job' ? `${i.job.pipeline}:${i.job.lotId}` : `invite:${i.action}`))).toEqual([
      'check:b',
      'stage:c',
      'invite:batch',
      'invite:receive',
    ]);
  });
  it('never invites to actions that are still locked', () => {
    const released = lot({
      id: 'p',
      type: 'packaging',
      state: 'released',
      available: 5,
      expires_at: '2027-01-01T00:00:00Z',
    });
    expect(homeItems([], [], ['receive'], snapshot({ lots: [released] }), now)).toEqual([
      { kind: 'invite', action: 'receive' },
    ]);
  });
});

describe('whey decision modes', () => {
  const rules = config.definition.reception_measurements!;
  const good = suggestDecision(lot({ id: 'w', type: 'whey', facts: { ph: 5, reception_temperature: 5 } }), rules);
  const bad = suggestDecision(
    lot({ id: 'w', type: 'whey', facts: { ph: 7, reception_temperature: 5, odour: 'abnormal' } }),
    rules,
  );
  it('keeps the full choice in choose mode, preselecting the suggestion', () => {
    expect(decisionPlan('choose', bad)).toEqual({
      kind: 'choose',
      options: ['accepted', 'hold', 'rejected'],
      preselected: 'hold',
    });
  });
  it('in signal mode, accepts only what is within limits and otherwise passes it to a supervisor', () => {
    expect(decisionPlan('signal', good)).toMatchObject({
      primary: { outcome: 'accepted', label: 'looksGood' },
      secondary: { outcome: 'hold', label: 'somethingOff' },
    });
    const plan = decisionPlan('signal', bad);
    expect(plan).toMatchObject({ primary: { outcome: 'hold', label: 'sendToSupervisor' } });
    expect('secondary' in plan && plan.secondary).toBeFalsy();
    expect(bad.issues).toEqual([{ key: 'ph', value: 7, min: 4, max: 6 }, { key: 'odour' }]);
  });
});

describe('everyday names', () => {
  const words = {
    whey: 'Whey',
    batch: 'Kishk',
    packaging: 'Pouches',
    material: 'Material',
    today: 'today',
    yesterday: 'yesterday',
  };
  it('names lots by what and when, with the supplier for whey', () => {
    const whey = lot({ id: 'w', type: 'whey', supplier_id: cedar.id, observed_at: '2026-10-27T06:00:00Z' });
    expect(friendlyName(whey, [whey], [cedar], now, 'en', words)).toBe('Whey · today · Cedar Dairy');
    const tuesday = lot({ id: 'b', type: 'batch', observed_at: '2026-10-20T09:00:00Z' });
    expect(friendlyName(tuesday, [tuesday], [], now, 'en', words)).toBe('Kishk · 20 Oct');
  });
  it('numbers lots of the same kind made the same day', () => {
    const a = lot({ id: 'a', type: 'batch', observed_at: '2026-10-26T06:00:00Z' }),
      b = lot({ id: 'b', type: 'batch', observed_at: '2026-10-26T09:00:00Z' });
    expect([a, b].map((l) => friendlyName(l, [b, a], [], now, 'en', words))).toEqual([
      'Kishk 1 · yesterday',
      'Kishk 2 · yesterday',
    ]);
  });
  it("uses the weekday within the last week, in the person's language", () => {
    expect(dayLabel('2026-10-24T09:00:00Z', now, 'en', words)).toBe('Saturday');
    expect(dayLabel('2026-10-24T09:00:00Z', now, 'ar', words)).toBe('السبت');
  });
});

it('keeps the default settings valid with every new choice', () => {
  expect(defaultSettings).toMatchObject({
    style: 'cards',
    wheyDecision: 'signal',
    levels: { mode: 'progressive', basis: 'person' },
    voice: { mode: 'tts' },
  });
  expect(mergeSettings(defaultSettings, { levels: { unlocks: { sell: 'always' } } }).levels.unlocks).toMatchObject({
    sell: 'always',
    batch: 'whey_accepted',
  });
  expect(() => mergeSettings(defaultSettings, { style: 'voice' as never })).toThrow();
});
