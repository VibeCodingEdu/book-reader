// מצב קריאה (עמודים): עימוד, החלקה, נגיעה בשוליים ומקלדת, מעל החלקים המשותפים.

import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks';
import { WordSheet } from '../WordSheet';
import { Icon } from '../Icon';
import { ChapterText } from './SentenceText';
import type { ViewProps } from './viewProps';
import { usePagination } from './usePagination';
import { useSelection } from './useSelection';
import { useSentenceTranslations } from './useSentenceTranslations';

export function ReadingView({ book, settings, ch, clearRef, ann, onEditNote, percent }: ViewProps) {
  const pg = usePagination({
    chapter: ch.chapter,
    settings,
    targetRef: ch.targetRef,
    onPageChange: (anchor) => {
      clearRef.current();
      if (anchor) ch.savePosition(anchor);
    },
  });
  const selection = useSelection({ book, chapter: ch.chapter, settings, rootRef: pg.pagesRef });
  clearRef.current = selection.clear;
  const tr = useSentenceTranslations(book, ch.chapterIdx, settings);

  // סימניות והערות: סימון קטן בתחילת המשפט (ב-DOM, בלי לרנדר מחדש את הפרק ובלי להזיז את העימוד)
  const marks = useMemo(() => ann.marksFor(ch.chapterIdx, ch.chapter), [ann.marksFor, ch.chapterIdx, ch.chapter]);
  useEffect(() => {
    const el = pg.pagesRef.current;
    if (!el) return;
    el.querySelectorAll('[data-sid].has-bm, [data-sid].has-note').forEach((n) => n.classList.remove('has-bm', 'has-note'));
    for (const [sid, m] of marks) {
      const s = el.querySelector(`[data-sid="${sid}"]`);
      if (m.bookmark) s?.classList.add('has-bm');
      if (m.note) s?.classList.add('has-note');
    }
  }, [marks, ch.chapter, pg.dims]);

  // ---------- דפדוף ----------
  const next = useCallback(() => {
    if (!ch.canNavigate()) return; // עד שהפרק הבא נטען – מתעלמים מלחיצות
    if (!pg.nextPage()) ch.nextChapter();
  }, [pg.nextPage, ch.nextChapter]);

  const prev = useCallback(() => {
    if (!ch.canNavigate()) return;
    if (!pg.prevPage()) ch.prevChapterAtEnd();
  }, [pg.prevPage, ch.prevChapterAtEnd]);

  // מקלדת (מחשב)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        next();
      } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        prev();
      } else if (e.key === 'Escape') selection.clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  // ---------- נגיעות: החלקה ונגיעה בשוליים ----------
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const swiped = useRef(false);

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    swiped.current = false;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - s.t < 800) {
      swiped.current = true;
      if (dx < 0) next();
      else prev();
    }
  };

  const onClick = (e: MouseEvent) => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    if (selection.handleClick(e)) return; // מילה, או סוף לחיצה ארוכה
    // לא על מילה: נגיעה בשוליים מדפדפת
    if (selection.sel) {
      selection.clear();
      return;
    }
    const rect = pg.viewportRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (x < 0.3) prev();
    else if (x > 0.7) next();
  };

  // ---------- תצוגה ----------
  const { chapter, chapterIdx, error } = ch;
  const chapterTitle = chapterIdx !== null ? book.chapterTitles[chapterIdx] : '';

  return (
    <>
      <div
        class="viewport"
        ref={pg.viewportRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        {...selection.pressHandlers}
        onContextMenu={(e) => e.preventDefault()}
        onClick={onClick}
      >
        {error && (
          <div class="reader-msg">
            <p>{error}</p>
            <button onClick={() => chapterIdx !== null && ch.loadChapter(chapterIdx, { anchor: pg.anchorRef.current })}>
              לנסות שוב
            </button>
          </div>
        )}
        {!chapter && !error && <div class="reader-msg">טוען…</div>}
        {chapter && pg.dims && (
          <div ref={pg.pagesRef} class={`pages en ${settings.fontFamily}`} dir="ltr" lang={book.lang} style={pg.pagesStyle}>
            <h2 class="chapter-title">{chapter.title}</h2>
            <ChapterText chapter={chapter} chapterIdx={chapterIdx!} />
          </div>
        )}
      </div>

      <footer class="reader-foot" dir="ltr">
        <button class="nav-btn" onClick={prev} aria-label="עמוד קודם">
          <Icon name="chevronLeft" size={24} />
        </button>
        <div class="progress" dir="rtl" title={chapterTitle}>
          <div class="pbar" role="progressbar" aria-label="התקדמות בספר" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? 0}>
            <span style={{ width: `${percent ?? 0}%` }} />
          </div>
          <span class="progress-text">
            עמוד {pg.page + 1} מתוך {pg.pageCount}
            {percent !== null && ` · ${percent}%`}
          </span>
        </div>
        <button class="nav-btn" onClick={next} aria-label="עמוד הבא">
          <Icon name="chevronRight" size={24} />
        </button>
      </footer>

      {selection.sel && (
        <WordSheet
          sel={selection.sel}
          onClose={selection.clear}
          onTranslate={selection.translateNow}
          sentenceTr={selection.sel.kind === 'word' ? tr.get(selection.sel.sid) : undefined}
          onTranslateSentence={selection.sel.kind === 'word' ? () => tr.translateOne((selection.sel as { sid: string }).sid) : undefined}
          {...(selection.sel.kind === 'word'
            ? (() => {
                const sel = selection.sel;
                const m = marks.get(sel.sid);
                return {
                  sentenceMarks: { bookmarked: !!m?.bookmark, hasNote: !!m?.note },
                  onToggleBookmark: () => ann.toggleBookmark(sel.sid, sel.sentence, m?.bookmark),
                  onEditNote: () => onEditNote(sel.sid, sel.sentence, m?.note),
                };
              })()
            : {})}
        />
      )}
    </>
  );
}
