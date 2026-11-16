import { isOnline } from '../connectivity/connectivity';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { api } from '../lib/api';
import { getDevice, type Row } from '../lib/data';
import { db } from '../offline/db';
export function EvidenceList({
  recordIds,
  attachments,
  records = [],
  onDone,
}: {
  recordIds: string[];
  attachments: Row[];
  records?: Row[];
  onDone?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [local, setLocal] = useState<{ id: string; url: string; type: string }[]>([]),
    [remote, setRemote] = useState<Record<string, string>>({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<{ record: string; value: number | string; confidence: number } | null>(null);
  const key = recordIds.join(',');
  useEffect(() => {
    let cancelled = false;
    let urls: string[] = [];
    void db.media
      .filter((m) => key.split(',').includes(m.record_id) && !m.uploaded)
      .toArray()
      .then((rows) => {
        if (cancelled) return;
        const results = rows.map((row) => ({ id: row.id, url: URL.createObjectURL(row.blob), type: row.type }));
        urls = results.map((row) => row.url);
        setLocal(results);
      });
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [key]);
  async function crosscheck(row: Row) {
    if (!api) return;
    setBusy(true);
    setError('');
    try {
      const downloaded = await api.storage.from('evidence').download(String(row.storage_path));
      if (downloaded.error) throw downloaded.error;
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('photo_failed'));
        reader.readAsDataURL(downloaded.data);
      });
      const reading = await api.functions.invoke('ocr', {
        body: { image, media_type: String(row.media_type), kind: 'number' },
      });
      if (reading.error) throw reading.error;
      const saved = await api.rpc('record_ocr_crosscheck', {
        target: String(row.record_id),
        reading: reading.data,
        device: await getDevice(),
      });
      if (saved.error) throw saved.error;
      setResult({ ...reading.data, record: String(row.record_id) });
      await onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }
  const render = (url: string, type: string) =>
    type.startsWith('image') ? (
      <img src={url} alt={t('photo')} loading="lazy" style={{ maxWidth: '100%', maxHeight: 300 }} />
    ) : (
      <audio src={url} controls preload="metadata" aria-label={t('voice')} />
    );
  return (
    <div className="evidence-list">
      {local.map((row) => (
        <figure key={row.id}>
          {render(row.url, row.type)}
          <figcaption>{t('saved')}</figcaption>
        </figure>
      ))}
      {attachments
        .filter((row) => recordIds.includes(String(row.record_id)))
        .map((row) => (
          <figure key={String(row.id)}>
            {remote[String(row.id)] ? (
              render(remote[String(row.id)], String(row.media_type))
            ) : (
              <Button
                variant="outline"
                onClick={async () => {
                  if (!api) return;
                  const response = await api.storage.from('evidence').createSignedUrl(String(row.storage_path), 180);
                  if (response.error) setError(response.error.message);
                  else setRemote((old) => ({ ...old, [String(row.id)]: response.data.signedUrl }));
                }}
              >
                {t('viewEvidence')}
              </Button>
            )}
            {isOnline() &&
              String(row.media_type).startsWith('image/') &&
              records.some((r) => r.id === row.record_id && typeof (r.payload as Row)?.value === 'number') && (
                <Button variant="outline" disabled={busy} onClick={() => void crosscheck(row)}>
                  {t('ocrCrosscheck')}
                </Button>
              )}
          </figure>
        ))}
      {result && (
        <p className="callout">
          {t('ocrSuggestion')}: {String(result.value)} ? {Math.round(result.confidence * 100)}% ?{' '}
          {t('manualReadingPreserved')}
        </p>
      )}
      {error && <p className="error-box">{t(error)}</p>}
    </div>
  );
}
