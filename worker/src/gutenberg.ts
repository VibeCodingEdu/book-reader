// ייבוא ספרים ברשות הציבור מ-Project Gutenberg.
// חיפוש: Gutendex (קטלוג פתוח של Gutenberg). הורדה: הטקסט הרשמי בקידוד UTF-8.

import { normalizeMeta, parsePlainText, type BookMeta, type Chapter } from '../../shared/book';

export interface SearchResult {
  gutenbergId: number;
  title: string;
  author: string;
  downloads: number;
}

const UA = 'book-reader-personal/0.1';

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA } });
  } finally {
    clearTimeout(t);
  }
}

interface GutendexBook {
  id: number;
  title: string;
  authors: { name: string }[];
  languages: string[];
  download_count: number;
  formats: Record<string, string>;
  copyright: boolean | null;
}

function authorName(b: GutendexBook): string {
  const a = b.authors[0]?.name ?? '';
  // "Shakespeare, William" → "William Shakespeare"
  const m = /^([^,]+),\s*(.+)$/.exec(a);
  return m ? `${m[2]} ${m[1]}` : a;
}

export async function searchGutenberg(query: string): Promise<SearchResult[]> {
  const url = `https://gutendex.com/books/?languages=en&search=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, 20000);
  if (!res.ok) throw new Error(`Gutendex ${res.status}`);
  const data = (await res.json()) as { results: GutendexBook[] };
  return data.results
    .filter((b) => b.copyright === false && b.languages.includes('en'))
    .slice(0, 20)
    .map((b) => ({ gutenbergId: b.id, title: b.title, author: authorName(b), downloads: b.download_count }));
}

async function fetchMeta(id: number): Promise<{ title: string; author: string } | null> {
  try {
    const res = await fetchWithTimeout(`https://gutendex.com/books/${id}`, 15000);
    if (!res.ok) return null;
    const b = (await res.json()) as GutendexBook;
    if (b.copyright) throw new Error('הספר מוגן בזכויות יוצרים');
    return { title: b.title, author: authorName(b) };
  } catch (e) {
    if (e instanceof Error && e.message.includes('זכויות')) throw e;
    return null; // Gutendex איטי/נפל – ננסה לחלץ מהטקסט עצמו
  }
}

/** כותרת ומחבר מתוך הטקסט עצמו (קבצי המראה לפעמים בלי שורת Title) */
export function metaFromText(raw: string): { title: string; author: string } | null {
  const title = /^Title:\s*(.+)$/m.exec(raw)?.[1]?.trim();
  if (title) return { title, author: /^Author:\s*(.+)$/m.exec(raw)?.[1]?.trim() ?? '' };
  // "End of the Project Gutenberg EBook of Aesop's Fables, by Aesop"
  const eb = /(?:End of )?(?:the|this) Project Gutenberg E[Bb]ook of ([^\n]+?)(?:,\s*by\s+([^\n]+))?\s*$/im.exec(raw);
  if (eb) return { title: eb[1].trim(), author: eb[2]?.trim() ?? '' };
  // "*** START OF THE PROJECT GUTENBERG EBOOK THE ADVENTURES OF PINOCCHIO ***"
  const st = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK ([^*]+?)\s*\*\*\*/i.exec(raw)?.[1];
  if (st && !/^\d+$/.test(st)) {
    const t = st.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    return { title: t, author: '' };
  }
  return null;
}

/** נתיב במראה הרשמי: 1513 → "1/5/1/1513", 5 → "0/5" */
export function mirrorPath(id: number): string {
  const s = String(id);
  const dirs = s.length === 1 ? ['0'] : s.slice(0, -1).split('');
  return [...dirs, s].join('/');
}

/** מוריד את הטקסט מהאתר הראשי, ואם הוא למטה – מהמראה הרשמי pglaf */
async function downloadText(id: number): Promise<string> {
  const p = mirrorPath(id);
  const urls = [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://gutenberg.pglaf.org/${p}/${id}-0.txt`,
    `https://gutenberg.pglaf.org/${p}/${id}.txt`,
  ];
  let last = '';
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, 25000);
      const type = res.headers.get('content-type') ?? '';
      if (res.ok && !type.includes('html')) return await res.text();
      last = `${res.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : 'שגיאה';
    }
  }
  throw new Error(`לא ניתן להוריד את הספר (${last})`);
}

export async function importGutenberg(
  id: number,
  hint?: { title?: string; author?: string },
): Promise<{ meta: BookMeta; chapters: Chapter[] }> {
  const [meta, raw] = await Promise.all([fetchMeta(id), downloadText(id)]);
  // סדר עדיפויות: הקטלוג → מה שהאפליקציה יודעת (הצעה/תוצאת חיפוש) → הטקסט עצמו
  const fromHint = hint?.title ? { title: hint.title, author: hint.author ?? '' } : null;
  const { title, author } = meta ?? fromHint ?? metaFromText(raw) ?? { title: `Gutenberg #${id}`, author: '' };
  const parsed = parsePlainText(raw, 'en');
  if (!parsed.chapters.length) throw new Error('לא נמצא טקסט בספר');
  return {
    meta: normalizeMeta({ id: `gutenberg-${id}`, lang: 'en', title, author, source: 'gutenberg' }, parsed.chapters),
    chapters: parsed.chapters,
  };
}
