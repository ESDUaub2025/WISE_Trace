// The "me" sheet, identical in both workspaces: switch workspace, language, lock or switch person,
// change password, and remove yourself from this phone.
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KeyRound, Languages, LayoutDashboard, ListChecks, Lock, LogOut } from 'lucide-react';
import { Sheet } from '../components/ui/sheet';
import { sessionConfig } from '../config/session';
import { canUseSimple, rememberWorkspace, workspacePath, type Workspace } from '../config/workspaces';
import { useConnectivity, useSyncStatus } from '../app/use-status';
import { useSession } from '../session/SessionProvider';
import { changePassword } from '../session/session';
import { fileTesting } from '../testing/file-backend';
import './account.css';

export function AccountMenu({
  open,
  onClose,
  workspace,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** The workspace the menu was opened from. */
  workspace: Workspace;
  /** Extra settings a workspace wants to show here. */
  children?: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { identity, lock, signOut } = useSession();
  const online = useConnectivity() === 'online';
  const { waiting } = useSyncStatus();
  const [panel, setPanel] = useState<'menu' | 'password' | 'leave'>('menu');
  if (!identity) return null;
  const other: Workspace = workspace === 'simple' ? 'full' : 'simple';
  const close = () => {
    setPanel('menu');
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title={identity.display_name}>
      {panel === 'menu' && (
        <div className="acct-menu">
          <p className="acct-quiet">
            <bdi>{identity.username}</bdi> · {identity.roles.map((role) => t(role)).join(' · ')}
          </p>
          {canUseSimple(identity) && (
            <button
              type="button"
              className="acct-menu-item"
              onClick={() => {
                rememberWorkspace(identity.id, other);
                close();
                void navigate(workspacePath(other));
              }}
            >
              {other === 'simple' ? (
                <ListChecks size={22} aria-hidden="true" />
              ) : (
                <LayoutDashboard size={22} aria-hidden="true" />
              )}
              <span>
                <strong>{t(other === 'simple' ? 'openSimpleWorkspace' : 'openFullWorkspace')}</strong>
                <small>{t(other === 'simple' ? 'simpleWorkspaceHelp' : 'fullWorkspaceHelp')}</small>
              </span>
            </button>
          )}
          <button
            type="button"
            className="acct-menu-item"
            onClick={() => void i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
          >
            <Languages size={22} aria-hidden="true" />
            <span>
              <strong>{i18n.language === 'ar' ? 'English' : 'العربية'}</strong>
            </span>
          </button>
          {children}
          <button
            type="button"
            className="acct-menu-item"
            onClick={() => {
              close();
              void lock();
            }}
          >
            <Lock size={22} aria-hidden="true" />
            <span>
              <strong>{t('lockOrSwitch')}</strong>
              <small>{t('lockOrSwitchHelp')}</small>
            </span>
          </button>
          <button
            type="button"
            className="acct-menu-item"
            disabled={!online || fileTesting}
            onClick={() => setPanel('password')}
          >
            <KeyRound size={22} aria-hidden="true" />
            <span>
              <strong>{t('changePassword')}</strong>
              {fileTesting ? (
                <small>{t('fileKeysManagedByOwner')}</small>
              ) : (
                !online && <small>{t('needsConnection')}</small>
              )}
            </span>
          </button>
          <button type="button" className="acct-menu-item acct-menu-danger" onClick={() => setPanel('leave')}>
            <LogOut size={22} aria-hidden="true" />
            <span>
              <strong>{t('signOut')}</strong>
              <small>{t('signOutHelp')}</small>
            </span>
          </button>
        </div>
      )}
      {panel === 'password' && <ChangePassword userId={identity.id} onDone={() => setPanel('menu')} />}
      {panel === 'leave' && (
        <div className="acct-form">
          <p className="acct-hint">{t('signOutConfirm')}</p>
          {waiting > 0 && (
            <p className="acct-notice" role="status">
              {t('signOutWaiting', { count: waiting })}
            </p>
          )}
          <button
            type="button"
            className="acct-danger"
            onClick={() => {
              close();
              void signOut(identity.id);
            }}
          >
            {t('signOut')}
          </button>
          <button type="button" className="acct-link" onClick={() => setPanel('menu')}>
            {t('cancel')}
          </button>
        </div>
      )}
    </Sheet>
  );
}

function ChangePassword({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const min = sessionConfig.passwordMinLength;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await changePassword(userId, String(form.get('current')), String(form.get('next')));
      setDone(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'error');
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="acct-form">
        <p className="acct-notice" role="status">
          {t('passwordChanged')}
        </p>
        <button type="button" className="acct-primary" onClick={onDone}>
          {t('done')}
        </button>
      </div>
    );
  return (
    <form className="acct-form" onSubmit={submit}>
      <label className="acct-field">
        <span className="acct-label">{t('currentPassword')}</span>
        <input name="current" type="password" autoComplete="current-password" required />
      </label>
      <label className="acct-field">
        <span className="acct-label">{t('newPassword')}</span>
        <input
          name="next"
          type="password"
          autoComplete="new-password"
          minLength={min}
          aria-describedby="acct-password-rule"
          required
        />
      </label>
      <small className="acct-quiet" id="acct-password-rule">
        {t('passwordRule', { count: min })}
      </small>
      {error && (
        <p className="acct-error" role="alert">
          {t(error)}
        </p>
      )}
      <button className="acct-primary" disabled={busy}>
        {t(busy ? 'loading' : 'changePassword')}
      </button>
      <button type="button" className="acct-link" onClick={onDone}>
        {t('cancel')}
      </button>
    </form>
  );
}
