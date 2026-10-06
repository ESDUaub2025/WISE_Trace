import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json'; import ar from './ar.json';
void i18n.use(initReactI18next).init({ resources: { en: {translation: en}, ar: {translation: ar} }, lng: localStorage.getItem('wise-language') ?? (navigator.language.startsWith('ar')?'ar':'en'), fallbackLng: 'en', interpolation: {escapeValue:false} });
function direction(language: string) { document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';localStorage.setItem('wise-language',language); }
i18n.on('languageChanged',direction);direction(i18n.language);
export default i18n;
