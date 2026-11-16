import { useMemo, useState } from 'react';
import { saveAction, type Snapshot } from '../lib/data';
import { lotConfig } from '../lib/schedules';
import type { Lot } from '../lib/domain';
import { demo } from '../lib/api';
import { fileTesting } from '../testing/file-mode';
import { Link } from 'react-router-dom';
import {
  allocationPayload,
  batchPayload,
  checkpointPayload,
  ingredientLots,
  lastIngredientAmounts,
  nextStage,
  outOfRange,
  usableWhey,
} from './payloads';
import { nextForBatch, type Job } from './jobs';
import { Problem, Runner, type PipelineProps, type Screen } from './flow';
import { Choices, Done, NumberInput, PhotoInput, Step, useAnswers } from './ui';
import { useNames } from './context';
import { useText } from './text';
import { useWorkerText } from '../worker/copy';

/** The label a job's button shows: the pipeline name, for the batch it belongs to. */
export function useJobLabel() {
  const { t } = useText();
  return (job: Job) => t(job.pipeline);
}

function trained(data: Snapshot, userId: string) {
  return (
    demo ||
    fileTesting ||
    data.training
      .filter((m) => m.required !== false)
      .every((m) =>
        data.completions.some(
          (c) =>
            c.user_id === userId &&
            c.module_id === m.id &&
            (!c.expires_at || Date.parse(String(c.expires_at)) > Date.now()),
        ),
      )
  );
}

/** After saving, point at what this batch needs next instead of back at the menu. */
function useNextFor(props: PipelineProps) {
  const { t } = useText();
  const label = useJobLabel();
  return (data: Snapshot | undefined, lotId: string) => {
    const lot = data?.lots.find((l) => l.id === lotId);
    if (!data || !lot || !['draft', 'in_production'].includes(lot.state)) return undefined;
    const job = nextForBatch(data, lot, new Date());
    return { label: t('whatNext', { action: label(job) }), onClick: () => props.open(job) };
  };
}

