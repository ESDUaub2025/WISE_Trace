import type { Snapshot } from '../lib/data';
import type { Lot } from '../lib/domain';
import { lotConfig } from '../lib/schedules';
import { nextForBatch, type Job } from '../simple/jobs';
import type { WorkerWord } from './copy';

export const taskPath = (job: Job) =>
  `/task/${job.pipeline}/${job.lotId ?? ''}${job.checkpoint ? '/' + encodeURIComponent(job.checkpoint) : ''}`;

export function nextJob(data: Snapshot, lot: Lot): Job | undefined {
  if (lot.sync_status === 'conflict') return undefined;
  if (lot.type === 'batch' && ['draft', 'in_production'].includes(lot.state))
    return nextForBatch(data, lot, new Date());
  if (lot.type === 'whey' && ['received', 'hold'].includes(lot.state))
    return { key: `review:${lot.id}`, pipeline: 'decide', lotId: lot.id, overdue: false };
  return undefined;
}

export const jobWord = (job: Job): WorkerWord =>
  ({
    receive: 'receive',
    batch: 'batch',
    check: 'check',
    stage: 'move',
    pack: 'pack',
    sell: 'sell',
    decide: 'review',
    full_app: 'view',
  })[job.pipeline] as WorkerWord;

export function lotStatus(data: Snapshot, lot: Lot, arabic: boolean, w: (key: WorkerWord) => string) {
  if (lot.type === 'batch' && ['draft', 'in_production'].includes(lot.state)) {
    const stage = lotConfig(data, lot).definition.stages.find((s) => s.key === lot.stage);
    if (stage) return arabic ? stage.label.ar : stage.label.en;
  }
  // Materials and ingredients are never decided on: they are simply in stock or used up.
  if (['ingredient', 'packaging_material'].includes(lot.type))
    return w((lot.available ?? 0) > 0 ? 'inStock' : 'usedUp');
  if (lot.type === 'batch' && lot.facts.abandoned) return w('stopped');
  if (lot.type === 'packaging' && lot.state === 'released' && (lot.available ?? 0) <= 0) return w('soldOut');
  const states: WorkerWord[] = [
    'received',
    'accepted',
    'hold',
    'rejected',
    'draft',
    'in_production',
    'awaiting_review',
    'released',
    'closed',
  ];
  return states.includes(lot.state as WorkerWord) ? w(lot.state as WorkerWord) : w('record');
}

/** Problems on a record that nobody has resolved yet. */
export function openProblems(data: Pick<Snapshot, 'deviations'>, lotId: string) {
  return data.deviations.filter((d) => d.lot_id === lotId && !['closed', 'resolved'].includes(String(d.status)));
}

/** The name a person goes by in this workspace, for "who recorded this". */
export function personName(data: Pick<Snapshot, 'members'>, id: unknown) {
  const member = data.members.find((m) => m.id === id);
  return typeof member?.display_name === 'string' ? member.display_name : '';
}

export function dateText(value: unknown, arabic: boolean, time = false) {
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(arabic ? 'ar-LB' : 'en-GB', {
    timeZone: 'Asia/Beirut',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(time ? ({ hour: '2-digit', minute: '2-digit' } as const) : {}),
  }).format(date);
}

/** Never turn arbitrary stored data into UI text. Only explicitly understood evidence is presented. */
export function evidenceText(payload: Record<string, unknown>, arabic: boolean, yes: string, no: string): string[] {
  const out: string[] = [];
  const value = payload.value ?? payload.confirmed_value;
  if (typeof value === 'number' && Number.isFinite(value))
    out.push(
      `${new Intl.NumberFormat(arabic ? 'ar-LB' : 'en-GB').format(value)} ${typeof payload.unit === 'string' ? payload.unit : ''}`.trim(),
    );
  else if (typeof value === 'boolean') out.push(value ? yes : no);
  if (typeof payload.all_ok === 'boolean') out.push(payload.all_ok ? yes : no);
  for (const key of ['note', 'reason']) if (typeof payload[key] === 'string' && payload[key]) out.push(payload[key]);
  return out;
}
