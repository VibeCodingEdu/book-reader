// סימון המילים השמורות בטקסט הפרק: מוסיף מחלקה לכל מילה (.w) ישירות ב-DOM,
// בלי לרנדר מחדש את הפרק ובלי להזיז את העימוד (קו תחתון בלבד).

import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';
import { parseSentenceId, type Chapter } from '../../../shared/book';
import { matchSentence, STAGE_CLASS, type SavedIndex } from '../savedWords';

const ALL = Object.values(STAGE_CLASS);

export function useSavedMarks(rootRef: RefObject<HTMLElement | null>, chapter: Chapter | null, index: SavedIndex, dep?: unknown) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll('.w.sv').forEach((n) => n.classList.remove('sv', ...ALL));
    if (!chapter || !index.size) return;
    root.querySelectorAll<HTMLElement>('[data-sid]').forEach((span) => {
      const pos = parseSentenceId(span.dataset.sid ?? '');
      const sentence = pos ? chapter.paragraphs[pos.p]?.[pos.s] : undefined;
      if (!sentence) return;
      const matches = matchSentence(index, sentence);
      if (!matches.length) return;
      const els = new Map<number, HTMLElement>();
      span.querySelectorAll<HTMLElement>('.w').forEach((w) => els.set(Number(w.dataset.o), w));
      for (const m of matches) for (const o of m.offsets) els.get(o)?.classList.add('sv', STAGE_CLASS[m.word.stage]);
    });
  }, [rootRef, chapter, index, dep]);
}
