import { isOnline } from '../connectivity/connectivity';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { api, demo } from '../lib/api';
import type { Snapshot, Row } from '../lib/data';
import { RecordList } from './FullWorkspace';
export function ReportSchedules({ data }: { data: Snapshot }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]),
    [history, setHistory] = useState<Row[]>([]),
    [error, setError] = useState(''),
    [selected, setSelected] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    if (!api || demo) return;
    const [schedules, deliveries] = await Promise.all([
      api.from('report_schedule').select('*').order('updated_at'),
      api.from('report_delivery').select('*').order('period', { ascending: false }).limit(100),
    ]);
    if (schedules.error || deliveries.error) {
      setError((schedules.error ?? deliveries.error)!.message);
      return;
    }
    setRows(schedules.data);
    setHistory(deliveries.data);
  }
  useEffect(() => {
    void load();
  }, []);
  const current = rows.find((r) => r.id === selected);
  return (
    <article className="card">
      <h2>{t('monthlyReports')}</h2>
      <p>{t('monthlyReportsHelp')}</p>
      <form
        key={selected}
        className="record-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const f = new FormData(e.currentTarget);
            if (!api || demo) throw new Error('onlineRequired');
            const reply = await api.rpc('save_report_schedule', {
              target: selected || crypto.randomUUID(),
              scope: String(f.get('scope')) || null,
              recipients: String(f.get('recipients'))
                .split(/[\n,;]/)
                .map((v) => v.trim())
                .filter(Boolean),
              enabled: f.has('enabled'),
            });
            if (reply.error) throw reply.error;
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {t('editOrCreate')}
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">{t('createNew')}</option>
            {rows.map((r) => (
              <option key={String(r.id)} value={String(r.id)}>
                {(r.recipients as string[]).join(', ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('organization')}
          <select name="scope" defaultValue={String(current?.cooperative_id ?? '')}>
            <option value="">{t('allAuthorizedCoops')}</option>
            {data.cooperatives.map((c) => (
              <option key={String(c.id)} value={String(c.id)}>
                {String(c.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('reportRecipients')}
          <textarea
            name="recipients"
            required
            defaultValue={(current?.recipients as string[] | undefined)?.join('\n') ?? ''}
          />
        </label>
        <label className="checkbox">
          <input name="enabled" type="checkbox" defaultChecked={current?.enabled === true} />
          {t('enableMonthlyReports')}
        </label>
        <Button disabled={busy || demo || !isOnline()}>{t('save')}</Button>
      </form>
      <RecordList rows={history} fields={['period', 'status', 'attempts', 'sent_at', 'last_error']} />
      {error && (
        <p className="error-box" role="alert">
          {t(error)}
        </p>
      )}
    </article>
  );
}
