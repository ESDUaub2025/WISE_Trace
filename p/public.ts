import './style.css';
const translations = {
  en: {
    reportProblem: 'Report a problem',
    send: 'Send report',
    complaintSent: 'Your report has been recorded. Thank you.',
    origin: 'CRAFTED WITH PURPOSE',
    title: 'A dairy by-product.\nA new chapter.',
    story:
      'Traditional kishk, made with whey through the WISE initiative. Supporting the productive use of a dairy by-product and the craft of local cooperatives.',
    loading: 'Finding your product…',
    cooperative: 'Made by',
    lot: 'Lot',
    bestBefore: 'Best before',
    size: 'Net weight',
    produced: 'Produced',
    allergens: 'Allergens',
    ingredients: 'Ingredients',
    storage: 'Storage advice',
    disclaimer: 'Traceability records do not certify food safety. Follow the information printed on your package.',
    footer: 'Local craft. A traceable journey.',
    unavailable: 'Information not available',
    available: 'Available',
    recall: 'Product recall — do not consume. Contact the cooperative listed on your package.',
    failed: 'Unable to load. Please try again when connected.',
  },
  ar: {
    reportProblem: 'الإبلاغ عن مشكلة',
    send: 'إرسال البلاغ',
    complaintSent: 'تمّ تسجيل بلاغك. شكرًا.',
    origin: 'صُنع بهدف',
    title: 'منتج جانبي للحليب.\nفصل جديد.',
    story:
      'كشك تقليدي مصنوع بمصل الحليب من خلال مبادرة WISE. لدعم الاستخدام المنتج لمشتقّات الحليب وحرفة التعاونيات المحلية.',
    loading: 'عم نبحث عن منتجك…',
    cooperative: 'من إنتاج',
    lot: 'التشغيلة',
    bestBefore: 'الأفضل قبل',
    size: 'الوزن الصافي',
    produced: 'تاريخ الإنتاج',
    allergens: 'مسببات الحساسية',
    ingredients: 'المكوّنات',
    storage: 'نصائح التخزين',
    disclaimer: 'سجلات التتبّع لا تشكّل شهادة لسلامة الغذاء. اتّبع المعلومات المطبوعة على العبوة.',
    footer: 'حرفة محليّة. رحلة قابلة للتتبّع.',
    unavailable: 'المعلومات غير متاحة',
    available: 'متاح',
    recall: 'استدعاء المنتج — لا تستهلكه. تواصل مع التعاونية المذكورة على العبوة.',
    failed: 'تعذّر التحميل. حاول مجدّداً عند الاتصال.',
  },
};
let productRecord: Record<string, unknown> | null = null;
let language: 'en' | 'ar' = navigator.language.startsWith('ar') ? 'ar' : 'en';
let state: 'loading' | 'unavailable' | 'available' | 'recall' | 'failed' = 'loading';
let notice: Record<string, string> | null = null;
function render() {
  if (productRecord) {
    const localized = (value: unknown): unknown =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)[language]
        : value;
    const formatted = (value: unknown) =>
      Array.isArray(localized(value)) ? (localized(value) as unknown[]).join(' · ') : String(localized(value) ?? '');
    const fields: Record<string, unknown> = {
      'product-name': productRecord.product,
      cooperative: productRecord.cooperative,
      lot: productRecord.lot,
      'best-before': productRecord.best_before,
      size: `${productRecord.package_size_kg} kg`,
      produced: productRecord.production_date,
      allergens: productRecord.allergens,
      ingredients: productRecord.ingredients,
      storage: productRecord.storage_advice,
    };
    for (const [id, value] of Object.entries(fields)) document.getElementById(id)!.textContent = formatted(value);
  }
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll<HTMLElement>('[data-key]').forEach((element) => {
    const key = element.dataset.key as keyof typeof translations.en;
    element.textContent = translations[language][key];
  });
  document.getElementById('language')!.textContent = language === 'ar' ? 'English' : 'العربية';
  document.getElementById('status')!.textContent =
    state === 'recall' ? (notice?.[language] ?? translations[language].recall) : translations[language][state];
  document.getElementById('status')!.className = state;
}
document.getElementById('language')!.addEventListener('click', () => {
  language = language === 'ar' ? 'en' : 'ar';
  render();
});
render();
async function load() {
  const token = new URLSearchParams(location.search).get('t');
  const url = import.meta.env.VITE_API_URL ?? '/api';
  if (!token || import.meta.env.VITE_DEMO_MODE === 'true' || import.meta.env.VITE_FILE_BACKEND_URL) {
    state = 'unavailable';
    render();
    return;
  }
  try {
    const response = await fetch(`${url}/rpc/public_lot_view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) throw new Error('HTTP');
    const { data } = await response.json();
    if (!['available', 'recall'].includes(data.status)) {
      state = 'unavailable';
      render();
      return;
    }
    state = data.status;
    notice = data.notice;
    productRecord = data;
    const fields: Record<string, unknown> = {
      cooperative: data.cooperative,
      lot: data.lot,
      'best-before': data.best_before,
      size: `${data.package_size_kg} kg`,
      produced: data.production_date,
      allergens: Array.isArray(data.allergens) ? data.allergens.join(' · ') : data.allergens,
      ingredients: Array.isArray(data.ingredients) ? data.ingredients.join(' · ') : data.ingredients,
      storage: data.storage_advice,
    };
    for (const [id, value] of Object.entries(fields)) document.getElementById(id)!.textContent = String(value ?? '');
    document.getElementById('product')!.hidden = false;
    render();
  } catch {
    state = 'failed';
    render();
  }
}
void load();

document.getElementById('feedback')!.addEventListener('submit', async (event) => {
  event.preventDefault();
  const token = new URLSearchParams(location.search).get('t');
  const input = document.getElementById('problem') as HTMLTextAreaElement;
  const status = document.getElementById('feedback-status')!;
  try {
    const response = await fetch((import.meta.env.VITE_API_URL ?? '/api') + '/rpc/report_problem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, message: input.value }),
    });
    if (!response.ok) throw new Error('HTTP');
    status.textContent = translations[language].complaintSent;
    input.value = '';
  } catch {
    status.textContent = translations[language].failed;
  }
});
