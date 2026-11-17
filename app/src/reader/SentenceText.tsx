// טקסט הספר עם מזהי משפטים ומילים לחיצות – משותף למצב קריאה ולמצב לימוד (M2).

import { memo } from 'preact/compat';
import { sentenceId, type Chapter } from '../../../shared/book';
import { tokenize } from '../paging';

/** משפט אחד: span עם data-sid, וכל מילה span.w עם data-o (מיקום באותיות במשפט) */
export function SentenceSpan({ sid, text }: { sid: string; text: string }) {
  return (
    <span data-sid={sid}>
      {tokenize(text).map((t) =>
        t.word ? (
          <span key={t.offset} class="w" data-o={t.offset}>
            {t.text}
          </span>
        ) : (
          t.text
        ),
      )}{' '}
    </span>
  );
}

/** כל הפרק בפסקאות. ממוזכר – לא מתרנדר מחדש בכל דפדוף. */
export const ChapterText = memo(function ChapterText({ chapter, chapterIdx }: { chapter: Chapter; chapterIdx: number }) {
  return (
    <>
      {chapter.paragraphs.map((para, pi) => (
        <p key={pi}>
          {para.map((s, si) => (
            <SentenceSpan key={si} sid={sentenceId(chapterIdx, pi, si)} text={s} />
          ))}
        </p>
      ))}
    </>
  );
});
