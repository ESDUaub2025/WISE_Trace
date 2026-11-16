import { useMemo, useState } from 'react';
import { saveAction } from '../lib/data';
import { lotConfig } from '../lib/schedules';
import type { Lot } from '../lib/domain';
import { answerSources, rememberedPacking, rememberedSale, resolveQuestions, startingAnswers } from './memory';
import {
  batchYield,
  bestBefore,
  packableBatches,
  packagingMaterial,
  packagingPayload,
  salePayload,
  sellableLots,
} from './payloads';
import { guardScreen, Runner, useQuestionScreens, type PipelineProps, type Screen } from './flow';
import { Choices, Done, Step, useAnswers } from './ui';
import { useNames } from './context';
import { useText } from './text';
import { fileTesting } from '../testing/file-mode';
import { useWorkerText } from '../worker/copy';

const round = (value: number) => Math.round(value * 100) / 100;

function lotScreen(
  id: string,
  title: string,
  lots: Lot[],
  value: string | undefined,
  choose: (id: string) => void,
  detail: (lot: Lot) => string,
  name: (lot: Lot | undefined) => string,
  picture: string,
): Screen {
  return {
    id,
    title,
    ready: !!value,
    summary: () => name(lots.find((l) => l.id === value)),
    body: (next) => (
      <Choices
        label={title}
        value={value}
        onChange={(v) => {
          choose(v);
          if (!fileTesting) setTimeout(next, 180);
        }}
        options={lots.map((l) => ({ value: l.id, label: name(l), detail: detail(l) || undefined, picture }))}
      />
    ),
  };
}

