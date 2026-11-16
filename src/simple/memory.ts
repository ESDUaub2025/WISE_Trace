// Turns past records into today's starting answers, and splits questions into asked, confirmed and silent.
import type { Lot, Supplier } from '../lib/domain';
import type { Snapshot } from '../lib/data';
import type { Answer, Question } from './settings';

export type Answers = Record<string, Answer | undefined>;

/** Whey older than this was certainly not "made a few hours ago": a slip of the finger, not a delivery. */
export const maxHoursAgo = 24 * 14;

/**
 * What is wrong with a typed number, as a wording key, or undefined when it can be used.
 * Checked on the question's own screen, so a slip is corrected where it was made instead of at the final save.
 */
export function numberProblem(question: Question, value: Answer | undefined): string | undefined {
  if (question.input !== 'number' && question.input !== 'hours_ago') return undefined;
  if (value === undefined || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) return 'needNumber';
  if (question.input === 'hours_ago') return number < 0 || number > maxHoursAgo ? 'needHours' : undefined;
  if (number < 0 || (number === 0 && !question.zero_allowed)) return 'needPositive';
  if (question.whole && !Number.isInteger(number)) return 'needWhole';
  return undefined;
}
export interface Resolved {
  /** Shown one by one. Starts from the question default. */
  ask: Question[];
  /** Shown together on one "same as usual?" card. */
  usual: { question: Question; value: Answer }[];
  /** Recorded without being shown. */
  silent: { question: Question; value: Answer }[];
}

export function resolveQuestions(questions: Question[], remembered: Answers): Resolved {
  const result: Resolved = { ask: [], usual: [], silent: [] };
  for (const question of questions) {
    if (question.memory === 'fixed') {
      result.silent.push({ question, value: question.default! });
      continue;
    }
    if (question.memory === 'every_time') {
      result.ask.push(question);
      continue;
    }
    // Only something actually remembered is "usual"; a default alone just pre-fills the question.
    const value = remembered[question.key];
    if (value === undefined || value === '') result.ask.push(question);
    else result.usual.push({ question, value });
  }
  return result;
}

/** Starting values for every question: remembered or usual values, then defaults. */
export function startingAnswers(resolved: Resolved): Answers {
  const known: [string, Answer | undefined][] = [...resolved.usual, ...resolved.silent].map(({ question, value }) => [
    question.key,
    value,
  ]);
  return Object.fromEntries([...known, ...resolved.ask.map((q) => [q.key, q.default] as [string, Answer | undefined])]);
}

/** Where each answer came from, stored with the record so reviewers can see what was confirmed rather than typed. */
export function answerSources(resolved: Resolved, answers: Answers) {
  const sources: Record<string, string> = {};
  for (const { question, value } of resolved.usual)
    sources[question.key] = answers[question.key] === value ? `${question.memory}_confirmed` : 'changed';
  for (const { question } of resolved.silent) sources[question.key] = 'fixed';
  for (const question of resolved.ask) sources[question.key] = 'asked';
  return sources;
}

const newest = (a: { observed_at: string }, b: { observed_at: string }) => b.observed_at.localeCompare(a.observed_at);
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);

function pasteurized(value: unknown) {
  return value === true || value === 'yes'
    ? 'yes'
    : value === false || value === 'no'
      ? 'no'
      : value === 'unknown'
        ? 'unknown'
        : undefined;
}

/** Answers from a previous whey receipt, in the simple app's question keys. */
export function receiptAnswers(lot: Lot): Answers {
  const facts = lot.facts ?? {};
  const declarations = (facts.declarations ?? {}) as Record<string, unknown>;
  const made = lot.generation_at
    ? Math.round((Date.parse(lot.observed_at) - Date.parse(lot.generation_at)) / 3600000)
    : undefined;
  return {
    quantity: lot.initial_quantity || undefined,
    unit: text(lot.unit),
    hours_since_made: made !== undefined && made >= 0 ? made : undefined,
    pasteurized: pasteurized(declarations.pasteurized),
    milk_species: text(facts.milk_species),
    transport_method: text(facts.transport_method),
    container_type: text(facts.container_type),
    container_condition: text(facts.container_condition),
    appearance: text(facts.appearance),
    odour: text(facts.odour),
    labneh_lot: text(facts.labneh_lot),
  };
}

/** Remembered receiving answers: this supplier's last delivery first, then the supplier profile, then any recent delivery for habits. */
export function rememberedReceipt(
  data: Pick<Snapshot, 'lots'>,
  supplier: Supplier | undefined,
  questions: Question[],
): Answers {
  const whey = data.lots.filter((l) => l.type === 'whey').sort(newest);
  const sameSupplier = whey.find((l) => supplier && l.supplier_id === supplier.id);
  const fromSupplier = {
    ...(supplier
      ? {
          pasteurized: pasteurized(supplier.declarations?.pasteurized),
          milk_species: text(supplier.declarations?.milk_species),
        }
      : {}),
    ...(sameSupplier ? definedOnly(receiptAnswers(sameSupplier)) : {}),
  };
  const fromAny = whey[0] ? receiptAnswers(whey[0]) : {};
  return Object.fromEntries(
    questions.map((q) => [
      q.key,
      q.memory === 'per_supplier'
        ? fromSupplier[q.key as keyof typeof fromSupplier]
        : q.memory === 'last_time'
          ? (fromSupplier[q.key as keyof typeof fromSupplier] ?? fromAny[q.key])
          : undefined,
    ]),
  );
}

export function rememberedPacking(data: Pick<Snapshot, 'packaging' | 'lots'>): Answers {
  const observed = (row: Record<string, unknown>) => data.lots.find((l) => l.id === row.lot_id)?.observed_at ?? '';
  const last = [...(data.packaging ?? [])].sort((a, b) => observed(b).localeCompare(observed(a)))[0];
  return last
    ? {
        package_type: text(last.package_type),
        size_kg: last.size_kg == null ? undefined : String(Number(last.size_kg)),
        package_count: Number(last.package_count) || undefined,
        storage_location: text(last.storage_location),
      }
    : {};
}

export function rememberedSale(data: Pick<Snapshot, 'sales'>): Answers {
  const last = [...(data.sales ?? [])]
    .filter((s) => s.transaction_type === 'sale' && Number(s.quantity) > 0)
    .sort((a, b) => String(b.observed_at).localeCompare(String(a.observed_at)))[0];
  if (!last) return {};
  return {
    quantity: Number(last.quantity) || undefined,
    unit_price: Math.round((Number(last.total) / Number(last.quantity)) * 100) / 100,
    currency: text(last.currency),
    usd_rate: last.currency === 'USD' ? undefined : Number(last.usd_rate) || undefined,
    customer_category: text(last.customer_category),
  };
}

function definedOnly(answers: Answers) {
  return Object.fromEntries(Object.entries(answers).filter(([, value]) => value !== undefined));
}
