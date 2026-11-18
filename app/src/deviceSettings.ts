// הגדרות תצוגה שנשמרות לכל מכשיר בנפרד (גופן לטלפון לא בהכרח מתאים ל-Boox),
// ומסונכרנות לשרת תחת שם המכשיר.

/** auto = יום/לילה לפי הגדרת המכשיר */
export type Theme = 'auto' | 'light' | 'dark' | 'sepia' | 'eink';

export interface DeviceSettings {
  theme: Theme;
  fontSize: number; // px
  fontFamily: 'serif' | 'sans';
  lineHeight: number; // 1.2–2.2
  margin: number; // px בצדדים
  engine: string; // מנוע התרגום
  /** לחיצה על מילה מתרגמת מיד (אחרת: רק אחרי לחיצה על "תרגם") */
  autoTranslate: boolean;
  /** מסך הספר: קריאה (עמודים) או לימוד (משפט בשורה) */
  viewMode: ViewMode;
  /** תרגום מקביל במצב לימוד: כבוי / גלוי / מוסתר עד לחיצה */
  parallel: ParallelMode;
  updatedAt: number;
}

export type ViewMode = 'read' | 'study';
export type ParallelMode = 'off' | 'show' | 'hide';

export const DEFAULT_SETTINGS: DeviceSettings = {
  theme: 'light',
  fontSize: 19,
  fontFamily: 'serif',
  lineHeight: 1.6,
  margin: 20,
  engine: '',
  autoTranslate: true,
  viewMode: 'read',
  parallel: 'off',
  updatedAt: 0,
};

const KEY = 'reader.deviceSettings.v1';
const THEMES: Theme[] = ['auto', 'light', 'dark', 'sepia', 'eink'];

const num = (v: unknown, min: number, max: number, def: number) =>
  typeof v === 'number' && v >= min && v <= max ? v : def;

/** ממזג נתונים שמורים (ואולי פגומים או ישנים) עם ברירות המחדל. */
export function normalizeSettings(obj: Partial<DeviceSettings> | null | undefined): DeviceSettings {
  const o = obj ?? {};
  return {
    theme: THEMES.includes(o.theme as Theme) ? (o.theme as Theme) : DEFAULT_SETTINGS.theme,
    fontSize: num(o.fontSize, 12, 40, DEFAULT_SETTINGS.fontSize),
    fontFamily: o.fontFamily === 'sans' ? 'sans' : 'serif',
    lineHeight: num(o.lineHeight, 1.2, 2.2, DEFAULT_SETTINGS.lineHeight),
    margin: num(o.margin, 4, 64, DEFAULT_SETTINGS.margin),
    engine: typeof o.engine === 'string' ? o.engine : '',
    autoTranslate: typeof o.autoTranslate === 'boolean' ? o.autoTranslate : true,
    viewMode: o.viewMode === 'study' ? 'study' : 'read',
    parallel: o.parallel === 'show' || o.parallel === 'hide' ? o.parallel : 'off',
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0,
  };
}

export function parseSettings(raw: string | null): DeviceSettings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return normalizeSettings(JSON.parse(raw) as Partial<DeviceSettings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function loadSettings(): DeviceSettings {
  try {
    return parseSettings(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: DeviceSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* מצב פרטי – ממשיכים בלי לשמור */
  }
}
