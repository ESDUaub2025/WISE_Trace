import { describe, expect, it } from 'vitest';
import { defaultSettings } from './settings';
import { rememberedPacking, rememberedReceipt, resolveQuestions, startingAnswers } from './memory';
import { cedar, snapshot } from './fixtures.test-helpers';

describe('a first-time person', () => {
  it('is never shown a "same as usual" answer that nobody gave before', () => {
    const newSupplier = { ...cedar, declarations: {} };
    const questions = defaultSettings.questions.receive;
    const resolved = resolveQuestions(questions, rememberedReceipt(snapshot(), newSupplier, questions));
    expect(resolved.usual).toEqual([]);
    // Defaults still save typing: they pre-fill the question instead.
    expect(startingAnswers(resolved).hours_since_made).toBe(3);
    expect(resolved.ask.map((q) => q.key)).toContain('hours_since_made');
  });
  it('packs the first time with the usual pouch pre-selected but asked', () => {
    const resolved = resolveQuestions(defaultSettings.questions.pack, rememberedPacking(snapshot()));
    expect(resolved.usual).toEqual([]);
    expect(startingAnswers(resolved)).toMatchObject({
      package_type: 'kraft',
      size_kg: '0.5',
      storage_location: 'Dry store',
    });
  });
});
