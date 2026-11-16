import { createContext, useContext, useEffect, useState } from 'react';
import type { Snapshot } from '../lib/data';
import type { Identity, Lot } from '../lib/domain';
import type { Settings } from './settings';
import { friendlyName } from './names';
import { useText } from './text';

export interface SimpleContextValue {
  settings: Settings;
  identity: Identity | null;
  data?: Snapshot;
}
export const SimpleContext = createContext<SimpleContextValue | null>(null);
export function useSimple() {
  const value = useContext(SimpleContext);
  if (!value) throw new Error('SimpleContext missing');
  return value;
}
export const useStyle = () => useContext(SimpleContext)?.settings.style ?? 'cards';

/** Everyday name for a lot, with its code only when the settings ask for it. */
export function useNames() {
  const { t, arabic } = useText();
  const { data, settings } = useSimple();
  const words = {
    whey: t('nameWhey'),
    batch: t('nameBatch'),
    packaging: t('namePouches'),
    material: t('nameMaterial'),
    today: t('today'),
    yesterday: t('yesterday'),
  };
  return (lot: Lot | undefined) => {
    if (!lot) return '';
    const name = friendlyName(lot, data?.lots ?? [lot], data?.suppliers ?? [], new Date(), arabic ? 'ar' : 'en', words);
    return settings.showCodes ? `${name} · ${lot.code}` : name;
  };
}

/** A tip shown the first time a person meets a screen, then never again on this device. */
export function useHint(key: string | undefined) {
  const { settings, identity } = useContext(SimpleContext) ?? {};
  const storage = `wise-simple-hints:${identity?.id ?? 'anyone'}`;
  const [show] = useState(() => {
    if (!key || !settings?.hints) return false;
    try {
      return !(JSON.parse(localStorage.getItem(storage) ?? '[]') as string[]).includes(key);
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!show || !key) return;
    try {
      const seen = JSON.parse(localStorage.getItem(storage) ?? '[]') as string[];
      localStorage.setItem(storage, JSON.stringify([...new Set([...seen, key])]));
    } catch {
      /* tips simply show again */
    }
  }, [show, key, storage]);
  return show;
}
