import type { BookMeta } from '../../../shared/book';
import type { DeviceSettings } from '../deviceSettings';
import type { Annotation } from '../../../shared/annotations';
import type { AnnotationsApi } from './useAnnotations';
import type { WordsApi } from '../useWords';
import type { useBookChapter } from './useBookChapter';

/** מה שהמעטפת (Reader) מעבירה לכל אחד מהמסכים: קריאה ולימוד */
export interface ViewProps {
  book: BookMeta;
  settings: DeviceSettings;
  /** הפרק והמיקום – משותפים לשני המסכים, כך שמעבר ביניהם לא טוען מחדש ולא מאבד מקום */
  ch: ReturnType<typeof useBookChapter>;
  /** המסך הפעיל רושם כאן את פונקציית ניקוי הבחירה שלו (נקראת בטעינת פרק) */
  clearRef: { current: () => void };
  /** שינוי הגדרות המכשיר מתוך המסך (למשל מצב התרגום המקביל) */
  onPatchSettings: (patch: Partial<DeviceSettings>) => void;
  /** סימניות והערות של הספר */
  ann: AnnotationsApi;
  /** המילים השמורות (רשימה אחת לכל הספרים) */
  words: WordsApi;
  /** פתיחת עורך ההערה למשפט */
  onEditNote: (sid: string, sentence: string, existing?: Annotation) => void;
  /** אחוז מהספר (או null אם לא ידוע) */
  percent: number | null;
  /** מצב קריאה בלי סרגלים (נגיעה במרכז המסך מחליפה) */
  immersive: boolean;
  onToggleImmersive: () => void;
}
