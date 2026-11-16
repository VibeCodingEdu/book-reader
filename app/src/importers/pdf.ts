// חילוץ טקסט מ-PDF בדפדפן (pdf.js). נטען רק כשבוחרים קובץ PDF.
// עובד על PDF עם שכבת טקסט; PDF סרוק (תמונות) מחזיר שגיאה ברורה.

export interface PdfLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/** מקבץ פריטי טקסט של עמוד לשורות לפי גובה */
export function itemsToLines(items: TextItem[]): PdfLine[] {
  const rows: { y: number; items: TextItem[] }[] = [];
  for (const it of items) {
    if (!it.str) continue;
    const y = it.transform[5];
    const h = it.height || Math.abs(it.transform[3]) || 10;
    let row = rows.find((r) => Math.abs(r.y - y) < h * 0.5);
    if (!row) rows.push((row = { y, items: [] }));
    row.items.push(it);
  }
  rows.sort((a, b) => b.y - a.y); // מלמעלה למטה
  return rows
    .map((r) => {
      r.items.sort((a, b) => a.transform[4] - b.transform[4]);
      let text = '';
      let end = -Infinity;
      for (const it of r.items) {
        const x = it.transform[4];
        // רווח בין פריטים שיש ביניהם מרחק
        if (text && !text.endsWith(' ') && !it.str.startsWith(' ') && x - end > 1) text += ' ';
        text += it.str;
        end = x + it.width;
      }
      const first = r.items[0];
      return {
        text: text.replace(/\s+/g, ' ').trim(),
        x: first.transform[4],
        y: r.y,
        width: end - first.transform[4],
        height: first.height || Math.abs(first.transform[3]) || 10,
      };
    })
    .filter((l) => l.text);
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const shape = (t: string) => t.toLowerCase().replace(/\d+/g, '#').trim();

/**
 * עמודים (רשימות שורות) → פסקאות טקסט.
 * מסיר מספרי עמודים וכותרות חוזרות, מאחד שורות לפסקאות, ומחבר מילים שנחתכו במקף.
 */
export function linesToParagraphs(pages: PdfLine[][]): string[] {
  // כותרות עליונות/תחתונות שחוזרות בהרבה עמודים
  const counts = new Map<string, number>();
  for (const lines of pages) {
    const edge = [...lines.slice(0, 2), ...lines.slice(-2)];
    for (const k of new Set(edge.map((l) => shape(l.text)))) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const minRepeat = Math.max(3, Math.ceil(pages.length * 0.3));
  const repeated = new Set([...counts].filter(([, n]) => n >= minRepeat).map(([k]) => k));

  const paras: string[] = [];
  let cur = '';
  const flush = () => {
    if (cur.trim()) paras.push(cur.trim());
    cur = '';
  };

  for (const raw of pages) {
    const pageWidth = median(raw.map((l) => l.width));
    const lines = raw.filter((l, i) => {
      const atEdge = i < 2 || i >= raw.length - 2;
      if (/^(page\s*)?\d{1,4}$/i.test(l.text)) return false;
      // כותרת רצה = שורה קצרה בקצה העמוד שחוזרת בהרבה עמודים (שורת טקסט מלאה לא נמחקת)
      if (atEdge && l.width < pageWidth * 0.7 && repeated.has(shape(l.text))) return false;
      return true;
    });
    if (!lines.length) continue;
    const gaps = lines.slice(1).map((l, i) => lines[i].y - l.y).filter((g) => g > 0);
    const gap = median(gaps) || lines[0].height * 1.4;
    const fullWidth = median(lines.map((l) => l.width));
    const left = median(lines.map((l) => l.x));

    lines.forEach((l, i) => {
      const prev = lines[i - 1];
      const bigGap = prev && prev.y - l.y > gap * 1.5;
      const indented = l.x > left + l.height * 0.8;
      const prevShortEnd = prev && prev.width < fullWidth * 0.75 && /[.!?:"”’)]$/.test(prev.text);
      if (i === 0 || bigGap || indented || prevShortEnd) {
        // בתחילת עמוד: ממשיכים את הפסקה הקודמת אם היא לא נגמרה במשפט שלם
        if (!(i === 0 && cur && !/[.!?:"”’)]$/.test(cur))) flush();
      }
      if (cur.endsWith('-') && /^[a-z]/.test(l.text)) cur = cur.slice(0, -1) + l.text;
      else cur = cur ? `${cur} ${l.text}` : l.text;
    });
  }
  flush();
  return paras;
}

export async function extractPdf(buf: ArrayBuffer): Promise<{ title: string; author: string; paras: string[] }> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: PdfLine[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(itemsToLines(content.items.filter((i): i is TextItem & typeof i => 'str' in i) as unknown as TextItem[]));
  }
  const chars = pages.reduce((n, p) => n + p.reduce((m, l) => m + l.text.length, 0), 0);
  if (chars < 200) {
    throw new Error('לא נמצא טקסט ב-PDF. כנראה שזה PDF סרוק (תמונות של עמודים), ואותו אי אפשר לקרוא כטקסט.');
  }
  const meta = (await doc.getMetadata().catch(() => null))?.info as { Title?: string; Author?: string } | undefined;
  return { title: meta?.Title?.trim() ?? '', author: meta?.Author?.trim() ?? '', paras: linesToParagraphs(pages) };
}
