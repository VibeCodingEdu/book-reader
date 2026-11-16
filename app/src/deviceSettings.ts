// הגדרות תצוגה שנשמרות לכל מכשיר בנפרד (גופן לטלפון לא בהכרח מתאים ל-Boox).
// באבן דרך 1 הן יסונכרנו גם לשרת, תחת מזהה המכשיר.

export type Theme = 'light' | 'dark' | 'sepia' | 'eink';

export interface DeviceSettings {
  theme: Theme;
  fontSize: number; // px
  fontFamily: 'serif' | 'sans';
}

export const DEFAULT_SETTINGS: DeviceSettings = {
  theme: 'light',
  fontSize: 19,
  fontFamily: 'serif',
};

const KEY = 'reader.deviceSettings.v1';
const THEMES: Theme[] = ['light', 'dark', 'sepia', 'eink'];

/** ממזג נתונים שמורים (ואולי פגומים או ישנים) עם ברירות המחדל. */
export function parseSettings(raw: string | null): DeviceSettings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const obj = JSON.parse(raw) as Partial<DeviceSettings>;
    return {
      theme: THEMES.includes(obj.theme as Theme) ? (obj.theme as Theme) : DEFAULT_SETTINGS.theme,
      fontSize:
        typeof obj.fontSize === 'number' && obj.fontSize >= 12 && obj.fontSize <= 40
          ? obj.fontSize
          : DEFAULT_SETTINGS.fontSize,
      fontFamily: obj.fontFamily === 'sans' ? 'sans' : 'serif',
    };
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
