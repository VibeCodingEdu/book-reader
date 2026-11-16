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
  audioUrl?: string;
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
    audioUrl: from?.audioUrl,
    chapterCount: imp.parsed.chapters.length,
    wordCount: imp.parsed.wordCount,
    chapterTitles: imp.parsed.chapters.map((c) => c.title),
  };
  onStage?.('שומר בספרייה…');
  return uploadBook(meta, imp.parsed.chapters);
}

export const ACCEPT = '.epub,.pdf,.txt,application/epub+zip,application/pdf,text/plain';

const EER_DL = (slug: string, format: 'epub' | 'mp3') => `https://english-e-reader.net/download?link=${slug}&format=${format}`;

/** כתובת הקובץ להורדה ישירה מקטלוג, או null אם אין קישור ישיר (רק דף) */
export function directFileUrl(source: CatalogLink['source'], id: string, url: string): { url: string; name: string } | null {
  if (source === 'english-e-reader') return { url: EER_DL(id, 'epub'), name: `${id}.epub` };
  if (/\.pdf$/i.test(url) || url.includes('drive.google.com/uc')) return { url, name: `${id}.pdf` };
  return null;
}

export function audioUrlFor(source: CatalogLink['source'], id: string): string | undefined {
  return source === 'english-e-reader' ? EER_DL(id, 'mp3') : undefined;
}

/** ייבוא בלחיצה אחת: השרת מוריד את הקובץ מהאתר, והאפליקציה מפענחת ושומרת */
export async function importFromCatalog(from: CatalogLink, onStage?: (s: string) => void): Promise<BookMeta> {
  const direct = directFileUrl(from.source, from.id, from.url);
  if (!direct) throw new Error('לספר הזה אין קישור הורדה ישיר. השתמשו ב"פתיחה באתר".');
  onStage?.('מוריד מהאתר…');
  const { fetchExternal } = await import('./api');
  const buf = await fetchExternal(direct.url);
  return uploadFile(new File([buf], direct.name), from, onStage);
}
