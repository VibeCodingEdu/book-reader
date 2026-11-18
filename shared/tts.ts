// הקראה (Google TTS): בניית SSML עם סימון לפני כל מילה, ופענוח שמות הסימונים.
//
// שם סימון = מקום במשפט: s{אינדקס משפט בקטע}o{offset של המילה}, וסוף משפט: s{אינדקס}e.
// ה-offset זהה ל-data-o של המילה בטקסט (אותה פונקציית tokenize), כך שהסימון בטקסט מדויק.
// תגי <mark> לא נספרים בחיוב של Google; שאר התגים כן.

import { tokenize } from './tokenize';

const XML: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
export const escapeXml = (s: string) => s.replace(/[&<>"']/g, (c) => XML[c]);

const encoder = new TextEncoder();
export const byteLength = (s: string) => encoder.encode(s).length;

/** גוגל מקבלת עד 5000 בתים של קלט בבקשה; משאירים מרווח */
export const MAX_SSML_BYTES = 4600;

/** תוכן SSML של משפט אחד (בלי <speak>): סימון לפני כל מילה וסימון סוף משפט */
export function sentenceSsml(sentence: string, index: number): { body: string; marks: string[] } {
  const marks: string[] = [];
  let body = '';
  for (const t of tokenize(sentence)) {
    if (t.word) {
      const name = `s${index}o${t.offset}`;
      marks.push(name);
      body += `<mark name="${name}"/>${escapeXml(t.text)}`;
    } else body += escapeXml(t.text);
  }
  const end = `s${index}e`;
  marks.push(end);
  body += `<mark name="${end}"/>`;
  return { body, marks };
}

/** SSML לקטע: משפטים ברצף. מחזיר גם את רשימת הסימונים שנשלחו (לבדיקת שלמות) */
export function buildSsml(sentences: string[]): { ssml: string; marks: string[] } {
  const parts = sentences.map((s, i) => sentenceSsml(s, i));
  return { ssml: `<speak>${parts.map((p) => p.body.trim()).join(' ')}</speak>`, marks: parts.flatMap((p) => p.marks) };
}

/** מספר התווים שגוגל תחייב: כל ה-SSML חוץ מתגי <mark> */
export const billedChars = (ssml: string) => ssml.replace(/<mark name="[^"]*"\/>/g, '').length;

/**
 * חלוקת משפטי פסקה לקטעים, כך שה-SSML של כל קטע (כולל הסימונים) לא יעבור את המגבלה.
 * משפט אחד ארוך מדי לבדו נשאר קטע בפני עצמו (ויידחה בשרת עם שגיאה ברורה).
 */
export function splitSegments(sentences: string[], maxBytes = MAX_SSML_BYTES): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  let size = byteLength('<speak></speak>');
  for (const s of sentences) {
    const len = byteLength(sentenceSsml(s, cur.length).body) + 1;
    if (cur.length && size + len > maxBytes) {
      out.push(cur);
      cur = [];
      size = byteLength('<speak></speak>');
    }
    cur.push(s);
    size += len;
  }
  if (cur.length) out.push(cur);
  return out;
}

export type MarkRef = { sentence: number; offset: number } | { sentence: number; end: true };

/** פענוח שם סימון; null אם לא תקין */
export function parseMarkName(name: string): MarkRef | null {
  let m = /^s(\d+)o(\d+)$/.exec(name);
  if (m) return { sentence: Number(m[1]), offset: Number(m[2]) };
  m = /^s(\d+)e$/.exec(name);
  if (m) return { sentence: Number(m[1]), end: true };
  return null;
}

export interface Timepoint {
  markName: string;
  timeSeconds: number;
}

/** בדיקת שלמות: כמה מהסימונים שנשלחו חזרו, ואילו חסרים */
export function checkTimepoints(sent: string[], got: Timepoint[]): { sent: number; returned: number; missing: string[] } {
  const have = new Set(got.map((t) => t.markName));
  const missing = sent.filter((m) => !have.has(m));
  return { sent: sent.length, returned: sent.length - missing.length, missing };
}
