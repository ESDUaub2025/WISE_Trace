import { describe, expect, it } from 'vitest';
import { ar, en } from './words';

const base = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, '');

describe('simple app words', () => {
  it('has Arabic for every English phrase, and nothing Arabic-only', () => {
    expect([...new Set(Object.keys(ar).map(base))].sort()).toEqual([...new Set(Object.keys(en).map(base))].sort());
  });
  it('keeps the same placeholders in both languages', () => {
    for (const key of Object.keys(en)) {
      const holes = (text: string) =>
        [...text.matchAll(/{{(\w+)}}/g)]
          .map((m) => m[1])
          .filter((name) => name !== 'count')
          .sort();
      const arabic = Object.entries(ar)
        .filter(([k]) => base(k) === base(key))
        .map(([, v]) => v);
      for (const text of arabic) expect(holes(text), key).toEqual(holes(en[key as keyof typeof en]));
    }
  });
});
