// מצב לימוד: כל משפט בשורה משלו, עם כפתורים לידו. בטלפון גלילה רגילה; ב-E-ink
// כפתורי ▲/▼ שמזיזים מסך שלם בבת אחת (בלי תנועה). בשלב 2 יתווסף תרגום משפט ותרגום
// מקביל, ובשלב 3 סימניות והערות – לשורה כבר יש מקום לכפתורים שלהם.

import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { sentenceId } from '../../../shared/book';
import { speak, WordSheet } from '../WordSheet';
import { SentenceSpan } from './SentenceText';
import { screenStep, topVisibleId, type RowBox } from './studyAnchor';
import { useSelection } from './useSelection';
import type { ViewProps } from './viewProps';

export function StudyView({ book, settings, ch, clearRef }: ViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selection = useSelection({ book, chapter: ch.chapter, settings, rootRef: listRef });
  clearRef.current = selection.clear;
  const { chapter, chapterIdx, error } = ch;

  // המשפט העליון במסך (העוגן). מתעדכן בגלילה, ונשמר כמיקום הקריאה.
  const topRef = useRef<string | null>(null);

  const rowBoxes = (): RowBox[] => {
    const list = listRef.current!;
    const base = list.getBoundingClientRect().top - list.scrollTop;
    return Array.from(list.querySelectorAll<HTMLElement>('[data-row]')).map((r) => {
      const b = r.getBoundingClientRect();
      return { id: r.dataset.row!, top: b.top - base, bottom: b.bottom - base };
    });
  };

  /** גלילה כך שהמשפט יהיה בראש המסך (או לסוף הפרק) */
  const scrollToTarget = () => {
    const list = listRef.current;
    if (!list || !chapter) return;
    const t = ch.targetRef.current;
    if ('end' in t) {
      list.scrollTop = list.scrollHeight;
      return;
    }
    const row = t.anchor ? list.querySelector<HTMLElement>(`[data-row="${t.anchor}"]`) : null;
    const box = row ? rowBoxes().find((b) => b.id === t.anchor) : null;
    list.scrollTop = box ? Math.max(0, box.top - 4) : 0;
    topRef.current = t.anchor;
  };

  // אחרי טעינת פרק או שינוי בגודל הגופן – חוזרים לאותו משפט
  useLayoutEffect(() => {
    scrollToTarget();
    // בטעינה לסוף פרק ("הקודם" בתחילת פרק) – העוגן הוא המשפט שבראש המסך
    if ('end' in ch.targetRef.current) updateTop();
  }, [chapter, settings.fontSize, settings.fontFamily, settings.lineHeight, settings.margin]);

  const updateTop = () => {
    const list = listRef.current;
    if (!list) return;
    const id = topVisibleId(rowBoxes(), list.scrollTop);
    if (!id || id === topRef.current) return;
    topRef.current = id;
    ch.targetRef.current = { anchor: id }; // מעבר למצב קריאה ייפתח על המשפט הזה
    ch.saver.save(id);
  };

  // גלילה: עדכון העוגן לכל היותר פעם ב-100ms. טיימר רגיל ולא requestAnimationFrame,
  // שהדפדפן משהה כשהחלון ברקע או במצב חיסכון.
  // המאזין מחובר ישירות לרשימה: אירוע scroll לא "מבעבע" למעלה, ו-Preact מאזין לאירועים
  // בשורש הדף – לכן onScroll רגיל ב-JSX לא נקרא בגלילה אמיתית.
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const updateTopRef = useRef(updateTop);
  updateTopRef.current = updateTop;
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const onScroll = () => {
      if (scrollTimer.current) return;
      scrollTimer.current = setTimeout(() => {
        scrollTimer.current = undefined;
        updateTopRef.current();
      }, 100);
    };
    list.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      list.removeEventListener('scroll', onScroll);
      clearTimeout(scrollTimer.current);
    };
  }, []);

  // ▲/▼: מסך שלם בבת אחת (ב-E-ink בלי אנימציה בכלל)
  const lineHeightPx = settings.fontSize * settings.lineHeight;
  const scrollScreen = (dir: 1 | -1) => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop += dir * screenStep(list.clientHeight, lineHeightPx);
    updateTop();
  };

  // מקלדת (מחשב)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (['ArrowDown', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        scrollScreen(1);
      } else if (['ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        scrollScreen(-1);
      } else if (e.key === 'Escape') selection.clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.study-actions')) return;
    if (selection.handleClick(e)) return;
    if (selection.sel) selection.clear();
  };

  const chapterTitle = chapterIdx !== null ? book.chapterTitles[chapterIdx] : '';
  const hasPrev = chapterIdx !== null && chapterIdx > 0;
  const hasNext = chapterIdx !== null && chapterIdx + 1 < book.chapterCount;

  return (
    <>
      <div
        ref={listRef}
        class={`study-list ${settings.fontFamily}`}
        style={{ fontSize: `${settings.fontSize}px`, lineHeight: String(settings.lineHeight), padding: `8px ${settings.margin}px 24px` }}
        {...selection.pressHandlers}
        onContextMenu={(e) => e.preventDefault()}
        onClick={onClick}
      >
        {error && (
          <div class="reader-msg">
            <p>{error}</p>
            <button onClick={() => chapterIdx !== null && ch.loadChapter(chapterIdx, { anchor: topRef.current })}>לנסות שוב</button>
          </div>
        )}
        {!chapter && !error && <div class="reader-msg">טוען…</div>}
        {chapter && chapterIdx !== null && (
          <>
            {hasPrev && (
              <button class="secondary chapter-nav" onClick={() => ch.prevChapterAtEnd()}>
                ‹ לפרק הקודם
              </button>
            )}
            <h2 class="chapter-title en" dir="auto">
              {chapter.title}
            </h2>
            {chapter.paragraphs.map((para, pi) => (
              <div class="study-para" key={pi}>
                {para.map((text, si) => {
                  const sid = sentenceId(chapterIdx, pi, si);
                  return (
                    <div class="study-row" data-row={sid} key={si} dir="ltr">
                      <div class="study-text en" lang={book.lang}>
                        <SentenceSpan sid={sid} text={text} />
                      </div>
                      <div class="study-actions">
                        <button class="icon-btn" aria-label="השמעת המשפט" onClick={() => speak(text)}>
                          🔊
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {hasNext && (
              <button class="chapter-nav" onClick={() => ch.nextChapter()}>
                לפרק הבא ›
              </button>
            )}
          </>
        )}
      </div>

      <footer class="reader-foot study-foot">
        <button class="nav-btn" onClick={() => scrollScreen(-1)} aria-label="מסך למעלה">
          ▲
        </button>
        <div class="progress">
          <span class="progress-chapter" dir="auto">
            {chapterTitle}
          </span>
          <span>
            מצב לימוד · פרק {(chapterIdx ?? 0) + 1}/{book.chapterCount}
          </span>
        </div>
        <button class="nav-btn" onClick={() => scrollScreen(1)} aria-label="מסך למטה">
          ▼
        </button>
      </footer>

      {selection.sel && <WordSheet sel={selection.sel} onClose={selection.clear} onTranslate={selection.translateNow} />}
    </>
  );
}
