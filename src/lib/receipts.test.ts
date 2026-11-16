import { describe, it, expect } from 'vitest';
import { receiptMeasurements } from './receipts';
import { demoIdentity } from './demo';
describe('reception measurements', () => {
  it('preserves blank optional readings without turning them into zero', () => {
    const form = new FormData();
    form.set('ph', '');
    expect(
      receiptMeasurements(form, [{ key: 'ph', required: false }], demoIdentity, new Date().toISOString(), false),
    ).toEqual({ measurements: [] });
  });
  it('requires configured readings and rejects physically impossible values', () => {
    const form = new FormData();
    expect(() =>
      receiptMeasurements(form, [{ key: 'ph', required: true }], demoIdentity, new Date().toISOString(), false),
    ).toThrow('receptionMeasurementRequired');
    form.set('ph', '14');
    expect(() =>
      receiptMeasurements(
        form,
        [{ key: 'ph', required: true, min_plausible: 0, max_plausible: 13 }],
        demoIdentity,
        new Date().toISOString(),
        false,
      ),
    ).toThrow('implausibleMeasurement');
  });
  it('records explicit zero with unit, time, author, equipment and image reference', () => {
    const form = new FormData();
    form.set('temperature', '0');
    form.set('equipment:reception_temperature', 'thermometer');
    const observedAt = new Date().toISOString();
    expect(
      receiptMeasurements(
        form,
        [{ key: 'reception_temperature', required: true, unit: '°C' }],
        demoIdentity,
        observedAt,
        true,
      ),
    ).toEqual({
      reception_temperature: 0,
      measurements: [
        {
          key: 'reception_temperature',
          value: 0,
          unit: '°C',
          observed_at: observedAt,
          user_id: demoIdentity.id,
          equipment_id: 'thermometer',
          image: 'receipt_photo',
        },
      ],
    });
  });
  it('supports configured rapid indicators and requires their equipment', () => {
    const form = new FormData();
    form.set('brix', '8.5');
    expect(() =>
      receiptMeasurements(
        form,
        [{ key: 'brix', required: true, unit: '°Brix', equipment_required: true }],
        demoIdentity,
        new Date().toISOString(),
        false,
      ),
    ).toThrow('equipmentRequired');
    form.set('equipment:brix', 'refractometer');
    expect(
      receiptMeasurements(
        form,
        [{ key: 'brix', required: true, unit: '°Brix', equipment_required: true }],
        demoIdentity,
        new Date().toISOString(),
        false,
      ).brix,
    ).toBe(8.5);
  });
});
