// העלאת קובץ מהמכשיר לספרייה: פענוח בדפדפן → שמירה בשרת

import { normalizeMeta, PARSER_VERSION, type BookMeta } from '../../shared/book';
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
  const meta = normalizeMeta(
    {
      id: from ? `${from.source}-${slug(from.id)}` : `upload-${slug(title) || 'book'}-${Date.now().toString(36)}`,
      lang: 'en',
      title,
      author: from?.author || imp.author,
      source: from?.source ?? 'upload',
      level: from?.level,
      sourceUrl: from?.url,
      audioUrl: from?.audioUrl,
      // הפענוח נעשה כאן בדפדפן – זו הגרסה שבה המזהים נוצרו
      parserVersion: PARSER_VERSION,
    },
    imp.parsed.chapters,
  );
  onStage?.('שומר בספרייה…');
  const cover = imp.cover ? await shrinkCover(imp.cover).catch(() => undefined) : undefined;
  return uploadBook(meta, imp.parsed.chapters, cover);
}

/** מקטין את הכריכה ל-JPEG ברוחב 400px לכל היותר (כמה עשרות KB) */
async function shrinkCover(cover: { bytes: Uint8Array; mime: string }): Promise<string | undefined> {
  const bmp = await createImageBitmap(new Blob([cover.bytes as BlobPart], { type: cover.mime }));
  const scale = Math.min(1, 400 / bmp.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const url = canvas.toDataURL('image/jpeg', 0.82);
  return url.startsWith('data:image/jpeg') ? url : undefined;
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
