// The simple workspace: one next step at a time, for recording production on a phone.
// It shares the sign-in, data, sending and status indicator with the full workspace (src/app);
// what is specific to it is the guided home screen and the step-by-step pipelines.
// Open product choices (who records, which questions repeat, card or chat look) are in ./settings.ts.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { AccountMenu } from '../account/AccountMenu';
import { ConnectionStatus } from '../app/ConnectionStatus';
import { useWorkspaceData } from '../app/WorkspaceData';
import { useIdentity } from '../session/SessionProvider';
import { settingsFor, type SettingsPatch } from './settings';
import { resolveJob, type Job } from './jobs';
import type { PipelineProps } from './flow';
import { SimpleContext } from './context';
import { Home } from './home';
import { Setup } from './setup';
import { Decide, Receive } from './receive';
import { Check, MoveStage, StartBatch } from './production';
import { Pack, Sell } from './sales';
import { useText } from './text';
import './simple.css';

const storageKey = 'wise-simple-settings';
type Route = { screen: 'home' } | { screen: 'setup' } | { screen: 'job'; job: Job };

const pipelines = {
  receive: Receive,
  decide: Decide,
  batch: StartBatch,
  check: Check,
  stage: MoveStage,
  pack: Pack,
  sell: Sell,
};

function readLocal(): SettingsPatch | undefined {
  try {
    const value = localStorage.getItem(storageKey);
    return value ? (JSON.parse(value) as SettingsPatch) : undefined;
  } catch {
    return undefined;
  }
}
/** ?style=chat or ?style=cards shows the other look for a side-by-side demo, without changing anything stored. */
function styleFromAddress(): SettingsPatch {
  const style = new URLSearchParams(location.search).get('style');
  return style === 'chat' || style === 'cards' ? { style } : {};
}

export default function SimpleWorkspace() {
  const { t, error: message } = useText();
  const navigate = useNavigate();
  const identity = useIdentity();
  const { data, error, refresh, pauseBackground } = useWorkspaceData();
  const [route, setRoute] = useState<Route>({ screen: 'home' });
  const [local, setLocal] = useState(readLocal);
  const [account, setAccount] = useState(false);

  useEffect(() => {
    const back = () => setRoute({ screen: 'home' });
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);

  // Lists must not change under someone's thumb in the middle of a step; refreshing resumes on the home screen.
  useEffect(() => {
    pauseBackground(route.screen !== 'home');
    return () => pauseBackground(false);
  }, [route.screen, pauseBackground]);

  const cooperativeCode = String(data?.cooperatives.find((c) => c.id === identity.cooperative_id)?.code ?? '');
  const settings = useMemo(() => {
    const patch = { ...local, ...styleFromAddress() };
    try {
      return settingsFor(cooperativeCode, patch);
    } catch {
      return settingsFor(cooperativeCode);
    }
  }, [cooperativeCode, local]);
  const context = useMemo(() => ({ settings, identity, data }), [settings, identity, data]);

  // One history entry per visit away from home, so the phone's back button always returns home.
  const go = useCallback((next: Route) => {
    if (next.screen === 'home') {
      if (history.state?.simple) history.back();
      else setRoute(next);
      return;
    }
    if (history.state?.simple) history.replaceState({ simple: true }, '');
    else history.pushState({ simple: true }, '');
    setRoute(next);
  }, []);

  const open = useCallback(
    (job: Job) => {
      // Work the simple workspace has no step-by-step screen for opens in the full workspace, on the same lot.
      if (job.pipeline === 'full_app') return void navigate('/', { state: { lot: job.lotId } });
      go({ screen: 'job', job: data ? resolveJob(data, job, new Date()) : job });
    },
    [data, go, navigate],
  );

  const shell = (children: React.ReactNode) => (
    <SimpleContext.Provider value={context}>
      <div className={`s-app s-style-${settings.style}`}>{children}</div>
    </SimpleContext.Provider>
  );

  if (!data)
    return shell(
      <div className="s-loading" role="status">
        {error
          ? message(error.message === 'setup' ? 'workspaceSetupPending' : error.message)
          : t('loading', { ns: 'translation' })}
        {error && (
          <button className="s-button s-quiet" onClick={() => setAccount(true)}>
            {t('account', { ns: 'translation' })}
          </button>
        )}
        <AccountMenu open={account} onClose={() => setAccount(false)} workspace="simple" />
      </div>,
    );

  const home = () => go({ screen: 'home' });
  if (route.screen === 'job' && route.job.pipeline !== 'full_app') {
    const Pipeline = pipelines[route.job.pipeline];
    const props: PipelineProps = {
      data,
      identity,
      settings,
      cooperativeCode,
      onClose: home,
      onSaved: refresh,
      open,
      lotId: route.job.lotId,
      checkpoint: route.job.checkpoint,
    };
    return shell(<Pipeline key={route.job.key} {...props} />);
  }
  if (route.screen === 'setup')
    return shell(
      <Setup
        data={data}
        settings={settings}
        cooperativeCode={cooperativeCode}
        onClose={home}
        onSave={(patch) => {
          try {
            localStorage.setItem(storageKey, JSON.stringify(patch));
          } catch {
            /* the patch still applies until reload */
          }
          setLocal(patch);
          home();
        }}
        onReset={() => {
          try {
            localStorage.removeItem(storageKey);
          } catch {
            /* nothing stored */
          }
          setLocal(undefined);
          home();
        }}
      />,
    );

  const cooperative = data.cooperatives.find((c) => c.id === identity.cooperative_id);
  return shell(
    <>
      <header className="s-bar">
        <div className="s-brand">
          <img src={`${import.meta.env.BASE_URL}wise.svg`} alt="" width={28} height={28} />
          <span>{String(cooperative?.name ?? 'WISE')}</span>
        </div>
        <ConnectionStatus onSendNow={refresh} />
        <button className="s-account" onClick={() => setAccount(true)} aria-label={t('account', { ns: 'translation' })}>
          <UserRound size={22} aria-hidden="true" />
        </button>
      </header>
      <Home
        data={data}
        identity={identity}
        settings={settings}
        cooperativeCode={cooperativeCode}
        open={open}
        menu={{
          account: () => setAccount(true),
          setup: settings.allowLocalOverrides ? () => go({ screen: 'setup' }) : undefined,
        }}
      />
      <AccountMenu open={account} onClose={() => setAccount(false)} workspace="simple" />
    </>,
  );
}
