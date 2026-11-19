// מצב לימוד: כל משפט בשורה משלו, עם כפתורים לידו. בטלפון גלילה רגילה; ב-E-ink
// כפתורי ▲/▼ שמזיזים מסך שלם בבת אחת (בלי תנועה). בשלב 2 יתווסף תרגום משפט ותרגום
// מקביל, ובשלב 3 סימניות והערות – לשורה כבר יש מקום לכפתורים שלהם.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { sentenceId } from '../../../shared/book';
import { stopSpeaking, toggleSpeak, useSpeakingKey } from '../speech';
import { WordSheet } from '../WordSheet';
import { Icon } from '../Icon';
import { SentenceSpan } from './SentenceText';
import { screenStep, topVisibleId, type RowBox } from './studyAnchor';
import type { ParallelMode } from '../deviceSettings';
import { saveProps } from './saveProps';
import { useSavedMarks } from './useSavedMarks';
import type { ChapterInfoResponse } from '../../../shared/translate';
import { useSelection } from './useSelection';
import { useSentenceTranslations, type SentenceTr } from './useSentenceTranslations';
import type { ViewProps } from './viewProps';

const PARALLEL_NEXT: Record<ParallelMode, ParallelMode> = { off: 'show', show: 'hide', hide: 'off' };
const PARALLEL_LABEL: Record<ParallelMode, string> = { off: 'כבוי', show: 'גלוי', hide: 'מוסתר' };

