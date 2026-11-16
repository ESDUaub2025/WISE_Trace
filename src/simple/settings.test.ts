import { describe, expect, it } from 'vitest';
import { defaultSettings, mergeSettings, settingsFor, settingsSchema, type SettingsPatch } from './settings';
import { canDecide, canRecord, canReceiveWhey, recordersFor } from './access';
import { karim, rima, salma } from './fixtures.test-helpers';

describe('simple app settings', () => {
  it('ships valid defaults', () => {
    expect(() => settingsSchema.parse(defaultSettings)).not.toThrow();
  });

  it('changes one question by key and keeps the rest', () => {
    const merged = mergeSettings(defaultSettings, {
      questions: { receive: [{ key: 'milk_species', memory: 'every_time' }] },
    });
    expect(merged.questions.receive.find((q) => q.key === 'milk_species')?.memory).toBe('every_time');
    expect(merged.questions.receive.find((q) => q.key === 'pasteurized')?.memory).toBe('per_supplier');
    expect(merged.questions.receive).toHaveLength(defaultSettings.questions.receive.length);
  });

  it('merges sections field by field', () => {
    const merged = mergeSettings(defaultSettings, { recording: { mode: 'designated' }, home: { maxJobs: 2 } });
    expect(merged.recording).toEqual({ ...defaultSettings.recording, mode: 'designated' });
    expect(merged.home.actions).toEqual(defaultSettings.home.actions);
  });

  it('refuses settings that would silently lose or misplace answers', () => {
    const bad: [string, unknown][] = [
      [
        'unknown key',
        {
          ...defaultSettings,
          questions: {
            ...defaultSettings.questions,
            receive: [...defaultSettings.questions.receive, { ...defaultSettings.questions.receive[0], key: 'colour' }],
          },
        },
      ],
      [
        'duplicate key',
        {
          ...defaultSettings,
          questions: {
            ...defaultSettings.questions,
            pack: [...defaultSettings.questions.pack, defaultSettings.questions.pack[0]],
          },
        },
      ],
      [
        'supplier memory outside receiving',
        {
          ...defaultSettings,
          questions: {
            ...defaultSettings.questions,
            sell: [{ ...defaultSettings.questions.sell[0], memory: 'per_supplier' }],
          },
        },
      ],
      [
        'fixed without default',
        {
          ...defaultSettings,
          questions: {
            ...defaultSettings.questions,
            pack: [{ ...defaultSettings.questions.pack[2], memory: 'fixed', default: undefined }],
          },
        },
      ],
      [
        'choice without options',
        {
          ...defaultSettings,
          questions: { ...defaultSettings.questions, pack: [{ ...defaultSettings.questions.pack[0], options: [] }] },
        },
      ],
    ];
    for (const [, value] of bad) expect(() => settingsSchema.parse(value)).toThrow();
  });

  it('keeps procedure measurements out of reach of settings', () => {
    for (const key of ['ph', 'reception_temperature'])
      expect(() =>
        settingsSchema.parse({
          ...defaultSettings,
          questions: {
            ...defaultSettings.questions,
            receive: [
              ...defaultSettings.questions.receive,
              { key, label: { en: 'x', ar: 'x' }, input: 'number', memory: 'fixed', default: 5, required: true },
            ],
          },
        }),
      ).toThrow();
  });

  it('applies the cooperative patch, then the on-device patch only when allowed', () => {
    const cooperatives: Record<string, SettingsPatch> = {
      AKR01: { recording: { mode: 'designated', recorders: { AKR01: ['rima'] } } },
    };
    const local: SettingsPatch = { home: { maxJobs: 1 } };
    expect(settingsFor('AKR01', local, defaultSettings, cooperatives)).toMatchObject({
      recording: { mode: 'designated' },
      home: { maxJobs: 1 },
    });
    expect(settingsFor('BEK01', undefined, defaultSettings, cooperatives).recording.mode).toBe('every_producer');
    expect(
      settingsFor('AKR01', local, { ...defaultSettings, allowLocalOverrides: false }, cooperatives).home.maxJobs,
    ).toBe(defaultSettings.home.maxJobs);
  });
});

describe('who records', () => {
  it('lets every producer and supervisor record by default, but not viewers', () => {
    expect(canRecord(rima, defaultSettings, 'AKR01')).toBe(true);
    expect(canRecord(karim, defaultSettings, 'AKR01')).toBe(true);
    expect(canRecord({ ...rima, roles: ['donor'] }, defaultSettings, 'AKR01')).toBe(false);
  });
  it('limits recording to the named people in designated mode', () => {
    const settings = mergeSettings(defaultSettings, {
      recording: { mode: 'designated', recorders: { AKR01: ['rima'], '*': ['karim'] } },
    });
    expect(canRecord(rima, settings, 'AKR01')).toBe(true);
    expect(canRecord(salma, settings, 'AKR01')).toBe(false);
    expect(recordersFor(settings, 'BEK01')).toEqual(['karim']);
    expect(canRecord(karim, settings, 'BEK01')).toBe(true);
  });
  it('follows the full app on who may decide and receive whey', () => {
    expect(canDecide(rima, { type: 'whey' })).toBe(true);
    expect(canDecide(rima, { type: 'batch' })).toBe(false);
    expect(canDecide(salma, { type: 'whey' })).toBe(false);
    expect(canDecide(karim, { type: 'batch' })).toBe(true);
    expect(canReceiveWhey(salma)).toBe(false);
  });
});
