import type { BookMeta } from '../../../shared/book';
import type { DeviceSettings } from '../deviceSettings';
import type { useBookChapter } from './useBookChapter';

/** מה שהמעטפת (Reader) מעבירה לכל אחד מהמסכים: קריאה ולימוד */
export interface ViewProps {
  book: BookMeta;
  settings: DeviceSettings;
  /** הפרק והמיקום – משותפים לשני המסכים, כך שמעבר ביניהם לא טוען מחדש ולא מאבד מקום */
  ch: ReturnType<typeof useBookChapter>;
  /** המסך הפעיל רושם כאן את פונקציית ניקוי הבחירה שלו (נקראת בטעינת פרק) */
  clearRef: { current: () => void };
}
