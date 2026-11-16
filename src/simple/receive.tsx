import { isOnline } from '../connectivity/connectivity';
import { useMemo, useState } from 'react';
import { saveAction, signedAction, synchronize } from '../lib/data';
import { lotConfig } from '../lib/schedules';
import { measurementUnit } from '../lib/receipts';
import type { ReceptionMeasurement, Supplier } from '../lib/domain';
import { answerSources, receiptAnswers, rememberedReceipt, resolveQuestions, startingAnswers } from './memory';
import { decisionPlan, receiptPayload, rememberedEquipment, suggestDecision } from './payloads';
import { canDecide, canReceiveWhey, canRecord } from './access';
import { Problem, Runner, useQuestionScreens, type PipelineProps, type Screen } from './flow';
import { Choices, Done, NumberInput, Step, useAnswers } from './ui';
import { useNames } from './context';
import { useText } from './text';
import { fileTesting } from '../testing/file-mode';
import { useWorkerText } from '../worker/copy';

const wheySuppliers = (suppliers: Supplier[]) => {
  const active = suppliers.filter((s) => s.status !== 'suspended');
  const dairy = active.filter((s) => ['dairy', 'labneh', 'whey'].includes(s.type));
  return dairy.length ? dairy : active;
};

export function Receive(props: PipelineProps) {
  const { t } = useText();
  const suppliers = wheySuppliers(props.data.suppliers);
  const lastSupplier = [...props.data.lots]
    .filter((l) => l.type === 'whey')
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at))[0]?.supplier_id;
  const [supplierId, setSupplierId] = useState(suppliers.length === 1 ? suppliers[0].id : '');
  const [chosen, setChosen] = useState(suppliers.length === 1);
  if (!canReceiveWhey(props.identity))
    return (
      <Step title={t('receive')} pipeline="receive" onClose={props.onClose}>
        <p className="s-lead">{t('notReceiver')}</p>
      </Step>
    );
  if (!suppliers.length)
    return (
      <Step
        title={t('receive')}
        pipeline="receive"
        onClose={props.onClose}
        action={
          props.onPrepare
            ? { label: t('supplier', { ns: 'translation' }), onClick: () => props.onPrepare!('supplier') }
            : undefined
        }
      >
        <p className="s-lead">{t('noSuppliers')}</p>
      </Step>
    );
  const supplier = suppliers.find((s) => s.id === supplierId);
  if (!chosen || !supplier)
    return (
      <Step
        title={t('whichSupplier')}
        step={1}
        total={2}
        pipeline="receive"
        hint="receive"
        onClose={props.onClose}
        action={{ label: t('next'), onClick: () => setChosen(true), disabled: !supplier }}
      >
        <Choices
          label={t('whichSupplier')}
          value={supplierId || undefined}
          onChange={(id) => {
            setSupplierId(id);
            setChosen(true);
          }}
          options={[...suppliers]
            .sort((a, b) => Number(b.id === lastSupplier) - Number(a.id === lastSupplier))
            .map((s) => ({ value: s.id, label: s.name, picture: '🧑‍🌾' }))}
        />
      </Step>
    );
  return (
    <ReceiveFrom
      key={supplier.id}
      {...props}
      supplier={supplier}
      onChangeSupplier={suppliers.length > 1 ? () => setChosen(false) : undefined}
    />
  );
}

