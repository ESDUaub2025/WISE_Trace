// Every open product decision for the simple app lives here. Change these values, not the screens.
// Measurements required by the approved procedure (pH, temperature) are not listed: they are always asked fresh.
import { z } from 'zod';

const words = z.object({ en: z.string().min(1), ar: z.string().min(1) });
const answer = z.union([z.string(), z.number()]);
const roles = z.enum(['producer', 'supervisor', 'manager', 'admin', 'food_safety', 'partner', 'donor']);
/** every_time: asked on every record. per_supplier: answered once per supplier, then confirmed. last_time: starts from the previous answer. fixed: never asked. */
export const memoryModes = ['every_time', 'per_supplier', 'last_time', 'fixed'] as const;
export const pipelines = ['receive', 'decide', 'batch', 'check', 'stage', 'pack', 'sell', 'full_app'] as const;
export const actions = ['receive', 'batch', 'pack', 'sell'] as const;
/** What a person must have done before a start action appears ("training wheels"). */
export const unlocks = ['always', 'whey_accepted', 'batch_at_last_stage', 'pouches_released'] as const;
export type Memory = (typeof memoryModes)[number];
export type Pipeline = (typeof pipelines)[number];
export type Action = (typeof actions)[number];
export type Unlock = (typeof unlocks)[number];
export type Answer = z.infer<typeof answer>;

const question = z
  .object({
    key: z.string().regex(/^[a-z_]+$/),
    label: words,
    input: z.enum(['number', 'choice', 'text', 'hours_ago']),
    memory: z.enum(memoryModes),
    default: answer.optional(),
    /** picture: an emoji placeholder or an image URL, for example a photo of the cooperative's own drum. */
    options: z.array(z.object({ value: z.string(), label: words, picture: z.string().optional() })).optional(),
    unit: z.string().optional(),
    /** One sentence behind the "?" button: why this is asked. */
    help: words.optional(),
    required: z.boolean().default(false),
    /** Numbers must be above zero unless this is set (a price can be zero for a gift or sample). */
    zero_allowed: z.boolean().optional(),
    /** Counted things (pouches) cannot be fractions. */
    whole: z.boolean().optional(),
  })
  .refine((q) => q.input !== 'choice' || (q.options?.length ?? 0) > 0, { message: 'Choice questions need options' })
  .refine((q) => q.memory !== 'fixed' || q.default !== undefined, { message: 'Fixed answers need a default' });
export type Question = z.infer<typeof question>;

// The fields each pipeline can fill. Unknown keys are refused so a typo never silently drops an answer.
export const questionKeys = {
  receive: [
    'quantity',
    'unit',
    'hours_since_made',
    'supplier_lot',
    'pasteurized',
    'milk_species',
    'transport_method',
    'container_type',
    'container_condition',
    'appearance',
    'odour',
    'labneh_lot',
  ],
  pack: ['package_type', 'size_kg', 'package_count', 'storage_location'],
  sell: ['quantity', 'unit_price', 'currency', 'usd_rate', 'customer_category'],
} as const;

