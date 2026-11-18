// פענוח EPUB בדפדפן: פותחים את ה-zip, קוראים את סדר הפרקים (spine) ואת תוכן העניינים,
// ומחלצים מכל פרק כותרת ופסקאות טקסט.

import { strFromU8, unzipSync } from 'fflate';

export interface RawBook {
  title: string;
  author: string;
  chapters: { title: string; paras: string[] }[];
  /** תמונת הכריכה מתוך הקובץ, אם יש */
  cover?: { bytes: Uint8Array; mime: string };
}

function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(0, i + 1) : '';
}

/** "../Text/ch1.xhtml#x" יחסית ל-"OEBPS/content.opf" → "OEBPS/Text/ch1.xhtml" */
export function resolvePath(base: string, href: string): string {
  const clean = decodeURIComponent(href.split('#')[0]);
  const parts = (dirOf(base) + clean).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml');
}

function parseHtml(text: string): Document {
  // XHTML קודם; אם יש שגיאת XML – כ-HTML רגיל
  const x = new DOMParser().parseFromString(text, 'application/xhtml+xml');
  if (!x.getElementsByTagName('parsererror').length && x.body) return x;
  return new DOMParser().parseFromString(text, 'text/html');
}

const byLocal = (root: Document | Element, name: string) =>
  Array.from(root.getElementsByTagName('*')).filter((e) => e.localName === name);

/** תוכן עניינים: מפת קובץ → שם פרק (מ-nav של EPUB3 או מ-NCX של EPUB2) */
function readToc(files: Record<string, Uint8Array>, opfPath: string, opf: Document): Map<string, string> {
  const map = new Map<string, string>();
  const items = byLocal(opf, 'item');
  const nav = items.find((i) => (i.getAttribute('properties') ?? '').split(' ').includes('nav'));
  if (nav) {
    const navPath = resolvePath(opfPath, nav.getAttribute('href')!);
    const data = files[navPath];
    if (data) {
      const doc = parseHtml(strFromU8(data));
      for (const a of Array.from(doc.querySelectorAll('nav a[href]'))) {
        const target = resolvePath(navPath, a.getAttribute('href')!);
        if (!map.has(target)) map.set(target, norm(a.textContent));
      }
    }
  }
  if (!map.size) {
    const ncxItem = items.find((i) => i.getAttribute('media-type') === 'application/x-dtbncx+xml');
    if (ncxItem) {
      const ncxPath = resolvePath(opfPath, ncxItem.getAttribute('href')!);
      const data = files[ncxPath];
      if (data) {
        const ncx = parseXml(strFromU8(data));
        for (const np of byLocal(ncx, 'navPoint')) {
          const label = byLocal(np, 'text')[0]?.textContent;
          const src = byLocal(np, 'content')[0]?.getAttribute('src');
          if (src) {
            const target = resolvePath(ncxPath, src);
            if (!map.has(target)) map.set(target, norm(label));
          }
        }
      }
    }
  }
  return map;
}

const BLOCKS = 'h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,dd,dt';

/** פסקאות וכותרת מתוך מסמך XHTML של פרק */
export function extractBlocks(doc: Document): { heading: string; paras: string[] } {
  const body = doc.body ?? doc.documentElement;
  const els = Array.from(body.querySelectorAll(BLOCKS)).filter(
    // לא לספור פעמיים: li שמכיל p, blockquote שמכיל p וכו'
    (el) => !el.querySelector(BLOCKS),
  );
  let heading = '';
  const paras: string[] = [];
  for (const el of els) {
    const text = norm(el.textContent);
    if (!text) continue;
    if (/^h[1-6]$/i.test(el.localName) && !heading && !paras.length) heading = text;
    else paras.push(text);
  }
  if (!els.length) {
    // ספרים שכל הטקסט בהם ב-div: חותכים לפי שורות
    const lines = (body.textContent ?? '').split(/\n\s*\n|\r?\n/).map(norm).filter(Boolean);
    paras.push(...lines);
  }
  return { heading, paras };
}

export function parseEpub(buf: Uint8Array): RawBook {
  const files = unzipSync(buf);
  const container = files['META-INF/container.xml'];
  if (!container) throw new Error('קובץ EPUB לא תקין (חסר container.xml)');
  const opfPath = parseXml(strFromU8(container)).getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
  if (!opfPath || !files[opfPath]) throw new Error('קובץ EPUB לא תקין (חסר OPF)');
  const opf = parseXml(strFromU8(files[opfPath]));

  const title = norm(byLocal(opf, 'title')[0]?.textContent) || 'ללא שם';
  const author = norm(byLocal(opf, 'creator')[0]?.textContent);

  const manifest = new Map<string, { href: string; type: string }>();
  for (const it of byLocal(opf, 'item')) {
    manifest.set(it.getAttribute('id')!, { href: it.getAttribute('href')!, type: it.getAttribute('media-type') ?? '' });
  }
  const toc = readToc(files, opfPath, opf);

  const chapters: RawBook['chapters'] = [];
  for (const ref of byLocal(opf, 'itemref')) {
    const item = manifest.get(ref.getAttribute('idref') ?? '');
    if (!item || !/html|xml/.test(item.type)) continue;
    const path = resolvePath(opfPath, item.href);
    const data = files[path];
    if (!data) continue;
    const { heading, paras } = extractBlocks(parseHtml(strFromU8(data)));
    if (!paras.length) continue;
    chapters.push({ title: toc.get(path) || heading, paras });
  }
  if (!chapters.length) throw new Error('לא נמצא טקסט בקובץ');
  return { title, author, chapters, cover: findCover(files, opfPath, opf) };
}

/**
 * כריכה: EPUB3 מסמן אותה ב-properties="cover-image"; EPUB2 ב-<meta name="cover" content="id">;
 * ובקבצים ישנים לפעמים רק השם מרמז ("cover.jpg").
 */
export function findCover(files: Record<string, Uint8Array>, opfPath: string, opf: Document): RawBook['cover'] {
  const items = byLocal(opf, 'item').filter((i) => /^image\/(jpeg|png|webp|gif)$/.test(i.getAttribute('media-type') ?? ''));
  const metaId = byLocal(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
  const item =
    items.find((i) => (i.getAttribute('properties') ?? '').split(' ').includes('cover-image')) ??
    (metaId ? items.find((i) => i.getAttribute('id') === metaId) : undefined) ??
    items.find((i) => /cover/i.test(`${i.getAttribute('id')} ${i.getAttribute('href')}`));
  if (!item) return undefined;
  const bytes = files[resolvePath(opfPath, item.getAttribute('href')!)];
  return bytes?.length ? { bytes, mime: item.getAttribute('media-type')! } : undefined;
}
