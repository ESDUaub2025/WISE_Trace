import { isOnline } from '../connectivity/connectivity';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { api, demo } from '../lib/api';
import type { Identity } from '../lib/domain';
import type { Snapshot } from '../lib/data';
import { TrainingAssetUpload } from './training-assets';
import { introAssessment } from '../lib/learning-demo';
export function TrainingEditor({
  identity,
  config,
  data,
  onDone,
}: {
  identity: Identity;
  config: string;
  data: Snapshot;
  onDone: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <>
      <TrainingAssetUpload identity={identity} config={config} onDone={onDone} />
      <form
        className="record-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          const f = new FormData(e.currentTarget);
          try {
            if (!api || demo || !isOnline()) throw new Error('onlineRequired');
            const response = await api.rpc('publish_training', {
              module_key: String(f.get('module_key')),
              content: {
                en: String(f.get('en')),
                ar: String(f.get('ar')),
                title: { en: String(f.get('title_en')), ar: String(f.get('title_ar')) },
                steps: JSON.parse(String(f.get('steps')) || '[]'),
                faqs: JSON.parse(String(f.get('faqs')) || '[]'),
                troubleshooting: JSON.parse(String(f.get('troubleshooting')) || '[]'),
                resources: data.trainingAssets
                  .filter((a) => a.config_version_id === config && f.has('asset:' + a.id))
                  .map((a) => a.id),
                refresh_days: Number(f.get('refresh_days')) || undefined,
              },
              assessment: JSON.parse(String(f.get('assessment'))),
              required: f.has('required'),
              config,
              effective: new Date(String(f.get('effective'))).toISOString(),
            });
            if (response.error) throw response.error;
            await onDone();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{t('publishTraining')}</h2>
        <label>
          {t('module_key')}
          <input name="module_key" required />
        </label>
        <label>
          {t('english')}
          <textarea name="en" rows={6} minLength={20} required />
        </label>
        <label>
          {t('language')}
          <textarea name="ar" dir="rtl" rows={6} minLength={20} required />
        </label>
        <label>
          {t('titleEnglish')}
          <input name="title_en" required />
        </label>
        <label>
          {t('titleArabic')}
          <input name="title_ar" dir="rtl" required />
        </label>
        {['steps', 'faqs', 'troubleshooting'].map((name) => (
          <label key={name}>
            {t(name)}
            <textarea name={name} className="mono" rows={5} defaultValue="[]" />
          </label>
        ))}
        <label>
          {t('refresherDays')}
          <input name="refresh_days" type="number" min="0" max="3650" defaultValue="0" />
        </label>
        {data.trainingAssets
          .filter((a) => a.config_version_id === config)
          .map((a) => (
            <label className="checkbox" key={a.id}>
              <input type="checkbox" name={'asset:' + a.id} />
              {String((a.title as Record<string, string>)?.en)}
            </label>
          ))}
        <label>
          {t('assessment')}
          <textarea
            name="assessment"
            className="mono"
            rows={5}
            required
            defaultValue={JSON.stringify(introAssessment, null, 2)}
          />
        </label>
        <label className="checkbox">
          <input name="required" type="checkbox" defaultChecked />
          {t('requiredTraining')}
        </label>
        <label>
          {t('effective')}
          <input name="effective" type="datetime-local" required />
        </label>
        {error && (
          <p className="error-box" role="alert">
            {t(error)}
          </p>
        )}
        <Button disabled={busy || !identity.roles.includes('admin') || demo}>
          {t(busy ? 'loading' : 'publishTraining')}
        </Button>
      </form>
    </>
  );
}