export const settingsSchema = z
  .object({
    recording: z.object({
      mode: z.enum(['every_producer', 'designated']),
      /** Usernames per cooperative code; '*' applies to every cooperative. Used only in designated mode. */
      recorders: z.record(z.string(), z.array(z.string())),
      roles: z.array(roles).min(1),
    }),
    home: z.object({ actions: z.array(z.enum(actions)), maxJobs: z.number().int().min(1).max(20) }),
    /** cards: one big card per step. chat: the same steps as a conversation. */
    style: z.enum(['cards', 'chat']),
    levels: z.object({
      /** progressive: start actions appear as the person gains experience. all: everything from the start. */
      mode: z.enum(['progressive', 'all']),
      /** person: count what this person has done. cooperative: count what anyone in the cooperative has done. */
      basis: z.enum(['person', 'cooperative']),
      unlocks: z.record(z.enum(actions), z.enum(unlocks)),
      everythingFor: z.array(roles),
      /** Usernames who see everything from the start. */
      experienced: z.array(z.string()),
    }),
    /** Task kind from the server → the pipeline its notification opens. Unlisted kinds open the full app. */
    jobs: z.record(z.string(), z.enum(pipelines)),
    /** After receiving whey, go straight to the whey decision when the person may decide. */
    decideAfterReceive: z.boolean(),
    /** choose: Accept, Hold or Reject. signal: "Looks good" or "Something's off", and a supervisor follows up. */
    wheyDecision: z.enum(['choose', 'signal']),
    batch: z.object({ wheyAmount: z.enum(['all_available', 'ask']), ingredients: z.enum(['last_time', 'every_time']) }),
    questions: z.object({ receive: z.array(question), pack: z.array(question), sell: z.array(question) }),
    /** Read-aloud: off, the phone's voice (tts), or recorded clips keyed by screen, falling back to the phone's voice. */
    voice: z.object({ mode: z.enum(['off', 'tts', 'recorded']), clips: z.record(z.string(), z.string()) }),
    feedback: z.object({ sound: z.boolean(), vibrate: z.boolean() }),
    /** One short tip the first time each screen is seen. */
    hints: z.boolean(),
    /** Lot codes next to everyday names ("Kishk · Tuesday"). Codes always stay on labels and in the full app. */
    showCodes: z.boolean(),
    /** Image URL per job (receive, batch, check, stage, pack, sell, decide) replacing the drawn icon, for real photos. */
    pictures: z.record(z.string(), z.string()),
    /** Shows the on-device setup panel so different answers can be tried without code changes. */
    allowLocalOverrides: z.boolean(),
  })
  .superRefine((value, context) => {
    for (const pipeline of ['receive', 'pack', 'sell'] as const) {
      const keys = value.questions[pipeline].map((q) => q.key);
      for (const key of keys) {
        if (!(questionKeys[pipeline] as readonly string[]).includes(key))
          context.addIssue({
            code: 'custom',
            path: ['questions', pipeline],
            message: `Unknown ${pipeline} question: ${key}`,
          });
        if (keys.indexOf(key) !== keys.lastIndexOf(key))
          context.addIssue({
            code: 'custom',
            path: ['questions', pipeline],
            message: `Duplicate ${pipeline} question: ${key}`,
          });
      }
      if (pipeline !== 'receive' && value.questions[pipeline].some((q) => q.memory === 'per_supplier'))
        context.addIssue({ code: 'custom', path: ['questions', pipeline], message: 'Only receiving has suppliers' });
    }
  });
export type Settings = z.infer<typeof settingsSchema>;

const option = (value: string, en: string, ar: string, picture?: string) => ({
  value,
  label: { en, ar },
  ...(picture ? { picture } : {}),
});
const normal = [option('normal', 'Normal', 'طبيعي', '👍'), option('abnormal', 'Not normal', 'غير طبيعي', '⚠️')];
const help = (en: string, ar: string) => ({ help: { en, ar } });

