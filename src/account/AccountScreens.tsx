// Everything a person sees before they are in the app: choose your name, PIN, password,
// authenticator code, registration, forgotten password. One flow for both workspaces.
//
// The order of steps is decided by src/session/session.ts (SignInStep); this file only shows them.
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight, Eye, EyeOff, UserPlus } from 'lucide-react';
import QRCode from 'qrcode';
import { setActingUser } from '../lib/api';
import type { Identity } from '../lib/domain';
import { sessionConfig } from '../config/session';
import { useConnectivity } from '../app/use-status';
import { ConnectionStatus } from '../app/ConnectionStatus';
import { useSession } from '../session/SessionProvider';
import {
  rememberedPeople,
  signInWithPassword,
  submitSecondFactor,
  unlockWithPin,
  SessionError,
  type SignInStep,
} from '../session/session';
import { isApiError, sessionApi, type Capabilities, type RegistrationState } from '../session/session-api';
import { PinPad, pinComplete } from './PinPad';
import { RegistrationForm, RegistrationStatus } from './registration';
import './account.css';

type View =
  | { name: 'language' }
  | { name: 'people' }
  | { name: 'pin'; person: Identity }
  | { name: 'password'; person?: Identity; reason?: string }
  | { name: 'code'; user: string; setup?: { secret: string; uri: string } }
  | { name: 'register' }
  | { name: 'finish-registration'; user: string }
  | { name: 'registration-status'; user: string; registration: RegistrationState }
  | { name: 'forgot' }
  | { name: 'reset'; token: string };

const languageChosenKey = 'wise-language-chosen';
const errorCode = (error: unknown) =>
  error instanceof SessionError || isApiError(error) ? error.message : error instanceof Error ? error.message : 'error';

/** Reads and removes the one-time values a link from an email puts in the address. */
function takeLinkParameters() {
  const parameters = new URLSearchParams(location.search);
  const reset = parameters.get('reset');
  const email = parameters.get('email');
  if (reset || email) history.replaceState(null, '', location.pathname);
  return { reset, email };
}

