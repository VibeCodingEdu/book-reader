// בדיקת תשובה מוקלדת (או מוכתבת במקלדת): נכון / קרוב / שגוי.
// ההשוואה מתעלמת מאותיות גדולות וקטנות, מפיסוק ומרווחים, כך ששגיאת מקלדת קטנה לא נחשבת שכחה.

import type { ReviewRating } from '../../../shared/review';

export type Verdict = 'correct' | 'close' | 'wrong';

/** צורה להשוואה: אותיות קטנות, גרש אחיד, בלי פיסוק, מקף = רווח, רווחים בודדים */
export function normAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[-–—]/g, ' ')
    .replace(/[^\p{L}\p{N}' ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** מרחק עריכה (הוספה / מחיקה / החלפה של תו) */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** כמה שגיאות כתיב מותרות לפי אורך המילה: קצרה – אפס, בינונית – אחת, ארוכה – שתיים */
const tolerance = (len: number) => (len <= 3 ? 0 : len <= 7 ? 1 : 2);

/**
 * accepted: הצורות שנחשבות נכונות לגמרי.
 * near: צורות שנחשבות "קרוב" (למשל צורת המילון כשהמשפט דורש צורה נטויה).
 */
export function checkAnswer(typed: string, accepted: string[], near: string[] = []): Verdict {
  const t = normAnswer(typed);
  if (!t) return 'wrong';
  const ok = accepted.map(normAnswer).filter(Boolean);
  if (ok.includes(t)) return 'correct';
  if (near.map(normAnswer).includes(t)) return 'close';
  if (ok.some((a) => editDistance(t, a) <= tolerance(a.length))) return 'close';
  return 'wrong';
}

/** הדירוג שמוצע לפי התוצאה: נכון = טוב, קרוב = קשה, שגוי = שוב */
export const suggestedRating = (v: Verdict): ReviewRating => (v === 'correct' ? 3 : v === 'close' ? 2 : 1);
