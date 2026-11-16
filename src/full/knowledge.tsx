import { isOnline } from '../connectivity/connectivity';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Download, Check, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { cacheTrainingAsset, trainingAssetURL } from '../lib/training-media';
import type { Row, Snapshot } from '../lib/data';
import type { Identity } from '../lib/domain';

type Localized = Record<string, string>;
export interface LearningContent {
  en: string;
  ar: string;
  title?: Localized;
  steps?: { title: Localized; text: Localized; illustration?: string }[];
  faqs?: { question: Localized; answer: Localized }[];
  troubleshooting?: { issue: Localized; action: Localized }[];
  resources?: string[];
}
export function InstructionPicture({ kind, label }: { kind: string; label: string }) {
  const dirty = kind === 'dirty_equipment' || kind === 'unprotected_container';
  return (
    <svg role="img" aria-label={label} viewBox="0 0 160 100" className="instruction-picture">
      <rect x="1" y="1" width="158" height="98" rx="14" fill="#eeeadc" />
      <path d="M38 42h84v34H38z" fill="#fffdf7" stroke="#344b32" strokeWidth="4" />
      <path d="M34 34h92M52 26h56" stroke="#344b32" strokeWidth="5" strokeLinecap="round" />
      {dirty ? (
        <g fill="#a95032">
          <circle cx="60" cy="60" r="5" />
          <circle cx="93" cy="49" r="4" />
          <circle cx="105" cy="69" r="6" />
        </g>
      ) : (
        <g stroke="#344b32" strokeWidth="3">
          <path d="M69 47v18M60 56h18M100 13v16M92 21h16" />
        </g>
      )}
    </svg>
  );
}
function LearningMedia({ asset, identity }: { asset: Row; identity: Identity }) {
  const { i18n, t } = useTranslation();
  const [value, setValue] = useState<{ url: string; offline: boolean } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const title = (asset.title as Localized)?.[i18n.language] ?? '';
  useEffect(() => {
    let cancelled = false;
    let blobURL: string | undefined;
    void trainingAssetURL(asset, identity.id)
      .then((url) => {
        if (url?.offline) blobURL = url.url;
        if (cancelled) {
          if (blobURL) URL.revokeObjectURL(blobURL);
          return;
        }
        setValue(url);
      })
      .catch(() => setError('downloadFailed'));
    return () => {
      cancelled = true;
      if (blobURL) URL.revokeObjectURL(blobURL);
    };
  }, [asset, identity.id, revision]);
  return (
    <div className="learning-media">
      <h3>{title}</h3>
      {value ? (
        String(asset.media_type).startsWith('video/') ? (
          <video controls preload="metadata" src={value.url} aria-label={title} />
        ) : (
          <img src={value.url} alt={title} />
        )
      ) : (
        <p>{t('mediaNotDownloaded')}</p>
      )}
      <Button
        variant="outline"
        disabled={busy || value?.offline || !isOnline()}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await cacheTrainingAsset(asset, identity.id);
            setRevision((v) => v + 1);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'downloadFailed');
          } finally {
            setBusy(false);
          }
        }}
      >
        {value?.offline ? <Check size={18} /> : <Download size={18} />}{' '}
        {t(value?.offline ? 'downloaded' : 'downloadOffline')} · {(Number(asset.byte_size) / 1024 / 1024).toFixed(1)} MB
      </Button>
      {error && <p className="error-box">{t(error)}</p>}
    </div>
  );
}
export function ModuleContent({
  module,
  data,
  identity,
  step,
}: {
  module: Row;
  data: Snapshot;
  identity: Identity;
  step?: number;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const content = module.content as unknown as LearningContent;
  const [downloading, setDownloading] = useState(false),
    [downloadRevision, setDownloadRevision] = useState(0),
    [error, setError] = useState('');
  return (
    <div className="module-content">
      <p>{content?.[lang]}</p>
      {content?.steps?.map((stepItem, index) =>
        step === undefined || step === index ? (
          <section key={index}>
            <h3>
              {index + 1}. {stepItem.title[lang]}
            </h3>
            {stepItem.illustration && <InstructionPicture kind={stepItem.illustration} label={stepItem.title[lang]} />}
            <p>{stepItem.text[lang]}</p>
          </section>
        ) : null,
      )}
      {!!content?.resources?.length && (
        <Button
          variant="outline"
          disabled={downloading || !isOnline()}
          onClick={async () => {
            setDownloading(true);
            setError('');
            try {
              for (const id of content.resources ?? []) {
                const asset = data.trainingAssets.find((a) => a.id === id);
                if (!asset) throw new Error('downloadFailed');
                await cacheTrainingAsset(asset, identity.id);
              }
              setDownloadRevision((v) => v + 1);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'downloadFailed');
            } finally {
              setDownloading(false);
            }
          }}
        >
          <Download size={18} />
          {t(downloading ? 'loading' : 'downloadModule')}
        </Button>
      )}
      {error && <p className="error-box">{t(error)}</p>}
      {content?.resources?.map((id) => {
        const asset = data.trainingAssets.find((a) => a.id === id);
        return asset ? <LearningMedia key={`${id}:${downloadRevision}`} asset={asset} identity={identity} /> : null;
      })}
      {!!content?.faqs?.length && <h3>{t('faqs')}</h3>}
      {content?.faqs?.map((faq, index) => (
        <details key={index}>
          <summary>{faq.question[lang]}</summary>
          <p>{faq.answer[lang]}</p>
        </details>
      ))}
      {!!content?.troubleshooting?.length && <h3>{t('troubleshooting')}</h3>}
      {content?.troubleshooting?.map((item, index) => (
        <div className="callout" key={index}>
          <AlertTriangle size={20} />
          <div>
            <strong>{item.issue[lang]}</strong>
            <p>{item.action[lang]}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
export function Knowledge({
  data,
  identity,
  open,
}: {
  data: Snapshot;
  identity: Identity;
  open: (action: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  return (
    <div className="training-grid">
      {data.training.map((module) => (
        <article id={`module-${module.id}`} className="card training-card" key={String(module.id)}>
          <BookOpen size={32} />
          <p className="eyebrow">
            {t('version')} {String(module.version)}
          </p>
          <h2>{(module.content as unknown as LearningContent)?.title?.[lang] ?? t(String(module.module_key))}</h2>
          <ModuleContent module={module} data={data} identity={identity} />
          <Button onClick={() => open(`training:${module.id}`)}>
            <Check size={18} />
            {t('completeModule')}
          </Button>
        </article>
      ))}
    </div>
  );
}