export function Pack(props: PipelineProps) {
  const { t } = useText();
  const { w } = useWorkerText();
  const name = useNames();
  const batches = packableBatches(props.data);
  const [batchId, setBatchId] = useState(batches.find((l) => l.id === props.lotId)?.id ?? batches[0]?.id);
  const questions = props.settings.questions.pack;
  const resolved = useMemo(() => resolveQuestions(questions, rememberedPacking(props.data)), [questions, props.data]);
  const [answers, set] = useAnswers(startingAnswers(resolved));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState<{ count: number; bestBefore: string } | null>(null);
  const [yieldReason, setYieldReason] = useState('');
  const questionScreens = useQuestionScreens({ resolved, answers, set, suggestions: rememberedPacking(props.data) });
  const batch = batches.find((l) => l.id === batchId);
  if (saved)
    return (
      <Done
        title={t('packed', { count: saved.count })}
        message={`${t('bestBefore', { date: saved.bestBefore })}. ${t('needsRelease')}`}
        onHome={props.onCompleted ?? props.onClose}
      />
    );
  if (!batches.length)
    return (
      <Step title={t('pack')} pipeline="pack" onClose={props.onClose}>
        <p className="s-lead">{t('noBatchReady')}</p>
      </Step>
    );
  if (props.onPrepare && !props.data.lots.some((l) => l.type === 'packaging_material' && (l.available ?? 0) > 0))
    return (
      <Step
        title={t('pack')}
        pipeline="pack"
        onClose={props.onClose}
        action={{ label: w('addMaterial'), onClick: () => props.onPrepare!('materials') }}
      >
        <p className="s-lead">{w('requiredSetup')}</p>
      </Step>
    );
  const count = Number(answers.package_count);
  const screens = [
    ...(batches.length > 1
      ? [lotScreen('batch', t('whichBatch'), batches, batchId, setBatchId, () => '', name, '🍲')]
      : []),
    ...guardScreen(
      questionScreens,
      'package_count',
      count > 0 && !packagingMaterial(props.data, count) ? 'noPackagingMaterial' : undefined,
    ),
  ];
  // Packed mass far from what the ingredients can give is usually a counting slip; the procedure asks for a reason.
  const packedKg = count * Number(answers.size_kg);
  const output =
    batch && packedKg > 0 ? batchYield(props.data, lotConfig(props.data, batch), batch.id, packedKg) : null;
  async function save() {
    setBusy(true);
    setError('');
    try {
      const config = lotConfig(props.data, batch);
      const payload = packagingPayload({
        answers,
        batch: batch!,
        material: packagingMaterial(props.data, count),
        config,
        now: new Date(),
        reason: output?.outside ? yieldReason : '',
      });
      const id = await saveAction(props.identity, config, 'packaging', {
        ...payload,
        answer_sources: answerSources(resolved, answers),
      });
      await props.onSaved(id);
      setSaved({ count: payload.package_count, bestBefore: payload.best_before });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }
  const type = String(answers.package_type ?? '');
  const last = screens.at(-1);
  if (last && batch)
    screens[screens.length - 1] = {
      ...last,
      title: last.title,
      body: (next) => (
        <>
          {last.body(next)}
          <p className="s-meta">
            {t('bestBefore', { date: bestBefore(lotConfig(props.data, batch), type, new Date()) })}
          </p>
        </>
      ),
    };
  if (output?.outside && output.expected)
    screens.push({
      id: 'yield',
      title: t('yieldTitle'),
      ready: yieldReason.trim().length >= 5,
      summary: () => yieldReason.trim(),
      body: () => (
        <>
          <p className="s-banner s-warn-banner">
            {output.inputKg > 0
              ? t('yieldNote', {
                  packed: round(output.packedKg),
                  input: round(output.inputKg),
                  min: round(output.inputKg * output.expected!.min),
                  max: round(output.inputKg * output.expected!.max),
                })
              : t('yieldNoInput')}
          </p>
          <label className="s-number">
            <span className="s-field-label">{t('yieldReason')}</span>
            <textarea rows={3} value={yieldReason} onChange={(e) => setYieldReason(e.target.value)} maxLength={500} />
          </label>
        </>
      ),
    });
  if (screens[0]) screens[0] = { ...screens[0], hint: screens[0].hint ?? 'pack' };
  return (
    <Runner
      screens={screens}
      onClose={props.onClose}
      onSave={save}
      saveLabel={t('pack')}
      busy={busy}
      error={error}
      pipeline="pack"
    />
  );
}

export function Sell(props: PipelineProps) {
  const { t } = useText();
  const name = useNames();
  const stock = sellableLots(props.data, new Date());
  const [lotId, setLotId] = useState(stock.find((l) => l.id === props.lotId)?.id ?? stock[0]?.id);
  const lot = stock.find((l) => l.id === lotId);
  const questions = props.settings.questions.sell;
  const resolved = useMemo(() => resolveQuestions(questions, rememberedSale(props.data)), [questions, props.data]);
  const [answers, set] = useAnswers(startingAnswers(resolved));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState<{ total: number; currency: string } | null>(null);
  // The exchange rate only matters when the sale is not in dollars.
  const visible = useMemo(
    () => ({
      ...resolved,
      ask: resolved.ask.filter((q) => q.key !== 'usd_rate' || answers.currency !== 'USD'),
      usual: resolved.usual.filter((u) => u.question.key !== 'usd_rate' || answers.currency !== 'USD'),
    }),
    [resolved, answers.currency],
  );
  const questionScreens = useQuestionScreens({
    resolved: visible,
    answers,
    set,
    suggestions: rememberedSale(props.data),
  });
  if (saved)
    return (
      <Done
        title={t('saleSaved', { total: saved.total, currency: saved.currency })}
        onHome={props.onCompleted ?? props.onClose}
      />
    );
  if (!stock.length)
    return (
      <Step title={t('sell')} pipeline="sell" onClose={props.onClose}>
        <p className="s-lead">{t('nothingToSell')}</p>
      </Step>
    );
  const screens = [
    ...(stock.length > 1
      ? [
          lotScreen(
            'stock',
            t('whichStock'),
            stock,
            lotId,
            setLotId,
            (l) => t('left', { n: l.available ?? 0 }),
            name,
            '🛍️',
          ),
        ]
      : []),
    ...guardScreen(
      questionScreens,
      'quantity',
      Number(answers.quantity) > (lot?.available ?? 0) ? 'saleExceedsStock' : undefined,
    ),
  ];
  async function save() {
    setBusy(true);
    setError('');
    try {
      const payload = salePayload(answers, lot!);
      const id = await saveAction(props.identity, lotConfig(props.data, lot), 'sale', payload);
      await props.onSaved(id);
      setSaved({ total: payload.total, currency: payload.currency });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }
  if (screens[0]) screens[0] = { ...screens[0], hint: screens[0].hint ?? 'sell' };
  return (
    <Runner
      screens={screens}
      onClose={props.onClose}
      onSave={save}
      saveLabel={t('sell')}
      busy={busy}
      error={error}
      pipeline="sell"
    />
  );
}