export const defaultSettings: Settings = settingsSchema.parse({
  recording: { mode: 'every_producer', recorders: { '*': [] }, roles: ['producer', 'supervisor'] },
  home: { actions: ['receive', 'batch', 'pack', 'sell'], maxJobs: 5 },
  style: 'cards',
  levels: {
    mode: 'progressive',
    basis: 'person',
    unlocks: { receive: 'always', batch: 'whey_accepted', pack: 'batch_at_last_stage', sell: 'pouches_released' },
    everythingFor: ['supervisor'],
    experienced: [],
  },
  jobs: {
    checkpoint_due: 'check',
    stage_overdue: 'stage',
    awaiting_decision: 'decide',
    held_whey_expiry: 'decide',
    expiry: 'batch',
  },
  decideAfterReceive: true,
  wheyDecision: 'signal',
  batch: { wheyAmount: 'all_available', ingredients: 'last_time' },
  questions: {
    receive: [
      {
        key: 'quantity',
        label: { en: 'How much whey?', ar: 'كم كمية المصل؟' },
        input: 'number',
        unit: 'kg',
        memory: 'last_time',
        required: true,
        ...help(
          'Weigh the whey or read the drum marks. It shows how much kishk this whey can make.',
          'زِن المصل أو اقرأ علامات البرميل. يبيّن كم كشكاً يمكن صنعه.',
        ),
      },
      {
        key: 'unit',
        label: { en: 'Unit', ar: 'الوحدة' },
        input: 'choice',
        options: [option('kg', 'kg', 'كغ'), option('L', 'litres', 'ليتر')],
        memory: 'fixed',
        default: 'kg',
        required: true,
      },
      {
        key: 'hours_since_made',
        label: { en: 'How many hours ago was it made?', ar: 'منذ كم ساعة صُنع؟' },
        input: 'hours_ago',
        memory: 'last_time',
        default: 3,
        required: true,
        ...help(
          'Whey must be used within a set time after it is made. This tells the app when it expires.',
          'يجب استخدام المصل خلال وقت محدد بعد صنعه. هذا يحدد موعد انتهائه.',
        ),
      },
      {
        key: 'pasteurized',
        label: { en: 'Pasteurized milk?', ar: 'حليب مبستر؟' },
        input: 'choice',
        options: [
          option('yes', 'Yes', 'نعم', '✅'),
          option('no', 'No', 'لا', '❌'),
          option('unknown', 'Not sure', 'غير متأكد', '❓'),
        ],
        memory: 'per_supplier',
        required: true,
        ...help(
          'Ask the supplier once. The app remembers the answer for next time.',
          'اسأل المورد مرة واحدة. التطبيق يتذكر الجواب للمرة القادمة.',
        ),
      },
      {
        key: 'milk_species',
        label: { en: 'Milk from', ar: 'نوع الحليب' },
        input: 'choice',
        options: [
          option('cow', 'Cow', 'بقر', '🐄'),
          option('goat', 'Goat', 'ماعز', '🐐'),
          option('sheep', 'Sheep', 'غنم', '🐑'),
          option('mixed', 'Mixed', 'مختلط', '🥛'),
        ],
        memory: 'per_supplier',
      },
      {
        key: 'transport_method',
        label: { en: 'How it came', ar: 'طريقة النقل' },
        input: 'choice',
        options: [
          option('supplier_vehicle', 'Supplier vehicle', 'سيارة المورد', '🚚'),
          option('cooperative_vehicle', 'Our vehicle', 'سيارتنا', '🚐'),
          option('carried', 'Carried by hand', 'باليد', '✋'),
        ],
        memory: 'per_supplier',
      },
      {
        key: 'container_type',
        label: { en: 'Container', ar: 'الوعاء' },
        input: 'choice',
        options: [
          option('food_grade_drum', 'Food-grade drum', 'برميل غذائي', '🛢️'),
          option('steel_can', 'Steel can', 'وعاء معدني', '🥫'),
          option('bucket', 'Bucket', 'دلو', '🪣'),
        ],
        memory: 'per_supplier',
      },
      {
        key: 'container_condition',
        label: { en: 'Container clean and closed?', ar: 'الوعاء نظيف ومغلق؟' },
        input: 'choice',
        options: [option('good', 'Yes', 'نعم', '👍'), option('damaged', 'No', 'لا', '⚠️')],
        memory: 'every_time',
        default: 'good',
        required: true,
        ...help('A dirty or open container can spoil the whey.', 'الوعاء المتسخ أو المفتوح قد يفسد المصل.'),
      },
      {
        key: 'appearance',
        label: { en: 'Looks', ar: 'المظهر' },
        input: 'choice',
        options: normal,
        memory: 'every_time',
        default: 'normal',
        required: true,
        ...help(
          'Lumps, strange colour or mould mean something is wrong.',
          'الكتل أو اللون الغريب أو العفن تعني وجود مشكلة.',
        ),
      },
      {
        key: 'odour',
        label: { en: 'Smells', ar: 'الرائحة' },
        input: 'choice',
        options: normal,
        memory: 'every_time',
        default: 'normal',
        required: true,
        ...help(
          'Fresh whey smells mildly sour. A strong or rotten smell is a warning.',
          'المصل الطازج رائحته حامضة خفيفة. الرائحة القوية أو الفاسدة إنذار.',
        ),
      },
      {
        key: 'supplier_lot',
        label: { en: "Supplier's lot number (if any)", ar: 'رقم دفعة المورد (إن وجد)' },
        input: 'text',
        memory: 'every_time',
        ...help(
          'If the supplier wrote a number on the drum or receipt, copy it. Otherwise skip.',
          'إذا كتب المورد رقماً على البرميل أو الإيصال، انسخه. وإلا تخطَّ.',
        ),
      },
    ],
    pack: [
      {
        key: 'package_type',
        label: { en: 'Pouch type', ar: 'نوع الكيس' },
        input: 'choice',
        options: [
          option('kraft', 'Kraft', 'كرافت'),
          option('transparent', 'Clear', 'شفاف'),
          option('vacuum', 'Vacuum', 'مفرغ'),
          option('container', 'Container', 'علبة'),
        ],
        memory: 'last_time',
        default: 'kraft',
        required: true,
      },
      {
        key: 'size_kg',
        label: { en: 'Size of each pouch', ar: 'حجم كل كيس' },
        input: 'choice',
        unit: 'kg',
        options: [option('0.25', '250 g', '٢٥٠ غ'), option('0.5', '500 g', '٥٠٠ غ'), option('1', '1 kg', '١ كغ')],
        memory: 'last_time',
        default: '0.5',
        required: true,
      },
      {
        key: 'package_count',
        label: { en: 'How many pouches?', ar: 'كم كيساً؟' },
        input: 'number',
        memory: 'every_time',
        required: true,
        whole: true,
        ...help(
          'Count the filled pouches. Each one gets the same QR label.',
          'عدّ الأكياس المعبأة. كل كيس يحمل نفس ملصق الرمز.',
        ),
      },
      {
        key: 'storage_location',
        label: { en: 'Stored where?', ar: 'أين التخزين؟' },
        input: 'text',
        memory: 'last_time',
        default: 'Dry store',
        required: true,
      },
    ],
    sell: [
      {
        key: 'quantity',
        label: { en: 'How many pouches sold?', ar: 'كم كيساً بيع؟' },
        input: 'number',
        memory: 'every_time',
        required: true,
        whole: true,
      },
      {
        key: 'unit_price',
        label: { en: 'Price per pouch', ar: 'سعر الكيس' },
        input: 'number',
        memory: 'last_time',
        required: true,
        zero_allowed: true,
        ...help('The app multiplies this by the number sold.', 'يضرب التطبيق هذا بعدد الأكياس المباعة.'),
      },
      {
        key: 'currency',
        label: { en: 'Currency', ar: 'العملة' },
        input: 'choice',
        options: [option('USD', 'US dollars', 'دولار', '💵'), option('LBP', 'Lebanese pounds', 'ليرة', '💷')],
        memory: 'last_time',
        default: 'USD',
        required: true,
      },
      {
        key: 'usd_rate',
        label: { en: 'Pounds per dollar today', ar: 'سعر الدولار بالليرة اليوم' },
        input: 'number',
        memory: 'last_time',
      },
      {
        key: 'customer_category',
        label: { en: 'Sold to', ar: 'البيع إلى' },
        input: 'choice',
        options: [
          option('retail', 'Shop customer', 'زبون', '🙂'),
          option('wholesale', 'Shop or trader', 'متجر أو تاجر', '🏪'),
          option('market', 'Market stall', 'سوق', '🧺'),
        ],
        memory: 'last_time',
        default: 'retail',
        required: true,
      },
    ],
  },
  voice: { mode: 'tts', clips: {} },
  feedback: { sound: true, vibrate: true },
  hints: true,
  showCodes: false,
  pictures: {},
  allowLocalOverrides: true,
} satisfies z.input<typeof settingsSchema>);

