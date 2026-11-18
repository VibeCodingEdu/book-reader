// יומן חזרות (תרגול FSRS) – משותף לשרת ולאפליקציה.
//
// כל דירוג הוא שורה חדשה ביומן, ואף פעם לא מעדכנים או מוחקים שורה. מצב ה-FSRS של כל מילה
// מחושב במכשיר מתוך היומן, כך שתרגול באייפון וב-Boox באותו יום לא דורסים זה את זה.

/** 1 = שוב, 2 = קשה, 3 = טוב, 4 = קל (כמו ב-FSRS) */
export type ReviewRating = 1 | 2 | 3 | 4;

export interface Review {
  /** מזהה ייחודי שנוצר במכשיר – מונע כפילות כששולחים שוב */
  id: string;
  wordId: string;
  rating: ReviewRating;
  /** מתי דורג (ms) */
  reviewedAt: number;
}

/** איחוד יומנים: כל מזהה פעם אחת, לפי סדר הזמן */
export function mergeReviews(a: Review[], b: Review[]): Review[] {
  const byId = new Map<string, Review>();
  for (const r of [...a, ...b]) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()].sort((x, y) => x.reviewedAt - y.reviewedAt || x.id.localeCompare(y.id));
}

/** בדיקת רשומה שהגיעה מבחוץ. מחזיר הודעת שגיאה, או null אם תקינה. */
export function validateReview(x: unknown): string | null {
  const r = x as Partial<Review>;
  if (!r || typeof r !== 'object') return 'רשומה לא תקינה';
  if (typeof r.id !== 'string' || !/^[\w-]{8,64}$/.test(r.id)) return 'מזהה לא תקין';
  if (typeof r.wordId !== 'string' || !/^[\w-]{8,64}$/.test(r.wordId)) return 'מילה לא תקינה';
  if (r.rating !== 1 && r.rating !== 2 && r.rating !== 3 && r.rating !== 4) return 'דירוג לא תקין';
  // לא לפני 2026 ולא יותר מיום קדימה (שעון מכשיר שגוי)
  if (typeof r.reviewedAt !== 'number' || r.reviewedAt < Date.UTC(2026, 0, 1) || r.reviewedAt > Date.now() + 86_400_000) {
    return 'זמן לא תקין';
  }
  return null;
}

/** קיבוץ היומן לפי מילה (כל רשימה ממוינת לפי זמן) */
export function reviewsByWord(reviews: Review[]): Map<string, Review[]> {
  const out = new Map<string, Review[]>();
  for (const r of [...reviews].sort((x, y) => x.reviewedAt - y.reviewedAt || x.id.localeCompare(y.id))) {
    const list = out.get(r.wordId);
    if (list) list.push(r);
    else out.set(r.wordId, [r]);
  }
  return out;
}
