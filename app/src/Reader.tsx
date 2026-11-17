// מסך הספר – מצב קריאה (עמודים). מחבר את החלקים המשותפים (פרק ומיקום, בחירה ותרגום,
// סרגל עליון, טקסט) עם מה שייחודי לקריאה: עימוד, החלקה, נגיעה בשוליים ומקלדת.
// ב-M2 יתווסף לידו מצב לימוד שמשתמש באותם חלקים משותפים.

import { useCallback, useEffect, useRef } from 'preact/hooks';
import type { BookMeta } from '../../shared/book';
import type { DeviceSettings } from './deviceSettings';
import { ReaderHeader } from './reader/ReaderHeader';
import { ChapterText } from './reader/SentenceText';
import { useBookChapter } from './reader/useBookChapter';
import { usePagination } from './reader/usePagination';
import { useSelection } from './reader/useSelection';
import { WordSheet } from './WordSheet';

interface Props {
  book: BookMeta;
  settings: DeviceSettings;
  onBack: () => void;
  onOpenSettings: () => void;
}

export function Reader({ book, settings, onBack, onOpenSettings }: Props) {
  // clearRef: הבחירה נמחקת בטעינת פרק ובדפדוף; היא מוגדרת אחרי ה-hooks שצריכים אותה
  const clearRef = useRef<() => void>(() => {});
  const ch = useBookChapter(book, () => clearRef.current());
  const pg = usePagination({
    chapter: ch.chapter,
    settings,
    targetRef: ch.targetRef,
    onPageChange: (anchor) => {
      clearRef.current();
      if (anchor) ch.saver.save(anchor);
    },
  });
  const selection = useSelection({ book, chapter: ch.chapter, settings, rootRef: pg.pagesRef });
  clearRef.current = selection.clear;

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
    <div class="reader">
      <ReaderHeader
        book={book}
        chapterIdx={chapterIdx}
        onBack={onBack}
        onJumpToChapter={ch.jumpToChapter}
        onOpenSettings={onOpenSettings}
      />

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
          ‹
        </button>
        <div class="progress" dir="rtl">
          <span class="progress-chapter" dir="auto">
            {chapterTitle}
          </span>
          <span>
            עמוד {pg.page + 1} מתוך {pg.pageCount} · פרק {(chapterIdx ?? 0) + 1}/{book.chapterCount}
          </span>
        </div>
        <button class="nav-btn" onClick={next} aria-label="עמוד הבא">
          ›
        </button>
      </footer>

      {selection.sel && <WordSheet sel={selection.sel} onClose={selection.clear} onTranslate={selection.translateNow} />}
    </div>
  );
}
