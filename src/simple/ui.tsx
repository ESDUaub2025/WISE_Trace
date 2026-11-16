import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CircleHelp,
  ClipboardCheck,
  CookingPot,
  Footprints,
  Lightbulb,
  Milk,
  Package,
  ShieldCheck,
  Store,
  Volume2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { compressPhoto } from '../lib/media';
import type { Answer, Question } from './settings';
import type { Answers } from './memory';
import { useText } from './text';
import { useHint, useSimple, useStyle } from './context';
import { canSpeak, celebrate, speak } from './voice';
import { workerDraftKey } from '../worker/drafts';

export interface StepAction {
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  tone?: 'primary' | 'warning';
}
export interface Exchange {
  question: string;
  answer: string;
}

const icons: Record<string, LucideIcon> = {
  receive: Milk,
  decide: ShieldCheck,
  batch: CookingPot,
  check: ClipboardCheck,
  stage: Footprints,
  pack: Package,
  sell: Store,
};

/** The picture for a job: a real photo when the settings name one, otherwise a drawn icon. */
export function PipelinePicture({ pipeline, size = 'large' }: { pipeline?: string; size?: 'large' | 'small' }) {
  const { settings } = useSimple();
  if (!pipeline) return null;
  const photo = settings.pictures[pipeline];
  const Icon = icons[pipeline] ?? Package;
  return (
    <span className={`s-picture s-picture-${size}`} aria-hidden="true">
      {photo ? <img src={photo} alt="" /> : <Icon size={size === 'large' ? 48 : 24} />}
    </span>
  );
}

/** Plays the words aloud: the person can listen instead of reading. */
export function SpeakButton({ text, clip }: { text: string; clip?: string }) {
  const { t, arabic } = useText();
  const { settings } = useSimple();
  if (!canSpeak(settings.voice, clip)) return null;
  return (
    <button
      type="button"
      className="s-speak"
      aria-label={t('listen')}
      onClick={() => speak(text, arabic ? 'ar' : 'en', settings.voice, clip)}
    >
      <Volume2 size={22} />
    </button>
  );
}

/** A "?" that opens one plain sentence. Phones have no hover, so it opens on tap. */
export function HelpTip({ text }: { text?: string }) {
  const { t } = useText();
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <span className="s-helptip">
      <button
        type="button"
        className="s-help"
        aria-expanded={open}
        aria-label={t('whyAsk')}
        onClick={() => setOpen((o) => !o)}
      >
        <CircleHelp size={22} />
      </button>
      {open && (
        <span className="s-help-text" role="note">
          {text}
        </span>
      )}
    </span>
  );
}

function Hint({ id }: { id?: string }) {
  const { t } = useText();
  const show = useHint(id);
  const [closed, setClosed] = useState(false);
  if (!id || !show || closed) return null;
  return (
    <p className="s-hint" role="note">
      <Lightbulb size={20} />
      <span>{t('hint_' + id)}</span>
      <button type="button" aria-label={t('close')} onClick={() => setClosed(true)}>
        <X size={18} />
      </button>
    </p>
  );
}

interface StepProps {
  title: string;
  step?: number;
  total?: number;
  onClose: () => void;
  onBack?: () => void;
  action?: StepAction;
  secondary?: StepAction;
  error?: string;
  busy?: boolean;
  children?: ReactNode;
  /** Plain sentence behind the "?" button. */ help?: string;
  /** One-time tip key (words hint_<key>). */ hint?: string;
  pipeline?: string;
  history?: Exchange[];
  clip?: string;
}

/** One screen of a job: one question, one main button, a way back. Drawn as a card or as a chat turn. */
export function Step(props: StepProps) {
  return useStyle() === 'chat' ? <ChatStep {...props} /> : <CardStep {...props} />;
}

