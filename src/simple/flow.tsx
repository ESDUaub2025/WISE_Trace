import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { Snapshot } from '../lib/data';
import type { Identity } from '../lib/domain';
import type { Answer, Question, Settings } from './settings';
import { numberProblem, type Answers, type Resolved } from './memory';
import type { Job } from './jobs';
import { Choices, HelpTip, QuestionInput, Step, UsualList, useAnswerLabel, type Exchange, type StepAction } from './ui';
import { useText } from './text';
import { fileTesting } from '../testing/file-mode';

export interface PipelineProps {
  data: Snapshot;
  identity: Identity;
  settings: Settings;
  cooperativeCode: string;
  lotId?: string;
  checkpoint?: string;
  onClose: () => void;
  onCompleted?: () => void;
  /**
   * Sends what was saved when online and returns the refreshed data.
   * Given the saved record's id, it throws that record's refusal reason (and only that record's).
   */
  onSaved: (savedId?: string) => Promise<Snapshot | undefined>;
  open: (job: Job) => void;
  /** Keep missing setup in the current task's navigation, rather than dropping into another workspace. */
  onPrepare?: (section: 'supplier' | 'materials' | 'ingredients') => void;
}

export interface Screen {
  id: string;
  title: string;
  body: (next: () => void) => ReactNode;
  ready?: boolean;
  action?: Partial<StepAction>;
  secondary?: StepAction;
  /** The answer in a few words, shown as the person's reply in the chat style. */
  summary?: () => string;
  help?: string;
  hint?: string;
}

/**
 * Shows screens one at a time; the last screen's main button saves. Answered screens become the chat history.
 * The step is part of the address (?step=2), so the phone's Back button returns to the previous question
 * instead of leaving the job, and a reload reopens the same question.
 */
export function Runner({
  screens,
  onClose,
  onSave,
  saveLabel,
  busy,
  error,
  pipeline,
}: {
  screens: Screen[];
  onClose: () => void;
  onSave: () => Promise<void>;
  saveLabel?: string;
  busy: boolean;
  error: string;
  pipeline?: string;
}) {
  const { t } = useText();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const addressStep = Number(params.get('step') ?? 0);
  // The screen changes at once when a button is pressed; the address follows. When the address changes
  // on its own (the Back or Forward button), the screen follows the address.
  const [wanted, setWanted] = useState(addressStep);
  const [seenAddress, setSeenAddress] = useState(location.key);
  if (seenAddress !== location.key) {
    setSeenAddress(location.key);
    if (wanted !== addressStep) setWanted(addressStep);
  }
  // Never open a question whose earlier answers are missing (an old link, or a reload without the saved answers).
  const firstOpen = screens.findIndex((screen) => screen.ready === false);
  const furthest = firstOpen === -1 ? screens.length - 1 : firstOpen;
  const index = Math.max(0, Math.min(Number.isInteger(wanted) ? wanted : 0, furthest));
  const current = screens[index];
  const last = index >= screens.length - 1;
  const history: Exchange[] = screens
    .slice(0, index)
    .map((screen) => ({ question: screen.title, answer: screen.summary?.() ?? '' }));
  const withStep = (step: number) => {
    const next = new URLSearchParams(params);
    if (step > 0) next.set('step', String(step));
    else next.delete('step');
    return next;
  };
  const next = () => {
    if (last) return;
    setWanted(index + 1);
    setParams(withStep(index + 1), { state: { fromStep: index } });
  };
  // Undo the entry "next" added when there is one; otherwise (reload, direct link) move without adding history.
  const back = () => {
    setWanted(index - 1);
    if ((location.state as { fromStep?: number } | null)?.fromStep === index - 1) void navigate(-1);
    else setParams(withStep(index - 1), { replace: true });
  };
  if (!current) return null;
  const main: StepAction = {
    label: last ? (saveLabel ?? t('save')) : t('next'),
    disabled: current.ready === false,
    ...current.action,
    onClick: current.action?.onClick ?? (last ? onSave : next),
  };
  return (
    <Step
      key={current.id}
      title={current.title}
      step={index + 1}
      total={screens.length}
      onClose={onClose}
      onBack={index > 0 ? back : undefined}
      action={main}
      secondary={current.secondary}
      busy={busy}
      error={error}
      help={current.help}
      hint={current.hint}
      pipeline={pipeline}
      history={history}
      clip={`${pipeline}.${current.id}`}
    >
      {current.body(next)}
    </Step>
  );
}

const filled = (value: Answer | undefined) => value !== undefined && value !== '';