/** Per-cooperative differences, keyed by cooperative code. Example: {AKR01:{recording:{mode:'designated',recorders:{AKR01:['rima']}}}} */
export const cooperativeSettings: Record<string, SettingsPatch> = {};

type QuestionPatch = { key: string } & Partial<Omit<Question, 'key'>>;
type Sections = 'recording' | 'home' | 'batch' | 'voice' | 'feedback';
type LevelsPatch = Partial<Omit<Settings['levels'], 'unlocks'>> & { unlocks?: Partial<Settings['levels']['unlocks']> };
export type SettingsPatch = Partial<Omit<Settings, 'questions' | 'levels' | Sections>> & {
  [K in Sections]?: Partial<Settings[K]>;
} & { levels?: LevelsPatch; questions?: Partial<Record<keyof Settings['questions'], QuestionPatch[]>> };

/** Applies a patch: sections merge field by field; questions merge by key, so a patch can change one question's memory. */
export function mergeSettings(base: Settings, patch: SettingsPatch = {}): Settings {
  const questions = { ...base.questions };
  for (const pipeline of Object.keys(patch.questions ?? {}) as (keyof Settings['questions'])[]) {
    const changes = new Map((patch.questions?.[pipeline] ?? []).map((q) => [q.key, q]));
    questions[pipeline] = base.questions[pipeline].map((q) => ({ ...q, ...changes.get(q.key) }) as Question);
  }
  return settingsSchema.parse({
    ...base,
    ...patch,
    recording: { ...base.recording, ...patch.recording },
    home: { ...base.home, ...patch.home },
    batch: { ...base.batch, ...patch.batch },
    jobs: { ...base.jobs, ...patch.jobs },
    levels: { ...base.levels, ...patch.levels, unlocks: { ...base.levels.unlocks, ...patch.levels?.unlocks } },
    voice: { ...base.voice, ...patch.voice },
    feedback: { ...base.feedback, ...patch.feedback },
    pictures: { ...base.pictures, ...patch.pictures },
    questions,
  });
}

/** The file defaults, then the cooperative's patch, then an optional on-device patch for trying alternatives. */
export function settingsFor(
  cooperativeCode: string,
  local?: SettingsPatch,
  base: Settings = defaultSettings,
  cooperatives: Record<string, SettingsPatch> = cooperativeSettings,
): Settings {
  const merged = mergeSettings(base, cooperatives[cooperativeCode]);
  return merged.allowLocalOverrides && local ? mergeSettings(merged, local) : merged;
}
