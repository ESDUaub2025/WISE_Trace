// Self-registration of a new workspace (only when the server allows it; otherwise accounts are issued by an administrator).
//   1. email + password        -> the server emails a verification link
//   2. sign in with that email -> "complete your request": username, name, workspace, PIN, plan
//   3. a WISE Admin approves   -> the person signs in normally
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { isOnline } from '../connectivity/connectivity';
import { sessionConfig } from '../config/session';
import { sessionApi, type RegistrationState } from '../session/session-api';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

export function RegistrationForm({
  complete,
  managed,
  user,
  onSubmitted,
}: {
  /** True for step 2: the account exists and is verified; only the workspace details are missing. */
  complete: boolean;
  /** True when this installation does not accept self-registration. */
  managed: boolean;
  user?: string;
  /** Called with the user id once a request is waiting for approval, or with nothing to go back. */
  onSubmitted: (user?: string) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  if (managed && !complete) return <p className="acct-hint">{t('registrationManaged')}</p>;
  if (emailSent)
    return (
      <p className="acct-notice" role="status">
        {t('registrationEmailSent')}
      </p>
    );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      if (!api || !isOnline()) throw new Error('onlineRequired');
      if (!complete) {
        await sessionApi.signUp(text(form, 'email'), String(form.get('password') ?? ''), text(form, 'display_name'));
        setEmailSent(true);
        return;
      }
      const reply = await api.rpc('request_registration', {
        account_username: text(form, 'username'),
        account_name: text(form, 'display_name'),
        workspace_name: text(form, 'workspace_name'),
        workspace_region: text(form, 'workspace_region'),
        account_pin: text(form, 'pin'),
        requested_plan: text(form, 'requested_plan'),
      });
      if (reply.error) throw reply.error;
      onSubmitted(user);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'error');
    } finally {
      setBusy(false);
    }
  }

  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="acct-field">
      <span className="acct-label">{label}</span>
      <input name={name} required {...props} />
    </label>
  );

  return (
    <form className="acct-form" onSubmit={submit}>
      <p className="acct-hint">{t(complete ? 'registrationScope' : 'registrationIntro')}</p>
      {field('display_name', t('display_name'), { minLength: 2, maxLength: 100, autoComplete: 'name' })}
      {complete ? (
        <>
          {field('username', t('username'), {
            pattern: '[a-z0-9._\\-]{3,40}',
            autoCapitalize: 'none',
            autoComplete: 'username',
            title: t('usernameRule'),
          })}
          {field('workspace_name', t('workspaceName'), { minLength: 3, maxLength: 100 })}
          {field('workspace_region', t('region'), { minLength: 2, maxLength: 100 })}
          {field('pin', t('choosePin'), {
            type: 'password',
            inputMode: 'numeric',
            pattern: `[0-9]{${sessionConfig.pin.minLength},${sessionConfig.pin.maxLength}}`,
            autoComplete: 'off',
          })}
          <label className="acct-field">
            <span className="acct-label">{t('accessPlan')}</span>
            <select name="requested_plan" defaultValue="trial">
              <option value="trial">{t('freeTrial')}</option>
              <option value="full">{t('fullService')}</option>
            </select>
          </label>
        </>
      ) : (
        <>
          {field('email', t('email'), { type: 'email', autoComplete: 'email', maxLength: 254 })}
          <label className="acct-field">
            <span className="acct-label">{t('password')}</span>
            <input
              name="password"
              type="password"
              required
              minLength={sessionConfig.passwordMinLength}
              autoComplete="new-password"
              aria-describedby="acct-password-rule"
            />
          </label>
          <small className="acct-quiet" id="acct-password-rule">
            {t('passwordRule', { count: sessionConfig.passwordMinLength })}
          </small>
        </>
      )}
      {error && (
        <p className="acct-error" role="alert">
          {t(error)}
        </p>
      )}
      <button className="acct-primary" disabled={busy}>
        {t(busy ? 'loading' : complete ? 'finishRegistration' : 'signUp')}
      </button>
    </form>
  );
}

export function RegistrationStatus({
  user,
  initial,
  onApproved,
}: {
  user: string;
  initial: RegistrationState;
  onApproved: () => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState(initial);
  const [error, setError] = useState('');

  async function refresh() {
    setError('');
    try {
      const { profile, registration } = await sessionApi.profile(user);
      if (profile) return onApproved();
      if (registration) setState(registration);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'error');
    }
  }
  useEffect(() => setState(initial), [initial]);

  return (
    <div className="acct-form">
      <p className="acct-notice" role="status">
        {t('registration_' + state.status)}
      </p>
      {state.review_reason && <p className="acct-hint">{state.review_reason}</p>}
      {error && (
        <p className="acct-error" role="alert">
          {t(error)}
        </p>
      )}
      <button type="button" className="acct-primary" onClick={() => void refresh()}>
        {t('refreshStatus')}
      </button>
    </div>
  );
}