export function StartBatch(props: PipelineProps) {
  const { t, arabic } = useText();
  const nextFor = useNextFor(props);
  const name = useNames();
  const whey = usableWhey(props.data, new Date());
  const groups = useMemo(() => [...ingredientLots(props.data).entries()], [props.data]);
  const last = useMemo(
    () => (props.settings.batch.ingredients === 'last_time' ? lastIngredientAmounts(props.data, props.identity) : {}),
    [props.data, props.identity, props.settings.batch.ingredients],
  );
  // Kept as answers so they survive a reload and a detour to add ingredients, like every other job's answers.
  const first = whey.find((l) => l.id === props.lotId) ?? whey[0];
  const [answers, set] = useAnswers({
    whey: first?.id,
    amount: first?.available,
    ...Object.fromEntries(groups.map(([type]) => [`ingredient:${type}`, last[type]])),
  });
  // A remembered choice may no longer be usable (used up or expired meanwhile).
  const selected = whey.find((l) => l.id === answers.whey) ?? first;
  const wheyId = selected?.id;
  const amount = typeof answers.amount === 'number' ? answers.amount : undefined;
  const setAmount = (value: number | undefined) => set('amount', value);
  const ingredients = Object.fromEntries(
    groups.map(([type]) => [type, answers[`ingredient:${type}`] as number | undefined]),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState<{ id: string; data?: Snapshot } | null>(null);
  if (saved)
    return (
      <Done
        title={t('batchStarted')}
        message={name(props.data.lots.find((l) => l.id === saved.id))}
        onHome={props.onCompleted ?? props.onClose}
        next={nextFor(saved.data, saved.id)}
      />
    );
  if (!trained(props.data, props.identity.id))
    return (
      <Step title={t('batch')} pipeline="batch" onClose={props.onClose}>
        <p className="s-lead">{t('trainingRequired', { ns: 'translation' })}</p>
        <Link className="s-button s-quiet" to="/training">
          {t('fullApp')}
        </Link>
      </Step>
    );
  if (!whey.length)
    return (
      <Step
        title={t('batch')}
        pipeline="batch"
        onClose={props.onClose}
        action={{
          label: t('receive'),
          onClick: () => props.open({ key: 'receive', pipeline: 'receive', overdue: false }),
        }}
      >
        <p className="s-lead">{t('noWhey')}</p>
      </Step>
    );
  const screens: Screen[] = [];
  if (whey.length > 1 || props.settings.batch.wheyAmount === 'all_available')
    screens.push({
      id: 'whey',
      title: t('whichWhey'),
      hint: 'batch',
      help: t('help_whichWhey'),
      ready: !!selected,
      summary: () => name(selected),
      body: (next) => (
        <Choices
          label={t('whichWhey')}
          value={wheyId}
          onChange={(id) => {
            set('whey', id);
            setAmount(whey.find((l) => l.id === id)?.available);
            if (!fileTesting && screens.length > 1) setTimeout(next, 180);
          }}
          options={whey.map((l) => ({
            value: l.id,
            label: name(l),
            picture: '🥛',
            detail: `${l.available} ${l.unit}${l.expires_at ? ' · ' + t('expires', { date: new Date(l.expires_at).toLocaleDateString(arabic ? 'ar-LB' : 'en-GB', { day: 'numeric', month: 'short' }) }) : ''}`,
          }))}
        />
      ),
    });
  if (props.settings.batch.wheyAmount === 'ask')
    screens.push({
      id: 'amount',
      title: t('howMuchWhey'),
      summary: () => `${amount ?? '—'} ${selected?.unit ?? ''}`,
      ready: !!amount && amount > 0 && amount <= (selected?.available ?? 0),
      body: () => (
        <>
          <p className="s-meta">{name(selected)}</p>
          <NumberInput
            label={t('howMuchWhey')}
            unit={selected?.unit}
            value={amount}
            onChange={setAmount}
            hint={`${selected?.available ?? 0} ${selected?.unit ?? ''}`}
          />
          <Problem
            code={
              amount === undefined
                ? undefined
                : amount <= 0
                  ? 'needPositive'
                  : amount > (selected?.available ?? 0)
                    ? 'over_allocation'
                    : undefined
            }
          />
        </>
      ),
    });
  if (groups.length)
    screens.push({
      id: 'ingredients',
      title: t('ingredients'),
      summary: () => groups.map(([type]) => `${type} ${ingredients[type] ?? 0}`).join(' · '),
      ready: groups.every(([type]) => (ingredients[type] ?? 0) >= 0),
      body: () => (
        <div className="s-stack">
          {groups.map(([type, lots], i) => (
            <NumberInput
              key={type}
              label={type}
              unit={lots[0].unit}
              autoFocus={i === 0}
              value={ingredients[type]}
              onChange={(v) => set(`ingredient:${type}`, v)}
              hint={`${lots.reduce((sum, l) => sum + (l.available ?? 0), 0)} ${lots[0].unit}`}
            />
          ))}
        </div>
      ),
    });
  // Kishk is whey plus bulgur and salt. With none recorded the batch could not be traced back to them,
  // so the person is told and offered to add them here; starting without them stays their decision.
  else if (props.onPrepare)
    screens.push({
      id: 'no-ingredients',
      title: t('ingredients'),
      summary: () => t('skipped'),
      secondary: { label: t('addIngredients'), onClick: () => props.onPrepare!('ingredients') },
      body: () => <p className="s-banner s-warn-banner">{t('noIngredientsNote')}</p>,
    });
  async function save() {
    setBusy(true);
    setError('');
    try {
      if (!selected) throw new Error('noWhey');
      const quantity = props.settings.batch.wheyAmount === 'all_available' ? (selected.available ?? 0) : Number(amount);
      const whey = allocationPayload(selected, '00000000-0000-4000-8000-000000000000', quantity);
      const parts: { lot: Lot; quantity: number }[] = [];
      for (const [type, lots] of groups) {
        let remaining = Number(ingredients[type] ?? 0);
        for (const lot of lots) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, lot.available ?? 0);
          parts.push({ lot, quantity: take });
          remaining -= take;
        }
        if (remaining > 0) throw new Error('over_allocation');
      }
      // In the shared JSON build a batch and its input quantities are one immutable append.
      // A failed network request cannot create a batch without its allocations.
      const id = await saveAction(props.identity, props.data.config, 'batch', {
        ...batchPayload(),
        ...(fileTesting
          ? {
              allocations: [whey, ...parts.map((part) => allocationPayload(part.lot, '', part.quantity))].map(
                ({ input_lot_id, quantity, unit }) => ({ input_lot_id, quantity, unit }),
              ),
            }
          : {}),
      });
      if (!fileTesting) {
        await saveAction(props.identity, props.data.config, 'allocation', { ...whey, output_lot_id: id });
        for (const part of parts)
          await saveAction(
            props.identity,
            props.data.config,
            'allocation',
            allocationPayload(part.lot, id, part.quantity),
          );
      }
      setSaved({ id, data: await props.onSaved(id) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Runner
      screens={screens}
      onClose={props.onClose}
      onSave={save}
      saveLabel={t('batch')}
      busy={busy}
      error={error}
      pipeline="batch"
    />
  );
}

export function Check(props: PipelineProps) {
  const { t, words } = useText();
  const { w } = useWorkerText();
  const nextFor = useNextFor(props);
  const name = useNames();
  const lot = props.data.lots.find((l) => l.id === props.lotId);
  const config = lotConfig(props.data, lot);
  const checkpoint =
    config.definition.checkpoints.find((c) => c.key === props.checkpoint) ??
    config.definition.checkpoints.find((c) => c.stage === lot?.stage);
  const items = checkpoint?.checklist_items ?? [];
  const equipment = useMemo(() => {
    const used = [...props.data.records]
      .reverse()
      .find(
        (r) => r.definition_key === checkpoint?.key && (r.payload as Record<string, unknown> | undefined)?.equipment_id,
      );
    return String((used?.payload as Record<string, unknown> | undefined)?.equipment_id ?? '');
  }, [props.data.records, checkpoint?.key]);
  const [problem, setProblem] = useState(false),
    [checks, setChecks] = useState<Record<string, boolean>>(Object.fromEntries(items.map((i) => [i.key, true])));
  const [value, setValue] = useState<number | undefined>(),
    [note, setNote] = useState(''),
    [photo, setPhoto] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState<Snapshot | undefined | null>(null);
  if (!lot || !checkpoint)
    return (
      <Step title={t('check')} pipeline="check" onClose={props.onClose}>
        <p className="s-lead">{t('nothingDue')}</p>
      </Step>
    );
  if (fileTesting && checkpoint.required_photo)
    return (
      <Step title={words(checkpoint.label)} onClose={props.onClose}>
        <p className="w-notice">{w('unavailablePhoto')}</p>
      </Step>
    );
  const numeric = !items.length && checkpoint.response_type !== 'boolean';
  const flagged = numeric && outOfRange(checkpoint, value);
  async function save(allOk: boolean) {
    setBusy(true);
    setError('');
    try {
      if (checkpoint!.required_photo && !photo) throw new Error('photoRequired');
      const payload = checkpointPayload(lot!, checkpoint!, {
        value: numeric ? value : undefined,
        allOk: numeric ? !flagged : allOk,
        checklist: items.length ? (allOk ? Object.fromEntries(items.map((i) => [i.key, true])) : checks) : undefined,
        note,
        equipmentId: equipment,
      });
      const id = await saveAction(
        props.identity,
        config,
        'checkpoint',
        payload,
        photo ? [{ blob: photo, type: 'image/jpeg' }] : [],
      );
      setSaved(await props.onSaved(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }
  if (saved !== null)
    return (
      <Done
        title={t('checkSaved')}
        message={flagged ? t('flagged') : undefined}
        onHome={props.onCompleted ?? props.onClose}
        next={nextFor(saved, lot.id)}
      />
    );
  const title = `${words(checkpoint.label)}`;
  const photoInput = checkpoint.required_photo ? (
    <PhotoInput photo={photo} onPhoto={setPhoto} onError={setError} />
  ) : null;
  const meta = <p className="s-meta">{name(lot)}</p>;
  if (numeric)
    return (
      <Step
        title={title}
        pipeline="check"
        hint="check"
        help={t('help_measure')}
        onClose={props.onClose}
        busy={busy}
        error={error}
        action={{
          label: flagged ? t('saveAnyway') : t('save'),
          tone: flagged ? 'warning' : 'primary',
          onClick: () => save(true),
          disabled: value === undefined || (!!checkpoint.required_photo && !photo),
        }}
      >
        {meta}
        <NumberInput
          label={title}
          unit={checkpoint.unit}
          value={value}
          onChange={setValue}
          warn={flagged}
          hint={
            checkpoint.min !== undefined || checkpoint.max !== undefined
              ? t('safeRange', { min: checkpoint.min ?? '', max: checkpoint.max ?? '', unit: checkpoint.unit ?? '' })
              : undefined
          }
        />
        {flagged && <p className="s-banner s-warn-banner">{t('flagged')}</p>}
        {photoInput}
      </Step>
    );
  if (!problem)
    return (
      <Step
        title={title}
        pipeline="check"
        hint="check"
        help={t('help_checklist')}
        onClose={props.onClose}
        busy={busy}
        error={error}
        action={{ label: t('allOk'), onClick: () => save(true), disabled: !!checkpoint.required_photo && !photo }}
        secondary={{ label: t('notOk'), onClick: () => setProblem(true) }}
      >
        {meta}
        <ul className="s-checklist">
          {items.map((i) => (
            <li key={i.key}>{words(i.label)}</li>
          ))}
        </ul>
        {photoInput}
      </Step>
    );
  return (
    <Step
      title={t('untick')}
      pipeline="check"
      onClose={props.onClose}
      onBack={() => setProblem(false)}
      busy={busy}
      error={error}
      action={{
        label: t('save'),
        tone: 'warning',
        onClick: () => save(false),
        // "Something's not right" must name what was not right; otherwise it would be saved as all OK.
        disabled: items.every((i) => checks[i.key]),
      }}
    >
      <div className="s-stack">
        {items.map((i) => (
          <label key={i.key} className="s-toggle">
            <input
              type="checkbox"
              checked={checks[i.key] ?? false}
              onChange={(e) => setChecks((c) => ({ ...c, [i.key]: e.target.checked }))}
            />
            <span>{words(i.label)}</span>
          </label>
        ))}
      </div>
      <label className="s-number">
        <span className="s-field-label">{t('whatHappened')}</span>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {photoInput}
    </Step>
  );
}

export function MoveStage(props: PipelineProps) {
  const { t, words } = useText();
  const nextFor = useNextFor(props);
  const name = useNames();
  const lot = props.data.lots.find((l) => l.id === props.lotId);
  const config = lotConfig(props.data, lot);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState<Snapshot | undefined | null>(null);
  if (!lot) return null;
  const current = config.definition.stages.find((s) => s.key === lot.stage);
  const upcoming = nextStage(config, lot);
  if (saved !== null) {
    const now = props.data.lots.find((l) => l.id === lot.id);
    return (
      <Done
        title={t('stageSaved', {
          stage: words(config.definition.stages.find((s) => s.key === now?.stage)?.label ?? upcoming?.label),
        })}
        onHome={props.onCompleted ?? props.onClose}
        next={nextFor(saved, lot.id)}
      />
    );
  }
  if (!upcoming)
    return (
      <Step title={t('stage')} pipeline="stage" onClose={props.onClose}>
        <p className="s-lead">{t('noBatchReady')}</p>
      </Step>
    );
  async function save() {
    setBusy(true);
    setError('');
    try {
      const id = await saveAction(props.identity, config, 'stage', { lot_id: lot!.id, next_stage: upcoming!.key });
      setSaved(await props.onSaved(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Step
      title={t('finished', { from: words(current?.label) })}
      pipeline="stage"
      hint="stage"
      help={t('help_stage')}
      onClose={props.onClose}
      busy={busy}
      error={error}
      action={{ label: t('startNext', { to: words(upcoming.label) }), onClick: save }}
    >
      <p className="s-meta">{name(lot)}</p>
      <ol className="s-stages">
        {config.definition.stages.map((s) => (
          <li
            key={s.key}
            className={
              s.key === lot.stage
                ? 'now'
                : config.definition.stages.findIndex((x) => x.key === s.key) <
                    config.definition.stages.findIndex((x) => x.key === lot.stage)
                  ? 'done'
                  : ''
            }
          >
            {words(s.label)}
          </li>
        ))}
      </ol>
    </Step>
  );
}
