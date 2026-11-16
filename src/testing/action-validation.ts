import type { Envelope } from '../lib/domain';
import { demoConfig } from '../lib/demo';

interface Stock {
  type: string;
  state: string;
  quantity: number;
  unit: string;
  generation?: string;
  facts: Record<string, unknown>;
  batch?: string;
  stage?: string;
  packed?: boolean;
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Client-side consistency checks for this intentionally open test service. Not a production security boundary. */
export function validateTestAction(history: Envelope[], action: Envelope, now = Date.now()): string | undefined {
  const stock = new Map<string, Stock>();
  const checks = new Map<string, Set<string>>();
  const problems = new Set<string>();
  const applyAllocation = (value: Record<string, unknown>) => {
    const input = stock.get(String(value.input_lot_id));
    if (input) input.quantity -= Number(value.quantity);
  };
  for (const record of history) {
    const p = record.payload;
    if (record.action === 'receipt')
      stock.set(record.id, {
        type: String(p.type),
        state: 'received',
        quantity: Number(p.quantity),
        unit: String(p.unit),
        generation: p.generation_at as string | undefined,
        facts: object(p.facts),
      });
    if (record.action === 'batch') {
      stock.set(record.id, {
        type: 'batch',
        state: 'draft',
        quantity: 0,
        unit: 'kg',
        facts: {},
        stage: demoConfig.definition.stages[0]?.key,
      });
      if (Array.isArray(p.allocations)) p.allocations.forEach((a) => applyAllocation(object(a)));
    }
    if (record.action === 'allocation') applyAllocation(p);
    if (record.action === 'stage') {
      const item = stock.get(String(p.lot_id));
      if (item) item.stage = String(p.next_stage);
    }
    if (['testing_review', 'whey_decision'].includes(record.action)) {
      const item = stock.get(String(p.lot_id));
      if (item) item.state = String(p.outcome);
    }
    if (record.action === 'checkpoint') {
      const values = object(p.values);
      const keys = checks.get(String(p.lot_id)) ?? new Set<string>();
      if (values.all_ok !== false) keys.add(String(p.definition_key));
      else {
        keys.delete(String(p.definition_key));
        // A check that did not pass is an open problem until someone records how it was resolved.
        problems.add(String(p.lot_id));
      }
      checks.set(String(p.lot_id), keys);
    }
    if (record.action === 'deviation' && !['closed', 'resolved'].includes(String(p.status)))
      problems.add(String(p.lot_id));
    if (record.action === 'testing_resolve') problems.delete(String(p.lot_id));
    if (record.action === 'packaging') {
      stock.set(record.id, {
        type: 'packaging',
        state: 'awaiting_review',
        quantity: Number(p.package_count),
        unit: 'unit',
        facts: p,
        batch: String(p.batch_id),
      });
      const material = stock.get(String(p.packaging_material_id));
      if (material) material.quantity -= Number(p.package_count);
      const batch = stock.get(String(p.batch_id));
      if (batch) batch.packed = true;
    }
    if (record.action === 'sale') {
      const item = stock.get(String(p.packaging_lot_id));
      if (item) item.quantity -= Number(p.quantity);
    }
    if (record.action === 'movement') {
      const item = stock.get(String(p.lot_id));
      if (item) item.quantity += Number(p.quantity);
    }
    if (record.action === 'material_disposition') {
      const item = stock.get(String(p.lot_id));
      if (item) {
        item.quantity -= Number(p.quantity);
        if (p.close_lot) item.state = 'closed';
      }
    }
    if (record.action === 'abandon') {
      const item = stock.get(String(p.lot_id));
      if (item) item.state = 'rejected';
    }
  }
  const p = action.payload;
  const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;
  if (action.action === 'receipt' && !positive(p.quantity)) return 'positive_quantity';
  // A stopped batch takes no further production records.
  if (['stage', 'checkpoint', 'abandon'].includes(action.action)) {
    const item = stock.get(String(p.lot_id));
    if (item?.type === 'batch' && item.state === 'rejected') return 'batchStopped';
  }
  if (action.action === 'abandon') {
    const item = stock.get(String(p.lot_id));
    if (!item || item.type !== 'batch') return 'fileInvalidRecord';
    if (String(p.reason ?? '').trim().length < 3) return 'reasonRequired';
    // PRD FR-BAT-10: a batch may be abandoned before packaging; packed kishk is rejected through its review instead.
    if (item.packed) return 'batchAlreadyPacked';
  }
  if (action.action === 'stage') {
    const item = stock.get(String(p.lot_id));
    const index = demoConfig.definition.stages.findIndex((s) => s.key === item?.stage);
    if (!item || demoConfig.definition.stages[index + 1]?.key !== p.next_stage) return 'stageChanged';
    if (
      demoConfig.definition.checkpoints.some(
        (c) => c.stage === item.stage && c.required && !checks.get(String(p.lot_id))?.has(c.key),
      )
    )
      return 'stageChecksFirst';
  }
  const allocations =
    action.action === 'batch' && Array.isArray(p.allocations)
      ? p.allocations.map(object)
      : action.action === 'allocation'
        ? [p]
        : [];
  const totals = new Map<string, number>();
  for (const allocation of allocations) {
    const id = String(allocation.input_lot_id),
      input = stock.get(id);
    if (!input || !positive(allocation.quantity)) return 'positive_quantity';
    if (['hold', 'rejected', 'closed'].includes(input.state)) return 'wheyNotAccepted';
    if (
      input.type === 'whey' &&
      (input.state !== 'accepted' ||
        (input.generation && Date.parse(input.generation) + demoConfig.definition.whey_max_age_hours * 3600000 <= now))
    )
      return 'wheyNotAccepted';
    if (String(allocation.unit) !== input.unit) return 'allocationUnitMismatch';
    const used = (totals.get(id) ?? 0) + Number(allocation.quantity);
    totals.set(id, used);
    if (used > input.quantity) return 'over_allocation';
  }
  if (action.action === 'packaging') {
    const batch = stock.get(String(p.batch_id));
    if (batch?.stage !== demoConfig.definition.stages.at(-1)?.key || batch?.state === 'rejected') return 'noBatchReady';
    // Same rule as the WISE server: output far from what the inputs can give needs a written reason.
    const expected = demoConfig.definition.expected_yield;
    if (expected && String(p.reason ?? '').trim().length < 5) {
      const mass = (records: Envelope[]) =>
        records.reduce((sum, r) => {
          const payload = r.payload;
          if (r.action === 'packaging' && payload.batch_id === p.batch_id)
            return sum + Number(payload.size_kg) * Number(payload.package_count);
          return sum;
        }, 0);
      const input = history
        .filter((r) => r.action === 'batch' && r.id === p.batch_id)
        .flatMap((r) => (Array.isArray(r.payload.allocations) ? r.payload.allocations.map(object) : []))
        .filter((a) => a.unit === 'kg')
        .reduce((sum, a) => sum + Number(a.quantity), 0);
      const ratio = input > 0 ? (mass(history) + Number(p.size_kg) * Number(p.package_count)) / input : null;
      if (ratio === null || ratio < expected.min || ratio > expected.max) return 'yieldReasonRequired';
    }
    const material = stock.get(String(p.packaging_material_id));
    if (
      !material ||
      material.type !== 'packaging_material' ||
      material.unit !== 'unit' ||
      material.quantity < Number(p.package_count)
    )
      return 'noPackagingMaterial';
    if (!Number.isInteger(p.package_count) || !positive(p.package_count) || !positive(p.size_kg))
      return 'positive_quantity';
    if (!stock.has(String(p.batch_id))) return 'noBatchReady';
  }
  if (action.action === 'sale') {
    const item = stock.get(String(p.packaging_lot_id));
    if (!item || item.state !== 'released') return 'notReleased';
    if (!Number.isInteger(p.quantity) || !positive(p.quantity) || Number(p.quantity) > item.quantity)
      return 'saleExceedsStock';
    if (item.facts.best_before && Date.parse(String(item.facts.best_before) + 'T23:59:59+02:00') < now)
      return 'expiredStock';
  }
  if (action.action === 'testing_review') {
    const item = stock.get(String(p.lot_id));
    if (!item || String(p.reason ?? '').trim().length < 3 || p.test_only !== true) return 'reasonRequired';
    const outcomes = item.type === 'packaging' ? ['released', 'hold', 'rejected'] : ['accepted', 'hold', 'rejected'];
    if (!['whey', 'packaging'].includes(item.type) || !outcomes.includes(String(p.outcome))) return 'fileInvalidRecord';
    if (p.outcome === 'accepted') {
      if (item.generation && Date.parse(item.generation) + demoConfig.definition.whey_max_age_hours * 3600000 <= now)
        return 'wheyNotAccepted';
      if (problems.has(String(p.lot_id))) return 'reviewProblemsFirst';
      for (const rule of demoConfig.definition.reception_measurements ?? []) {
        const value = item.facts[rule.key];
        if (rule.required && (typeof value !== 'number' || !Number.isFinite(value)))
          return 'receptionMeasurementRequired';
        if (
          typeof value === 'number' &&
          ((rule.min !== undefined && value < rule.min) || (rule.max !== undefined && value > rule.max))
        )
          return 'reviewOutsideLimits';
      }
      if (
        item.facts.appearance === 'abnormal' ||
        item.facts.odour === 'abnormal' ||
        item.facts.container_condition === 'damaged'
      )
        return 'reviewOutsideLimits';
    }
    if (p.outcome === 'released') {
      if (problems.has(String(p.lot_id)) || problems.has(item.batch ?? '')) return 'reviewProblemsFirst';
      if (demoConfig.definition.checkpoints.some((c) => c.required && !checks.get(item.batch ?? '')?.has(c.key)))
        return 'reviewChecksFirst';
    }
  }
  return undefined;
}
