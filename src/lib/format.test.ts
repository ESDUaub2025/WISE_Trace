import { describe, it, expect, vi } from 'vitest';
import { formatNumber, formatLocalDate } from './format';
describe('bilingual producer formatting', () => {
  it('uses Western digits for Arabic quantities and label weights', () => {
    expect(formatNumber(1250.75, 'ar', { maximumFractionDigits: 3 })).toContain('1,250.75');
    expect(formatNumber(1250.75, 'en', { maximumFractionDigits: 3 })).toBe('1,250.75');
  });
  it('localizes the month while keeping Beirut time and Western digits', () => {
    const ar = formatLocalDate('2026-10-06T13:00:00Z', 'ar');
    expect(ar).toContain('16:00');
    expect(ar).toMatch(/[\u0600-\u06ff]/);
    expect(ar).not.toMatch(/[\u0660-\u0669\u06f0-\u06f9]/);
    expect(formatLocalDate('2026-01-06T13:00:00Z', 'en')).toContain('15:00');
  });
  it('uses Eastern Arabic digits only after an explicit Arabic display preference', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'arab' });
    expect(formatNumber(123, 'ar')).toBe('١٢٣');
    expect(formatNumber(123, 'en')).toBe('123');
    expect(formatLocalDate('2026-10-06T13:00:00Z', 'ar')).toContain('١٦:٠٠');
    vi.unstubAllGlobals();
  });
});
