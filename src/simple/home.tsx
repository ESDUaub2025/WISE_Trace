import { useState } from 'react';
import { ArrowRight, ChevronRight, Ellipsis, Lightbulb } from 'lucide-react';
import type { Snapshot } from '../lib/data';
import type { Identity } from '../lib/domain';
import { lotConfig } from '../lib/schedules';
import type { Action, Settings } from './settings';
import { canRecord, recordersFor } from './access';
import { homeItems, jobsFor, journeys, type HomeItem, type Job, type Journey } from './jobs';
import { newlyUnlocked, unlockedActions } from './levels';
import { useHint, useNames, useStyle } from './context';
import { Bubble, PipelinePicture } from './ui';
import { useText } from './text';

export interface MenuLinks {
  /** Opens the shared account sheet: language, full workspace, lock or switch person, sign out. */
  account: () => void;
  setup?: () => void;
}

const asJob = (item: HomeItem): Job =>
  item.kind === 'job' ? item.job : { key: item.action, pipeline: item.action, lotId: item.lotId, overdue: false };

/** What the home screen needs, the same for cards and chat. */
function useHome(data: Snapshot, identity: Identity, settings: Settings, cooperativeCode: string) {
  const now = new Date();
  const all = jobsFor(data, identity, settings, cooperativeCode, now);
  const batches = journeys(data, identity, settings, cooperativeCode, now);
  const recorder = canRecord(identity, settings, cooperativeCode);
  const unlocked = recorder ? unlockedActions(data, identity, settings) : [];
  const items = homeItems(all, batches, unlocked, data, now);
  const work = items.filter((i) => i.kind === 'job');
  const recorders = recordersFor(settings, cooperativeCode).map((username) =>
    String(data.members.find((m) => m.username === username)?.display_name ?? username),
  );
  return {
    hero: items[0],
    rest: work.slice(1, settings.home.maxJobs),
    batches,
    recorder,
    unlocked,
    recorders,
    elsewhere: all.filter((j) => j.pipeline === 'full_app'),
    locked: settings.home.actions.length - unlocked.length,
  };
}

/** The sentence and button for one thing to do, in kitchen words. */
function useDescribe(data: Snapshot) {
  const { t, words } = useText();
  const name = useNames();
  return (item: HomeItem) => {
    const job = asJob(item);
    const lot = data.lots.find((l) => l.id === job.lotId);
    const config = lotConfig(data, lot);
    const stage = words(config.definition.stages.find((s) => s.key === lot?.stage)?.label);
    if (item.kind === 'invite')
      return {
        pipeline: item.action,
        sentence: t(
          item.action === 'receive'
            ? 'heroReceive'
            : item.action === 'batch'
              ? 'heroBatch'
              : item.action === 'sell'
                ? 'heroSell'
                : 'heroCalm',
        ),
        detail: item.action === 'batch' ? name(lot) : '',
        button: t(`btn${item.action[0].toUpperCase()}${item.action.slice(1)}`),
      };
    const sentence = {
      check: t('heroCheck', { name: name(lot) }),
      stage: t('heroStage', { name: name(lot), stage }),
      pack: t('heroPack', { name: name(lot) }),
      decide: t('heroDecide'),
      batch: t('heroUseWhey', { name: name(lot) }),
      receive: t('heroReceive'),
      sell: t('heroSell'),
      full_app: t('full_app'),
    }[job.pipeline];
    const button = {
      check: t('btnCheck'),
      stage: t('btnStage'),
      pack: t('btnPack'),
      decide: t('btnDecide'),
      batch: t('btnUseWhey'),
      receive: t('btnReceive'),
      sell: t('btnSell'),
      full_app: t('full_app'),
    }[job.pipeline];
    const detail =
      job.pipeline === 'check'
        ? words(config.definition.checkpoints.find((c) => c.key === job.checkpoint)?.label)
        : job.pipeline === 'decide'
          ? name(lot)
          : '';
    return { pipeline: job.pipeline, sentence, detail, button };
  };
}

function greeting(t: (key: string, options?: Record<string, unknown>) => string, name: string) {
  const hour = new Date().getHours();
  return t(hour < 12 ? 'greetMorning' : hour < 18 ? 'greetAfternoon' : 'greetEvening', { name: name.split(' ')[0] });
}

/** Celebrates start actions that just unlocked, once per person on this device. */
function useUnlocks(identity: Identity, unlocked: Action[]) {
  const key = `wise-simple-unlocked:${identity.id}`;
  const [seen, setSeen] = useState<string[] | null>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) return JSON.parse(stored) as string[];
      localStorage.setItem(key, JSON.stringify(unlocked));
      return unlocked;
    } catch {
      return unlocked;
    }
  });
  const fresh = newlyUnlocked(seen, unlocked);
  return {
    fresh,
    dismiss: () => {
      try {
        localStorage.setItem(key, JSON.stringify(unlocked));
      } catch {
        /* shown again next time */
      }
      setSeen(unlocked);
    },
  };
}

