import { describe, expect, it } from 'vitest';
import {
  allocationPayload,
  batchYield,
  bestBefore,
  checkpointPayload,
  outOfRange,
  packableBatches,
  packagingMaterial,
  packagingPayload,
  receiptPayload,
  rememberedEquipment,
  salePayload,
  sellableLots,
  suggestDecision,
  usableWhey,
} from './payloads';
import { cedar, config, lot, now, rima, snapshot } from './fixtures.test-helpers';

const rules = config.definition.reception_measurements!;
const answers = {
  quantity: 80,
  unit: 'kg',
  hours_since_made: 5,
  pasteurized: 'yes',
  milk_species: 'cow',
  transport_method: 'supplier_vehicle',
  container_type: 'food_grade_drum',
  container_condition: 'good',
  appearance: 'normal',
  odour: 'normal',
  supplier_lot: '',
  ph: 5.1,
  reception_temperature: 6,
};

describe('receiving whey', () => {
  it('builds the same receipt shape the full app sends', () => {
    const payload = receiptPayload({
      answers,
      supplier: cedar,
      rules,
      identity: rima,
      now,
      sources: { quantity: 'asked' },
    });
    expect(payload).toMatchObject({
      type: 'whey',
      supplier_id: cedar.id,
      quantity: 80,
      unit: 'kg',
      generation_at: '2026-10-27T04:00:00.000Z',
    });
    expect(payload.facts).toMatchObject({
      ph: 5.1,
      reception_temperature: 6,
      declarations_confirmed: true,
      declared_by_supplier: true,
      declarations: { pasteurized: true, starter_culture: 'Cultured labneh' },
      milk_species: 'cow',
      answer_sources: { quantity: 'asked' },
    });
    expect(payload.facts.measurements).toEqual([
      expect.objectContaining({ key: 'ph', value: 5.1, unit: 'pH', user_id: rima.id, observed_at: now.toISOString() }),
      expect.objectContaining({ key: 'reception_temperature', value: 6, unit: '°C' }),
    ]);
  });
  it('refuses a receipt without the procedure measurements or with impossible values', () => {
    expect(() =>
      receiptPayload({
        answers: { ...answers, ph: undefined },
        supplier: cedar,
        rules,
        identity: rima,
        now,
        sources: {},
      }),
    ).toThrow('receptionMeasurementRequired');
    expect(() =>
      receiptPayload({
        answers: { ...answers, quantity: 0 },
        supplier: cedar,
        rules,
        identity: rima,
        now,
        sources: {},
      }),
    ).toThrow('positive_quantity');
    expect(() =>
      receiptPayload({
        answers,
        supplier: cedar,
        rules: [{ ...rules[0], max_plausible: 4 }],
        identity: rima,
        now,
        sources: {},
      }),
    ).toThrow('implausibleMeasurement');
  });
  it('keeps an unsure pasteurization answer as unknown', () => {
    expect(
      receiptPayload({
        answers: { ...answers, pasteurized: 'unknown' },
        supplier: cedar,
        rules,
        identity: rima,
        now,
        sources: {},
      }).facts.declarations.pasteurized,
    ).toBe('unknown');
  });
  it('preselects the meter used last time', () => {
    expect(
      rememberedEquipment([
        lot({ id: 'wl', type: 'whey', facts: { measurements: [{ key: 'ph', equipment_id: 'eq-ph' }] } }),
      ]),
    ).toEqual({ ph: 'eq-ph' });
  });
  it('suggests accepting within limits and holding otherwise', () => {
    expect(
      suggestDecision(
        lot({ id: 'w', type: 'whey', facts: { ph: 5, reception_temperature: 6, appearance: 'normal' } }),
        rules,
      ).outcome,
    ).toBe('accepted');
    const held = suggestDecision(
      lot({ id: 'w', type: 'whey', facts: { ph: 6.5, reception_temperature: 6, odour: 'abnormal' } }),
      rules,
    );
    expect(held.outcome).toBe('hold');
    expect(held.problems).toHaveLength(2);
  });
});

