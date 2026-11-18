// התקדמות בספר – לפי מילים ולא לפי פרקים (פרקים שונים באורכם).

import { countWords, parseSentenceId, type Chapter } from './book';

/** כמה מהפרק עבר (0–1) עד משפט מסוים: מילים במשפטים שלפניו / כל המילים בפרק */
export function chapterFraction(chapter: Chapter, sid: string | null): number {
  const pos = sid ? parseSentenceId(sid) : null;
  if (!pos) return 0;
  let before = 0;
  let total = 0;
  chapter.paragraphs.forEach((para, p) =>
    para.forEach((text, s) => {
      const w = countWords(text);
      total += w;
      if (p < pos.p || (p === pos.p && s < pos.s)) before += w;
    }),
  );
  return total ? before / total : 0;
}

/** אחוז מהספר (0–100), לפי מספר המילים בכל פרק */
export function bookPercent(chapterWords: number[] | undefined, chapterIdx: number, fraction: number): number | null {
  if (!chapterWords?.length || chapterIdx < 0 || chapterIdx >= chapterWords.length) return null;
  const total = chapterWords.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const before = chapterWords.slice(0, chapterIdx).reduce((a, b) => a + b, 0);
  const pct = ((before + fraction * chapterWords[chapterIdx]) / total) * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
}
