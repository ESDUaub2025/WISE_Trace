// Turns server tasks and batches in progress into one-tap jobs, each opening the pipeline that finishes it.
import type { Config, Identity, Lot } from '../lib/domain';
import type { Snapshot } from '../lib/data';
import { attentionTasks, responsibleFor } from '../lib/attention';
import { lotConfig } from '../lib/schedules';
import type { Action, Pipeline, Settings } from './settings';
import { canDecide, canRecord } from './access';
import { isLastStage, sellableLots, stageCheckpoints, usableWhey } from './payloads';

export interface Job {
  key: string;
  pipeline: Pipeline;
  lotId?: string;
  checkpoint?: string;
  taskKind?: string;
  dueAt?: string;
  overdue: boolean;
}
export interface Journey {
  lot: Lot;
  stageIndex: number;
  stageCount: number;
  next: Job;
}

/** Required checks of the batch's current stage with no record yet; the server refuses to advance until they exist. */
export function missingChecks(data: Pick<Snapshot, 'records'>, config: Config, lot: Lot) {
  return stageCheckpoints(config, lot).filter((c) => {
    if (!c.required) return false;
    const latest = data.records
      .filter((r) => r.lot_id === lot.id && r.definition_key === c.key)
      .sort((a, b) => String(a.observed_at).localeCompare(String(b.observed_at)))
      .at(-1);
    return !latest || (latest.payload as Record<string, unknown> | undefined)?.all_ok === false;
  });
}

/** What finishing a batch's current stage means: a missing check first, then packing at the last stage, otherwise moving on. */
export function nextForBatch(data: Snapshot, lot: Lot, now: Date): Job {
  const config = lotConfig(data, lot);
  const due = data.tasks.find(
    (t) =>
      t.status === 'open' &&
      t.kind === 'checkpoint_due' &&
      Date.parse(t.due_at) <= now.getTime() &&
      t.lot_id === lot.id &&
      stageCheckpoints(config, lot).some((c) => c.key === t.details.definition_key),
  );
  const missing = missingChecks(data, config, lot)[0];
  const checkpoint = due ? String(due.details.definition_key) : missing?.key;
  if (checkpoint)
    return {
      key: `check:${lot.id}:${checkpoint}`,
      pipeline: 'check',
      lotId: lot.id,
      checkpoint,
      dueAt: due?.due_at,
      overdue: !!due && Date.parse(due.due_at) < now.getTime(),
    };
  return isLastStage(config, lot)
    ? { key: `pack:${lot.id}`, pipeline: 'pack', lotId: lot.id, overdue: false }
    : { key: `stage:${lot.id}`, pipeline: 'stage', lotId: lot.id, overdue: false };
}

/** Moving a stage only works once its checks exist and before the last stage, so such a job opens the check or packing instead. */
export function resolveJob(data: Snapshot, job: Job, now: Date): Job {
  if (job.pipeline !== 'stage') return job;
  const lot = data.lots.find((l) => l.id === job.lotId);
  return lot ? nextForBatch(data, lot, now) : job;
}

function sees(lot: Lot, identity: Identity, everyone: boolean) {
  return everyone || responsibleFor(lot, identity);
}