function ReceiveFrom({
  supplier,
  onChangeSupplier,
  ...props
}: PipelineProps & { supplier: Supplier; onChangeSupplier?: () => void }) {
  const { t } = useText();
  const { w } = useWorkerText();
  const questions = props.settings.questions.receive;
  const rules = props.data.config.definition.reception_measurements ?? [];
  const resolved = useMemo(
    () => resolveQuestions(questions, rememberedReceipt(props.data, supplier, questions)),
    [questions, props.data, supplier],
  );
  // Answers from this supplier's last delivery, offered as one-tap suggestions on questions that are asked fresh.
  const suggestions = useMemo(() => {
    const last = [...props.data.lots]
      .filter((l) => l.type === 'whey' && l.supplier_id === supplier.id)
      .sort((a, b) => b.observed_at.localeCompare(a.observed_at))[0];
    return last ? receiptAnswers(last) : {};
  }, [props.data.lots, supplier.id]);
  const [answers, set] = useAnswers(startingAnswers(resolved), supplier.id);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const screens: Screen[] = [
    ...useQuestionScreens({ resolved, answers, set, suggestions, usualTitle: t('usualFrom', { name: supplier.name }) }),
  ];
  // Measurements required by the approved procedure are always asked fresh, on one screen.
  const readingLabel = (rule: ReceptionMeasurement) =>
    rule.key === 'ph'
      ? 'pH'
      : t(rule.key === 'reception_temperature' ? 'temperature' : rule.key, { ns: 'translation' });
  if (rules.length)
    screens.splice(
      screens.findIndex((s) => s.id === 'quick') < 0 ? screens.length : screens.findIndex((s) => s.id === 'quick'),
      0,
      {
        id: 'readings',
        title: t('readings'),
        hint: 'readings',
        help: t('help_readings'),
        ready: rules.every(
          (rule) => (!rule.required || answers[rule.key] !== undefined) && !implausible(rule, answers[rule.key]),
        ),
        summary: () =>
          rules
            .map((rule) => {
              const unit = measurementUnit(rule);
              return `${readingLabel(rule)} ${answers[rule.key] ?? '—'}${unit === readingLabel(rule) ? '' : ' ' + unit}`.trim();
            })
            .join(' · '),
        body: () => (
          <div className="s-stack">
            {rules.map((rule, i) => (
              <Reading
                key={rule.key}
                rule={rule}
                label={readingLabel(rule)}
                value={answers[rule.key]}
                onChange={(v) => set(rule.key, v)}
                autoFocus={i === 0}
              />
            ))}
          </div>
        ),
      },
    );
  if (!screens.length) screens.push({ id: 'confirm', title: t('receive'), body: () => null });
  if (fileTesting)
    screens.push({
      id: 'review',
      title: w('confirm'),
      ready: Number(answers.quantity) > 0,
      body: () => (
        <>
          <p>{w('confirmNote')}</p>
          <dl className="w-facts">
            <div>
              <dt>{w('supplier')}</dt>
              <dd>{supplier.name}</dd>
            </div>
            <div>
              <dt>{w('amount')}</dt>
              <dd>
                {String(answers.quantity ?? '')} {String(answers.unit ?? 'kg')}
              </dd>
            </div>
            {rules
              .filter((r) => answers[r.key] !== undefined)
              .map((r) => (
                <div key={r.key}>
                  <dt>{readingLabel(r)}</dt>
                  <dd>
                    {String(answers[r.key])} {measurementUnit(r)}
                  </dd>
                </div>
              ))}
          </dl>
        </>
      ),
    });
  async function save() {
    setBusy(true);
    setError('');
    try {
      const equipment = { ...rememberedEquipment(props.data.lots) };
      for (const rule of rules)
        if (rule.equipment_required && !equipment[rule.key]) {
          const meter = props.data.equipment.find((e) => e.status === 'active');
          if (meter) equipment[rule.key] = String(meter.id);
        }
      const payload = receiptPayload({
        answers,
        supplier,
        rules,
        identity: props.identity,
        now: new Date(),
        equipment,
        sources: answerSources(resolved, answers),
      });
      const id = await saveAction(props.identity, props.data.config, 'receipt', payload);
      await props.onSaved(id);
      if (props.settings.decideAfterReceive && canDecide(props.identity, { type: 'whey' }))
        props.open({ key: `decide:${id}`, pipeline: 'decide', lotId: id, overdue: false });
      else setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }
  if (saved)
    return (
      <Done title={t('receiptSaved')} message={t('supervisorDecides')} onHome={props.onCompleted ?? props.onClose} />
    );
  const first = screens[0];
  if (first)
    screens[0] = {
      ...first,
      hint: first.hint ?? 'receive',
      ...(onChangeSupplier && !first.secondary
        ? { secondary: { label: t('differentSupplier'), onClick: onChangeSupplier } }
        : {}),
    };
  return (
    <Runner screens={screens} onClose={props.onClose} onSave={save} busy={busy} error={error} pipeline="receive" />
  );
}

function Reading({
  rule,
  label,
  value,
  onChange,
  autoFocus,
}: {
  rule: ReceptionMeasurement;
  label: string;
  value: unknown;
  onChange: (value: number | undefined) => void;
  autoFocus: boolean;
}) {
  const { t } = useText();
  const unit = measurementUnit(rule);
  const number = typeof value === 'number' ? value : undefined;
  const outside =
    number !== undefined &&
    ((rule.min !== undefined && number < rule.min) || (rule.max !== undefined && number > rule.max));
  return (
    <>
      <NumberInput
        label={label}
        unit={unit}
        value={number}
        onChange={onChange}
        autoFocus={autoFocus}
        warn={outside}
        hint={
          rule.min !== undefined || rule.max !== undefined
            ? t('safeRange', { min: rule.min ?? '', max: rule.max ?? '', unit })
            : undefined
        }
      />
      <Problem code={implausible(rule, value) ? 'implausibleMeasurement' : undefined} />
    </>
  );
}

/** A reading no instrument could show (pH 14 whey, 500 °C): a typing slip, asked again before it is saved. */
function implausible(rule: ReceptionMeasurement, value: unknown) {
  return (
    typeof value === 'number' &&
    ((rule.min_plausible !== undefined && value < rule.min_plausible) ||
      (rule.max_plausible !== undefined && value > rule.max_plausible))
  );
}

export function Decide(props: PipelineProps) {
  const { t } = useText();
  const name = useNames();
  const lot = props.data.lots.find((l) => l.id === props.lotId);
  const config = lotConfig(props.data, lot);
  const suggestion = useMemo(
    () => (lot ? suggestDecision(lot, config.definition.reception_measurements ?? []) : undefined),
    [lot, config],
  );
  const [choice, setOutcome] = useState<string | null>(null);
  const [pin, setPin] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState<string | null>(null);
  if (!lot || !suggestion)
    return (
      <Step title={t('decide')} pipeline="decide" onClose={props.onClose}>
        <p className="s-lead">{t('loading', { ns: 'translation' })}</p>
      </Step>
    );
  if (!canDecide(props.identity, lot))
    return (
      <Step title={t('decide')} pipeline="decide" onClose={props.onClose}>
        <p className="s-lead">{t('supervisorDecides')}</p>
      </Step>
    );
  const plan = decisionPlan(props.settings.wheyDecision, suggestion);
  const pinReady = /^\d{4,6}$/.test(pin);
  async function decide(outcome: string, finalReason: string) {
    setBusy(true);
    setError('');
    try {
      if (isOnline()) {
        await synchronize(props.identity);
        await signedAction(props.identity, 'decision', lot!.id, pin, { outcome, reason: finalReason });
      } else
        await saveAction(
          props.identity,
          config,
          'whey_decision',
          { lot_id: lot!.id, outcome, reason: finalReason },
          [],
          pin,
        );
      await props.onSaved();
      setSaved(outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }
  if (saved)
    return (
      <Done
        title={saved === 'accepted' ? t('wheyAccepted') : saved === 'hold' ? t('wheyHeld') : t('decisionSaved')}
        message={saved === 'hold' ? t('supervisorFollows') : name(lot)}
        onHome={props.onCompleted ?? props.onClose}
        next={
          saved === 'accepted' && canRecord(props.identity, props.settings, props.cooperativeCode)
            ? {
                label: t('whatNext', { action: t('batch') }),
                onClick: () => props.open({ key: `batch:${lot.id}`, pipeline: 'batch', lotId: lot.id, overdue: false }),
              }
            : undefined
        }
      />
    );
  const issue = (item: { key: string; value?: number; min?: number; max?: number }) =>
    item.value === undefined
      ? t('issue_' + item.key)
      : `${item.key === 'ph' ? 'pH' : t('temperature', { ns: 'translation' })} ${item.value} (${t('safeRange', { min: item.min ?? '', max: item.max ?? '', unit: '' }).trim()})`;
  const summary = (
    <>
      <div className={`s-banner ${suggestion.outcome === 'accepted' ? 's-good' : 's-warn-banner'}`}>
        {suggestion.outcome === 'accepted' ? (
          t('allWithin')
        ) : (
          <>
            {t('outsideLimits')}
            <ul>
              {suggestion.issues.map((i) => (
                <li key={i.key}>{issue(i)}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      <p className="s-meta">
        {name(lot)} · {lot.initial_quantity} {lot.unit}
      </p>
    </>
  );
  const pinField = (
    <label className="s-number">
      <span className="s-field-label">{t('pinToSign')}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
      />
    </label>
  );
  if (plan.kind === 'signal')
    return (
      <Step
        title={suggestion.outcome === 'accepted' ? t('looksGoodTitle') : t('somethingOffTitle')}
        pipeline="decide"
        hint="decide"
        help={t('help_decide')}
        onClose={props.onClose}
        busy={busy}
        error={error}
        action={{
          label: t(plan.primary.label),
          tone: plan.primary.outcome === 'accepted' ? 'primary' : 'warning',
          disabled: !pinReady,
          onClick: () => decide(plan.primary.outcome, plan.primary.reason),
        }}
        secondary={
          plan.secondary
            ? {
                label: t(plan.secondary.label),
                disabled: !pinReady,
                onClick: () => decide(plan.secondary!.outcome, plan.secondary!.reason),
              }
            : undefined
        }
      >
        {summary}
        {pinField}
      </Step>
    );
  // Choose mode keeps the full decision; going against the suggestion needs the person's own reason.
  const outcome = choice ?? plan.preselected;
  const ownReason = outcome !== suggestion.outcome;
  return (
    <Step
      title={t('decideTitle')}
      pipeline="decide"
      hint="decide"
      help={t('help_decide')}
      onClose={props.onClose}
      busy={busy}
      error={error}
      action={{
        label: t('save'),
        onClick: () => decide(outcome, ownReason ? reason.trim() : suggestion.reason),
        disabled: !pinReady || (ownReason && reason.trim().length < 3),
        tone: outcome === 'accepted' ? 'primary' : 'warning',
      }}
    >
      {summary}
      <Choices
        label={t('decideTitle')}
        value={outcome}
        onChange={setOutcome}
        options={plan.options.map((value) => ({
          value,
          label: t(value),
          picture: value === 'accepted' ? '✅' : value === 'hold' ? '⏸️' : '❌',
        }))}
      />
      {ownReason && (
        <label className="s-number">
          <span className="s-field-label">{t('yourReason')}</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      )}
      {pinField}
    </Step>
  );
}