export function AccountScreens() {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const online = useConnectivity() === 'online';
  const [people, setPeople] = useState<Identity[] | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [notice, setNotice] = useState(session.notice ?? '');
  const [capabilities, setCapabilities] = useState<Capabilities>({
    registration: 'administrator',
    passwordReset: false,
  });
  // A PIN typed before the server asked for the password again; reused so the person does not type it twice.
  const [heldPin, setHeldPin] = useState('');

  const startView = useCallback(
    (known: Identity[]): View => {
      if (session.lockedPerson && known.some((person) => person.id === session.lockedPerson!.id))
        return { name: 'pin', person: session.lockedPerson };
      return known.length ? { name: 'people' } : { name: 'password' };
    },
    [session.lockedPerson],
  );

  useEffect(() => {
    void rememberedPeople().then((known) => {
      setPeople(known);
      const link = takeLinkParameters();
      if (link.email) setNotice(link.email === 'verified' ? 'emailVerified' : 'linkExpired');
      let languageChosen = true;
      try {
        languageChosen = !!localStorage.getItem(languageChosenKey) || known.length > 0;
      } catch {
        /* without storage the question would repeat forever: skip it */
      }
      setView(
        link.reset ? { name: 'reset', token: link.reset } : languageChosen ? startView(known) : { name: 'language' },
      );
    });
    // Runs once: later lock notices arrive through props, not by re-reading the device.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (online)
      void sessionApi
        .capabilities()
        .then(setCapabilities)
        .catch(() => {});
  }, [online]);

  const go = useCallback((next: View, message = '') => {
    setNotice(message);
    setView(next);
  }, []);
  const home = useCallback(() => {
    setHeldPin('');
    setActingUser(null);
    // "Back" always leads to the list of people, even when the app opened straight on one person's PIN.
    go(people?.length ? { name: 'people' } : { name: 'password' });
  }, [go, people]);

  const finish = useCallback(
    (identity: Identity) => {
      session.clearNotice();
      session.activate(identity);
    },
    [session],
  );

  /** Shows whatever the sign-in needs next. */
  const follow = useCallback(
    async (step: SignInStep) => {
      if (step.step === 'second_factor') return go({ name: 'code', user: step.user, setup: step.setup });
      if (step.step === 'registration') {
        setActingUser(step.user); // the registration form calls the server as this person
        return go(
          step.registration.status === 'none'
            ? { name: 'finish-registration', user: step.user }
            : { name: 'registration-status', user: step.user, registration: step.registration },
        );
      }
      if (step.step === 'pin') {
        if (heldPin) {
          const pin = heldPin;
          setHeldPin('');
          try {
            return finish(await unlockWithPin(step.identity, pin));
          } catch (error) {
            return go({ name: 'pin', person: step.identity }, errorCode(error));
          }
        }
        return go({ name: 'pin', person: step.identity });
      }
      if (step.step === 'done') finish(step.identity);
    },
    [finish, go, heldPin],
  );

  if (!view || !people) return <div className="loading-screen">{t('loading')}</div>;

  const frame = (title: string, body: ReactNode, back?: () => void) => (
    <main className="acct-page">
      <div className="acct-card">
        <header className="acct-top">
          {back ? (
            <button type="button" className="acct-back" onClick={back} aria-label={t('goBack')}>
              <ArrowLeft size={22} className="directional" aria-hidden="true" />
            </button>
          ) : (
            <img src="/wise.svg" width={40} height={40} alt="" />
          )}
          <span className="acct-brand">{t('brand')}</span>
          <ConnectionStatus compact />
          <button
            type="button"
            className="acct-language"
            onClick={() => void i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
          >
            {i18n.language === 'ar' ? 'English' : 'العربية'}
          </button>
        </header>
        <h1 className="acct-title">{title}</h1>
        {notice && (
          <p className="acct-notice" role="status">
            {t(notice)}
          </p>
        )}
        {body}
      </div>
      <p className="acct-foot">{t('noCertification')}</p>
    </main>
  );

  switch (view.name) {
    case 'language':
      return (
        <main className="acct-page">
          <div className="acct-card acct-language-first">
            <img src="/wise.svg" width={64} height={64} alt="" />
            <h1 className="acct-title">اختر لغتك · Choose your language</h1>
            {(['ar', 'en'] as const).map((language) => (
              <button
                key={language}
                type="button"
                lang={language}
                className="acct-primary"
                onClick={() => {
                  void i18n.changeLanguage(language);
                  try {
                    localStorage.setItem(languageChosenKey, '1');
                  } catch {
                    /* asked again next time */
                  }
                  setView(startView(people));
                }}
              >
                {language === 'ar' ? 'العربية' : 'English'}
              </button>
            ))}
          </div>
        </main>
      );

    case 'people':
      return frame(
        t('whoIsHere'),
        <>
          <ul className="acct-people">
            {people.map((person) => (
              <li key={person.id}>
                <button type="button" onClick={() => go({ name: 'pin', person })}>
                  <span className="acct-face" aria-hidden="true">
                    {person.display_name.slice(0, 1)}
                  </span>
                  <span className="acct-person-name">
                    <strong>{person.display_name}</strong>
                    <small>{person.roles.map((role) => t(role)).join(' · ')}</small>
                  </span>
                  <ChevronRight size={20} className="directional" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="acct-secondary" onClick={() => go({ name: 'password' })}>
            <UserPlus size={20} aria-hidden="true" />
            {t('someoneElse')}
          </button>
        </>,
      );

    case 'pin':
      return frame(
        t('helloName', { name: view.person.display_name.split(' ')[0] }),
        <PinStep
          person={view.person}
          remembered={people.some((person) => person.id === view.person.id)}
          onUnlocked={finish}
          onPasswordNeeded={(pin) => {
            setHeldPin(pin);
            go({ name: 'password', person: view.person, reason: 'passwordRequired' });
          }}
          onForget={async () => {
            await session.signOut(view.person.id);
            const left = people.filter((person) => person.id !== view.person.id);
            setPeople(left);
            go(left.length ? { name: 'people' } : { name: 'password' });
          }}
        />,
        home,
      );

    case 'password':
      return frame(
        view.person ? t('helloName', { name: view.person.display_name.split(' ')[0] }) : t('signIn'),
        <PasswordStep
          person={view.person}
          reason={view.reason}
          online={online}
          capabilities={capabilities}
          onStep={follow}
          onForgot={() => go({ name: 'forgot' })}
          onRegister={() => go({ name: 'register' })}
        />,
        people.length || view.person ? home : undefined,
      );

    case 'code':
      return frame(
        t(view.setup ? 'codeSetupTitle' : 'codeTitle'),
        <CodeStep user={view.user} setup={view.setup} onStep={follow} />,
        home,
      );

    case 'register':
    case 'finish-registration':
      return frame(
        t(view.name === 'register' ? 'signUp' : 'finishRegistration'),
        <RegistrationForm
          complete={view.name === 'finish-registration'}
          managed={capabilities.registration === 'administrator'}
          onSubmitted={(user) =>
            user ? go({ name: 'registration-status', user, registration: { status: 'pending' } }) : home()
          }
          user={view.name === 'finish-registration' ? view.user : undefined}
        />,
        home,
      );

    case 'registration-status':
      return frame(
        t('registrationStatus'),
        <RegistrationStatus
          user={view.user}
          initial={view.registration}
          onApproved={() => go({ name: 'password' }, 'registrationApprovedSignIn')}
        />,
        home,
      );

    case 'forgot':
      return frame(t('forgotPassword'), <ForgotStep canEmail={capabilities.passwordReset} />, home);

    case 'reset':
      return frame(
        t('newPassword'),
        <ResetStep token={view.token} onDone={() => go(startView(people), 'passwordChanged')} />,
        home,
      );
  }
}

function ErrorLine({ code }: { code: string }) {
  const { t } = useTranslation();
  if (!code) return null;
  return (
    <p className="acct-error" role="alert">
      {t(code)}
    </p>
  );
}

/** Runs one async step with a busy flag and a translated error. */
function useStep() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (failure) {
      setError(errorCode(failure));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

function PinStep({
  person,
  remembered,
  onUnlocked,
  onPasswordNeeded,
  onForget,
}: {
  person: Identity;
  remembered: boolean;
  onUnlocked: (identity: Identity) => void;
  onPasswordNeeded: (pin: string) => void;
  onForget: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { busy, error, run } = useStep();
  const [pin, setPin] = useState('');
  const [confirmForget, setConfirmForget] = useState(false);
  const submit = () =>
    run(async () => {
      try {
        onUnlocked(await unlockWithPin(person, pin));
      } catch (failure) {
        if (failure instanceof SessionError && failure.message === 'passwordRequired') return onPasswordNeeded(pin);
        setPin('');
        throw failure;
      }
    });
  return (
    <form
      className="acct-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (pinComplete(pin)) void submit();
      }}
    >
      <PinPad value={pin} onChange={setPin} onSubmit={() => void submit()} disabled={busy} label={t('enterPin')} />
      <ErrorLine code={error} />
      <button className="acct-primary" disabled={busy || !pinComplete(pin)}>
        {t(busy ? 'loading' : 'unlock')}
      </button>
      {remembered &&
        (confirmForget ? (
          <div className="acct-confirm" role="group" aria-label={t('forgetPerson', { name: person.display_name })}>
            <p>{t('forgetPersonHelp')}</p>
            <button type="button" className="acct-danger" onClick={() => void onForget()}>
              {t('forgetPerson', { name: person.display_name.split(' ')[0] })}
            </button>
            <button type="button" className="acct-link" onClick={() => setConfirmForget(false)}>
              {t('cancel')}
            </button>
          </div>
        ) : (
          <button type="button" className="acct-link" onClick={() => setConfirmForget(true)}>
            {t('forgetPerson', { name: person.display_name.split(' ')[0] })}
          </button>
        ))}
    </form>
  );
}

function PasswordStep({
  person,
  reason,
  online,
  capabilities,
  onStep,
  onForgot,
  onRegister,
}: {
  person?: Identity;
  reason?: string;
  online: boolean;
  capabilities: Capabilities;
  onStep: (step: SignInStep) => Promise<void>;
  onForgot: () => void;
  onRegister: () => void;
}) {
  const { t } = useTranslation();
  const { busy, error, run } = useStep();
  const [identifier, setIdentifier] = useState(person?.username ?? '');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => onStep(await signInWithPassword(identifier, password)));
  };
  return (
    <form className="acct-form" onSubmit={submit}>
      {reason && <p className="acct-hint">{t(reason)}</p>}
      {!online && (
        <p className="acct-notice" role="status">
          {t('onlineRequiredFirstTime')}
        </p>
      )}
      {!person && (
        <label className="acct-field">
          <span className="acct-label">{t('usernameOrEmail')}</span>
          <input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            autoFocus
            required
          />
        </label>
      )}
      <label className="acct-field">
        <span className="acct-label">{t('password')}</span>
        <span className="acct-password">
          <input
            name="password"
            type={visible ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus={!!person}
            required
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-label={t(visible ? 'hidePassword' : 'showPassword')}
            aria-pressed={visible}
          >
            {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
          </button>
        </span>
      </label>
      <ErrorLine code={error} />
      <button className="acct-primary" disabled={busy || !online || !identifier || !password}>
        {t(busy ? 'loading' : 'continue')}
      </button>
      <button type="button" className="acct-link" onClick={onForgot}>
        {t('forgotPassword')}
      </button>
      {!person &&
        (capabilities.registration === 'email' ? (
          <button type="button" className="acct-secondary" onClick={onRegister}>
            {t('signUp')}
          </button>
        ) : (
          <p className="acct-quiet">{t('registrationManaged')}</p>
        ))}
    </form>
  );
}

function CodeStep({
  user,
  setup,
  onStep,
}: {
  user: string;
  setup?: { secret: string; uri: string };
  onStep: (step: SignInStep) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { busy, error, run } = useStep();
  const [code, setCode] = useState('');
  const [qr, setQr] = useState('');
  useEffect(() => {
    if (setup) void QRCode.toDataURL(setup.uri, { margin: 1, width: 220 }).then(setQr);
  }, [setup]);
  return (
    <form
      className="acct-form"
      onSubmit={(event) => {
        event.preventDefault();
        void run(async () => onStep(await submitSecondFactor(user, code)));
      }}
    >
      {setup ? (
        <ol className="acct-steps">
          <li>{t('codeSetupInstall')}</li>
          <li>
            {t('codeSetupScan')}
            {qr && <img src={qr} width={220} height={220} alt={t('codeSetupQrAlt')} />}
            <bdi className="acct-secret" dir="ltr">
              {setup.secret}
            </bdi>
          </li>
          <li>{t('codeSetupEnter')}</li>
        </ol>
      ) : (
        <p className="acct-hint">{t('codeHelp')}</p>
      )}
      <label className="acct-field">
        <span className="acct-label">{t('codeLabel')}</span>
        <input
          name="totp"
          className="acct-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          dir="ltr"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          autoFocus={!setup}
          required
        />
      </label>
      <ErrorLine code={error} />
      <button className="acct-primary" disabled={busy || code.length !== 6}>
        {t(busy ? 'loading' : 'continue')}
      </button>
    </form>
  );
}

function ForgotStep({ canEmail }: { canEmail: boolean }) {
  const { t } = useTranslation();
  const { busy, error, run } = useStep();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <div className="acct-form">
      <p className="acct-hint">{t('forgotManaged')}</p>
      {canEmail &&
        (sent ? (
          <p className="acct-notice" role="status">
            {t('resetSent')}
          </p>
        ) : (
          <form
            className="acct-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await sessionApi.requestPasswordReset(email);
                setSent(true);
              });
            }}
          >
            <label className="acct-field">
              <span className="acct-label">{t('forgotEmail')}</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <ErrorLine code={error} />
            <button className="acct-primary" disabled={busy || !email}>
              {t(busy ? 'loading' : 'sendResetLink')}
            </button>
          </form>
        ))}
    </div>
  );
}

function ResetStep({ token, onDone }: { token: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { busy, error, run } = useStep();
  const [password, setPassword] = useState('');
  return (
    <form
      className="acct-form"
      onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          await sessionApi.resetPassword(token, password);
          onDone();
        });
      }}
    >
      <label className="acct-field">
        <span className="acct-label">{t('newPassword')}</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={sessionConfig.passwordMinLength}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby="acct-password-rule"
          autoFocus
          required
        />
      </label>
      <small className="acct-quiet" id="acct-password-rule">
        {t('passwordRule', { count: sessionConfig.passwordMinLength })}
      </small>
      <ErrorLine code={error} />
      <button className="acct-primary" disabled={busy || password.length < sessionConfig.passwordMinLength}>
        {t(busy ? 'loading' : 'savePassword')}
      </button>
    </form>
  );
}
