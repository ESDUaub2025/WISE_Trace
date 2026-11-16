// The one connection and sending indicator, used in both workspaces and on the sign-in screens.
// It always answers two questions in words, never by colour alone (PRD §11.3):
//   "Can I reach WISE?"  and  "Has my work left this phone?"
// Tapping it opens the details and a "Send now" button.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, CloudOff, CloudUpload, RefreshCw, ServerOff } from 'lucide-react';
import { syncConfig } from '../config/connectivity';
import { connectivity } from '../connectivity/connectivity';
import { Sheet } from '../components/ui/sheet';
import { formatLocalDate } from '../lib/format';
import { useConnectivity, useSyncStatus } from './use-status';
import { summarize } from './status-summary';
import './status.css';

export function ConnectionStatus({
  compact = false,
  onSendNow,
}: {
  /** Icon-first version for tight headers; the words stay available to screen readers and in the sheet. */
  compact?: boolean;
  /** Present when someone is signed in: sends waiting records immediately. */
  onSendNow?: () => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation();
  const link = useConnectivity();
  const sync = useSyncStatus();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const summary = summarize(link, sync);
  const label = t(summary.key, { count: sync.waiting || sync.conflicts });
  const Icon =
    link === 'offline'
      ? CloudOff
      : link === 'unreachable'
        ? ServerOff
        : summary.tone === 'ok'
          ? Check
          : summary.tone === 'busy'
            ? CloudUpload
            : AlertTriangle;

  async function retry() {
    setBusy(true);
    try {
      if ((await connectivity.check()) === 'online') await onSendNow?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`status-pill status-${summary.tone} ${compact ? 'status-compact' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={`${label}. ${t('statusDetails')}`}
      >
        <Icon size={18} aria-hidden="true" />
        <span className="status-text">{compact && summary.tone === 'ok' ? t('online') : label}</span>
        {sync.waiting > 0 && (
          <span className="status-count" aria-hidden="true">
            {sync.waiting}
          </span>
        )}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('statusTitle')}>
        <dl className="status-details">
          <div>
            <dt>{t('statusConnection')}</dt>
            <dd>
              {t(
                link === 'online'
                  ? 'statusLinkOnline'
                  : link === 'offline'
                    ? 'statusLinkOffline'
                    : 'statusLinkUnreachable',
              )}
            </dd>
          </div>
          {onSendNow && (
            <>
              <div>
                <dt>{t('statusOnThisPhone')}</dt>
                <dd>{sync.waiting ? t('statusWaiting', { count: sync.waiting }) : t('statusAllSent')}</dd>
              </div>
              <div>
                <dt>{t('statusLastSent')}</dt>
                <dd>
                  <bdi>{sync.lastSentAt ? formatLocalDate(sync.lastSentAt, i18n.language) : t('statusNeverSent')}</bdi>
                </dd>
              </div>
              {sync.conflicts > 0 && (
                <div>
                  <dt>{t('statusNeedsReview')}</dt>
                  <dd>{t('statusConflicts', { count: sync.conflicts })}</dd>
                </div>
              )}
            </>
          )}
        </dl>
        {summary.stale && (
          <p className="status-warning" role="status">
            {t('statusStale', { hours: syncConfig.staleAfterHours })}
          </p>
        )}
        {sync.phase === 'failed' && sync.error && link === 'online' && (
          <p className="status-warning" role="status">
            {t('statusSendFailed')} · {t(sync.error)}
          </p>
        )}
        <p className="status-reassure">{t('statusReassure')}</p>
        <button type="button" className="button button-primary" disabled={busy} onClick={() => void retry()}>
          <RefreshCw size={18} aria-hidden="true" className={busy ? 'status-spin' : ''} />
          {t(link === 'online' && onSendNow ? 'statusSendNow' : 'statusCheckAgain')}
        </button>
      </Sheet>
    </>
  );
}