export function jobsFor(
  data: Snapshot,
  identity: Identity,
  settings: Settings,
  cooperativeCode: string,
  now: Date,
): Job[] {
  const recorder = canRecord(identity, settings, cooperativeCode);
  // A designated recorder works on behalf of the whole cooperative, so sees every production task.
  const everyone = settings.recording.mode === 'designated' && recorder;
  const tasks = everyone ? data.tasks.filter((t) => t.status === 'open') : attentionTasks(data, identity);
  const jobs: Job[] = [];
  for (const task of tasks) {
    const lot = data.lots.find((l) => l.id === task.lot_id);
    let pipeline: Pipeline | null = settings.jobs[task.kind] ?? 'full_app';
    if (pipeline === 'decide')
      pipeline = lot && canDecide(identity, lot) ? (lot.type === 'whey' ? 'decide' : 'full_app') : null;
    else if (pipeline === 'check' || pipeline === 'stage')
      pipeline =
        recorder && lot?.type === 'batch' && sees(lot, identity, everyone || identity.roles.includes('supervisor'))
          ? pipeline
          : null;
    // Expiring whey becomes "use it in a batch" only while it can still be used; expired whey needs disposal in the full app.
    else if (pipeline === 'batch') {
      const usable =
        lot?.type === 'whey' &&
        lot.state === 'accepted' &&
        (lot.available ?? 0) > 0 &&
        (!lot.expires_at || Date.parse(lot.expires_at) > now.getTime());
      pipeline = usable
        ? recorder
          ? 'batch'
          : null
        : lot?.type === 'whey' &&
            ['hold', 'received'].includes(lot.state) &&
            canDecide(identity, lot) &&
            (!lot.expires_at || Date.parse(lot.expires_at) > now.getTime())
          ? 'decide'
          : 'full_app';
    }
    // Someone who does not record here only gets decisions they are allowed to make.
    if (!recorder && pipeline !== 'decide') pipeline = null;
    if (!pipeline) continue;
    jobs.push({
      key: `${pipeline}:${task.lot_id ?? task.id}:${String(task.details?.definition_key ?? '')}`,
      pipeline,
      lotId: task.lot_id,
      checkpoint: pipeline === 'check' ? String(task.details?.definition_key ?? '') : undefined,
      taskKind: task.kind,
      dueAt: task.due_at,
      overdue: Date.parse(task.due_at) < now.getTime(),
    });
  }
  const unique = [...new Map(jobs.map((job) => [job.key, job])).values()];
  // Work someone can finish here comes before work that needs the full app; overdue first, then soonest due.
  return unique.sort(
    (a, b) =>
      Number(a.pipeline === 'full_app') - Number(b.pipeline === 'full_app') ||
      Number(b.overdue) - Number(a.overdue) ||
      (a.dueAt ?? '').localeCompare(b.dueAt ?? ''),
  );
}

export function journeys(
  data: Snapshot,
  identity: Identity,
  settings: Settings,
  cooperativeCode: string,
  now: Date,
): Journey[] {
  const recorder = canRecord(identity, settings, cooperativeCode);
  if (!recorder) return [];
  const everyone = settings.recording.mode === 'designated' || identity.roles.includes('supervisor');
  return data.lots
    .filter((l) => l.type === 'batch' && ['draft', 'in_production'].includes(l.state) && sees(l, identity, everyone))
    .sort((a, b) => a.observed_at.localeCompare(b.observed_at))
    .map((lot) => {
      const stages = lotConfig(data, lot).definition.stages;
      return {
        lot,
        stageIndex: Math.max(
          0,
          stages.findIndex((s) => s.key === lot.stage),
        ),
        stageCount: stages.length,
        next: nextForBatch(data, lot, now),
      };
    });
}

export type HomeItem = { kind: 'job'; job: Job } | { kind: 'invite'; action: Action; lotId?: string };
/**
 * Everything the home screen could lead with, best first: work due now, then the next step of each batch in progress,
 * then an invitation to the most useful unlocked start action. The home screen shows only the first as its one card.
 */
export function homeItems(jobs: Job[], batches: Journey[], unlocked: Action[], data: Snapshot, now: Date): HomeItem[] {
  const seen = new Set<string>();
  const work: Job[] = [];
  for (const job of [...jobs.filter((j) => j.pipeline !== 'full_app'), ...batches.map((b) => b.next)]) {
    const key = `${job.pipeline}:${job.lotId ?? job.key}`;
    if (!seen.has(key)) {
      seen.add(key);
      work.push(job);
    }
  }
  const invites: HomeItem[] = [];
  const whey = usableWhey(data, now)[0];
  if (unlocked.includes('batch') && whey) invites.push({ kind: 'invite', action: 'batch', lotId: whey.id });
  if (unlocked.includes('sell') && sellableLots(data, now).length) invites.push({ kind: 'invite', action: 'sell' });
  if (unlocked.includes('receive')) invites.push({ kind: 'invite', action: 'receive' });
  return [...work.map((job) => ({ kind: 'job' as const, job })), ...invites];
}
