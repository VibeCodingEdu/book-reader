// הורדת קובץ ספר מאחד מאתרי הקטלוג – רק בלחיצה של המשתמש, ורק מכתובות מוכרות.

const ALLOWED: RegExp[] = [
  /^https:\/\/english-e-reader\.net\/download\?link=[a-z0-9-]+&format=(epub|txt)$/,
  /^https:\/\/www\.learnenglishteam\.com\/wp-content\/uploads\/[\w./%-]+\.pdf$/i,
  /^https:\/\/drive\.google\.com\/uc\?export=download&id=[\w-]+$/,
];

export const MAX_BYTES = 40 * 1024 * 1024;

export function isAllowedExternal(url: string): boolean {
  return ALLOWED.some((r) => r.test(url));
}

export async function fetchExternal(url: string): Promise<Response> {
  if (!isAllowedExternal(url)) throw new Error('כתובת לא מורשית');
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (book-reader; user-initiated download)' },
  });
  if (!res.ok) throw new Error(`האתר החזיר שגיאה (${res.status})`);
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('text/html')) {
    throw new Error('האתר החזיר דף אינטרנט במקום קובץ. נסו "פתיחה באתר".');
  }
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_BYTES) throw new Error('הקובץ גדול מדי');
  return res;
}
