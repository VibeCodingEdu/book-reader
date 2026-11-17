// מצב לימוד: כל משפט בשורה משלו, עם כפתורים לידו. בטלפון גלילה רגילה; ב-E-ink
// כפתורי ▲/▼ שמזיזים מסך שלם בבת אחת (בלי תנועה). בשלב 2 יתווסף תרגום משפט ותרגום
// מקביל, ובשלב 3 סימניות והערות – לשורה כבר יש מקום לכפתורים שלהם.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { sentenceId } from '../../../shared/book';
import { speak, WordSheet } from '../WordSheet';
import { SentenceSpan } from './SentenceText';
import { screenStep, topVisibleId, type RowBox } from './studyAnchor';
import type { ParallelMode } from '../deviceSettings';
import { useSelection } from './useSelection';
import { useSentenceTranslations, type SentenceTr } from './useSentenceTranslations';
import type { ViewProps } from './viewProps';

const PARALLEL_NEXT: Record<ParallelMode, ParallelMode> = { off: 'show', show: 'hide', hide: 'off' };
const PARALLEL_LABEL: Record<ParallelMode, string> = { off: 'כבוי', show: 'גלוי', hide: 'מוסתר' };

export function StudyView({ book, settings, ch, clearRef, onPatchSettings }: ViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selection = useSelection({ book, chapter: ch.chapter, settings, rootRef: listRef });
  clearRef.current = selection.clear;
  const { chapter, chapterIdx, error } = ch;

  // ---------- תרגום משפטים ----------
  const tr = useSentenceTranslations(book, chapterIdx, settings);
  const parallel = settings.parallel;
  // 🌐 – משפטים שפתחת ידנית; "מוסתר" – משפטים שחשפת בנגיעה. מתאפסים בכל פרק.
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  useEffect(() => {
    setOpened(new Set());
    setRevealed(new Set());
  }, [chapterIdx]);
  // תרגום מקביל פעיל – מביאים את כל הפרק (פעם אחת לפרק)
  useEffect(() => {
    if (parallel !== 'off' && chapter && tr.chapterState === 'idle') tr.loadChapter();
  }, [parallel, chapter, tr.chapterState]);

  const toggleSet = (set: Set<string>, sid: string) => {
    const n = new Set(set);
    if (n.has(sid)) n.delete(sid);
    else n.add(sid);
    return n;
  };
  const toggleOpen = (sid: string) => {
    const willOpen = !opened.has(sid);
    setOpened(toggleSet(opened, sid));
    if (willOpen && !tr.get(sid)) tr.translateOne(sid);
  };
  const reveal = (sid: string) => {
    setRevealed(toggleSet(revealed, sid));
    if (!tr.get(sid)) tr.translateOne(sid);
  };

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
    if ((e.target as HTMLElement).closest('.study-actions, .study-tr, .study-tr-hidden')) return;
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
                    <div class="study-row" data-row={sid} key={si}>
                      <div class="study-line" dir="ltr">
                        <div class="study-text en" lang={book.lang}>
                          <SentenceSpan sid={sid} text={text} />
                        </div>
                        <div class="study-actions">
                          <button
                            class="icon-btn"
                            aria-label="תרגום המשפט"
                            aria-pressed={opened.has(sid)}
                            onClick={() => toggleOpen(sid)}
                          >
                            🌐
                          </button>
                          <button class="icon-btn" aria-label="השמעת המשפט" onClick={() => speak(text)}>
                            🔊
                          </button>
                        </div>
                      </div>
                      <TranslationLine
                        tr={tr.get(sid)}
                        visible={parallel === 'show' || opened.has(sid) || (parallel === 'hide' && revealed.has(sid))}
                        hidden={parallel === 'hide' && !revealed.has(sid) && !opened.has(sid)}
                        onReveal={() => reveal(sid)}
                        onHide={parallel === 'hide' && revealed.has(sid) ? () => reveal(sid) : undefined}
                      />
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
          <button
            class="parallel-btn"
            aria-label={`תרגום מקביל: ${PARALLEL_LABEL[parallel]}`}
            onClick={() => onPatchSettings({ parallel: PARALLEL_NEXT[parallel] })}
          >
            🌐 תרגום מקביל: {PARALLEL_LABEL[parallel]}
          </button>
        </div>
        <button class="nav-btn" onClick={() => scrollScreen(1)} aria-label="מסך למטה">
          ▼
        </button>
      </footer>

      {parallel !== 'off' && tr.chapterState === 'error' && (
        <div class="tr-error" role="alert">
          {tr.chapterError}{' '}
          <button class="secondary" onClick={() => tr.loadChapter()}>
            לנסות שוב
          </button>
        </div>
      )}

      {selection.sel && (
        <WordSheet
          sel={selection.sel}
          onClose={selection.clear}
          onTranslate={selection.translateNow}
          sentenceTr={selection.sel.kind === 'word' ? tr.get(selection.sel.sid) : undefined}
          onTranslateSentence={selection.sel.kind === 'word' ? () => tr.translateOne((selection.sel as { sid: string }).sid) : undefined}
        />
      )}
    </>
  );
}

/** שורת התרגום מתחת למשפט */
function TranslationLine(props: {
  tr: SentenceTr | undefined;
  visible: boolean;
  hidden: boolean;
  onReveal: () => void;
  onHide?: () => void;
}) {
  const { tr, visible, hidden } = props;
  if (hidden) {
    return (
      <button class="study-tr-hidden" onClick={props.onReveal}>
        הצג תרגום
      </button>
    );
  }
  if (!visible) return null;
  if (!tr || tr.state === 'loading') return <div class="study-tr muted">מתרגם…</div>;
  if (tr.state === 'error') return <div class="study-tr msg bad">{tr.error}</div>;
  return (
    <div class="study-tr" dir="rtl" lang="he" onClick={props.onHide} role={props.onHide ? 'button' : undefined}>
      {tr.text}
    </div>
  );
}
