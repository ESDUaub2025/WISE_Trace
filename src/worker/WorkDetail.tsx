// One record in the worker view: what it is, what happened to it and who did it, and the decisions taken on it.
import { useState } from 'react';
import { ArrowLeft, ArrowRight, AlertTriangle, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Identity, Lot } from '../lib/domain';
import { saveAction, type Snapshot } from '../lib/data';
import { lotConfig } from '../lib/schedules';
import { measurementUnit } from '../lib/receipts';
import { useNames } from '../simple/context';
import { useText } from '../simple/text';
import { isLastStage, suggestDecision } from '../simple/payloads';
import { Step, Done } from '../simple/ui';
import { useWorkerText, type WorkerWord } from './copy';
import { dateText, evidenceText, jobWord, lotStatus, nextJob, openProblems, personName, taskPath } from './model';

type Refresh = (savedId?: string) => Promise<Snapshot | undefined>;
interface RecordScreen {
  data: Snapshot;
  lot: Lot;
  identity: Identity;
  refresh: Refresh;
  onClose: () => void;
}

function Fact({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={warn ? 'w-fact-warn' : undefined}>
      <dt>{label}</dt>
      {/* bdi keeps "100 kg" in that order inside Arabic text. */}
      <dd>
        <bdi>{value}</bdi>
      </dd>
    </div>
  );
}

/** What the supplier declared and what the receiver saw. A decision on whey is made on exactly these answers. */
function DeliveryChecks({ lot }: { lot: Lot }) {
  const { w } = useWorkerText();
  const facts = lot.facts;
  const pasteurized = (facts.declarations as { pasteurized?: unknown } | undefined)?.pasteurized;
  return (
    <>
      {pasteurized !== undefined && (
        <Fact
          label={w('pasteurized')}
          value={pasteurized === true ? w('yes') : pasteurized === false ? w('no') : w('unsure')}
          warn={pasteurized !== true}
        />
      )}
      {typeof facts.appearance === 'string' && facts.appearance && (
        <Fact
          label={w('appearance')}
          value={facts.appearance === 'normal' ? w('normal') : w('notNormal')}
          warn={facts.appearance !== 'normal'}
        />
      )}
      {typeof facts.odour === 'string' && facts.odour && (
        <Fact
          label={w('odour')}
          value={facts.odour === 'normal' ? w('normal') : w('notNormal')}
          warn={facts.odour !== 'normal'}
        />
      )}
      {typeof facts.container_condition === 'string' && facts.container_condition && (
        <Fact
          label={w('container')}
          value={facts.container_condition === 'good' ? w('clean') : w('notClean')}
          warn={facts.container_condition !== 'good'}
        />
      )}
    </>
  );
}

export function WorkSummary({ data, lot, checks = false }: { data: Snapshot; lot: Lot; checks?: boolean }) {
  const { w, arabic } = useWorkerText();
  const { t } = useText();
  const supplier = data.suppliers.find((s) => s.id === lot.supplier_id);
  const rules = lot.type === 'whey' ? (lotConfig(data, lot).definition.reception_measurements ?? []) : [];
  // Everything that went into this record: whey and each ingredient by its own name.
  const inputs = data.edges
    .filter((edge) => edge.output_lot_id === lot.id)
    .map((edge) => ({ edge, input: data.lots.find((l) => l.id === edge.input_lot_id) }))
    .filter(({ input }) => input && ['whey', 'ingredient'].includes(input.type));
  const recorder = personName(data, lot.producer_id);
  const unit = lot.unit === 'unit' ? t('namePouches') : lot.unit;
  return (
    <dl className="w-facts">
      {supplier && <Fact label={w('supplier')} value={supplier.name} />}
      {lot.type !== 'batch' && (
        <Fact
          label={lot.type === 'whey' ? w('receivedAmount') : w('available')}
          value={`${lot.type === 'whey' ? lot.initial_quantity : (lot.available ?? 0)} ${unit}`}
        />
      )}
      {lot.type === 'whey' && lot.available !== lot.initial_quantity && (
        <Fact label={w('available')} value={`${lot.available ?? 0} ${lot.unit}`} />
      )}
      {inputs.map(({ edge, input }) => (
        <Fact
          key={edge.input_lot_id}
          label={input!.type === 'whey' ? w('used') : String(input!.facts.name ?? w('ingredient'))}
          value={`${edge.quantity} ${edge.unit}`}
        />
      ))}
      {rules
        .filter((rule) => typeof lot.facts[rule.key] === 'number')
        .map((rule) => {
          const value = Number(lot.facts[rule.key]);
          const outside = (rule.min !== undefined && value < rule.min) || (rule.max !== undefined && value > rule.max);
          return (
            <Fact
              key={rule.key}
              label={rule.key === 'ph' ? 'pH' : rule.key === 'reception_temperature' ? w('temperature') : w('reading')}
              value={`${value} ${rule.key === 'ph' ? '' : measurementUnit(rule)}`.trim()}
              warn={outside}
            />
          );
        })}
      {checks && lot.type === 'whey' && <DeliveryChecks lot={lot} />}
      {lot.type === 'whey' && lot.generation_at && (
        <Fact label={w('wheyMade')} value={dateText(lot.generation_at, arabic, true)} />
      )}
      <Fact label={w('made')} value={dateText(lot.observed_at, arabic, true)} />
      {recorder && <Fact label={w('recordedBy')} value={recorder} />}
      {lot.expires_at && (
        <Fact
          label={lot.type === 'whey' ? w('expiry') : w('bestBefore')}
          value={dateText(lot.expires_at, arabic, lot.type === 'whey')}
        />
      )}
    </dl>
  );
}

