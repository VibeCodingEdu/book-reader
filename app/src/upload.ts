// העלאת קובץ מהמכשיר לספרייה: פענוח בדפדפן → שמירה בשרת

import type { BookMeta } from '../../shared/book';
import { uploadBook } from './api';
import { importFile } from './importers';

export interface CatalogLink {
  source: 'english-e-reader' | 'learnenglishteam';
  id: string;
  title: string;
  author: string;
  level?: string;
  url: string;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/** מפענח את הקובץ ושומר אותו. אם הגיע מקטלוג – לוקחים ממנו שם, מחבר ורמה. */
export async function uploadFile(file: File, from?: CatalogLink, onStage?: (s: string) => void): Promise<BookMeta> {
  onStage?.('מפענח את הקובץ…');
  const imp = await importFile(file);
  if (!imp.parsed.chapters.length) throw new Error('לא נמצא טקסט בקובץ');
  const title = from?.title || imp.title;
  const meta: BookMeta = {
    id: from ? `${from.source}-${slug(from.id)}` : `upload-${slug(title) || 'book'}-${Date.now().toString(36)}`,
    lang: 'en',
    title,
    author: from?.author || imp.author,
    source: from?.source ?? 'upload',
    level: from?.level,
    sourceUrl: from?.url,
    chapterCount: imp.parsed.chapters.length,
    wordCount: imp.parsed.wordCount,
    chapterTitles: imp.parsed.chapters.map((c) => c.title),
  };
  onStage?.('שומר בספרייה…');
  return uploadBook(meta, imp.parsed.chapters);
}

export const ACCEPT = '.epub,.pdf,.txt,application/epub+zip,application/pdf,text/plain';
