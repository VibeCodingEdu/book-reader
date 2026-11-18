// תוכן עניינים: פרקים (עם התקדמות), סימניות והערות. לחיצה קופצת לפרק או למשפט.

import { useState } from 'preact/hooks';
import { Icon } from '../Icon';
import { locateSentence, type Annotation } from '../../../shared/annotations';
import { parseSentenceId, type BookMeta } from '../../../shared/book';

type Tab = 'chapters' | 'bookmarks' | 'notes';

interface Props {
  book: BookMeta;
  chapterIdx: number | null;
  /** כמה מהפרק הנוכחי עבר (0–1) */
  fraction: number;
  annotations: Annotation[];
  parserVersion: number;
  onJumpChapter: (idx: number) => void;
  onJumpSentence: (sid: string) => void;
  onEditNote: (a: Annotation) => void;
  onRemove: (a: Annotation) => void;
  onClose: () => void;
}

export function TocSheet(props: Props) {
  const { book, chapterIdx, fraction, annotations, parserVersion } = props;
  const [tab, setTab] = useState<Tab>('chapters');
  const bookmarks = annotations.filter((a) => a.kind === 'bookmark');
  const notes = annotations.filter((a) => a.kind === 'note');

  /** איפה הרשומה: לפי מזהה (אותה גרסת פענוח); אחרת – לא ידוע עד שהפרק נטען */
  const where = (a: Annotation) => {
    const sid = locateSentence(a, parserVersion, []);
    const pos = sid ? parseSentenceId(sid) : null;
    return { sid, chapter: pos ? pos.c : parseSentenceId(a.sentenceId)?.c ?? null };
  };

  const jump = (a: Annotation) => {
    const w = where(a);
    // גרסת פענוח אחרת: קופצים לפרק המקורי; המשפט יאותר שם לפי הטקסט
    props.onJumpSentence(w.sid ?? a.sentenceId);
    props.onClose();
  };

  const chapterLabel = (idx: number | null) => (idx === null ? '' : book.chapterTitles[idx] ?? `פרק ${idx + 1}`);

  return (
    <div class="overlay" onClick={props.onClose}>
      <div class="sheet toc" role="dialog" aria-label="תוכן עניינים" onClick={(e) => e.stopPropagation()}>
        <div class="sheet-head">
          <h2>תוכן עניינים</h2>
          <span class="spacer" />
          <button class="icon-btn" aria-label="סגירה" onClick={props.onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div class="segmented three" role="tablist">
          <button role="tab" aria-pressed={tab === 'chapters'} onClick={() => setTab('chapters')}>
            פרקים
          </button>
          <button role="tab" aria-pressed={tab === 'bookmarks'} onClick={() => setTab('bookmarks')}>
            <span class="tab-ico">
              <Icon name="bookmark" size={18} />
              {bookmarks.length}
            </span>
          </button>
          <button role="tab" aria-pressed={tab === 'notes'} onClick={() => setTab('notes')}>
            <span class="tab-ico">
              <Icon name="note" size={18} />
              {notes.length}
            </span>
          </button>
        </div>

        {tab === 'chapters' && (
          <ul class="toc-list">
            {book.chapterTitles.map((t, i) => {
              const state = chapterIdx === null ? '' : i < chapterIdx ? '✓' : i === chapterIdx ? `${Math.round(fraction * 100)}%` : '';
              return (
                <li key={i}>
                  <button
                    class={`toc-row ${i === chapterIdx ? 'current' : ''}`}
                    onClick={() => {
                      props.onJumpChapter(i);
                      props.onClose();
                    }}
                  >
                    <span class="toc-title" dir="auto">
                      {t}
                    </span>
                    <span class="toc-state">{state}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {tab !== 'chapters' && (
          <ul class="toc-list">
            {(tab === 'bookmarks' ? bookmarks : notes).length === 0 && (
              <li class="muted toc-empty">
                {tab === 'bookmarks'
                  ? 'עוד אין סימניות. במצב לימוד, או בבועה של מילה, אפשר לסמן משפט.'
                  : 'עוד אין הערות. במצב לימוד, או בבועה של מילה, אפשר לכתוב הערה למשפט.'}
              </li>
            )}
            {(tab === 'bookmarks' ? bookmarks : notes).map((a) => {
              const w = where(a);
              return (
                <li key={a.id} class="toc-ann">
                  <button class="toc-row" onClick={() => jump(a)}>
                    <span class="toc-ann-body">
                      {a.kind === 'note' && <span class="toc-note" dir="auto">{a.text}</span>}
                      <span class="toc-excerpt en" lang="en" dir="ltr">
                        {a.excerpt}
                      </span>
                      <span class="muted small">
                        {chapterLabel(w.chapter)}
                        {!w.sid && ' · המיקום יאותר לפי הטקסט'}
                      </span>
                    </span>
                  </button>
                  <div class="toc-ann-actions">
                    {a.kind === 'note' && (
                      <button class="icon-btn" aria-label="עריכת ההערה" onClick={() => props.onEditNote(a)}>
                        <Icon name="note" />
                      </button>
                    )}
                    <button class="icon-btn" aria-label={a.kind === 'note' ? 'מחיקת ההערה' : 'הסרת הסימנייה'} onClick={() => props.onRemove(a)}>
                      <Icon name="trash" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