function Progress({ batch }: { batch?: Journey }) {
  if (!batch) return null;
  return (
    <span
      className="s-progress"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={batch.stageCount}
      aria-valuenow={batch.stageIndex + 1}
    >
      {Array.from({ length: batch.stageCount }, (_, i) => (
        <i key={i} className={i <= batch.stageIndex ? 'on' : ''} />
      ))}
    </span>
  );
}

export function Home(props: {
  data: Snapshot;
  identity: Identity;
  settings: Settings;
  cooperativeCode: string;
  open: (job: Job) => void;
  menu: MenuLinks;
}) {
  const model = useHome(props.data, props.identity, props.settings, props.cooperativeCode);
  const [more, setMore] = useState(false);
  const view =
    useStyle() === 'chat' ? (
      <ChatHome {...props} model={model} onMore={() => setMore(true)} />
    ) : (
      <CardHome {...props} model={model} onMore={() => setMore(true)} />
    );
  return (
    <>
      {view}
      {more && <MoreSheet {...props} model={model} onClose={() => setMore(false)} />}
    </>
  );
}

type Model = ReturnType<typeof useHome>;
type HomeProps = {
  data: Snapshot;
  identity: Identity;
  settings: Settings;
  open: (job: Job) => void;
  model: Model;
  onMore: () => void;
};

