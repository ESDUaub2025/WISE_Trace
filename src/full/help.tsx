import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleHelp } from 'lucide-react';
import { Sheet } from '../components/ui/sheet';
import { Button } from '../components/ui/button';
import { pageHelp } from './help-content';
import guideUrl from '../../docs/USER_GUIDE.md?url';

const words = {
  en: {
    help: 'Help',
    welcome: 'Welcome to WISE',
    page: 'This page',
    tour: 'Getting started',
    pages: 'Explore pages',
    download: 'Download the full guide (English)',
    next: 'Next',
    back: 'Back',
    finish: 'Start using WISE',
    skip: 'Not now',
    tip: 'Remember',
    titles: [
      'Start with your daily tasks',
      'Follow the product from source to sale',
      'Keep records safe on shared devices',
    ],
    text: [
      'Today shows checks, training and other work that needs your attention. Open a task to act on it. Your account determines which pages and actions you can use.',
      'Receive materials → start a batch → allocate inputs → record stage checks → package → review and release → sell. Open any lot code to see its evidence and history.',
      'Use your own account and PIN. Offline records stay on this device until synchronized; some actions remain provisional. Release and recall require an online authorization. Help is always available at the top of every page.',
    ],
  },
  ar: {
    help: 'مساعدة',
    welcome: 'أهلاً بك في وايز',
    page: 'هذه الصفحة',
    tour: 'البدء',
    pages: 'استكشف الصفحات',
    download: 'تنزيل الدليل الكامل (بالإنجليزية)',
    next: 'التالي',
    back: 'السابق',
    finish: 'ابدأ استخدام وايز',
    skip: 'ليس الآن',
    tip: 'تذكر',
    titles: ['ابدأ بمهامك اليومية', 'تابع المنتج من المصدر إلى البيع', 'احفظ السجلات بأمان على الأجهزة المشتركة'],
    text: [
      'تعرض صفحة اليوم الفحوص والتدريب والمهام التي تحتاج انتباهك. افتح المهمة للعمل عليها. يحدد حسابك الصفحات والإجراءات المتاحة لك.',
      'استلم المواد ← ابدأ دفعة ← خصص المدخلات ← سجل فحوص المراحل ← غلف ← راجع وأفرج ← بع. افتح رمز أي دفعة لمراجعة أدلتها وتاريخها.',
      'استخدم حسابك ورمزك الشخصي. تبقى السجلات دون اتصال على هذا الجهاز حتى المزامنة وقد تكون مؤقتة. الإفراج والسحب يحتاجان تفويضاً أثناء الاتصال. زر المساعدة متاح دائماً أعلى كل صفحة.',
    ],
  },
};
export const helpKey = (id: string) => `wise-help:v1:${id}`;
function needsWelcome(id: string) {
  try {
    return localStorage.getItem(helpKey(id)) !== 'seen';
  } catch {
    return true;
  }
}
export function Help({ userId, section, pages }: { userId: string; section: string; pages: string[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ar') ? 'ar' : 'en';
  const w = words[lang];
  const [open, setOpen] = useState(() => needsWelcome(userId));
  const [tab, setTab] = useState<'page' | 'tour' | 'pages'>(() => (needsWelcome(userId) ? 'tour' : 'page'));
  const [step, setStep] = useState(0);
  const close = () => {
    try {
      localStorage.setItem(helpKey(userId), 'seen');
    } catch {
      /* Help remains usable when browser storage is unavailable. */
    }
    setOpen(false);
  };
  const details = (key: string) => {
    const content = pageHelp[lang][key] ?? pageHelp[lang].home;
    return (
      <section className="help-page" key={key}>
        <h3>{t(key)}</h3>
        <p>{content.purpose}</p>
        <ol>
          {content.steps.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ol>
        <p className="help-tip">
          <strong>{w.tip}: </strong>
          {content.tip}
        </p>
      </section>
    );
  };
  return (
    <>
      <button
        type="button"
        className="help-button"
        onClick={() => {
          setTab('page');
          setOpen(true);
        }}
      >
        <CircleHelp size={18} />
        <span>{w.help}</span>
      </button>
      <Sheet open={open} onClose={close} title={tab === 'tour' ? w.welcome : w.help}>
        <div className="help-content">
          <div className="help-tabs" aria-label={w.help}>
            {(['page', 'tour', 'pages'] as const).map((value) => (
              <Button
                type="button"
                variant={tab === value ? 'default' : 'outline'}
                key={value}
                aria-pressed={tab === value}
                onClick={() => {
                  setTab(value);
                  if (value === 'tour') setStep(0);
                }}
              >
                {w[value]}
              </Button>
            ))}
          </div>
          {tab === 'page' && details(section)}
          {tab === 'pages' &&
            pages.map((key) => (
              <details key={key}>
                <summary>{t(key)}</summary>
                {details(key)}
              </details>
            ))}
          {tab === 'tour' && (
            <section className="help-tour">
              <p className="eyebrow" aria-live="polite">
                {step + 1} / 3
              </p>
              <progress max={3} value={step + 1} aria-label={w.tour} />
              <h3>{w.titles[step]}</h3>
              <p>{w.text[step]}</p>
              <div className="help-tabs">
                {step > 0 && (
                  <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                    {w.back}
                  </Button>
                )}
                <Button type="button" onClick={() => (step < 2 ? setStep(step + 1) : close())}>
                  {step < 2 ? w.next : w.finish}
                </Button>
                <Button type="button" variant="ghost" onClick={close}>
                  {w.skip}
                </Button>
              </div>
            </section>
          )}
          <a className="help-download" href={guideUrl} download="WISE-User-Guide.md">
            {w.download}
          </a>
        </div>
      </Sheet>
    </>
  );
}
