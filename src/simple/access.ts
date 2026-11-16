import type { Identity, Lot } from '../lib/domain';
import type { Settings } from './settings';

export function recordersFor(settings: Settings, cooperativeCode: string) {
  return settings.recording.recorders[cooperativeCode] ?? settings.recording.recorders['*'] ?? [];
}
/** The simple app's own recording policy. The server still enforces roles and authorizations on every record. */
export function canRecord(identity: Identity, settings: Settings, cooperativeCode: string) {
  if (!identity.roles.some((role) => settings.recording.roles.includes(role))) return false;
  return (
    settings.recording.mode === 'every_producer' || recordersFor(settings, cooperativeCode).includes(identity.username)
  );
}
/** Mirrors the full app: supervisors and food-safety leads decide; producers decide on whey only with the receiving authorization. */
export function canDecide(identity: Identity, lot: Pick<Lot, 'type'>) {
  return (
    identity.roles.some((role) => ['supervisor', 'food_safety'].includes(role)) ||
    (lot.type === 'whey' && !!identity.authorizations.receive_whey)
  );
}
export function canReceiveWhey(identity: Identity) {
  return identity.roles.includes('supervisor') || !!identity.authorizations.receive_whey;
}
