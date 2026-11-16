import { isOnline } from '../connectivity/connectivity';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
export function MetricEditor({ onDone }: { onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const [definition, setDefinition] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    if (api)
      void api.rpc('metric_dictionary').then((r) => {
        if (!r.error) setDefinition(JSON.stringify({ metrics: r.data }, null, 2));
      });
  }, []);
  return (
    <details className="card">
      <summary>{t('metricDictionary')}</summary>
      <p>{t('metricDictionaryHelp')}</p>
      <form
        className="record-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            if (!api || !isOnline()) throw new Error('onlineRequired');
            const f = new FormData(e.currentTarget);
            const r = await api.rpc('draft_scoped_configuration', {
              kind: 'kpi',
              definition: JSON.parse(definition),
              effective: new Date(String(f.get('effective'))).toISOString(),
              scope: null,
            });
            if (r.error) throw r.error;
            await onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'error');
          }
        }}
      >
        <label>
          {t('configDefinition')}
          <textarea className="mono" rows={15} value={definition} onChange={(e) => setDefinition(e.target.value)} />
        </label>
        <label>
          {t('effective')}
          <input name="effective" type="datetime-local" required />
        </label>
        <Button>{t('draftConfig')}</Button>
      </form>
      {error && (
        <p role="alert" className="error-box">
          {t(error)}
        </p>
      )}
    </details>
  );
}
