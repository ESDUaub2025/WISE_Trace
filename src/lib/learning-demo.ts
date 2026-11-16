export const introTrainingContent = {
  title: { en: 'Good practice and traceable records', ar: 'الممارسات الجيدة والسجلات القابلة للتتبع' },
  en: 'Use the approved cooperative SOP for production. These introductory examples explain clean equipment, evidence capture and traceable records; the placeholder protocol needs Food-Safety Lead approval.',
  ar: 'اتبع إجراءات التشغيل المعتمدة في التعاونيات. توضح هذه الأمثلة التمهيدية نظافة المعدات وتسجيل الأدلة والسجلات القابلة للتتبع؛ يحتاج البروتوكول المؤقت إلى موافقة مسؤول سلامة الغذاء.',
  steps: [
    {
      title: { en: 'Check equipment before work', ar: 'افحص المعدات قبل العمل' },
      text: {
        en: 'Confirm each item in the approved hygiene checklist. Record an exception when something is not ready; ask the supervisor before proceeding.',
        ar: 'أكد كل بند في قائمة النظافة المعتمدة. سجّل استثناءً عندما لا يكون شيء جاهزاً واسأل المشرف قبل المتابعة.',
      },
      illustration: 'clean_equipment',
    },
    {
      title: { en: 'Capture the display and confirm the value', ar: 'صوّر الشاشة وأكد القيمة' },
      text: {
        en: 'Photograph the instrument without faces. Enter or confirm the displayed reading and unit. An OCR suggestion is assistance; your confirmed value is the record.',
        ar: 'صوّر الجهاز دون وجوه. أدخل أو أكد القراءة والوحدة الظاهرة. اقتراح قراءة الصورة للمساعدة؛ القيمة التي تؤكدها هي السجل.',
      },
      illustration: 'clean_equipment',
    },
    {
      title: { en: 'Keep the lot connection', ar: 'حافظ على الربط بالدفعة' },
      text: {
        en: 'Select the actual received lot and record the quantity used. Never substitute a rejected, held or expired input. Save and check the synchronization status.',
        ar: 'اختر الدفعة المستلمة الفعلية وسجّل الكمية المستخدمة. لا تستبدلها بمادة مرفوضة أو معلقة أو منتهية الصلاحية. احفظ السجل وتحقق من حالة المزامنة.',
      },
      illustration: 'protected_container',
    },
  ],
  faqs: [
    {
      question: { en: 'Does saving a checkpoint release the batch?', ar: 'هل حفظ الفحص يجيز طرح الدفعة؟' },
      answer: {
        en: 'No. An authorized reviewer makes a separate release decision after reviewing the required records and deviations.',
        ar: 'لا. يتخذ المراجع المصرّح له قراراً منفصلاً بعد مراجعة السجلات والانحرافات المطلوبة.',
      },
    },
    {
      question: { en: 'Can I keep working without a connection?', ar: 'هل يمكنني متابعة التسجيل دون اتصال؟' },
      answer: {
        en: 'Save permitted records on the device and synchronize later. Check the status after each save. Release, recall and critical deviation closure require a connection.',
        ar: 'احفظ السجلات المسموحة على الجهاز وزامنها لاحقاً. تحقق من الحالة بعد كل حفظ. يتطلب الطرح والاستدعاء وإغلاق الانحراف الحرج اتصالاً.',
      },
    },
  ],
  troubleshooting: [
    {
      issue: { en: 'The reading is uncertain', ar: 'القراءة غير واضحة' },
      action: {
        en: 'Keep the photo, enter the value manually if you can confirm it, or record a deviation and ask the supervisor.',
        ar: 'احتفظ بالصورة وأدخل القيمة يدوياً إذا أمكن تأكيدها أو سجّل انحرافاً واسأل المشرف.',
      },
    },
    {
      issue: { en: 'A record shows a sync conflict', ar: 'السجل يظهر تعارض مزامنة' },
      action: {
        en: 'Do not repeat or silently replace the record. The supervisor reviews the saved original and creates an attributed correction.',
        ar: 'لا تكرر السجل أو تستبدله بصمت. يراجع المشرف الأصل المحفوظ ويسجّل تصحيحاً منسوباً لصاحبه.',
      },
    },
  ],
  resources: [] as string[],
};
export const introAssessment = [
  {
    key: 'hygiene',
    question: { en: 'Which equipment is ready to check before use?', ar: 'أي معدات جاهزة للفحص قبل الاستخدام؟' },
    correct: 'safe',
    options: [
      { key: 'safe', illustration: 'clean_equipment', label: { en: 'Clean equipment', ar: 'معدات نظيفة' } },
      {
        key: 'unsafe',
        illustration: 'dirty_equipment',
        label: { en: 'Equipment with residues', ar: 'معدات عليها بقايا' },
      },
    ],
  },
];
