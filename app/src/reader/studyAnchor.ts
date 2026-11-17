// במצב לימוד: איזה משפט הוא "העליון" במסך – הוא נשמר כמיקום הקריאה ועובר למצב קריאה.

export interface RowBox {
  id: string;
  /** גבול עליון ותחתון של השורה, באותה מערכת צירים כמו viewTop */
  top: number;
  bottom: number;
}

/**
 * המשפט הראשון שנראה בראש המסך. שורה שרק השוליים התחתונים שלה (עד minVisible פיקסלים)
 * עוד מציצים למעלה לא נחשבת – העוגן הוא המשפט שבאמת מתחילים לקרוא.
 */
export function topVisibleId(rows: RowBox[], viewTop: number, minVisible = 12): string | null {
  for (const r of rows) {
    if (r.bottom - viewTop > minVisible) return r.id;
  }
  return rows.length ? rows[rows.length - 1].id : null;
}

/** כמה לגלול בלחיצה על ▲/▼: מסך שלם פחות שתי שורות, כדי שההקשר לא יאבד */
export function screenStep(viewHeight: number, lineHeightPx: number): number {
  return Math.max(viewHeight - 2 * lineHeightPx, viewHeight * 0.5);
}