export function StudyView({ book, settings, ch, clearRef, followRef, onPatchSettings, ann, words, onEditNote, percent }: ViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selection = useSelection({ book, chapter: ch.chapter, settings, rootRef: listRef, savedIndex: words.index });
  useSavedMarks(listRef, ch.chapter, words.index);
  clearRef.current = selection.clear;
  // הקראה: גוללים למשפט המוקרא כשעוברים למשפט חדש
  followRef.current = (el, newSentence) => {
    if (!newSentence) return;
    const row = el.closest<HTMLElement>('[data-row]');
    if (!row) return;
    const still = document.documentElement.dataset.theme === 'eink' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    row.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  };
  const { chapter, chapterIdx, error } = ch;
  const speaking = useSpeakingKey();
  const marks = useMemo(() => ann.marksFor(chapterIdx, chapter), [ann.marksFor, chapterIdx, chapter]);
  // יציאה ממצב לימוד או מעבר פרק – עוצרים השמעה של משפט
  useEffect(() => () => stopSpeaking(), [chapterIdx]);

  // ---------- תרגום משפטים ----------
  const tr = useSentenceTranslations(book, chapterIdx, settings);
  const parallel = settings.parallel;
  // 🌐 – משפטים שפתחת ידנית; "מוסתר" – משפטים שחשפת בנגיעה. מתאפסים בכל פרק.
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  // המשפט הפעיל – רק לידו מוצגים הכפתורים (שאר השורות נקיות, הטקסט ברוחב מלא)
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    setOpened(new Set());
    setRevealed(new Set());
    setActive(null);
  }, [chapterIdx]);
  // תרגום מקביל פעיל – מביאים את כל הפרק (פעם אחת לפרק)
  useEffect(() => {
    if (parallel !== 'off' && chapter && tr.chapterState === 'idle') tr.requestChapter();
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
    ch.savePosition(id);
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

  /** כפתורי סימנייה/הערה בבועה של מילה – על המשפט שלה */
  const sheetAnnProps = (sel: typeof selection.sel) => {
    if (!sel || sel.kind !== 'word') return {};
    const m = marks.get(sel.sid);
    return {
      sentenceMarks: { bookmarked: !!m?.bookmark, hasNote: !!m?.note },
      onToggleBookmark: () => ann.toggleBookmark(sel.sid, sel.sentence, m?.bookmark),
      onEditNote: () => onEditNote(sel.sid, sel.sentence, m?.note),
    };
  };

  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.study-actions, .study-tr, .study-tr-hidden')) return;
    // נגיעה בשורה (גם במילה) הופכת אותה לפעילה
    const row = target.closest<HTMLElement>('[data-row]');
    if (row) setActive(row.dataset.row!);
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
                <Icon name="chevronUp" size={18} />
                לפרק הקודם
              </button>
            )}
            <h2 class="chapter-title en" dir="auto">
              {chapter.title}
            </h2>
            {active === null && <p class="study-hint">נגיעה במשפט מציגה את הכלים שלו: תרגום, השמעה, סימנייה והערה.</p>}
            {chapter.paragraphs.map((para, pi) => (
              <div class="study-para" key={pi}>
                {para.map((text, si) => {
                  const sid = sentenceId(chapterIdx, pi, si);
                  return (
                    <div class={`study-row ${active === sid ? 'active' : ''}`} data-row={sid} key={si}>
                      <div class="study-line" dir="ltr">
                        <div class="study-text en" lang={book.lang}>
                          <SentenceSpan sid={sid} text={text} />
                        </div>
                        {active !== sid && (marks.get(sid)?.bookmark || marks.get(sid)?.note || opened.has(sid)) && (
                          <span class="row-marks" aria-hidden="true">
                            {marks.get(sid)?.bookmark && <Icon name="bookmark" size={14} />}
                            {marks.get(sid)?.note && <Icon name="note" size={14} />}
                          </span>
                        )}
                      </div>
                      {active === sid && (
                        <div class="study-actions" dir="rtl">
                          {/* כשהתרגום המקביל פעיל, התרגום כבר מוצג או נחשף בשורה "הצג תרגום" */}
                          {parallel === 'off' && (
                            <button class="act" aria-pressed={opened.has(sid)} onClick={() => toggleOpen(sid)}>
                              <Icon name="translate" size={18} />
                              תרגום
                            </button>
                          )}
                          <button class="act" aria-pressed={speaking === sid} onClick={() => toggleSpeak(text, sid)}>
                            <Icon name={speaking === sid ? 'stop' : 'speak'} size={18} />
                            {speaking === sid ? 'עצירה' : 'השמעה'}
                          </button>
                          <button
                            class="act"
                            aria-pressed={!!marks.get(sid)?.bookmark}
                            onClick={() => ann.toggleBookmark(sid, text, marks.get(sid)?.bookmark)}
                          >
                            <Icon name="bookmark" size={18} />
                            {marks.get(sid)?.bookmark ? 'מסומן' : 'סימנייה'}
                          </button>
                          <button class="act" aria-pressed={!!marks.get(sid)?.note} onClick={() => onEditNote(sid, text, marks.get(sid)?.note)}>
                            <Icon name="note" size={18} />
                            הערה
                          </button>
                        </div>
                      )}
                      <TranslationLine
                        tr={tr.get(sid)}
                        visible={parallel === 'show' || opened.has(sid) || (parallel === 'hide' && revealed.has(sid))}
                        hidden={parallel === 'hide' && !revealed.has(sid) && !opened.has(sid)}
                        onReveal={() => reveal(sid)}
                        onHide={parallel === 'hide' && revealed.has(sid) ? () => reveal(sid) : undefined}
                        onRetry={() => tr.translateOne(sid)}
                        pending={parallel !== 'off' && (tr.chapterState === 'idle' || tr.chapterState === 'checking')}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
            {hasNext && (
              <button class="chapter-nav" onClick={() => ch.nextChapter()}>
                לפרק הבא
                <Icon name="chevronDown" size={18} />
              </button>
            )}
          </>
        )}
      </div>

      <footer class="reader-foot study-foot">
        <button class="nav-btn" onClick={() => scrollScreen(-1)} aria-label="מסך למעלה">
          <Icon name="chevronUp" size={24} />
        </button>
        <div class="progress" title={chapterTitle}>
          <div class="pbar" role="progressbar" aria-label="התקדמות בספר" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? 0}>
            <span style={{ width: `${percent ?? 0}%` }} />
          </div>
          <button
            class="parallel-btn"
            aria-pressed={parallel !== 'off'}
            aria-label={`תרגום מקביל: ${PARALLEL_LABEL[parallel]}`}
            onClick={() => onPatchSettings({ parallel: PARALLEL_NEXT[parallel] })}
          >
            <Icon name="translate" size={16} />
            תרגום מקביל: {PARALLEL_LABEL[parallel]}
            {percent !== null && <span class="muted"> · {percent}%</span>}
          </button>
        </div>
        <button class="nav-btn" onClick={() => scrollScreen(1)} aria-label="מסך למטה">
          <Icon name="chevronDown" size={24} />
        </button>
      </footer>

      {parallel !== 'off' && tr.chapterState === 'confirm' && tr.chapterInfo && (
        <BigChapterNotice
          info={tr.chapterInfo}
          onConfirm={() => tr.loadChapter()}
          onCancel={() => onPatchSettings({ parallel: 'off' })}
        />
      )}

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
          {...sheetAnnProps(selection.sel)}
          {...saveProps(selection.sel, words, book)}
        />
      )}
    </>
  );
}

