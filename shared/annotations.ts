// סימניות והערות על משפטים – משותף לשרת ולאפליקציה.
//
// סנכרון: כל רשומה נושאת updatedAt, והכתיבה האחרונה גוברת. מחיקה נשמרת כ"מחוקה"
// (deleted), כדי שמכשיר שעוד לא שמע עליה לא יחזיר אותה לחיים.
// כל רשומה שומרת גם את גרסת הפענוח ואת תחילת המשפט, כדי למצוא אותו גם אם הפירוק ישתנה.

import { parseSentenceId, sentenceId, type Chapter } from './book';

export type AnnotationKind = 'bookmark' | 'note';

export interface Annotation {
  /** מזהה ייחודי שנוצר במכשיר */
  id: string;
  bookId: string;
  kind: AnnotationKind;
  sentenceId: string;
  /** גרסת הפענוח שבה נוצר המזהה */
  parserVersion: number;
  /** טקסט ההערה (בסימנייה – ריק) */
  text: string;
  /** תחילת המשפט, עד 200 תווים – לרשימות ולאיתור מחדש */
  excerpt: string;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

export const MAX_NOTE = 5000;
export const MAX_EXCERPT = 200;

export const makeExcerpt = (sentence: string) => sentence.trim().slice(0, MAX_EXCERPT);

/** הגרסה שגוברת מבין שתיים: המאוחרת; בשוויון – המחוקה (מחיקה לא "מתבטלת" בטעות) */
export function newer(a: Annotation, b: Annotation): Annotation {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return b.deleted && !a.deleted ? b : a;
}

/** מיזוג שתי רשימות (מקומית ומהשרת): לכל מזהה – הגרסה שגוברת */
export function mergeAnnotations(a: Annotation[], b: Annotation[]): Annotation[] {
  const byId = new Map<string, Annotation>();
  for (const x of [...a, ...b]) {
    const cur = byId.get(x.id);
    byId.set(x.id, cur ? newer(cur, x) : x);
  }
  return [...byId.values()].sort((x, y) => x.createdAt - y.createdAt || x.id.localeCompare(y.id));
}

/** בדיקת רשומה שהגיעה מבחוץ. מחזיר הודעת שגיאה, או null אם תקינה. */
export function validateAnnotation(x: unknown): string | null {
  const a = x as Partial<Annotation>;
  if (!a || typeof a !== 'object') return 'רשומה לא תקינה';
  if (typeof a.id !== 'string' || !/^[\w-]{8,64}$/.test(a.id)) return 'מזהה לא תקין';
  if (typeof a.bookId !== 'string' || a.bookId.length > 200) return 'ספר לא תקין';
  if (a.kind !== 'bookmark' && a.kind !== 'note') return 'סוג לא תקין';
  if (typeof a.sentenceId !== 'string' || !parseSentenceId(a.sentenceId)) return 'משפט לא תקין';
  if (!Number.isInteger(a.parserVersion) || a.parserVersion! < 1) return 'גרסה לא תקינה';
  if (typeof a.text !== 'string' || a.text.length > MAX_NOTE) return 'הערה ארוכה מדי';
  if (typeof a.excerpt !== 'string' || a.excerpt.length > MAX_EXCERPT) return 'קטע לא תקין';
  if (typeof a.createdAt !== 'number' || typeof a.updatedAt !== 'number') return 'זמן לא תקין';
  if (typeof a.deleted !== 'boolean') return 'מחיקה לא תקינה';
  return null;
}

/**
 * איפה המשפט של הרשומה עכשיו. אם הספר פוענח באותה גרסה – לפי המזהה. אחרת מחפשים בפרק
 * (ובפרקים שהועברו) משפט שמתחיל באותו טקסט. מחזיר מזהה, או null אם לא נמצא.
 */
export function locateSentence(
  a: Pick<Annotation, 'sentenceId' | 'parserVersion' | 'excerpt'>,
  bookParserVersion: number,
  chapters: { idx: number; chapter: Chapter }[],
): string | null {
  if (a.parserVersion === bookParserVersion) return a.sentenceId;
  const want = norm(a.excerpt);
  if (!want) return null;
  for (const { idx, chapter } of chapters) {
    for (let p = 0; p < chapter.paragraphs.length; p++) {
      for (let s = 0; s < chapter.paragraphs[p].length; s++) {
        if (norm(makeExcerpt(chapter.paragraphs[p][s])) === want) return sentenceId(idx, p, s);
      }
    }
  }
  return null;
}

const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
