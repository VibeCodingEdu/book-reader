// כפתור "שמירת מילה" בבועה – משותף למצב קריאה ולמצב לימוד.

import type { BookMeta } from '../../../shared/book';
import type { Selection } from '../WordSheet';
import { savedAt } from '../savedWords';
import type { WordsApi } from '../useWords';

/** מה שהבועה צריכה כדי להציג ולהחליף את מצב השמירה של המילה שנלחצה */
export function saveProps(sel: Selection | null, words: WordsApi, book: BookMeta) {
  if (!sel || sel.kind !== 'word') return {};
  const hit = savedAt(words.index, sel.sentence, sel.offset)?.word;
  return {
    savedWord: hit,
    onToggleSave:
      sel.state === 'done'
        ? () =>
            hit
              ? words.remove(hit)
              : void words.save({ book, sid: sel.sid, offset: sel.offset, sentence: sel.sentence, result: sel.result })
        : undefined,
  };
}
