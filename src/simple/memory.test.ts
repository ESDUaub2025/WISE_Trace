import { describe, expect, it } from 'vitest';
import { defaultSettings, mergeSettings } from './settings';
import {
  answerSources,
  maxHoursAgo,
  numberProblem,
  rememberedPacking,
  rememberedReceipt,
  rememberedSale,
  resolveQuestions,
  startingAnswers,
} from './memory';
import { cedar, lot, snapshot } from './fixtures.test-helpers';

const questions = defaultSettings.questions.receive;
const lastDelivery = lot({
  id: 'wl-1',
  type: 'whey',
  supplier_id: cedar.id,
  initial_quantity: 120,
  observed_at: '2026-10-25T08:00:00Z',
  generation_at: '2026-10-25T04:00:00Z',
  facts: {
    milk_species: 'goat',
    transport_method: 'supplier_vehicle',
    container_type: 'steel_can',
    declarations: { pasteurized: false },
    appearance: 'abnormal',
  },
});

describe('remembering answers', () => {
  it('asks only fresh questions on a first delivery from a new supplier, and remembers the supplier profile', () => {
    const resolved = resolveQuestions(questions, rememberedReceipt(snapshot(), cedar, questions));
    expect(resolved.silent.map((s) => s.question.key)).toEqual(['unit']);
    expect(resolved.usual.find((u) => u.question.key === 'pasteurized')?.value).toBe('yes');
    // Nothing known yet about species, transport or container: those are asked once.
    expect(resolved.ask.map((q) => q.key)).toEqual(
      expect.arrayContaining(['quantity', 'milk_species', 'transport_method', 'container_type', 'appearance', 'odour']),
    );
  });

  it('offers the last delivery from the same supplier as the usual answers', () => {
    const remembered = rememberedReceipt(snapshot({ lots: [lastDelivery] }), cedar, questions);
    const resolved = resolveQuestions(questions, remembered);
    const usual = Object.fromEntries(resolved.usual.map((u) => [u.question.key, u.value]));
    expect(usual).toMatchObject({
      quantity: 120,
      hours_since_made: 4,
      milk_species: 'goat',
      transport_method: 'supplier_vehicle',
      container_type: 'steel_can',
      pasteurized: 'no',
    });
    // Every-time questions are never carried over, even when the last answer was unusual.
    expect(resolved.ask.map((q) => q.key)).toEqual(['container_condition', 'appearance', 'odour', 'supplier_lot']);
    expect(startingAnswers(resolved).appearance).toBe('normal');
  });

  it("uses another supplier's delivery only for habits, never for supplier facts", () => {
    const other = { ...cedar, id: '50000000-0000-4000-8000-000000000002', declarations: {} };
    const remembered = rememberedReceipt(snapshot({ lots: [lastDelivery] }), other, questions);
    expect(remembered.quantity).toBe(120);
    expect(remembered.milk_species).toBeUndefined();
  });

  it("follows the settings when a question's memory changes", () => {
    const strict = mergeSettings(defaultSettings, {
      questions: {
        receive: [
          { key: 'milk_species', memory: 'every_time' },
          { key: 'quantity', memory: 'every_time' },
        ],
      },
    }).questions.receive;
    const resolved = resolveQuestions(strict, rememberedReceipt(snapshot({ lots: [lastDelivery] }), cedar, strict));
    expect(resolved.ask.map((q) => q.key)).toEqual(expect.arrayContaining(['milk_species', 'quantity']));
  });

  it('records whether each answer was confirmed, changed, fixed or asked', () => {
    const resolved = resolveQuestions(
      questions,
      rememberedReceipt(snapshot({ lots: [lastDelivery] }), cedar, questions),
    );
    const answers = { ...startingAnswers(resolved), quantity: 90 };
    expect(answerSources(resolved, answers)).toMatchObject({
      quantity: 'changed',
      milk_species: 'per_supplier_confirmed',
      unit: 'fixed',
      appearance: 'asked',
    });
  });

  it('remembers packing and selling habits', () => {
    const data = snapshot({
      lots: [
        lot({ id: 'pl-old', type: 'packaging', observed_at: '2026-09-01T00:00:00Z' }),
        lot({ id: 'pl-new', type: 'packaging', observed_at: '2026-10-01T00:00:00Z' }),
      ],
      packaging: [
        { lot_id: 'pl-old', package_type: 'transparent', size_kg: 1, package_count: 10, storage_location: 'Old store' },
        { lot_id: 'pl-new', package_type: 'kraft', size_kg: 0.5, package_count: 96, storage_location: 'Dry store A' },
      ],
      sales: [
        {
          transaction_type: 'sale',
          quantity: 10,
          total: 55,
          currency: 'USD',
          usd_rate: 1,
          customer_category: 'wholesale',
          observed_at: '2026-10-02T00:00:00Z',
        },
      ],
    });
    expect(rememberedPacking(data)).toEqual({
      package_type: 'kraft',
      size_kg: '0.5',
      package_count: 96,
      storage_location: 'Dry store A',
    });
    expect(rememberedSale(data)).toEqual({
      quantity: 10,
      unit_price: 5.5,
      currency: 'USD',
      usd_rate: undefined,
      customer_category: 'wholesale',
    });
  });
});

describe('typed numbers are checked on their own question', () => {
  const question = (pipeline: 'receive' | 'pack' | 'sell', key: string) =>
    defaultSettings.questions[pipeline].find((q) => q.key === key)!;
  it('needs an amount above zero', () => {
    const quantity = question('receive', 'quantity');
    expect(numberProblem(quantity, 0)).toBe('needPositive');
    expect(numberProblem(quantity, -5)).toBe('needPositive');
    expect(numberProblem(quantity, 0.5)).toBeUndefined();
    // Not answered yet is not a problem; "required" covers that.
    expect(numberProblem(quantity, undefined)).toBeUndefined();
  });
  it('refuses whey made in the future or impossibly long ago', () => {
    const hours = question('receive', 'hours_since_made');
    expect(numberProblem(hours, -3)).toBe('needHours');
    expect(numberProblem(hours, maxHoursAgo + 1)).toBe('needHours');
    expect(numberProblem(hours, 0)).toBeUndefined();
    expect(numberProblem(hours, 47.5)).toBeUndefined();
  });
  it('counts pouches in whole numbers and allows a zero price', () => {
    expect(numberProblem(question('pack', 'package_count'), 2.5)).toBe('needWhole');
    expect(numberProblem(question('sell', 'quantity'), 2.5)).toBe('needWhole');
    expect(numberProblem(question('sell', 'unit_price'), 0)).toBeUndefined();
    expect(numberProblem(question('sell', 'unit_price'), -1)).toBe('needPositive');
  });
  it('leaves choices and text alone', () => {
    expect(numberProblem(question('receive', 'pasteurized'), 'no')).toBeUndefined();
  });
});
