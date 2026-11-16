/** Western digits are the default; an explicit preference affects Arabic views. */
export function digitSystem(language: string): 'latn' | 'arab' {
  return language.startsWith('ar') &&
    typeof localStorage !== 'undefined' &&
    localStorage.getItem('wise-digits') === 'arab'
    ? 'arab'
    : 'latn';
}
export function formatNumber(value: number, language: string, options: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat(language, { ...options, numberingSystem: digitSystem(language) }).format(value);
}
export function formatLocalDate(value: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    numberingSystem: digitSystem(language),
    timeZone: 'Asia/Beirut',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}