/** פרק גדול: לפני שמתרגמים אותו כולו, אומרים כמה זה עולה ומבקשים אישור */
function BigChapterNotice({ info, onConfirm, onCancel }: { info: ChapterInfoResponse; onConfirm: () => void; onCancel: () => void }) {
  const n = (x: number) => x.toLocaleString('he-IL');
  const pct = info.quota ? Math.max(1, Math.round((info.chars / info.quota.limit) * 100)) : null;
  return (
    <div class="tr-confirm" role="alertdialog" aria-label="תרגום פרק גדול">
      <p class="tr-confirm-title">הפרק הזה גדול</p>
      <p>
        תרגום מקביל מתרגם את כל הפרק בבת אחת: <strong>{n(info.chars)} תווים</strong>
        {info.engine === 'google-nmt' && pct !== null && <> ({pct}% מהמכסה החינמית החודשית של גוגל)</>}.
      </p>
      {info.fallback && (
        <p class="muted small">
          המכסה החינמית של גוגל לחודש הזה כמעט נגמרה, ולכן התרגום יבוצע ב-Gemini. עלות משוערת: כ-{info.estimateUsd.toFixed(2)}$.
        </p>
      )}
      <div class="row">
        <button onClick={onConfirm}>תרגום הפרק</button>
        <button class="secondary" onClick={onCancel}>
          לא עכשיו
        </button>
      </div>
    </div>
  );
}

/** שורת התרגום מתחת למשפט */
function TranslationLine(props: {
  tr: SentenceTr | undefined;
  visible: boolean;
  hidden: boolean;
  onReveal: () => void;
  onHide?: () => void;
  /** תרגום של המשפט הזה לבד (כשהוא חסר בתרגום הפרק, או נכשל) */
  onRetry: () => void;
  /** תרגום הפרק עומד להתחיל – מציגים "מתרגם…" ולא כפתור (בלי הבהוב ב-E-ink) */
  pending: boolean;
}) {
  const { tr, visible, hidden } = props;
  if (hidden) {
    return (
      <button class="study-tr-hidden" onClick={props.onReveal}>
        <Icon name="eye" size={14} />
        הצג תרגום
      </button>
    );
  }
  if (!visible) return null;
  if (tr?.state === 'loading' || (!tr && props.pending)) return <div class="study-tr muted" role="status">מתרגם…</div>;
  if (!tr || tr.state === 'error') {
    // הפרק תורגם אבל המשפט הזה חסר בו, או שהתרגום נכשל
    return (
      <button class="study-tr-hidden retry" onClick={props.onRetry}>
        {tr?.state === 'error' ? `${tr.error} · נסה שוב` : 'לא תורגם · נסה שוב'}
      </button>
    );
  }
  return (
    <div class="study-tr" dir="rtl" lang="he" aria-live="polite" onClick={props.onHide} role={props.onHide ? 'button' : undefined}>
      {tr.text}
    </div>
  );
}
