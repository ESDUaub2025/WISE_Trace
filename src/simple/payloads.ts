// Builds the same record payloads as the full app's forms, so both apps write identical, traceable records.
import type { Checkpoint, Config, Identity, Lot, ReceptionMeasurement, Supplier } from '../lib/domain';
import type { Snapshot } from '../lib/data';
import { receiptField, receiptMeasurements, measurementUnit } from '../lib/receipts';
import { lotConfig } from '../lib/schedules';
import { maxHoursAgo, type Answers } from './memory';

const unavailable = ['rejected', 'closed', 'hold', 'on_hold', 'recalled', 'withdrawn'];
const byObserved = (a: Lot, b: Lot) => a.observed_at.localeCompare(b.observed_at);
const byExpiry = (a: Lot, b: Lot) => (a.expires_at ?? '9999').localeCompare(b.expires_at ?? '9999');
const str = (value: unknown) => (value === undefined || value === null ? '' : String(value));

export function receiptPayload({
  answers,
  supplier,
  rules,
  identity,
  now,
  equipment = {},
  sources,
}: {
  answers: Answers;
  supplier: Supplier;
  rules: ReceptionMeasurement[];
  identity: Identity;
  now: Date;
  equipment?: Record<string, string>;
  sources: Record<string, string>;
}) {
  const quantity = Number(answers.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('positive_quantity');
  const observedAt = now.toISOString();
  const form = new FormData();
  for (const rule of rules) {
    form.set(receiptField(rule.key), str(answers[rule.key]));
    form.set('unit:' + rule.key, measurementUnit(rule));
    if (equipment[rule.key]) form.set('equipment:' + rule.key, equipment[rule.key]);
  }
  const hours = Number(answers.hours_since_made);
  // An answer was given but cannot be a real age: refuse it rather than save a delivery without a use-by time.
  if (str(answers.hours_since_made) !== '' && !(hours >= 0 && hours <= maxHoursAgo)) throw new Error('needHours');
  const pasteurized = answers.pasteurized === 'unknown' ? 'unknown' : answers.pasteurized === 'yes';
  return {
    type: 'whey',
    supplier_id: supplier.id,
    quantity,
    unit: str(answers.unit) || 'kg',
    generation_at:
      Number.isFinite(hours) && hours >= 0 ? new Date(now.getTime() - hours * 3600000).toISOString() : undefined,
    facts: {
      supplier_reference: '',
      supplier_lot: str(answers.supplier_lot),
      confirmed_supplier_lot: str(answers.supplier_lot),
      ingredient_type: supplier.type,
      declarations: { ...supplier.declarations, pasteurized },
      declarations_confirmed: true,
      declared_by_supplier: true,
      ...receiptMeasurements(form, rules, identity, observedAt, false),
      labneh_lot: str(answers.labneh_lot),
      milk_species: str(answers.milk_species),
      transport_method: str(answers.transport_method),
      container_type: str(answers.container_type),
      container_condition: str(answers.container_condition),
      appearance: str(answers.appearance),
      odour: str(answers.odour),
      answer_sources: sources,
    },
  };
}

/** The equipment last used for each reception measurement, so the same meter is preselected. */
export function rememberedEquipment(lots: Lot[]) {
  const last = [...lots]
    .filter((l) => l.type === 'whey')
    .sort(byObserved)
    .at(-1);
  const result: Record<string, string> = {};
  for (const item of (last?.facts?.measurements ?? []) as { key?: string; equipment_id?: string }[])
    if (item.key && item.equipment_id) result[item.key] = item.equipment_id;
  return result;
}

/** Accept when every reading is inside the procedure's limits and the checks were normal; otherwise suggest a hold. */
export function suggestDecision(lot: Lot, rules: ReceptionMeasurement[]) {
  const problems: string[] = [];
  const issues: { key: string; value?: number; min?: number; max?: number }[] = [];
  for (const rule of rules) {
    const value = Number(lot.facts?.[rule.key]);
    if (!Number.isFinite(value)) continue;
    if ((rule.min !== undefined && value < rule.min) || (rule.max !== undefined && value > rule.max)) {
      problems.push(`${rule.key} ${value} outside ${rule.min ?? '-'}–${rule.max ?? '-'}`);
      issues.push({ key: rule.key, value, min: rule.min, max: rule.max });
    }
  }
  for (const key of ['appearance', 'odour'])
    if (lot.facts?.[key] === 'abnormal') {
      problems.push(`${key} not normal`);
      issues.push({ key });
    }
  if (lot.facts?.container_condition === 'damaged') {
    problems.push('container not clean or closed');
    issues.push({ key: 'container_condition' });
  }
  return problems.length
    ? { outcome: 'hold' as const, reason: `Held: ${problems.join('; ')}`, problems, issues }
    : { outcome: 'accepted' as const, reason: 'Within configured limits; checks normal', problems, issues };
}

export type DecisionPlan =
  | { kind: 'choose'; options: ('accepted' | 'hold' | 'rejected')[]; preselected: 'accepted' | 'hold' }
  | {
      kind: 'signal';
      primary: { outcome: 'accepted' | 'hold'; label: 'looksGood' | 'sendToSupervisor'; reason: string };
      secondary?: { outcome: 'hold'; label: 'somethingOff'; reason: string };
    };
/** choose keeps the full Accept/Hold/Reject choice. signal only lets a person accept what is within limits, or pass it to a supervisor. */
export function decisionPlan(mode: 'choose' | 'signal', suggestion: ReturnType<typeof suggestDecision>): DecisionPlan {
  if (mode === 'choose')
    return { kind: 'choose', options: ['accepted', 'hold', 'rejected'], preselected: suggestion.outcome };
  if (suggestion.outcome === 'accepted')
    return {
      kind: 'signal',
      primary: { outcome: 'accepted', label: 'looksGood', reason: suggestion.reason },
      secondary: {
        outcome: 'hold',
        label: 'somethingOff',
        reason: 'Held: flagged by the recorder for a supervisor to check',
      },
    };
  return { kind: 'signal', primary: { outcome: 'hold', label: 'sendToSupervisor', reason: suggestion.reason } };
}

export function usableWhey(data: Pick<Snapshot, 'lots'>, now: Date) {
  return data.lots
    .filter(
      (l) =>
        l.type === 'whey' &&
        l.state === 'accepted' &&
        (l.available ?? 0) > 0 &&
        (!l.expires_at || Date.parse(l.expires_at) > now.getTime()),
    )
    .sort(byExpiry);
}

export function ingredientLots(data: Pick<Snapshot, 'lots'>) {
  const groups = new Map<string, Lot[]>();
  for (const lot of data.lots
    .filter((l) => l.type === 'ingredient' && (l.available ?? 0) > 0 && !unavailable.includes(l.state))
    .sort(byObserved)) {
    const type = str(lot.facts?.ingredient_type) || 'ingredient';
    groups.set(type, [...(groups.get(type) ?? []), lot]);
  }
  return groups;
}

/** Ingredient amounts used by this person's most recent batch, by ingredient type. */
export function lastIngredientAmounts(data: Pick<Snapshot, 'lots' | 'edges'>, identity: Identity) {
  const batch = data.lots
    .filter((l) => l.type === 'batch' && l.producer_id === identity.id)
    .sort(byObserved)
    .at(-1);
  const amounts: Record<string, number> = {};
  if (!batch) return amounts;
  for (const edge of data.edges.filter((e) => e.output_lot_id === batch.id)) {
    const input = data.lots.find((l) => l.id === edge.input_lot_id);
    if (input?.type === 'ingredient') {
      const type = str(input.facts?.ingredient_type) || 'ingredient';
      amounts[type] = (amounts[type] ?? 0) + Number(edge.quantity ?? 0);
    }
  }
  return amounts;
}

export const batchPayload = () => ({ unit: 'kg', quantity: 0, facts: { recorded_with: 'simple' } });
export function allocationPayload(input: Lot, batchId: string, quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('positive_quantity');
  if (quantity > (input.available ?? 0)) throw new Error('over_allocation');
  return { input_lot_id: input.id, output_lot_id: batchId, quantity, unit: input.unit, reason: '' };
}

export function stageCheckpoints(config: Config, lot: Lot) {
  return config.definition.checkpoints.filter((c) => c.stage === lot.stage);
}
export function nextStage(config: Config, lot: Lot) {
  const stages = config.definition.stages;
  const index = stages.findIndex((s) => s.key === lot.stage);
  return index >= 0 ? stages[index + 1] : undefined;
}
export const isLastStage = (config: Config, lot: Lot) =>
  !!config.definition.stages.length && config.definition.stages.at(-1)!.key === lot.stage;

export function checkpointPayload(
  lot: Lot,
  checkpoint: Checkpoint,
  {
    value,
    allOk,
    checklist,
    note = '',
    equipmentId = '',
  }: { value?: number; allOk: boolean; checklist?: Record<string, boolean>; note?: string; equipmentId?: string },
) {
  if (checkpoint.response_type !== 'boolean' && !checkpoint.checklist_items?.length && value === undefined)
    throw new Error('positive_quantity');
  if (
    value !== undefined &&
    ((checkpoint.min_plausible !== undefined && value < checkpoint.min_plausible) ||
      (checkpoint.max_plausible !== undefined && value > checkpoint.max_plausible))
  )
    throw new Error('implausibleMeasurement');
  const items = checkpoint.checklist_items ?? [];
  const checks = checklist ?? Object.fromEntries(items.map((item) => [item.key, allOk]));
  return {
    lot_id: lot.id,
    definition_key: checkpoint.key,
    values: {
      value,
      unit: checkpoint.unit ?? '',
      all_ok: items.length ? items.every((item) => checks[item.key]) : allOk,
      checklist: checks,
      equipment_id: equipmentId,
      note,
      confirmed_value: value,
    },
  };
}
export function outOfRange(checkpoint: Checkpoint, value: number | undefined) {
  return (
    value !== undefined &&
    ((checkpoint.min !== undefined && value < checkpoint.min) ||
      (checkpoint.max !== undefined && value > checkpoint.max))
  );
}

/** Batches at the last stage. One still waiting for review can be packed again: a batch may be packed in several sessions. */
export function packableBatches(data: Snapshot) {
  return data.lots
    .filter(
      (l) =>
        l.type === 'batch' &&
        ['draft', 'in_production', 'awaiting_review'].includes(l.state) &&
        isLastStage(lotConfig(data, l), l),
    )
    .sort(byObserved);
}

/**
 * Packed mass against input mass for a batch, counting what was packed before plus `addingKg`.
 * `outside` is true when the procedure sets an expected range and the ratio is missing or beyond it
 * (the same rule as the full workspace's packaging form).
 */
export function batchYield(
  data: Pick<Snapshot, 'lots' | 'edges' | 'packaging'>,
  config: Config,
  batchId: string,
  addingKg: number,
) {
  const inputKg = data.edges
    .filter(
      (e) =>
        e.output_lot_id === batchId &&
        data.lots.some((l) => l.id === e.input_lot_id && ['whey', 'ingredient'].includes(l.type) && l.unit === 'kg'),
    )
    .reduce((sum, e) => sum + Number(e.quantity ?? 0), 0);
  const packedKg =
    data.packaging
      .filter((p) => p.batch_id === batchId)
      .reduce((sum, p) => sum + Number(p.size_kg) * Number(p.package_count), 0) + addingKg;
  const ratio = inputKg > 0 ? packedKg / inputKg : null;
  const expected = config.definition.expected_yield;
  const outside = !!expected && (ratio === null || ratio < expected.min || ratio > expected.max);
  return { inputKg, packedKg, ratio, expected, outside };
}
export function packagingMaterial(data: Pick<Snapshot, 'lots'>, count: number) {
  return data.lots
    .filter((l) => l.type === 'packaging_material' && !unavailable.includes(l.state) && (l.available ?? 0) >= count)
    .sort(byObserved)[0];
}
/** Best-before from the procedure's shelf life for this pouch type, never beyond the overall limit the server enforces. */
export function bestBefore(config: Config, packageType: string, now: Date) {
  const days = Math.min(
    config.definition.shelf_life_by_package?.[packageType] ?? config.definition.shelf_life_days,
    config.definition.shelf_life_days,
  );
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  return date.toISOString().slice(0, 10);
}
export function packagingPayload({
  answers,
  batch,
  material,
  config,
  now,
  reason = '',
}: {
  answers: Answers;
  batch: Lot;
  material: Lot | undefined;
  config: Config;
  now: Date;
  /** Required by the procedure when the packed mass is outside the expected yield. */
  reason?: string;
}) {
  const count = Number(answers.package_count),
    size = Number(answers.size_kg);
  if (!Number.isInteger(count) || count <= 0 || !Number.isFinite(size) || size <= 0)
    throw new Error('positive_quantity');
  if (!material) throw new Error('noPackagingMaterial');
  const type = str(answers.package_type);
  return {
    batch_id: batch.id,
    packaging_material_id: material.id,
    package_type: type,
    size_kg: size,
    package_count: count,
    best_before: bestBefore(config, type, now),
    storage_location: str(answers.storage_location),
    reason: reason.trim(),
    label: config.definition.label_template ?? {},
  };
}

export function sellableLots(data: Pick<Snapshot, 'lots'>, now: Date) {
  return data.lots
    .filter(
      (l) =>
        l.type === 'packaging' &&
        l.state === 'released' &&
        (l.available ?? 0) > 0 &&
        (!l.expires_at || Date.parse(l.expires_at) > now.getTime()),
    )
    .sort(byExpiry);
}
export function salePayload(answers: Answers, lot: Lot) {
  const quantity = Number(answers.quantity),
    price = Number(answers.unit_price);
  if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0)
    throw new Error('positive_quantity');
  if (quantity > (lot.available ?? 0)) throw new Error('saleExceedsStock');
  const currency = str(answers.currency) || 'USD';
  const rate = currency === 'USD' ? 1 : Number(answers.usd_rate);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('rateRequired');
  return {
    packaging_lot_id: lot.id,
    quantity,
    transaction_type: 'sale',
    customer_category: str(answers.customer_category),
    total: Math.round(quantity * price * 100) / 100,
    currency,
    usd_rate: rate,
  };
}
