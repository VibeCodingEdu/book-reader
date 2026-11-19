// תוצאת "לחיצה על מילה" – משותפת לשרת ולאפליקציה.

export type UnitType = 'word' | 'phrasal_verb' | 'idiom' | 'proper_noun';

export interface WordLookup {
  /** המילה או הביטוי המלא כפי שהם מופיעים במשפט, למשל "broke out" */
  unit: string;
  unitType: UnitType;
  /** צורת מילון, למשל "break out" */
  lemma: string;
  /** חלק דיבר בעברית: פועל, שם עצם... */
  pos: string;
  ipa: string;
  /** המשמעות בעברית שמתאימה למשפט הזה – מוצגת ראשונה */
  contextMeaning: string;
  otherMeanings: { pos: string; meaning: string }[];
}

export interface WordLookupRequest {
  sentence: string;
  word: string;
  /** מיקום המילה (באותיות) בתוך המשפט – כדי להבחין בין מופעים חוזרים */
  offset: number;
  lang: string;
  engine?: string;
}

export interface WordLookupResponse {
  result: WordLookup;
  engine: string;
  cached: boolean;
}

export const ENGINES = [
  { id: 'claude-haiku', label: 'Claude Haiku 5.5' },
  { id: 'gemini-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
] as const;

/** שמות לתצוגה של כל המנועים, כולל מנוע המשפטים (Google Translate, שלא נבחר בהגדרות) */
export const ENGINE_LABELS: Record<string, string> = {
  ...Object.fromEntries(ENGINES.map((e) => [e.id, e.label])),
  'google-nmt': 'Google Translate',
  /** משמעות שנשמרה ברשימת המילים (לא נקראה מהמנוע) */
  saved: 'מהמילים שלי',
};

/**
 * תווים מכתב שלא אמור להופיע בתרגום לעברית: ערבית, קירילית, סינית, יפנית, קוריאנית, הינדי ותאילנדית.
 * מודלי שפה קטנים לפעמים "מחליקים" ומכניסים תו כזה באמצע מילה עברית (למשל "כיוﺻר" במקום "כיוצר").
 * אנגלית (למשל מילה מצוטטת) ועברית – תקינות.
 */
const FOREIGN_SCRIPT =
  /[\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Devanagari}\p{Script=Thai}]/u;
const FOREIGN_SCRIPT_G = new RegExp(FOREIGN_SCRIPT.source, 'gu');

export const hasForeignScript = (s: string): boolean => FOREIGN_SCRIPT.test(s);

/** מוריד תווים מכתב זר (מוצא אחרון, כשגם ניסיון חוזר לא עזר) */
export const stripForeignScript = (s: string): string => s.replace(FOREIGN_SCRIPT_G, '').replace(/\s{2,}/g, ' ').trim();

/** האם תוצאת לחיצה על מילה מכילה תווים זרים באחד משדות הטקסט */
export function lookupHasForeignScript(r: WordLookup): boolean {
  return [r.unit, r.lemma, r.pos, r.ipa, r.contextMeaning, ...r.otherMeanings.flatMap((m) => [m.pos, m.meaning])].some(hasForeignScript);
}

/** מנקה תווים זרים מכל שדות התוצאה */
export function stripLookup(r: WordLookup): WordLookup {
  return {
    ...r,
    contextMeaning: stripForeignScript(r.contextMeaning),
    pos: stripForeignScript(r.pos),
    otherMeanings: r.otherMeanings.map((m) => ({ pos: stripForeignScript(m.pos), meaning: stripForeignScript(m.meaning) })),
  };
}

/** מסיר ניקוד, לצורך השוואות */
export function stripNiqqud(s: string): string {
  return s.replace(/[֑-ׇ]/g, '');
}

// ---------- תרגום קטע (כמה מילים עד פסקה) ----------

export interface TextTranslation {
  /** תרגום טבעי לעברית של הקטע שסומן */
  translation: string;
  /** הסבר קצר כשהקטע הוא ניב/ביטוי או שיש בו משהו לא מובן מאליו (אופציונלי) */
  note: string;
}

export interface TextTranslateRequest {
  /** הקטע שסומן */
  text: string;
  /** המשפט/ים שהקטע נמצא בהם – להקשר */
  context: string;
  lang: string;
  engine?: string;
}

export interface TextTranslateResponse {
  result: TextTranslation;
  engine: string;
  cached: boolean;
}

// ---------- תרגום משפטים: משפט בודד ותרגום מקביל של פרק ----------

/** תרגום מקביל של פרק: מזהה משפט → תרגום */
export type SentenceTranslations = Record<string, string>;

export interface ChapterTranslateRequest {
  bookId: string;
  chapterIdx: number;
  engine?: string;
}

export interface ChapterTranslateResponse {
  translations: SentenceTranslations;
  engine: string;
  cached: boolean;
}

export interface SentenceTranslateRequest {
  bookId: string;
  chapterIdx: number;
  sid: string;
  engine?: string;
}

export interface SentenceTranslateResponse {
  translation: string;
  engine: string;
  cached: boolean;
}