describe('making, packing and selling', () => {
  it('offers usable whey soonest-expiring first and skips expired or held whey', () => {
    const lots = [
      lot({ id: 'late', type: 'whey', state: 'accepted', available: 10, expires_at: '2026-10-29T00:00:00Z' }),
      lot({ id: 'soon', type: 'whey', state: 'accepted', available: 10, expires_at: '2026-10-28T00:00:00Z' }),
      lot({ id: 'gone', type: 'whey', state: 'accepted', available: 10, expires_at: '2026-10-26T00:00:00Z' }),
      lot({ id: 'held', type: 'whey', state: 'hold', available: 10 }),
    ];
    expect(usableWhey(snapshot({ lots }), now).map((l) => l.id)).toEqual(['soon', 'late']);
  });
  it('never allocates more whey than is left', () => {
    const whey = lot({ id: 'w', type: 'whey', available: 50 });
    expect(allocationPayload(whey, 'b', 50)).toEqual({
      input_lot_id: 'w',
      output_lot_id: 'b',
      quantity: 50,
      unit: 'kg',
      reason: '',
    });
    expect(() => allocationPayload(whey, 'b', 51)).toThrow('over_allocation');
  });
  it('records a one-tap hygiene check with every item ticked', () => {
    const hygiene = config.definition.checkpoints.find((c) => c.key === 'hygiene')!;
    const payload = checkpointPayload(lot({ id: 'b', type: 'batch' }), hygiene, { allOk: true });
    expect(payload.values.all_ok).toBe(true);
    expect(Object.values(payload.values.checklist).every(Boolean)).toBe(true);
    expect(
      checkpointPayload(lot({ id: 'b', type: 'batch' }), hygiene, { allOk: false, checklist: { equipment: false } })
        .values.all_ok,
    ).toBe(false);
  });
  it('needs a value for measured checks and flags out-of-range readings', () => {
    const drying = config.definition.checkpoints.find((c) => c.key === 'drying_temperature')!;
    expect(() => checkpointPayload(lot({ id: 'b', type: 'batch' }), drying, { allOk: true })).toThrow();
    expect(() => checkpointPayload(lot({ id: 'b', type: 'batch' }), drying, { allOk: true, value: 200 })).toThrow(
      'implausibleMeasurement',
    );
    expect(checkpointPayload(lot({ id: 'b', type: 'batch' }), drying, { allOk: true, value: 25 }).values).toMatchObject(
      { value: 25, unit: '°C' },
    );
    expect(outOfRange(drying, 55)).toBe(true);
    expect(outOfRange(drying, 25)).toBe(false);
  });
  it('computes best-before and never exceeds the overall shelf life', () => {
    expect(bestBefore(config, 'kraft', now)).toBe('2027-04-25');
    expect(
      bestBefore(
        { ...config, definition: { ...config.definition, shelf_life_by_package: { kraft: 999 } } },
        'kraft',
        now,
      ),
    ).toBe('2027-04-25');
  });
  it('packs from the oldest packaging material with enough stock', () => {
    const lots = [
      lot({ id: 'small', type: 'packaging_material', available: 10, observed_at: '2026-01-01T00:00:00Z' }),
      lot({ id: 'old', type: 'packaging_material', available: 500, observed_at: '2026-02-01T00:00:00Z' }),
      lot({ id: 'new', type: 'packaging_material', available: 500, observed_at: '2026-03-01T00:00:00Z' }),
    ];
    const material = packagingMaterial(snapshot({ lots }), 96);
    expect(material?.id).toBe('old');
    expect(
      packagingPayload({
        answers: { package_type: 'kraft', size_kg: '0.5', package_count: 96, storage_location: 'Dry store A' },
        batch: lot({ id: 'b', type: 'batch' }),
        material,
        config,
        now,
      }),
    ).toMatchObject({
      batch_id: 'b',
      packaging_material_id: 'old',
      size_kg: 0.5,
      package_count: 96,
      best_before: '2027-04-25',
    });
    expect(() =>
      packagingPayload({
        answers: { package_type: 'kraft', size_kg: '0.5', package_count: 96 },
        batch: lot({ id: 'b', type: 'batch' }),
        material: undefined,
        config,
        now,
      }),
    ).toThrow('noPackagingMaterial');
  });
  it('sells released, unexpired stock and works out the total', () => {
    const lots = [
      lot({ id: 'pl', type: 'packaging', state: 'released', available: 20, expires_at: '2027-01-01T00:00:00Z' }),
      lot({ id: 'review', type: 'packaging', state: 'awaiting_review', available: 20 }),
    ];
    const [stock] = sellableLots(snapshot({ lots }), now);
    expect(stock.id).toBe('pl');
    expect(salePayload({ quantity: 3, unit_price: 4.5, currency: 'USD', customer_category: 'retail' }, stock)).toEqual({
      packaging_lot_id: 'pl',
      quantity: 3,
      transaction_type: 'sale',
      customer_category: 'retail',
      total: 13.5,
      currency: 'USD',
      usd_rate: 1,
    });
    expect(() => salePayload({ quantity: 3, unit_price: 400000, currency: 'LBP' }, stock)).toThrow('rateRequired');
    expect(() => salePayload({ quantity: 21, unit_price: 1, currency: 'USD' }, stock)).toThrow('saleExceedsStock');
  });
});

