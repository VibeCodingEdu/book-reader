// מילים שמורות (אוצר מילים) – משותף לשרת ולאפליקציה.
//
// סנכרון: כמו הערות – כל רשומה נושאת updatedAt, הכתיבה האחרונה גוברת, ומחיקה נשמרת כ"מחוקה"
// (deleted) כדי שמכשיר שעוד לא שמע עליה לא יחזיר אותה לחיים.
// הרשימה אחת לכל הספרים (לא לכל ספר), ולכן אין כאן תלות במשתמש: אם יתווסף בעתיד user_id,
// הוא יתווסף כעמודה בלי לשנות את המבנה.

import { parseSentenceId } from './book';
import type { UnitType } from './translate';

/** שלב למידה. ב-3א נקבע ידנית; ב-3ב FSRS יעדכן אותו לפי התרגול */
export type WordStage = 'new' | 'learning' | 'known';
export const STAGES: readonly WordStage[] = ['new', 'learning', 'known'];
export const STAGE_LABEL: Record<WordStage, string> = { new: 'חדשה', learning: 'בלמידה', known: 'כמעט ידועה' };

export interface SavedWord {
  /** מזהה ייחודי שנוצר במכשיר */
  id: string;
  /** מאיפה נשמרה: הספר, המשפט ומיקום המילה בו */
  bookId: string;
  bookTitle: string;
  sentenceId: string;
  parserVersion: number;
  wordOffset: number;
  /** המילה או הביטוי כפי שהופיעו ("broke out") */
  unit: string;
  unitType: UnitType;
  /** צורת מילון ("break out") */
  lemma: string;
  /** חלק דיבר בעברית */
  pos: string;
  ipa: string;
  /** המשמעות בהקשר – ניתנת לעריכה */
  meaning: string;
  /** המשפט המלא שבו נשמרה */
  sentence: string;
  stage: WordStage;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

export const MAX_SENTENCE = 1500;
export const MAX_MEANING = 500;

/** הגרסה שגוברת מבין שתיים: המאוחרת; בשוויון – המחוקה */
export function newer(a: SavedWord, b: SavedWord): SavedWord {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return b.deleted && !a.deleted ? b : a;
}

/** מיזוג שתי רשימות (מקומית ומהשרת): לכל מזהה – הגרסה שגוברת */
export function mergeWords(a: SavedWord[], b: SavedWord[]): SavedWord[] {
  const byId = new Map<string, SavedWord>();
  for (const x of [...a, ...b]) {
    const cur = byId.get(x.id);
    byId.set(x.id, cur ? newer(cur, x) : x);
  }
  return [...byId.values()].sort((x, y) => x.createdAt - y.createdAt || x.id.localeCompare(y.id));
}

const UNIT_TYPES: readonly string[] = ['word', 'phrasal_verb', 'idiom', 'proper_noun'];

/** בדיקת רשומה שהגיעה מבחוץ. מחזיר הודעת שגיאה, או null אם תקינה. */
export function validateWord(x: unknown): string | null {
  const w = x as Partial<SavedWord>;
  if (!w || typeof w !== 'object') return 'רשומה לא תקינה';
  if (typeof w.id !== 'string' || !/^[\w-]{8,64}$/.test(w.id)) return 'מזהה לא תקין';
  if (typeof w.bookId !== 'string' || !w.bookId || w.bookId.length > 200) return 'ספר לא תקין';
  if (typeof w.bookTitle !== 'string' || w.bookTitle.length > 300) return 'שם ספר לא תקין';
  if (typeof w.sentenceId !== 'string' || !parseSentenceId(w.sentenceId)) return 'משפט לא תקין';
  if (!Number.isInteger(w.parserVersion) || w.parserVersion! < 1) return 'גרסה לא תקינה';
  if (!Number.isInteger(w.wordOffset) || w.wordOffset! < 0 || w.wordOffset! > MAX_SENTENCE * 4) return 'מיקום לא תקין';
  if (typeof w.unit !== 'string' || !w.unit.trim() || w.unit.length > 120) return 'מילה לא תקינה';
  if (typeof w.unitType !== 'string' || !UNIT_TYPES.includes(w.unitType)) return 'סוג לא תקין';
  if (typeof w.lemma !== 'string' || w.lemma.length > 120) return 'צורת מילון לא תקינה';
  if (typeof w.pos !== 'string' || w.pos.length > 60) return 'חלק דיבר לא תקין';
  if (typeof w.ipa !== 'string' || w.ipa.length > 120) return 'תעתיק לא תקין';
  if (typeof w.meaning !== 'string' || w.meaning.length > MAX_MEANING) return 'משמעות ארוכה מדי';
  if (typeof w.sentence !== 'string' || w.sentence.length > MAX_SENTENCE) return 'משפט ארוך מדי';
  if (typeof w.stage !== 'string' || !(STAGES as readonly string[]).includes(w.stage)) return 'שלב לא תקין';
  if (typeof w.createdAt !== 'number' || typeof w.updatedAt !== 'number') return 'זמן לא תקין';
  if (typeof w.deleted !== 'boolean') return 'מחיקה לא תקינה';
  return null;
}

// ---------- התאמת מילים שמורות בטקסט ----------

/** צורה מנורמלת של מילה לצורך השוואה: אותיות קטנות, גרש אחיד, בלי סיומת בעלות ('s) */
export function normToken(t: string): string {
  return t.toLowerCase().replace(/[’‘]/g, "'").replace(/'s$/, '');
}

const VOWELS = /[aeiou]/;

/**
 * נטיות רגילות באנגלית של מילה (לא כולל חריגות כמו broke/break – אלה נתפסות דרך הצורה שנשמרה בפועל).
 * מחזיר את המילה עצמה וגם את הנטיות האפשריות שלה.
 */
export function inflections(word: string): Set<string> {
  const w = normToken(word);
  const out = new Set<string>([w]);
  if (w.length < 3 || !/^[a-z]+$/.test(w)) return out;
  const last = w[w.length - 1];
  const prev = w[w.length - 2];
  // רבים / גוף שלישי
  out.add(w + 's');
  if (/(s|x|z|ch|sh)$/.test(w)) out.add(w + 'es');
  if (last === 'y' && !VOWELS.test(prev)) {
    out.add(w.slice(0, -1) + 'ies');
    out.add(w.slice(0, -1) + 'ied');
  }
  if (/o$/.test(w)) out.add(w + 'es');
  // עבר ו-ing
  out.add(w + 'ed');
  out.add(w + 'ing');
  if (last === 'e') {
    out.add(w + 'd');
    out.add(w.slice(0, -1) + 'ing');
  }
  if (last === 'y' && !VOWELS.test(prev)) out.add(w.slice(0, -1) + 'ied');
  // הכפלת עיצור: stop → stopped / stopping
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(w) && w.length <= 5) {
    out.add(w + last + 'ed');
    out.add(w + last + 'ing');
  }
  // וגם בכיוון ההפוך: אם נשמרה צורה נטויה, נתאים גם את הבסיס שלה
  for (const suf of ['ing', 'ed', 'es', 's']) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) {
      const stem = w.slice(0, -suf.length);
      out.add(stem);
      out.add(stem + 'e');
      if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) out.add(stem.slice(0, -1));
      if (suf === 'es' || suf === 'ed') {
        if (stem.endsWith('i')) out.add(stem.slice(0, -1) + 'y');
      }
    }
  }
  return out;
}
