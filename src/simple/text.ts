// Words for the simple app, added beside the full app's translations so its error messages can be reused.
import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { ar, en } from './words';

i18n.addResourceBundle('en', 'simple', en);
i18n.addResourceBundle('ar', 'simple', ar);

export function useText() {
  const { t, i18n: current } = useTranslation(['simple', 'translation']);
  const arabic = current.language === 'ar';
  return {
    t,
    arabic,
    words: (value: { en: string; ar: string } | undefined) => (value ? (arabic ? value.ar : value.en) : ''),
    error: (key: string) =>
      t(key, {
        ns: ['simple', 'translation'],
        defaultValue: arabic
          ? 'تعذّر الحفظ. راجع البيانات وحاول مجدداً.'
          : 'Could not save. Check your answers and try again.',
      }),
    toggleLanguage: () => void current.changeLanguage(arabic ? 'en' : 'ar'),
    setLanguage: (language: 'en' | 'ar') => void current.changeLanguage(language),
  };
}