describe('rules a person meets before the final save', () => {
  it('refuses an age for the whey that cannot be real', () => {
    const input = { supplier: cedar, rules, identity: rima, now, sources: {} };
    expect(() => receiptPayload({ ...input, answers: { ...answers, hours_since_made: -3 } })).toThrow('needHours');
    expect(() => receiptPayload({ ...input, answers: { ...answers, hours_since_made: 9999 } })).toThrow('needHours');
    expect(receiptPayload({ ...input, answers: { ...answers, hours_since_made: 0 } }).generation_at).toBe(
      now.toISOString(),
    );
  });
  it('keeps a batch packable until its packed kishk has been reviewed', () => {
    const lastStage = config.definition.stages.at(-1)!.key;
    const lots = [
      lot({ id: 'ready', type: 'batch', state: 'in_production', stage: lastStage }),
      lot({ id: 'more', type: 'batch', state: 'awaiting_review', stage: lastStage }),
      lot({ id: 'released', type: 'batch', state: 'released', stage: lastStage }),
      lot({ id: 'early', type: 'batch', state: 'in_production', stage: config.definition.stages[0].key }),
    ];
    expect(
      packableBatches(snapshot({ lots }))
        .map((l) => l.id)
        .sort(),
    ).toEqual(['more', 'ready']);
  });
  it('compares everything packed from a batch with the kilograms that went in', () => {
    const data = snapshot({
      lots: [
        lot({ id: 'b', type: 'batch' }),
        lot({ id: 'w', type: 'whey' }),
        lot({ id: 'bulgur', type: 'ingredient' }),
        lot({ id: 'pouches', type: 'packaging_material', unit: 'unit' }),
      ],
      edges: [
        { input_lot_id: 'w', output_lot_id: 'b', quantity: 30, unit: 'kg' },
        { input_lot_id: 'bulgur', output_lot_id: 'b', quantity: 10, unit: 'kg' },
        { input_lot_id: 'pouches', output_lot_id: 'b', quantity: 50, unit: 'unit' },
      ],
      packaging: [{ batch_id: 'b', size_kg: 0.5, package_count: 20 }],
    });
    // 40 kg in; 10 kg packed earlier. The sample procedure expects 0.1 to 2 times the input.
    expect(batchYield(data, config, 'b', 10)).toMatchObject({ inputKg: 40, packedKg: 20, ratio: 0.5, outside: false });
    expect(batchYield(data, config, 'b', 90).outside).toBe(true);
    expect(batchYield(data, config, 'b', 0.5).outside).toBe(false);
    // Nothing recorded as going in: the amount cannot be checked, which is itself worth a reason.
    expect(batchYield(snapshot(), config, 'b', 5)).toMatchObject({ ratio: null, outside: true });
  });
});
