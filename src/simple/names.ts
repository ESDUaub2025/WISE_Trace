// Everyday names for lots ("Kishk · Tuesday") instead of codes like KB-AKR01-261027-002.
import type { Lot, Supplier } from '../lib/domain';

export interface NameWords {
  whey: string;
  batch: string;
  packaging: string;
  material: string;
  today: string;
  yesterday: string;
}
const zone = 'Asia/Beirut';
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: zone });

/** Today, yesterday, a weekday within the last week, otherwise the date: whatever a person would say out loud. */
export function dayLabel(iso: string, now: Date, language: string, words: Pick<NameWords, 'today' | 'yesterday'>) {
  const day = dayOf(iso),
    today = dayOf(now.toISOString());
  const ago = Math.round((Date.parse(today) - Date.parse(day)) / 86400000);
  if (ago === 0) return words.today;
  if (ago === 1) return words.yesterday;
  const locale = language === 'ar' ? 'ar-LB' : 'en-GB';
  if (ago > 1 && ago < 7) return new Date(iso).toLocaleDateString(locale, { weekday: 'long', timeZone: zone });
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: zone });
}

export function friendlyName(
  lot: Lot,
  lots: Lot[],
  suppliers: Supplier[],
  now: Date,
  language: string,
  words: NameWords,
) {
  const kind =
    lot.type === 'whey'
      ? words.whey
      : lot.type === 'batch'
        ? words.batch
        : lot.type === 'packaging'
          ? words.packaging
          : words.material;
  const sameDay = lots
    .filter((l) => l.type === lot.type && dayOf(l.observed_at) === dayOf(lot.observed_at))
    .sort((a, b) => a.observed_at.localeCompare(b.observed_at) || a.id.localeCompare(b.id));
  const number = sameDay.length > 1 ? ` ${sameDay.findIndex((l) => l.id === lot.id) + 1}` : '';
  const supplier = lot.type === 'whey' ? suppliers.find((s) => s.id === lot.supplier_id)?.name : undefined;
  return `${kind}${number} · ${dayLabel(lot.observed_at, now, language, words)}${supplier ? ` · ${supplier}` : ''}`;
}