function History({ data, lot }: { data: Snapshot; lot: Lot }) {
  const { w, arabic } = useWorkerText();
  const config = lotConfig(data, lot);
  const items: { id: string; at: unknown; by: unknown; title: string; lines: string[] }[] = [];
  for (const record of data.records.filter((r) => r.lot_id === lot.id)) {
    const checkpoint = config.definition.checkpoints.find((c) => c.key === record.definition_key);
    const p = record.payload && typeof record.payload === 'object' ? (record.payload as Record<string, unknown>) : {};
    const label = checkpoint ? (arabic ? checkpoint.label.ar : checkpoint.label.en) : '';
    const title = checkpoint
      ? p.all_ok === false
        ? `${label}: ${w('checkFailed')}`
        : label
      : record.kind === 'abandon'
        ? w('stopSaved')
        : p.resolved
          ? w('resolved')
          : w(record.kind === 'testing_review' ? 'decision' : 'note');
    // A check's own pass/fail is in its title; the lines carry the reading and what was noted.
    const lines = evidenceText(checkpoint ? { ...p, all_ok: undefined } : p, arabic, w('yes'), w('no'));
    if (['accepted', 'hold', 'rejected', 'released'].includes(String(p.outcome)))
      lines.unshift(w(p.outcome as WorkerWord));
    const checks = p.checklist && typeof p.checklist === 'object' ? (p.checklist as Record<string, unknown>) : {};
    for (const check of checkpoint?.checklist_items ?? [])
      if (typeof checks[check.key] === 'boolean')
        lines.push(`${arabic ? check.label.ar : check.label.en}: ${checks[check.key] ? w('yes') : w('no')}`);
    items.push({ id: String(record.id), at: record.observed_at, by: record.author_id, title, lines });
  }
  for (const event of data.stageEvents.filter((e) => e.lot_id === lot.id)) {
    const stage = config.definition.stages.find((s) => s.key === event.stage);
    if (stage)
      items.push({
        id: String(event.id),
        at: event.observed_at,
        by: event.author_id,
        title: arabic ? stage.label.ar : stage.label.en,
        lines: [],
      });
  }
  for (const sale of data.sales.filter((s) => s.packaging_lot_id === lot.id))
    items.push({
      id: String(sale.id),
      at: sale.observed_at,
      by: sale.author_id,
      title: w('sale'),
      lines: [
        typeof sale.quantity === 'number' ? `${sale.quantity} ${w('units')}` : '',
        typeof sale.total === 'number'
          ? `${sale.total} ${typeof sale.currency === 'string' ? sale.currency : ''}`.trim()
          : '',
      ].filter(Boolean),
    });
  // A failed check already appears as that check; only problems people wrote themselves are listed separately.
  for (const issue of data.deviations.filter((d) => d.lot_id === lot.id && d.source !== 'checkpoint'))
    items.push({
      id: String(issue.id),
      at: issue.observed_at,
      by: issue.author_id,
      title: w('issue'),
      lines: typeof issue.description === 'string' ? [issue.description] : [],
    });
  items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return items.length ? (
    <ol className="w-timeline">
      {items.map((item) => {
        const person = personName(data, item.by);
        return (
          <li key={item.id}>
            <h3>{item.title}</h3>
            <time>
              {dateText(item.at, arabic, true)}
              {person && ` · ${w('by')} ${person}`}
            </time>
            {item.lines.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </li>
        );
      })}
    </ol>
  ) : (
    <p>{w('historyEmpty')}</p>
  );
}

export function WorkDetail({
  data,
  lot,
  refresh,
}: {
  data: Snapshot;
  lot: Lot;
  refresh: () => Promise<Snapshot | undefined>;
}) {
  const { w, arabic } = useWorkerText();
  const name = useNames();
  const navigate = useNavigate();
  const job = nextJob(data, lot);
  const hasProblem = openProblems(data, lot.id).length > 0;
  const inProduction = lot.type === 'batch' && ['draft', 'in_production'].includes(lot.state);
  const actions: { label: string; path: string }[] = [];
  if (job) actions.push({ label: w(jobWord(job)), path: taskPath(job) });
  if (lot.type === 'packaging' && ['awaiting_review', 'hold'].includes(lot.state))
    actions.push({ label: w('reviewPack'), path: `/review/${lot.id}` });
  if (lot.type === 'batch' && lot.state === 'awaiting_review' && isLastStage(lotConfig(data, lot), lot))
    actions.push({ label: w('packMore'), path: `/task/pack/${lot.id}` });
  if (
    lot.type === 'whey' &&
    lot.state === 'accepted' &&
    (lot.available ?? 0) > 0 &&
    (!lot.expires_at || Date.parse(lot.expires_at) > Date.now())
  )
    actions.push({ label: w('batch'), path: `/task/batch/${lot.id}` });
  if (lot.type === 'packaging' && lot.state === 'released' && (lot.available ?? 0) > 0)
    actions.push({ label: w('sell'), path: `/task/sell/${lot.id}` });
  return (
    <main className="w-main w-narrow">
      <button className="w-back" onClick={() => void navigate('/work')}>
        <ArrowLeft className="s-flip" size={20} />
        {w('work')}
      </button>
      <h1>{name(lot)}</h1>
      <p className={`w-state w-state-${lot.state}`}>{lotStatus(data, lot, arabic, w)}</p>
      {hasProblem && (
        <p className="w-notice">
          <AlertTriangle size={20} />
          {w('problemPending')}
        </p>
      )}
      <section className="w-card">
        <h2>{w('overview')}</h2>
        <WorkSummary data={data} lot={lot} checks />
        {actions.map((action) => (
          <button key={action.path} className="w-primary" onClick={() => void navigate(action.path)}>
            {action.label}
            <ArrowRight className="s-flip" size={20} />
          </button>
        ))}
      </section>
      <details className="w-disclosure">
        <summary>
          {w('history')}
          <ChevronDown size={20} />
        </summary>
        <History data={data} lot={lot} />
      </details>
      <details className="w-disclosure">
        <summary>
          {w('identity')}
          <ChevronDown size={20} />
        </summary>
        <p>{w('referenceNote')}</p>
        <p className="w-reference">
          <bdi>{lot.code}</bdi>
        </p>
      </details>
      <button className="w-secondary" onClick={() => void navigate(`/problem/${lot.id}`)}>
        <AlertTriangle size={20} />
        {hasProblem ? w('resolveProblem') : w('problem')}
      </button>
      {inProduction && (
        <button className="w-text" onClick={() => void navigate(`/stop/${lot.id}`)}>
          {w('stopBatch')}
        </button>
      )}
      <button className="w-text" onClick={() => void refresh()}>
        {w('refresh')}
      </button>
    </main>
  );
}

/** Saves one record and reports the reason if the shared workspace refuses it. Error codes are translated by Step. */
function useSave(refresh: Refresh) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  async function run(save: () => Promise<string>) {
    setBusy(true);
    setError('');
    try {
      await refresh(await save());
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, saved, run };
}

export function TestReview({ data, lot, identity, refresh, onClose }: RecordScreen) {
  const { w } = useWorkerText();
  const { t } = useText();
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState(lot.type === 'packaging' ? 'released' : '');
  const [reason, setReason] = useState('');
  const { busy, error, saved, run } = useSave(refresh);
  const config = lotConfig(data, lot);
  const suggestion =
    lot.type === 'whey' ? suggestDecision(lot, config.definition.reception_measurements ?? []) : undefined;
  const unconfirmed =
    lot.type === 'whey' && (lot.facts.declarations as { pasteurized?: unknown } | undefined)?.pasteurized !== true;
  if (saved)
    return (
      <Done
        title={w('reviewSaved')}
        onHome={onClose}
        next={{ label: w('view'), onClick: () => void navigate(`/work/${lot.id}`, { replace: true }) }}
      />
    );
  const choices: [string, WorkerWord][] =
    lot.type === 'packaging'
      ? [
          ['released', 'testRelease'],
          ['hold', 'pause'],
          ['rejected', 'reject'],
        ]
      : [
          ['accepted', 'accept'],
          ['hold', 'pause'],
          ['rejected', 'reject'],
        ];
  return (
    <Step
      title={w('reviewTitle')}
      onClose={onClose}
      busy={busy}
      error={error}
      action={{
        label: w('save'),
        disabled: !outcome || reason.trim().length < 3,
        onClick: () =>
          run(() =>
            saveAction(identity, config, 'testing_review', {
              lot_id: lot.id,
              outcome,
              reason: reason.trim(),
              test_only: true,
            }),
          ),
      }}
    >
      {/* The system suggests; the person decides (PRD FR-WHY-08). */}
      {suggestion && (
        <div className={`s-banner ${suggestion.outcome === 'accepted' ? 's-good' : 's-warn-banner'}`}>
          {suggestion.outcome === 'accepted' ? (
            w('withinLimits')
          ) : (
            <>
              {w('outsideLimits')}
              <ul>
                {suggestion.issues.map((issue) => (
                  <li key={issue.key}>
                    {issue.value === undefined
                      ? t('issue_' + issue.key)
                      : `${issue.key === 'ph' ? 'pH' : w('temperature')} ${issue.value} (${t('safeRange', { min: issue.min ?? '', max: issue.max ?? '', unit: '' }).trim()})`}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {unconfirmed && <p className="s-banner s-warn-banner">{w('notPasteurized')}</p>}
      <WorkSummary data={data} lot={lot} checks />
      <fieldset className="w-review-choices">
        <legend>{w('decision')}</legend>
        {choices.map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="outcome"
              value={value}
              checked={outcome === value}
              onChange={() => setOutcome(value)}
            />
            {w(label)}
          </label>
        ))}
      </fieldset>
      <label className="w-field">
        {w('reason')}
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
      </label>
    </Step>
  );
}

export function Problem({ data, lot, identity, refresh, onClose }: RecordScreen) {
  const { w, arabic } = useWorkerText();
  const [note, setNote] = useState('');
  const { busy, error, saved, run } = useSave(refresh);
  const config = lotConfig(data, lot);
  const openIssues = openProblems(data, lot.id);
  const save = (resolve: boolean) =>
    run(() =>
      saveAction(identity, config, resolve ? 'testing_resolve' : 'deviation', {
        lot_id: lot.id,
        description: note.trim(),
        reason: note.trim(),
        test_only: true,
        status: 'open',
        observed_at: new Date().toISOString(),
      }),
    );
  const describe = (issue: Snapshot['deviations'][number]) => {
    const checkpoint = config.definition.checkpoints.find((c) => c.key === issue.definition_key);
    if (checkpoint) return `${arabic ? checkpoint.label.ar : checkpoint.label.en}: ${w('checkFailed')}`;
    return String(issue.description ?? '');
  };
  if (saved) return <Done title={w('problemSaved')} onHome={onClose} />;
  return (
    <Step
      title={w('problemTitle')}
      onClose={onClose}
      busy={busy}
      error={error}
      action={{ label: w('save'), disabled: note.trim().length < 3, onClick: () => save(false) }}
      secondary={
        openIssues.length
          ? { label: w('resolveProblem'), disabled: note.trim().length < 3, onClick: () => save(true) }
          : undefined
      }
    >
      <p>{w('problemNote')}</p>
      {openIssues.length > 0 && (
        <div className="w-notice">
          <div>
            <p>{w('resolveHelp')}</p>
            {openIssues.map((issue) => (
              <p key={issue.id}>{describe(issue)}</p>
            ))}
          </div>
        </div>
      )}
      <label className="w-field">
        {w('note')}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} maxLength={2000} />
      </label>
    </Step>
  );
}

/** Ends a batch that cannot be finished (PRD FR-BAT-10). Its inputs stay consumed and count as a loss. */
export function StopBatch({ data, lot, identity, refresh, onClose }: RecordScreen) {
  const { w } = useWorkerText();
  const name = useNames();
  const [reason, setReason] = useState('');
  const { busy, error, saved, run } = useSave(refresh);
  if (saved) return <Done title={w('stopSaved')} onHome={onClose} />;
  return (
    <Step
      title={w('stopTitle')}
      onClose={onClose}
      busy={busy}
      error={error}
      action={{
        label: w('stopConfirm'),
        tone: 'warning',
        disabled: reason.trim().length < 3,
        onClick: () =>
          run(() => saveAction(identity, lotConfig(data, lot), 'abandon', { lot_id: lot.id, reason: reason.trim() })),
      }}
    >
      <p className="s-meta">{name(lot)}</p>
      <p className="w-notice">{w('stopNote')}</p>
      <label className="w-field">
        {w('stopReason')}
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={1000} />
      </label>
    </Step>
  );
}
