// "Training wheels": start actions appear only once the person has done what comes before them.
import type { Identity, Lot } from '../lib/domain';
import type { Snapshot } from '../lib/data';
import { lotConfig } from '../lib/schedules';
import { isLastStage } from './payloads';
import type { Action, Settings, Unlock } from './settings';

const pastPacking = ['awaiting_review', 'released', 'closed', 'recalled'];

/** Whether the work behind an unlock has happened, counting this person's lots or the whole cooperative's. */
export function reached(
  data: Pick<Snapshot, 'lots' | 'sales' | 'configs' | 'config'>,
  unlock: Unlock,
  mine: (lot: Lot) => boolean,
): boolean {
  const lots = data.lots.filter(mine);
  if (unlock === 'always') return true;
  if (unlock === 'whey_accepted')
    return (
      lots.some((l) => l.type === 'whey' && ['accepted', 'closed'].includes(l.state)) ||
      lots.some((l) => l.type === 'batch')
    );
  if (unlock === 'batch_at_last_stage')
    return (
      lots.some((l) => l.type === 'packaging') ||
      lots.some(
        (l) => l.type === 'batch' && (pastPacking.includes(l.state) || isLastStage(lotConfig(data as Snapshot, l), l)),
      )
    );
  return (
    lots.some((l) => l.type === 'packaging' && ['released', 'closed'].includes(l.state)) ||
    (data.sales ?? []).length > 0
  );
}

export function unlockedActions(data: Snapshot, identity: Identity, settings: Settings): Action[] {
  const { levels } = settings;
  const everything =
    levels.mode === 'all' ||
    identity.roles.some((r) => levels.everythingFor.includes(r)) ||
    levels.experienced.includes(identity.username);
  const mine = (lot: Lot) =>
    levels.basis === 'cooperative' ||
    lot.producer_id === identity.id ||
    lot.facts?.responsible_producer === identity.id;
  return settings.home.actions.filter(
    (action) => everything || reached(data, levels.unlocks[action] ?? 'always', mine),
  );
}

/** Actions unlocked since the person last saw the home screen; the first visit celebrates nothing. */
export function newlyUnlocked(seen: string[] | null, now: Action[]): Action[] {
  return seen === null ? [] : now.filter((action) => !seen.includes(action));
}