/** Turns resolved questions into screens: one "same as usual?" card, one screen per open question, and one screen of quick checks. */
export function useQuestionScreens({
  resolved,
  answers,
  set,
  usualTitle,
  suggestions = {},
}: {
  resolved: Resolved;
  answers: Answers;
  set: (key: string, value: Answer | undefined) => void;
  usualTitle?: string;
  suggestions?: Answers;
}): Screen[] {
  const { t, words } = useText();
  const label = useAnswerLabel();
  const [editing, setEditing] = useState(false);
  const screens: Screen[] = [];
  const usual = resolved.usual.map((u) => u.question);
  const changed = () =>
    resolved.usual
      .filter((u) => answers[u.question.key] !== u.value)
      .map((u) => label(u.question, answers[u.question.key]));
  if (usual.length)
    screens.push({
      id: 'usual',
      title: usualTitle ?? t('sameAsUsual'),
      hint: 'usual',
      ready: usual.every((q) => (!q.required || filled(answers[q.key])) && !numberProblem(q, answers[q.key])),
      body: () =>
        editing ? (
          <div className="s-stack">
            {usual.map((q) => (
              <QuestionBlock key={q.key} question={q} value={answers[q.key]} set={set} compact />
            ))}
          </div>
        ) : (
          <UsualList items={usual} answers={answers} />
        ),
      summary: () => (changed().length ? changed().join(' · ') : t('yesSame')),
      action: editing ? undefined : { label: t('yesSame') },
      secondary: editing ? undefined : { label: t('changeSomething'), onClick: () => setEditing(true) },
    });
  const quick = resolved.ask.filter(isQuick);
  for (const question of resolved.ask.filter((q) => !isQuick(q)))
    screens.push({
      id: question.key,
      title: words(question.label),
      help: words(question.help) || undefined,
      ready: (!question.required || filled(answers[question.key])) && !numberProblem(question, answers[question.key]),
      summary: () => (filled(answers[question.key]) ? label(question, answers[question.key]) : t('skipped')),
      body: (next) => (
        <>
          <QuestionInput
            question={question}
            value={answers[question.key]}
            suggestion={suggestions[question.key]}
            onChange={(value) => {
              set(question.key, value);
              if (!fileTesting && question.input === 'choice') setTimeout(next, 180);
            }}
          />
          <Problem code={numberProblem(question, answers[question.key])} />
        </>
      ),
    });
  if (quick.length)
    screens.push({
      id: 'quick',
      title: t('quickChecks'),
      hint: 'quick',
      ready: quick.every((q) => !q.required || filled(answers[q.key])),
      summary: () => quick.map((q) => label(q, answers[q.key])).join(' · '),
      body: () => (
        <div className="s-stack">
          {quick.map((q) => (
            <QuestionBlock key={q.key} question={q} value={answers[q.key]} set={set} compact />
          ))}
        </div>
      ),
    });
  return screens;
}

/** Blocks one screen with a reason, for rules that need more than the answer itself (stock left, pouches available). */
export function guardScreen(screens: Screen[], id: string, code: string | undefined): Screen[] {
  return screens.map((screen) =>
    screen.id === id && code && screen.ready !== false
      ? {
          ...screen,
          ready: false,
          body: (next) => (
            <>
              {screen.body(next)}
              <Problem code={code} />
            </>
          ),
        }
      : screen,
  );
}

/** Why the main button is off, said next to the answer that causes it. */
export function Problem({ code }: { code: string | undefined }) {
  const { error } = useText();
  return code ? (
    <p className="s-error" role="alert">
      {error(code)}
    </p>
  ) : null;
}

/** A choice with a default and at most three options is a quick check: shown together, already answered "normal". */
export const isQuick = (q: Question) =>
  q.input === 'choice' && q.default !== undefined && (q.options?.length ?? 0) <= 3 && q.memory === 'every_time';

function QuestionBlock({
  question,
  value,
  set,
  compact,
}: {
  question: Question;
  value: Answer | undefined;
  set: (key: string, value: Answer | undefined) => void;
  compact?: boolean;
}) {
  const { words } = useText();
  if (question.input === 'choice')
    return (
      <div className="s-field">
        <span className="s-field-label">
          {words(question.label)}
          <HelpTip text={words(question.help) || undefined} />
        </span>
        <Choices
          label={words(question.label)}
          value={value === undefined ? undefined : String(value)}
          onChange={(v) => set(question.key, v)}
          options={(question.options ?? []).map((o) => ({ value: o.value, label: words(o.label), picture: o.picture }))}
        />
      </div>
    );
  return <QuestionInput question={question} value={value} onChange={(v) => set(question.key, v)} compact={compact} />;
}