function CardStep({
  title,
  step,
  total,
  onClose,
  onBack,
  action,
  secondary,
  error,
  busy,
  children,
  help,
  hint,
  pipeline,
  clip,
}: StepProps) {
  const { t, error: message } = useText();
  return (
    <section className="s-step" aria-labelledby="s-step-title">
      <header className="s-step-head">
        {onBack ? (
          <button className="s-icon" onClick={onBack} aria-label={t('back')}>
            <ArrowLeft className="s-flip" />
          </button>
        ) : (
          <span className="s-icon-gap" />
        )}
        {total && total > 1 ? (
          <ol className="s-dots" aria-label={t('stepOf', { n: step, total })}>
            {Array.from({ length: total }, (_, i) => (
              <li key={i} className={i < (step ?? 0) ? 'on' : ''} />
            ))}
          </ol>
        ) : (
          <span />
        )}
        <button className="s-icon" onClick={onClose} aria-label={t('close')}>
          <X />
        </button>
      </header>
      {pipeline && step === 1 && <PipelinePicture pipeline={pipeline} />}
      <div className="s-title-row">
        <h1 id="s-step-title" className="s-title">
          {title}
        </h1>
        <SpeakButton text={title} clip={clip} />
        <HelpTip text={help} />
      </div>
      <Hint id={hint} />
      <div className="s-step-body">{children}</div>
      {error && (
        <p className="s-error" role="alert">
          {message(error)}
        </p>
      )}
      <footer className="s-step-foot">
        {secondary && (
          <button
            className="s-button s-quiet"
            onClick={() => void secondary.onClick()}
            disabled={busy || secondary.disabled}
          >
            {secondary.label}
          </button>
        )}
        {action && (
          <button
            className={`s-button ${action.tone === 'warning' ? 's-warning' : 's-primary'}`}
            onClick={() => void action.onClick()}
            disabled={busy || action.disabled}
          >
            {busy ? t('saving') : action.label}
            {!busy && <ArrowRight className="s-flip" size={20} />}
          </button>
        )}
      </footer>
    </section>
  );
}

export function Bubble({ from, children }: { from: 'app' | 'me'; children: ReactNode }) {
  return <div className={`s-bubble s-from-${from}`}>{children}</div>;
}

function ChatStep({
  title,
  onClose,
  onBack,
  action,
  secondary,
  error,
  busy,
  children,
  help,
  hint,
  pipeline,
  history = [],
  clip,
}: StepProps) {
  const { t, error: message } = useText();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [title, history.length, error]);
  return (
    <section className="s-chat" aria-labelledby="s-step-title">
      <header className="s-chat-head">
        {onBack ? (
          <button className="s-icon" onClick={onBack} aria-label={t('back')}>
            <ArrowLeft className="s-flip" />
          </button>
        ) : (
          <span className="s-icon-gap" />
        )}
        <PipelinePicture pipeline={pipeline} size="small" />
        <button className="s-icon" onClick={onClose} aria-label={t('close')}>
          <X />
        </button>
      </header>
      <div className="s-chat-log" aria-live="polite">
        {history.map((turn, i) => (
          <div key={i} className="s-turn">
            <Bubble from="app">{turn.question}</Bubble>
            {turn.answer && <Bubble from="me">{turn.answer}</Bubble>}
          </div>
        ))}
        <Bubble from="app">
          <span className="s-title-row">
            <strong id="s-step-title">{title}</strong>
            <SpeakButton text={title} clip={clip} />
            <HelpTip text={help} />
          </span>
        </Bubble>
        <Hint id={hint} />
        {children && <div className="s-chat-reply">{children}</div>}
        {error && (
          <p className="s-error" role="alert">
            {message(error)}
          </p>
        )}
        <div ref={end} />
      </div>
      <footer className="s-chat-replies">
        {secondary && (
          <button className="s-chip" onClick={() => void secondary.onClick()} disabled={busy || secondary.disabled}>
            {secondary.label}
          </button>
        )}
        {action && (
          <button
            className={`s-chip s-chip-main ${action.tone === 'warning' ? 's-chip-warning' : ''}`}
            onClick={() => void action.onClick()}
            disabled={busy || action.disabled}
          >
            {busy ? t('saving') : action.label}
          </button>
        )}
      </footer>
    </section>
  );
}

