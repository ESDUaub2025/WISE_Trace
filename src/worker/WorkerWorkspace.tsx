import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  CookingPot,
  Home,
  Languages,
  Milk,
  Package,
  Plus,
  Search,
  ShoppingBag,
  UserRound,
} from 'lucide-react';
import { useIdentity, useSession } from '../session/SessionProvider';
import { useWorkspaceData } from '../app/WorkspaceData';
import { ConnectionStatus } from '../app/ConnectionStatus';
import { useSyncStatus } from '../app/use-status';
import { Sheet } from '../components/ui/sheet';
import { SimpleContext, useNames } from '../simple/context';
import { mergeSettings, defaultSettings } from '../simple/settings';
import { Receive } from '../simple/receive';
import { Check as RecordCheck, MoveStage, StartBatch } from '../simple/production';
import { Pack, Sell } from '../simple/sales';
import { usableWhey, packableBatches, sellableLots } from '../simple/payloads';
import { resolveJob, type Job } from '../simple/jobs';
import type { PipelineProps } from '../simple/flow';
import type { Snapshot } from '../lib/data';
import type { Lot } from '../lib/domain';
import { useText } from '../simple/text';
import { Preparation } from './Preparation';
import { PendingChanges } from './PendingChanges';
import { db, discardConflict } from '../offline/db';
import { clearWorkerDraft } from './drafts';
import { Problem, StopBatch, TestReview, WorkDetail } from './WorkDetail';
import { useWorkerText } from './copy';
import { dateText, jobWord, lotStatus, nextJob, taskPath } from './model';
import '../simple/simple.css';
import './worker.css';

const settings = mergeSettings(defaultSettings, {
  hints: false,
  showCodes: false,
  style: 'cards',
  allowLocalOverrides: false,
  batch: { wheyAmount: 'ask', ingredients: 'every_time' },
  questions: {
    receive: [
      { key: 'quantity', memory: 'every_time' },
      { key: 'hours_since_made', memory: 'every_time', default: undefined },
    ],
  },
});
const pipelines = { receive: Receive, batch: StartBatch, check: RecordCheck, stage: MoveStage, pack: Pack, sell: Sell };

