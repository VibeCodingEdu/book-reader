// כריכות ספרים: מאיפה מביאים אותן, ובדיקה של מה שמתקבל.
// הכריכה נשמרת ב-D1 (טבלת covers) בפעם הראשונה שמבקשים אותה, וכך כל מכשיר מקבל אותה מהשרת.

import type { BookMeta } from '../../shared/book';

export const MAX_COVER_BYTES = 600_000;
/** אחרי כישלון (אין כריכה / האתר חסום) – לא מנסים שוב לפני שעבר הזמן הזה */
export const RETRY_MISSING_MS = 3 * 24 * 3600 * 1000;

export type CoverSource = { kind: 'image'; urls: string[] } | { kind: 'page'; url: string } | null;

/** מאיפה אפשר להביא כריכה לספר. ספר שהועלה מקובץ שולח את הכריכה בעצמו בהעלאה. */
export function coverSourceFor(meta: Pick<BookMeta, 'id' | 'source' | 'sourceUrl'>): CoverSource {
  const g = /^gutenberg-(\d+)$/.exec(meta.id);
  if (g) {
    // האתר הראשי חוסם לפעמים בקשות אוטומטיות – אז מהמראה (כמו בהורדת הטקסט)
    const path = `cache/epub/${g[1]}/pg${g[1]}.cover.medium.jpg`;
    return { kind: 'image', urls: [`https://www.gutenberg.org/${path}`, `https://gutenberg.pglaf.org/${path}`] };
  }
  if (meta.source === 'english-e-reader' && meta.sourceUrl && /^https:\/\/english-e-reader\.net\/book\/[a-z0-9-]+$/.test(meta.sourceUrl)) {
    // כתובת הכריכה לא נגזרת מהמזהה – לוקחים אותה מתגית og:image בדף הספר
    return { kind: 'page', url: meta.sourceUrl };
  }
  return null;
}

/** כתובת התמונה מתוך דף של english-e-reader – רק מתיקיית הכריכות שלהם */
export function ogImageFrom(html: string): string | null {
  const m = /<meta\s+property="og:image"\s+content="([^"]+)"/i.exec(html);
  if (!m) return null;
  return /^https:\/\/english-e-reader\.net\/covers\/[\w%.()'-]+\.(jpe?g|png|webp)$/i.test(m[1]) ? m[1] : null;
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function isImageType(type: string | null): boolean {
  return !!type && IMAGE_TYPES.includes(type.split(';')[0].trim().toLowerCase());
}

/** כריכה שחולצה בדפדפן מקובץ EPUB: data URL של JPEG/PNG/WebP, לא גדולה מדי */
export function decodeCoverDataUrl(dataUrl: unknown): { mime: string; bytes: Uint8Array } | null {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  let bin: string;
  try {
    bin = atob(m[2]);
  } catch {
    return null;
  }
  if (bin.length === 0 || bin.length > MAX_COVER_BYTES) return null;
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: m[1], bytes };
}

const UA = { 'User-Agent': 'Mozilla/5.0 (book-reader; cover for a book in a personal library)' };

async function fetchImage(url: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
  const res = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!res.ok || !isImageType(res.headers.get('content-type'))) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_COVER_BYTES) return null;
  return { mime: res.headers.get('content-type')!.split(';')[0].trim().toLowerCase(), bytes: buf };
}

/** מוריד את הכריכה מהמקור. null = אין כריכה (או שהמקור לא זמין כרגע). */
export async function downloadCover(source: CoverSource): Promise<{ mime: string; bytes: Uint8Array } | null> {
  if (!source) return null;
  try {
    if (source.kind === 'image') {
      for (const url of source.urls) {
        const img = await fetchImage(url).catch(() => null);
        if (img) return img;
      }
      return null;
    }
    const page = await fetch(source.url, { headers: UA });
    if (!page.ok) return null;
    const img = ogImageFrom(await page.text());
    return img ? await fetchImage(img) : null;
  } catch {
    return null;
  }
}