function Picture({ value }: { value?: string }) {
  if (!value) return null;
  return /^(\/|https?:)/.test(value) ? (
    <img className="s-option-photo" src={value} alt="" />
  ) : (
    <span className="s-option-emoji" aria-hidden="true">
      {value}
    </span>
  );
}

export function Choices({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: string; label: string; detail?: string; picture?: string }[];
  value: string | undefined;
  onChange: (value: string) => void;
  label: string;
}) {
  const pictures = options.some((o) => o.picture);
  return (
    <div
      className={`s-choices ${options.length > 3 || (pictures && options.length > 2) ? 's-grid' : ''} ${pictures ? 's-with-pictures' : ''}`}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className="s-choice"
          onClick={() => onChange(option.value)}
        >
          <Picture value={option.picture} />
          <span>
            {option.label}
            {option.detail && <small>{option.detail}</small>}
          </span>
          {value === option.value && <Check className="s-choice-tick" size={22} />}
        </button>
      ))}
    </div>
  );
}

/** A number box. A suggestion from last time sits beside it as a chip: one tap uses it, but nothing is filled in silently. */
export function NumberInput({
  label,
  value,
  unit,
  hint,
  onChange,
  autoFocus = true,
  warn,
  suggestion,
  help,
}: {
  label: string;
  value: Answer | undefined;
  unit?: string;
  hint?: string;
  onChange: (value: number | undefined) => void;
  autoFocus?: boolean;
  warn?: boolean;
  suggestion?: number;
  help?: string;
}) {
  const { t } = useText();
  return (
    <div className={`s-number ${warn ? 's-warn' : ''}`}>
      <label>
        <span className="s-field-label">
          {label}
          <HelpTip text={help} />
        </span>
        <span className="s-number-row">
          <input
            inputMode="decimal"
            type="number"
            step="any"
            autoFocus={autoFocus}
            value={value === undefined ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          />
          {unit && <b>{unit}</b>}
        </span>
      </label>
      {suggestion !== undefined && value !== suggestion && (
        <button type="button" className="s-suggestion" onClick={() => onChange(suggestion)}>
          {t('lastTime', { value: `${suggestion}${unit ? ' ' + unit : ''}` })}
        </button>
      )}
      {hint && <small>{hint}</small>}
    </div>
  );
}

/** Shows an answer in words: the option label for choices, the number with its unit otherwise. */
export function useAnswerLabel() {
  const { t, words } = useText();
  return (question: Question, value: Answer | undefined) => {
    if (value === undefined || value === '') return '—';
    if (question.input === 'choice') {
      const option = question.options?.find((o) => o.value === String(value));
      return `${option?.picture && !/^(\/|https?:)/.test(option.picture) ? option.picture + ' ' : ''}${words(option?.label) || String(value)}`;
    }
    if (question.input === 'hours_ago') return t('hoursAgo', { count: Number(value) });
    return `${value}${question.unit ? ' ' + question.unit : ''}`;
  };
}

/** One question's input. Its label, "?" and suggestion come along so it works alone or grouped. */
export function QuestionInput({
  question,
  value,
  onChange,
  compact,
  suggestion,
}: {
  question: Question;
  value: Answer | undefined;
  onChange: (value: Answer | undefined) => void;
  compact?: boolean;
  suggestion?: Answer;
}) {
  const { words } = useText();
  if (question.input === 'choice')
    return (
      <Choices
        label={words(question.label)}
        value={value === undefined ? undefined : String(value)}
        onChange={onChange}
        options={(question.options ?? []).map((o) => ({ value: o.value, label: words(o.label), picture: o.picture }))}
      />
    );
  if (question.input === 'text')
    return (
      <label className="s-number">
        <span className="s-field-label">{words(question.label)}</span>
        <input
          autoFocus={!compact}
          value={value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  return (
    <NumberInput
      label={words(question.label)}
      unit={question.input === 'hours_ago' ? 'h' : question.unit}
      value={value}
      onChange={onChange}
      autoFocus={!compact}
      suggestion={typeof suggestion === 'number' ? suggestion : undefined}
      help={compact ? words(question.help) || undefined : undefined}
    />
  );
}

export function UsualList({ items, answers }: { items: Question[]; answers: Answers }) {
  const { words } = useText();
  const label = useAnswerLabel();
  return (
    <dl className="s-usual">
      {items.map((q) => (
        <div key={q.key}>
          <dt>{words(q.label)}</dt>
          <dd>{label(q, answers[q.key])}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PhotoInput({
  photo,
  onPhoto,
  onError,
}: {
  photo: Blob | null;
  onPhoto: (blob: Blob) => void;
  onError: (key: string) => void;
}) {
  const { t } = useText();
  return (
    <label className="s-photo">
      <Camera size={28} />
      <span>{photo ? t('photoTaken') : t('photo')}</span>
      {photo && <Check size={22} />}
      <input
        className="s-hidden"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file)
            try {
              onPhoto(await compressPhoto(file));
            } catch {
              onError('photo_failed');
            }
        }}
      />
    </label>
  );
}

/** The end of a job: a clear "done" with a sound and buzz, then the next useful step. */
export function Done({
  title,
  message,
  next,
  onHome,
}: {
  title: string;
  message?: string;
  next?: { label: string; onClick: () => void };
  onHome: () => void;
}) {
  const { t } = useText();
  const { settings } = useSimple();
  const style = useStyle();
  useEffect(() => {
    celebrate(settings.feedback);
  }, [settings.feedback]);
  if (style === 'chat')
    return (
      <section className="s-chat" aria-live="polite">
        <div className="s-chat-log">
          <Bubble from="app">
            <span className="s-done-inline">
              <Check size={22} />
              <strong>{title}</strong>
            </span>
            {message && <p>{message}</p>}
          </Bubble>
        </div>
        <footer className="s-chat-replies">
          {next && (
            <button className="s-chip s-chip-main" onClick={next.onClick}>
              {next.label}
            </button>
          )}
          <button className={next ? 's-chip' : 's-chip s-chip-main'} onClick={onHome}>
            {t('home')}
          </button>
        </footer>
      </section>
    );
  return (
    <section className="s-step s-done" aria-live="polite">
      <div className="s-done-mark">
        <Check size={44} />
      </div>
      <h1 className="s-title">{title}</h1>
      {message && <p className="s-lead">{message}</p>}
      <footer className="s-step-foot">
        {next && (
          <button className="s-button s-primary" onClick={next.onClick}>
            {next.label}
            <ArrowRight className="s-flip" size={20} />
          </button>
        )}
        <button className={`s-button ${next ? 's-quiet' : 's-primary'}`} onClick={onHome}>
          {t('home')}
        </button>
      </footer>
    </section>
  );
}

/** Keeps a small set of answers with a typed setter. */
export function useAnswers(initial: Answers, draftScope?: string) {
  const { identity } = useSimple();
  const key = identity ? workerDraftKey(identity.id, draftScope) : undefined;
  const [answers, setAnswers] = useState<Answers>(() => {
    try {
      const saved = key ? sessionStorage.getItem(key) : null;
      const value = saved ? JSON.parse(saved) : null;
      return value && typeof value === 'object' && !Array.isArray(value) ? { ...initial, ...value } : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      if (key) sessionStorage.setItem(key, JSON.stringify(answers));
    } catch {
      /* The current answers remain usable. */
    }
  }, [key, answers]);
  return [
    answers,
    (key: string, value: Answer | undefined) => setAnswers((current) => ({ ...current, [key]: value })),
    setAnswers,
  ] as const;
}
