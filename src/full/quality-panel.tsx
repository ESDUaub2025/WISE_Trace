import { isOnline } from '../connectivity/connectivity';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RecordList } from './FullWorkspace';
import { Button } from '../components/ui/button';
import { api, demo } from '../lib/api';
import { getDevice, type Snapshot, type Row } from '../lib/data';
import type { Identity } from '../lib/domain';
export function QualityPanel({
  data,
  identity,
  onClose,
  onDone,
}: {
  data: Snapshot;
  identity: Identity;
  onClose: (row: Row) => void;
  onDone: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [complaints, setComplaints] = useState<Row[]>([]),
    [error, setError] = useState(''),
    [filter, setFilter] = useState('open');
  useEffect(() => {
    let cancelled = false;
    if (api && !demo)
      void api
        .from('complaint')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
        .then((reply) => {
          if (!cancelled && !reply.error) setComplaints(reply.data);
        });
    return () => {
      cancelled = true;
    };
  }, [data.deviations]);
  return (
    <>
      <div className="stats-strip">
        {['critical', 'major', 'minor'].map((severity) => (
          <div key={severity}>
            <strong>{data.deviations.filter((d) => d.severity === severity && !d.closed_at).length}</strong>
            <span>
              {t(severity)} · {t('open')}
            </span>
          </div>
        ))}
      </div>
      <div className="segmented">
        {['open', 'closed', 'all'].map((value) => (
          <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>
            {t(value)}
          </button>
        ))}
      </div>
      <RecordList
        rows={data.deviations.filter(
          (d) => filter === 'all' || (filter === 'open' && !d.closed_at) || (filter === 'closed' && d.closed_at),
        )}
        fields={[
          'issue',
          'category',
          'severity',
          'recurrence_count',
          'corrective_action',
          'preventive_action',
          'owner_id',
          'due_at',
          'closed_at',
        ]}
        onClick={onClose}
      />
      <h2>{t('complaints')}</h2>
      {complaints.map((c) => (
        <article className="card" key={String(c.id)}>
          <p>{String(c.message)}</p>
          <p>{String(c.created_at)}</p>
          {!c.deviation_id && identity.roles.some((r) => ['supervisor', 'food_safety'].includes(r)) && (
            <Button
              variant="outline"
              disabled={!isOnline()}
              onClick={async () => {
                try {
                  const reply = await api!.rpc('convert_complaint', {
                    target: c.id,
                    severity: 'major',
                    device: await getDevice(),
                  });
                  if (reply.error) throw reply.error;
                  await onDone();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'error');
                }
              }}
            >
              {t('convertComplaint')}
            </Button>
          )}
        </article>
      ))}
      {error && (
        <p role="alert" className="error-box">
          {t(error)}
        </p>
      )}
    </>
  );
}
