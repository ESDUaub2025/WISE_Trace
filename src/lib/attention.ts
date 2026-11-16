import type { Identity, Lot, Task } from './domain';
import type { Snapshot } from './data';
import { lotConfig } from './schedules';

export function responsibleFor(lot: Lot, identity: Identity) {
  return String(lot.facts.responsible_producer ?? lot.producer_id) === identity.id;
}
export function attentionTasks(data: Snapshot, identity: Identity): Task[] {
  const oversight = identity.roles.some((r) => ['supervisor', 'manager', 'admin', 'food_safety'].includes(r));
  return data.tasks
    .filter((task) => {
      if (task.status !== 'open') return false;
      if (task.user_id) return task.user_id === identity.id || oversight;
      if (oversight) return true;
      const lot = data.lots.find((l) => l.id === task.lot_id);
      if (lot && lot.type === 'batch') {
        if (!responsibleFor(lot, identity)) return false;
        const role = lotConfig(data, lot).definition.checkpoints.find(
          (c) => c.key === task.details.definition_key,
        )?.responsible_role;
        return !role || identity.roles.includes(role);
      }
      return ['expiry', 'held_whey_expiry', 'calibration', 'sync_conflict'].includes(task.kind);
    })
    .sort((a, b) => a.due_at.localeCompare(b.due_at));
}
