import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, format } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import type { Snapshot } from '../lib/data';
import type { Lot } from '../lib/domain';
import { lotConfig } from '../lib/schedules';
export function PackagingFields({ data, lot }: { data: Snapshot; lot: Lot | null }) {
  const { t } = useTranslation();
  const batches = data.lots.filter(
    (l) => l.type === 'batch' && ['draft', 'in_production', 'awaiting_review'].includes(l.state),
  );
  const [batchId, setBatchId] = useState(lot?.type === 'batch' ? lot.id : (batches[0]?.id ?? ''));
  const batch = batches.find((b) => b.id === batchId),
    config = lotConfig(data, batch);
  const options = config.definition.packaging_options ?? [];
  const [packageType, setPackageType] = useState(options[0] ?? ''),
    [size, setSize] = useState(0.5),
    [count, setCount] = useState(1);
  const selectedType = options.includes(packageType) ? packageType : (options[0] ?? '');
  const maxDate = format(
    addDays(
      new TZDate(new Date(), 'Asia/Beirut'),
      config.definition.shelf_life_by_package?.[selectedType] ?? config.definition.shelf_life_days,
    ),
    'yyyy-MM-dd',
  );
  const minDate = format(new TZDate(new Date(), 'Asia/Beirut'), 'yyyy-MM-dd');
  const input = data.edges
    .filter(
      (e) =>
        e.output_lot_id === batchId &&
        data.lots.some((l) => l.id === e.input_lot_id && ['whey', 'ingredient'].includes(l.type) && l.unit === 'kg'),
    )
    .reduce((sum, e) => sum + Number(e.quantity ?? 0), 0);
  const already = data.packaging
    .filter((p) => p.batch_id === batchId)
    .reduce((sum, p) => sum + Number(p.size_kg) * Number(p.package_count), 0);
  const ratio = input > 0 ? (already + size * count) / input : null;
  const expected = config.definition.expected_yield;
  const warning = !!expected && (ratio === null || ratio < expected.min || ratio > expected.max);
  return (
    <>
      <label>
        {t('batch')}
        <select name="batch_id" required value={batchId} onChange={(e) => setBatchId(e.target.value)}>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('packaging_material')}
        <select name="packaging_material_id" required>
          {data.lots
            .filter(
              (l) =>
                l.type === 'packaging_material' &&
                (l.available ?? 0) > 0 &&
                (!l.expires_at || Date.parse(l.expires_at) > Date.now()) &&
                l.state !== 'closed',
            )
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} · {l.available} {l.unit}
              </option>
            ))}
        </select>
      </label>
      <label>
        {t('packageType')}
        <select name="package_type" value={selectedType} onChange={(e) => setPackageType(e.target.value)}>
          {options.map((type) => (
            <option key={type} value={type}>
              {t(type)}
            </option>
          ))}
        </select>
      </label>
      <div className="button-group">
        {(config.definition.packaging_sizes ?? [0.25, 0.5, 1]).map((value) => (
          <button type="button" className="button button-outline" key={value} onClick={() => setSize(value)}>
            {value} kg
          </button>
        ))}
      </div>
      <div className="form-grid">
        <label>
          {t('packageSize')}
          <input
            name="size_kg"
            type="number"
            min=".001"
            step="any"
            required
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        </label>
        <label>
          {t('packageCount')}
          <input
            name="package_count"
            type="number"
            min="1"
            step="1"
            required
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
      </div>
      <label key={maxDate}>
        {t('bestBefore')}
        <input name="best_before" type="date" required min={minDate} max={maxDate} defaultValue={maxDate} />
      </label>
      <label>
        {t('location')}
        <input name="storage_location" required />
      </label>
      <p className="quiet">
        {t('packagedMass')}: {size * count} kg
      </p>
      {expected && (
        <p className="callout">
          {t('packagingYield')}: {ratio === null ? t('yieldUnavailable') : ratio.toFixed(3)} {t('expectedRange')}:{' '}
          {expected.min}–{expected.max}
        </p>
      )}
      {warning && (
        <label>
          {t('yieldJustification')}
          <textarea name="reason" minLength={5} required />
        </label>
      )}
    </>
  );
}
