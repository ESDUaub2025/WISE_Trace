import { isOnline } from '../connectivity/connectivity';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { api, demo } from '../lib/api';
import type { Snapshot, Row } from '../lib/data';
import { Label, RecordList, Status, localDate } from './FullWorkspace';

export function RecallCases({ data, onDone }: { data: Snapshot; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(''),
    [actions, setActions] = useState<Row[]>([]),
    [trace, setTrace] = useState<{ lots: Row[]; sales: Row[] }>({ lots: [], sales: [] }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const current = data.recalls.find((r) => r.id === selected);
  useEffect(() => {
    let cancelled = false;
    setActions([]);
    setTrace({ lots: [], sales: [] });
    if (current && api && !demo)
      void Promise.all([
        api.from('recall_action').select('*').eq('recall_id', selected).order('recorded_at'),
        api.rpc('recall_trace', { target: current.trigger_lot_id }),
      ]).then(([history, result]) => {
        if (cancelled) return;
        if (history.error || result.error) setError((history.error ?? result.error)!.message);
        else {
          setActions(history.data ?? []);
          setTrace(result.data ?? { lots: [], sales: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected, current]);
  return (
    <section>
      <h2>{t('recallCases')}</h2>
      <div className="task-list">
        {data.recalls.map((r) => (
          <button
            key={String(r.id)}
            className="task-card"
            onClick={() => {
              setSelected(String(r.id));
              setError('');
            }}
          >
            <span className="task-copy">
              <strong>{String(r.reason)}</strong>
              <span>
                {r.mock ? t('mockRecall') : t('recall')} · {localDate(String(r.started_at))}
              </span>
            </span>
            <Status value={String(r.status)} />
          </button>
        ))}
      </div>
      {current && (
        <article className="card">
          <h2>{String(current.reason)}</h2>
          <p>{t('recallScope')}</p>
          <div className="genealogy">
            {trace.lots.map((l) => (
              <div key={String(l.id)}>
                <Label code={String(l.code)} />
                <Status value={String(l.state)} />
                <span>
                  {t('available')}: {String(l.stock ?? 0)}
                </span>
              </div>
            ))}
          </div>
          <h3>{t('notifyBuyers')}</h3>
          <RecordList
            rows={trace.sales}
            fields={['customer_category', 'customer_contact', 'quantity', 'transaction_type']}
          />
          <h3>{t('actions')}</h3>
          <RecordList rows={actions} fields={['action', 'quantity', 'notes', 'recorded_at']} />
          {current.status !== 'closed' && (
            <form
              className="record-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                try {
                  if (!api || demo || !isOnline()) throw new Error('onlineRequired');
                  const form = e.currentTarget;
                  const f = new FormData(form);
                  const reply = await api.rpc('record_recall_action', {
                    target: selected,
                    action: String(f.get('action')),
                    quantity: Number(f.get('quantity')),
                    notes: String(f.get('notes')),
                  });
                  if (reply.error) throw reply.error;
                  const history = await api
                    .from('recall_action')
                    .select('*')
                    .eq('recall_id', selected)
                    .order('recorded_at');
                  if (history.error) throw history.error;
                  setActions(history.data);
                  form.reset();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                {t('action')}
                <select name="action">
                  {['stop_sale', 'notify', 'retrieve', 'destroy', ...(current.mock ? ['trace_completed'] : [])].map(
                    (a) => (
                      <option key={a} value={a}>
                        {t('recall_' + a)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                {t('quantity')}
                <input name="quantity" type="number" min="0" step="any" defaultValue="0" required />
              </label>
              <label>
                {t('notes')}
                <textarea name="notes" minLength={3} required />
              </label>
              <Button disabled={busy || demo || !isOnline()}>{t('save')}</Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || demo || !isOnline() || !actions.length}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const reply = await api!.rpc('complete_recall', { target: selected, actions: [] });
                    if (reply.error) throw reply.error;
                    await onDone();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'error');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t('closeRecall')}
              </Button>
            </form>
          )}
        </article>
      )}
      {error && (
        <p role="alert" className="error-box">
          {t(error)}
        </p>
      )}
    </section>
  );
}
