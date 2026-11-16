import { isOnline } from '../connectivity/connectivity';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Lot } from '../lib/domain';
import type { Snapshot } from '../lib/data';
import { api } from '../lib/api';
import { checkpointReview } from '../lib/schedules';
export function BatchStatus({ lot, data }: { lot: Lot; data: Snapshot }) {
  const { t } = useTranslation();
  const [training, setTraining] = useState<{ valid: boolean; exception: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    if (api && isOnline())
      void api.rpc('batch_training_validity', { target: lot.id }).then((r) => {
        if (active && !r.error) setTraining(r.data);
      });
    return () => {
      active = false;
    };
  }, [lot.id, lot.config_version_id]);
  const terminal = ['released', 'rejected', 'recalled', 'abandoned'].includes(lot.state);
  const attention =
    data.deviations.some((d) => d.lot_id === lot.id && !d.closed_at) ||
    checkpointReview(data, lot).some((c) => c.missing > 0 && !c.stageMissing);
  return (
    <div className="button-group">
      <span className="status">
        {t(terminal || lot.state === 'on_hold' ? lot.state : attention ? 'attentionRequired' : 'onTrack')}
      </span>
      {training && (
        <span className="status">
          {t(
            training.exception ? 'supervisedTrainingException' : training.valid ? 'trainingValid' : 'trainingRequired',
          )}
        </span>
      )}
    </div>
  );
}
