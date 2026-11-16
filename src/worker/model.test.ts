import { expect, it } from 'vitest';
import { evidenceText } from './model';
it('presents understood evidence while keeping internal data out of worker history', () => {
  expect(
    evidenceText(
      { value: 24.3, unit: '°C', equipment_id: 'private-id', note: 'Morning check', debug: { raw: true } },
      false,
      'Yes',
      'No',
    ),
  ).toEqual(['24.3 °C', 'Morning check']);
  expect(evidenceText({ value: null, raw: { unknown: true } }, false, 'Yes', 'No')).toEqual([]);
  expect(evidenceText({ value: false }, false, 'Yes', 'No')).toEqual(['No']);
});