/** The only workspace shipped to the public file-backed testing application. */
export default function WorkerWorkspace() {
  const { data, error, refresh, pauseBackground } = useWorkspaceData();
  const identity = useIdentity();
  const session = useSession();
  const { waiting, conflicts } = useSyncStatus();
  const { w, arabic, i18n } = useWorkerText();
  const { error: errorText } = useText();
  const navigate = useNavigate();
  const location = useLocation();
  const [account, setAccount] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const segments = location.pathname.split('/').filter(Boolean);
  const screen = segments[0] ?? 'today';
  const inTask = ['task', 'review', 'problem', 'stop'].includes(screen);

  useEffect(() => {
    pauseBackground(inTask || screen === 'prepare');
    return () => pauseBackground(false);
  }, [inTask, screen, pauseBackground]);

  useEffect(() => {
    // Start each screen at the very top, so the connection indicator and account button stay in view.
    window.scrollTo(0, 0);
    const timer = setTimeout(() => {
      const heading = mainRef.current?.querySelector<HTMLElement>('h1');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    const supported = ['today', 'work', 'help', 'prepare', 'task', 'review', 'problem', 'stop'];
    if (!supported.includes(screen))
      void navigate(screen === 'batches' || screen === 'whey' || screen === 'inventory' ? '/work' : '/today', {
        replace: true,
      });
  }, [screen, navigate]);

  const go = (path: string) => {
    if (inTask && !document.querySelector('.s-done')) setLeaveTo(path);
    else void navigate(path);
  };
  const open = (job: Job) => void navigate(taskPath(data ? resolveJob(data, job, new Date()) : job));
  const home = () => go('/today');
  const completed = () => void navigate('/today');
  /**
   * After a save: send it, and report only what happened to that record.
   * A record the shared workspace refused is removed again and its reason shown on the form, so the person
   * corrects it there. An older refused record never makes a new, accepted save look like a failure.
   */
  const refreshSaved = async (savedId?: string) => {
    const result = await refresh();
    const entry = savedId ? await db.outbox.get(savedId) : undefined;
    if (entry?.status === 'conflict') {
      await discardConflict(entry.id, identity.id);
      await refresh();
      throw new Error(entry.error ?? 'fileConflict');
    }
    if (!result) throw new Error('serverUnreachable');
    clearWorkerDraft(identity.id);
    return result;
  };
  // Setup opened from inside a job returns to the same question of that job.
  const prepare = (section: 'supplier' | 'materials' | 'ingredients') =>
    void navigate(
      `/prepare?section=${section === 'supplier' ? 'supplier' : 'materials'}${section === 'ingredients' ? '&kind=ingredient' : ''}&return=${encodeURIComponent(location.pathname + location.search)}`,
    );
  const lotId = screen === 'task' ? segments[2] : segments[1];
  const lot = data?.lots.find((l) => l.id === lotId);
  const context = useMemo(() => ({ settings, identity, data }), [identity, data]);

  let content;
  if (!data)
    content = (
      <main className="w-main w-empty">
        <h1>{error ? errorText(error.message) : arabic ? 'جارٍ تحميل عملك…' : 'Loading your work…'}</h1>
        {error && (
          <button className="w-primary" onClick={() => void refresh()}>
            {w('retry')}
          </button>
        )}
      </main>
    );
  else if (screen === 'prepare')
    content = <Preparation key={location.search} data={data} identity={identity} refresh={refresh} />;
  else if (screen === 'task') {
    const pipeline = segments[1];
    if (pipeline === 'decide' && lot)
      content = (
        <main className="w-task">
          <TestReview
            key={location.pathname}
            data={data}
            lot={lot}
            identity={identity}
            refresh={refreshSaved}
            onClose={home}
          />
        </main>
      );
    else if (pipeline in pipelines && (!['check', 'stage'].includes(pipeline) || lot)) {
      const Pipeline = pipelines[pipeline as keyof typeof pipelines];
      const props: PipelineProps = {
        data,
        identity,
        settings,
        cooperativeCode: 'TEST',
        onClose: home,
        onCompleted: completed,
        onSaved: refreshSaved,
        open,
        onPrepare: prepare,
        lotId,
        checkpoint: segments[3] ? decodeURIComponent(segments[3]) : undefined,
      };
      content = (
        <main className="w-task">
          <Pipeline key={location.pathname} {...props} />
        </main>
      );
    } else content = <Missing refresh={refresh} />;
  } else if (screen === 'review' && lot)
    content = (
      <main className="w-task">
        <TestReview key={lot.id} data={data} lot={lot} identity={identity} refresh={refreshSaved} onClose={home} />
      </main>
    );
  else if (screen === 'problem' && lot)
    content = (
      <main className="w-task">
        <Problem key={lot.id} data={data} lot={lot} identity={identity} refresh={refreshSaved} onClose={home} />
      </main>
    );
  else if (screen === 'stop' && lot)
    content = (
      <main className="w-task">
        <StopBatch key={lot.id} data={data} lot={lot} identity={identity} refresh={refreshSaved} onClose={home} />
      </main>
    );
  else if (screen === 'work' && lotId)
    content = lot ? <WorkDetail key={lot.id} data={data} lot={lot} refresh={refresh} /> : <Missing refresh={refresh} />;
  else if (screen === 'work') content = <WorkList data={data} />;
  else if (screen === 'help') content = <Help userId={identity.id} refresh={refresh} />;
  else content = <Today data={data} username={identity.display_name} />;

  return (
    <SimpleContext.Provider value={context}>
      <div className="s-app w-app">
        <button
          className="w-skip"
          onClick={() => {
            const heading = mainRef.current?.querySelector<HTMLElement>('h1');
            if (heading) {
              heading.tabIndex = -1;
              heading.focus();
            }
          }}
        >
          {w('skipContent')}
        </button>
        <header className="w-header">
          <button className="w-brand" onClick={home} aria-label="WISE">
            <img src={`${import.meta.env.BASE_URL}wise.svg`} alt="" width={35} height={35} />
            <strong>WISE</strong>
          </button>
          <div className="w-header-tools">
            <ConnectionStatus onSendNow={refresh} />
            <button className="w-icon" aria-label={w('account')} onClick={() => setAccount(true)}>
              <UserRound size={22} />
            </button>
          </div>
        </header>
        <div className="w-test">
          <button onClick={() => go('/help')}>
            {w('test')}
            <CircleHelp size={15} />
          </button>
        </div>
        <div ref={mainRef} id="worker-content" className="w-content">
          {conflicts > 0 && (
            <div className="w-conflict">
              <button className="w-secondary" onClick={() => go('/help')}>
                {w('unsentTitle')}
              </button>
            </div>
          )}
          {content}
        </div>
        <nav className="w-nav" aria-label={arabic ? 'التنقل الرئيسي' : 'Main navigation'}>
          {[
            { path: '/today', label: w('today'), Icon: Home },
            { path: '/work', label: w('work'), Icon: ClipboardList },
            { path: '/help', label: w('help'), Icon: CircleHelp },
          ].map(({ path, label, Icon }) => (
            <button
              key={path}
              aria-current={
                location.pathname.startsWith(path) || (path === '/today' && screen === 'today') ? 'page' : undefined
              }
              onClick={() => go(path)}
            >
              <Icon size={23} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <Sheet open={account} onClose={() => setAccount(false)} title={w('account')}>
          <div className="w-account">
            <p>
              <strong>{identity.display_name}</strong>
            </p>
            <button className="w-secondary" onClick={() => void i18n.changeLanguage(arabic ? 'en' : 'ar')}>
              <Languages size={20} />
              {arabic ? 'English' : 'العربية'}
            </button>
            <p>{w('signOutNote')}</p>
            <button className="w-secondary" disabled={waiting > 0} onClick={() => void session.signOut(identity.id)}>
              {w('signOut')}
            </button>
          </div>
        </Sheet>
        <Sheet open={leaveTo !== null} onClose={() => setLeaveTo(null)} title={w('unsaved')}>
          <div className="w-account">
            <p>{w('unsavedNote')}</p>
            <button className="w-primary" onClick={() => setLeaveTo(null)}>
              {w('stay')}
            </button>
            <button
              className="w-secondary"
              onClick={() => {
                const path = leaveTo;
                setLeaveTo(null);
                if (path) void navigate(path);
              }}
            >
              {w('leave')}
            </button>
          </div>
        </Sheet>
      </div>
    </SimpleContext.Provider>
  );
}

function Missing({ refresh }: { refresh: () => Promise<Snapshot | undefined> }) {
  const { w } = useWorkerText();
  const navigate = useNavigate();
  return (
    <main className="w-main w-empty">
      <h1>{w('missing')}</h1>
      <p>{w('missingNote')}</p>
      <button className="w-primary" onClick={() => void refresh()}>
        {w('refresh')}
      </button>
      <button className="w-secondary" onClick={() => void navigate('/work')}>
        {w('work')}
      </button>
    </main>
  );
}

function LotRow({ data, lot }: { data: Snapshot; lot: Lot }) {
  const { w, arabic } = useWorkerText();
  const name = useNames();
  const navigate = useNavigate();
  const Icon = lot.type === 'batch' ? CookingPot : lot.type === 'whey' ? Milk : Package;
  return (
    <button className="w-lot-row" onClick={() => void navigate(`/work/${lot.id}`)}>
      <span className="w-lot-icon">
        <Icon size={24} />
      </span>
      <span className="w-row-content">
        <strong>{typeof lot.facts.name === 'string' && lot.facts.name ? lot.facts.name : name(lot)}</strong>
        <span>{lotStatus(data, lot, arabic, w)}</span>
      </span>
      <ChevronRight className="s-flip" size={21} />
    </button>
  );
}

function Today({ data, username }: { data: Snapshot; username: string }) {
  const { w, arabic } = useWorkerText();
  const name = useNames();
  const navigate = useNavigate();
  const sorted = [...data.lots].sort((a, b) => a.observed_at.localeCompare(b.observed_at));
  const next = sorted.map((lot) => ({ lot, job: nextJob(data, lot) })).filter((item) => item.job);
  const review = sorted.find((lot) => lot.type === 'packaging' && lot.state === 'awaiting_review');
  const hero = next[0];
  const actions = [
    { key: 'receive' as const, Icon: Milk, show: !!hero || !!review, path: '/task/receive/' },
    { key: 'batch' as const, Icon: CookingPot, show: usableWhey(data, new Date()).length > 0, path: '/task/batch/' },
    {
      key: 'pack' as const,
      Icon: Package,
      show: packableBatches(data).length > 0 && hero?.job?.pipeline !== 'pack',
      path: '/task/pack/',
    },
    { key: 'sell' as const, Icon: ShoppingBag, show: sellableLots(data, new Date()).length > 0, path: '/task/sell/' },
  ].filter((a) => a.show);
  return (
    <main className="w-main">
      <div className="w-page-intro">
        <p className="w-eyebrow">{dateText(new Date().toISOString(), arabic)}</p>
        <h1>{w('welcome')}</h1>
        <p className="w-subtitle">
          {username} · {w('welcomeNote')}
        </p>
      </div>
      {!data.suppliers.length ? (
        <section className="w-hero">
          <span className="w-hero-icon">
            <Milk size={32} />
          </span>
          <p className="w-eyebrow">{w('receive')}</p>
          <h2>{w('setupNeeded')}</h2>
          <p>{w('setupNote')}</p>
          <button
            className="w-primary"
            onClick={() => void navigate('/prepare?section=supplier&return=%2Ftask%2Freceive%2F')}
          >
            <Plus size={21} />
            {w('addSupplier')}
          </button>
        </section>
      ) : hero?.job ? (
        <section className="w-hero">
          <p className="w-eyebrow">{w('next')}</p>
          <h2>{w(jobWord(hero.job))}</h2>
          <p>{name(hero.lot)}</p>
          <span className="w-stage-note">{lotStatus(data, hero.lot, arabic, w)}</span>
          <button className="w-primary" onClick={() => void navigate(taskPath(hero.job!))}>
            {w('continue')}
            <ArrowRight className="s-flip" size={21} />
          </button>
        </section>
      ) : review ? (
        <section className="w-hero">
          <p className="w-eyebrow">{w('next')}</p>
          <h2>{w('reviewPack')}</h2>
          <p>{name(review)}</p>
          <button className="w-primary" onClick={() => void navigate(`/review/${review.id}`)}>
            {w('continue')}
            <ArrowRight size={21} />
          </button>
        </section>
      ) : (
        <section className="w-hero">
          <span className="w-hero-icon">
            <Check size={30} />
          </span>
          <h2>{data.lots.length ? w('noTasks') : w('receive')}</h2>
          <p>{data.lots.length ? w('noTasksNote') : w('emptyNote')}</p>
          <button className="w-primary" onClick={() => void navigate('/task/receive/')}>
            <Milk size={21} />
            {w('receive')}
          </button>
        </section>
      )}
      {actions.length > 0 && (
        <section className="w-section">
          <h2>{w('start')}</h2>
          <div className="w-actions">
            {actions.map(({ key, Icon, path }) => (
              <button key={key} onClick={() => void navigate(path)}>
                <Icon size={26} />
                <span>{w(key)}</span>
                <ChevronRight className="s-flip" size={19} />
              </button>
            ))}
          </div>
        </section>
      )}
      {next.length > 1 && (
        <section className="w-section">
          <h2>{w('jobs')}</h2>
          <div className="w-list">
            {next.slice(1, 4).map(({ lot }) => (
              <LotRow key={lot.id} data={data} lot={lot} />
            ))}
          </div>
        </section>
      )}
      {data.lots.length > 0 && (
        <section className="w-section">
          <div className="w-section-head">
            <h2>{w('work')}</h2>
            <button className="w-text" onClick={() => void navigate('/work')}>
              {w('allWork')}
            </button>
          </div>
          <div className="w-list">
            {[...data.lots]
              .reverse()
              .slice(0, 3)
              .map((lot) => (
                <LotRow key={lot.id} data={data} lot={lot} />
              ))}
          </div>
        </section>
      )}
    </main>
  );
}

function WorkList({ data }: { data: Snapshot }) {
  const { w } = useWorkerText();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const filter = params.get('type') ?? 'all';
  const navigate = useNavigate();
  const name = useNames();
  const items = data.lots
    .filter(
      (lot) =>
        (filter === 'all' || lot.type === filter) &&
        `${name(lot)} ${lot.code} ${lot.facts.name ?? ''}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at));
  return (
    <main className="w-main">
      <div className="w-page-intro">
        <h1>{w('work')}</h1>
      </div>
      <label className="w-search">
        <Search size={22} />
        <span className="sr-only">{w('search')}</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={w('search')} type="search" />
      </label>
      <div className="w-tabs" aria-label={w('work')}>
        {(
          [
            ['all', 'all'],
            ['whey', 'whey'],
            ['batch', 'batches'],
            ['packaging', 'stock'],
            ['packaging_material', 'materials'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            aria-pressed={filter === value}
            onClick={() => setParams(value === 'all' ? {} : { type: value })}
          >
            {w(label)}
          </button>
        ))}
      </div>
      {items.length ? (
        <div className="w-list">
          {items.map((lot) => (
            <LotRow key={lot.id} data={data} lot={lot} />
          ))}
        </div>
      ) : (
        <section className="w-card w-empty">
          <ClipboardList size={38} />
          <h2>{query || filter !== 'all' ? w('noMatch') : w('empty')}</h2>
          <p>{w('emptyNote')}</p>
          {query || filter !== 'all' ? (
            <button
              className="w-secondary"
              onClick={() => {
                setQuery('');
                setParams({});
              }}
            >
              {w('clear')}
            </button>
          ) : (
            <button className="w-primary" onClick={() => void navigate('/task/receive/')}>
              {w('receive')}
            </button>
          )}
        </section>
      )}
      <div className="w-secondary-actions">
        <button className="w-text" onClick={() => void navigate('/prepare?section=supplier')}>
          {w('addSupplier')}
        </button>
        <button className="w-text" onClick={() => void navigate('/prepare?section=materials')}>
          {w('addMaterial')}
        </button>
      </div>
    </main>
  );
}

function Help({ userId, refresh }: { userId: string; refresh: () => Promise<Snapshot | undefined> }) {
  const { w } = useWorkerText();
  const navigate = useNavigate();
  return (
    <main className="w-main w-narrow">
      <h1>{w('help')}</h1>
      <PendingChanges userId={userId} refresh={refresh} />
      <section className="w-card">
        <h2>{w('how')}</h2>
        <ol className="w-help-steps">
          {(['helpReceive', 'helpBatch', 'helpPack', 'helpSave'] as const).map((key) => (
            <li key={key}>{w(key)}</li>
          ))}
        </ol>
      </section>
      <section className="w-card">
        <h2>{w('prepare')}</h2>
        <p>{w('prepareNote')}</p>
        <button className="w-secondary" onClick={() => void navigate('/prepare?section=supplier')}>
          <Plus size={20} />
          {w('addSupplier')}
        </button>
        <button className="w-secondary" onClick={() => void navigate('/prepare?section=materials')}>
          <Package size={20} />
          {w('addMaterial')}
        </button>
      </section>
      <section className="w-card">
        <h2>{w('procedure')}</h2>
        <p>{w('procedureNote')}</p>
        <p>{w('testHelp')}</p>
        <p>{w('limitation')}</p>
      </section>
    </main>
  );
}