function CardHome({ data, identity, open, model, onMore }: HomeProps) {
  const { t } = useText();
  const describe = useDescribe(data);
  const { fresh, dismiss } = useUnlocks(identity, model.unlocked);
  const tip = useHint(model.hero ? 'home' : undefined);
  const hero = model.hero ? describe(model.hero) : undefined;
  const heroJob = model.hero ? asJob(model.hero) : undefined;
  return (
    <main className="s-home">
      <h1 className="s-hello">{greeting(t, identity.display_name)}</h1>
      {fresh.length > 0 && (
        <p className="s-banner s-new" role="status">
          <span>{t('unlocked', { action: fresh.map((a) => t(a)).join(', ') })}</span>
          <button className="s-link" onClick={dismiss}>
            {t('gotIt')}
          </button>
        </p>
      )}
      {!model.recorder && (
        <p className="s-banner">
          {model.recorders.length ? t('recorderOnly', { names: model.recorders.join(', ') }) : t('noRecorder')}
        </p>
      )}
      {tip && (
        <p className="s-hint" role="note">
          <Lightbulb size={20} />
          <span>{t('hint_home')}</span>
        </p>
      )}
      {hero && heroJob ? (
        <section className={`s-hero ${heroJob.overdue ? 's-late' : ''}`} aria-labelledby="s-hero-text">
          <PipelinePicture pipeline={hero.pipeline} />
          {heroJob.overdue && <span className="s-badge">{t('overdue')}</span>}
          <h2 id="s-hero-text">{hero.sentence}</h2>
          {hero.detail && <p className="s-hero-detail">{hero.detail}</p>}
          <Progress batch={model.batches.find((b) => b.lot.id === heroJob.lotId)} />
          <button className="s-button s-primary s-hero-button" onClick={() => open(heroJob)}>
            {hero.button}
            <ArrowRight className="s-flip" size={22} />
          </button>
        </section>
      ) : (
        <p className="s-calm">{t('heroCalm')}</p>
      )}
      {model.rest.length > 0 && (
        <details className="s-more-today">
          <summary>{t('moreToday', { count: model.rest.length })}</summary>
          <ul className="s-list">
            {model.rest.map((item) => {
              const d = describe(item);
              const job = asJob(item);
              return (
                <li key={job.key}>
                  <button onClick={() => open(job)}>
                    <PipelinePicture pipeline={d.pipeline} size="small" />
                    <span>
                      <strong>{d.sentence}</strong>
                      {d.detail && <small>{d.detail}</small>}
                    </span>
                    <ChevronRight className="s-flip" size={20} />
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      <button className="s-more-button" onClick={onMore}>
        <Ellipsis size={22} />
        {t('more')}
      </button>
    </main>
  );
}

function ChatHome({ data, identity, open, model, onMore }: HomeProps) {
  const { t } = useText();
  const describe = useDescribe(data);
  const { fresh, dismiss } = useUnlocks(identity, model.unlocked);
  const [asked, setAsked] = useState(false);
  const hero = model.hero ? describe(model.hero) : undefined;
  const heroJob = model.hero ? asJob(model.hero) : undefined;
  const others = [
    ...model.rest.map(asJob),
    ...model.unlocked
      .filter((a) => a !== heroJob?.pipeline)
      .map((a) => ({ key: a, pipeline: a, overdue: false }) as Job),
  ];
  return (
    <section className="s-chat s-chat-home">
      <div className="s-chat-log" aria-live="polite">
        <Bubble from="app">
          <strong>{greeting(t, identity.display_name)}</strong>
        </Bubble>
        {fresh.length > 0 && (
          <Bubble from="app">🎉 {t('unlocked', { action: fresh.map((a) => t(a)).join(', ') })}</Bubble>
        )}
        {!model.recorder && (
          <Bubble from="app">
            {model.recorders.length ? t('recorderOnly', { names: model.recorders.join(', ') }) : t('noRecorder')}
          </Bubble>
        )}
        {hero ? (
          <Bubble from="app">
            <span className="s-bubble-row">
              <PipelinePicture pipeline={hero.pipeline} size="small" />
              <span>
                {hero.sentence}
                {hero.detail && <small className="s-bubble-detail">{hero.detail}</small>}
              </span>
            </span>
          </Bubble>
        ) : (
          <Bubble from="app">{t('heroCalm')}</Bubble>
        )}
        {asked && (
          <>
            <Bubble from="me">{t('whatElse')}</Bubble>
            <Bubble from="app">{others.length ? t('chatMore') : t('chatNothingElse')}</Bubble>
          </>
        )}
      </div>
      <footer className="s-chat-replies">
        {heroJob && hero && (
          <button
            className="s-chip s-chip-main"
            onClick={() => {
              dismiss();
              open(heroJob);
            }}
          >
            {hero.button}
          </button>
        )}
        {asked ? (
          others.map((job) => (
            <button key={job.key} className="s-chip" onClick={() => open(job)}>
              {job.pipeline === job.key ? t(job.pipeline) : describe({ kind: 'job', job }).sentence}
            </button>
          ))
        ) : (
          <button
            className="s-chip"
            onClick={() => {
              dismiss();
              setAsked(true);
            }}
          >
            {t('whatElse')}
          </button>
        )}
        <button className="s-chip" onClick={onMore}>
          {t('more')}
        </button>
      </footer>
    </section>
  );
}

/** Everything that is not the next job: start actions so far unlocked, kishk in progress, and settings, out of the way. */
function MoreSheet({
  data,
  open,
  model,
  menu,
  onClose,
}: {
  data: Snapshot;
  open: (job: Job) => void;
  model: Model;
  menu: MenuLinks;
  onClose: () => void;
}) {
  const { t, words } = useText();
  const name = useNames();
  const go = (job: Job) => {
    onClose();
    open(job);
  };
  return (
    <div className="s-sheet-backdrop" onClick={onClose}>
      <section
        className="s-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('more')}
        onClick={(e) => e.stopPropagation()}
      >
        {model.unlocked.length > 0 && (
          <>
            <h2 className="s-h2">{t('start')}</h2>
            <ul className="s-list">
              {model.unlocked.map((action) => (
                <li key={action}>
                  <button onClick={() => go({ key: action, pipeline: action, overdue: false })}>
                    <PipelinePicture pipeline={action} size="small" />
                    <span>
                      <strong>{t(action)}</strong>
                    </span>
                    <ChevronRight className="s-flip" size={20} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {model.locked > 0 && model.recorder && <p className="s-meta">{t('moreWillAppear')}</p>}
        {model.batches.length > 0 && (
          <>
            <h2 className="s-h2">{t('myKishk')}</h2>
            <ul className="s-list">
              {model.batches.map((b) => (
                <li key={b.lot.id}>
                  <button onClick={() => go(b.next)}>
                    <PipelinePicture pipeline="batch" size="small" />
                    <span>
                      <strong>{name(b.lot)}</strong>
                      <small>{words(lotConfig(data, b.lot).definition.stages[b.stageIndex]?.label)}</small>
                      <Progress batch={b} />
                    </span>
                    <ChevronRight className="s-flip" size={20} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {model.elsewhere.length > 0 && (
          <>
            <h2 className="s-h2">{t('inFullApp')}</h2>
            <ul className="s-list s-list-quiet">
              {model.elsewhere.map((job) => (
                <li key={job.key}>
                  <button onClick={() => go(job)}>
                    <span>
                      <strong>
                        {name(data.lots.find((l) => l.id === job.lotId)) ||
                          t(job.taskKind ?? 'full_app', { ns: 'translation' })}
                      </strong>
                      {job.taskKind && <small>{t(job.taskKind, { ns: 'translation' })}</small>}
                    </span>
                    <ChevronRight className="s-flip" size={20} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="s-sheet-links">
          <button
            className="s-link"
            onClick={() => {
              onClose();
              menu.account();
            }}
          >
            {t('accountAndSettings')}
          </button>
          {menu.setup && (
            <button
              className="s-link"
              onClick={() => {
                onClose();
                menu.setup!();
              }}
            >
              {t('setup')}
            </button>
          )}
        </div>
        <button className="s-button s-quiet" onClick={onClose}>
          {t('close')}
        </button>
      </section>
    </div>
  );
}
