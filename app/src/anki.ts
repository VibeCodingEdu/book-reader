// ייצוא המילים השמורות לקובץ CSV שאפשר לייבא ל-Anki.
// הקובץ נבנה בדפדפן (לא עובר דרך השרת). קידוד UTF-8 עם BOM כדי שהעברית תוצג נכון.

import { STAGE_LABEL, type SavedWord } from '../../shared/words';
import { tokenize } from './paging';
import { unitOffsets } from './savedWords';

export const GAP = '_____';

/** המשפט עם היחידה השמורה מוחלפת ברווח (ביטוי של כמה מילים – רווח אחד) */
export function sentenceWithGap(w: SavedWord): string {
  const hide = new Set(unitOffsets(w));
  const toks = tokenize(w.sentence);
  let out = '';
  toks.forEach((t, i) => {
    if (t.word && hide.has(t.offset)) {
      const prev = toks[i - 2]; // המילה שלפני הרווח הקודם
      const prevHidden = i >= 2 && !!prev && prev.word && hide.has(prev.offset) && !toks[i - 1].word;
      if (!prevHidden) out += GAP;
    } else if (!t.word && i >= 1 && i + 1 < toks.length && toks[i - 1].word && hide.has(toks[i - 1].offset) && toks[i + 1].word && hide.has(toks[i + 1].offset)) {
      // רווח בין שתי מילים של אותה יחידה – מושמט
    } else out += t.text;
  });
  return out;
}

/** שדה CSV: מוקף במרכאות כשיש בו פסיק, מרכאות או שורה חדשה */
export function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export const ANKI_HEADER = ['משפט עם רווח', 'מילה', 'משמעות', 'IPA', 'משפט מלא', 'ספר', 'שלב'];

/** CSV של המילים. השורה הראשונה היא כותרת; Anki מזהה אותה בייבוא */
export function buildAnkiCsv(words: SavedWord[]): string {
  const rows = words.map((w) => [sentenceWithGap(w), w.unit, w.meaning, w.ipa, w.sentence, w.bookTitle, STAGE_LABEL[w.stage]]);
  const body = [ANKI_HEADER, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n');
  return '﻿' + body + '\r\n';
}

/** הורדת הקובץ מהדפדפן */
export function downloadCsv(csv: string, name: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
