import type { BookMeta, Chapter } from '../../shared/book';

const ID = /^(upload|english-e-reader|learnenglishteam)-[a-z0-9-]{1,100}$/;
const SOURCES = ['upload', 'english-e-reader', 'learnenglishteam'];
const MAX_CHAPTERS = 600;
const MAX_CHAPTER_BYTES = 1_500_000; // שורה ב-D1 מוגבלת ל-2MB

/** בדיקת ספר שהועלה מהדפדפן. מחזיר הודעת שגיאה, או null אם תקין. */
export function validateUpload(meta?: BookMeta, chapters?: Chapter[]): string | null {
  if (!meta || !chapters) return 'נתונים חסרים';
  if (typeof meta.id !== 'string' || !ID.test(meta.id)) return 'מזהה ספר לא תקין';
  if (!SOURCES.includes(meta.source)) return 'מקור לא תקין';
  if (typeof meta.title !== 'string' || !meta.title.trim()) return 'חסר שם ספר';
  if (!Array.isArray(chapters) || !chapters.length) return 'הספר ריק';
  if (chapters.length > MAX_CHAPTERS) return `יותר מדי פרקים (${chapters.length})`;
  for (const ch of chapters) {
    if (!ch || typeof ch.title !== 'string' || !Array.isArray(ch.paragraphs)) return 'מבנה פרק לא תקין';
    if (!ch.paragraphs.every((p) => Array.isArray(p) && p.every((s) => typeof s === 'string'))) return 'מבנה פסקה לא תקין';
    if (JSON.stringify(ch).length > MAX_CHAPTER_BYTES) return `פרק "${ch.title}" גדול מדי`;
  }
  return null;
}
