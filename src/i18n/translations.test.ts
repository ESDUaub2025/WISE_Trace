import { it, expect } from 'vitest';
import en from './en.json';
import ar from './ar.json';
it('all English keys have readable Arabic translations', () => {
  for (const key of Object.keys(en)) {
    expect(ar, key).toHaveProperty(key);
    const value = ar[key as keyof typeof ar];
    expect(value, key).not.toMatch(/\?{3,}/);
    expect(value, key).toMatch(/[\u0600-\u06ff]|^(WISE|English)$/);
  }
});
