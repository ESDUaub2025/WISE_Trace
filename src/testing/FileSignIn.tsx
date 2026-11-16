import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../session/SessionProvider';
import { signInWithPassword } from '../session/session';
import '../account/account.css';
import './testing.css';

export function FileSignIn() {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const step = await signInWithPassword(String(form.get('username')), '');
      if (step.step === 'done') session.activate(step.identity);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'fileRequestFailed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="acct-page file-entry">
      <div className="acct-card">
        <div className="file-entry-brand">
          <img src={`${import.meta.env.BASE_URL}wise.svg`} alt="" width={45} height={45} />
          <strong>WISE</strong>
        </div>
        <h1>{t('fileSignInTitle')}</h1>
        <p className="acct-hint">{t('fileSignInHelp')}</p>
        <form className="acct-form" onSubmit={(event) => void submit(event)}>
          <label className="acct-field">
            <span>{t('username')}</span>
            <input
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              minLength={2}
              maxLength={40}
              dir="auto"
              autoFocus
            />
          </label>
          {error && (
            <p className="acct-error" role="alert">
              {t(error)}
            </p>
          )}
          <button type="submit" className="acct-primary" disabled={busy}>
            {t(busy ? 'loading' : 'fileStartTesting')}
          </button>
        </form>
        <p className="acct-quiet">{t('fileSessionHelp')}</p>
        <button
          className="acct-link"
          type="button"
          onClick={() => void i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
        >
          {i18n.language === 'ar' ? 'English' : 'العربية'}
        </button>
      </div>
    </main>
  );
}
