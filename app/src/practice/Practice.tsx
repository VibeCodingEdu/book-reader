// מסך התרגול. מצבים (נבחרים בראש המסך ונשמרים בהגדרות המכשיר):
//  • הצגה: משפט עם רווח + רמז בעברית; נזכרים בראש, חושפים ומדרגים.
//  • הקלדה: אותו משפט, מקלידים את המילה (במקלדת, או בהכתבה של המקלדת) ומקבלים חיווי.
//  • עברית ← אנגלית: רק המשמעות בעברית; מקלידים את המילה באנגלית.
//  • אנגלית ← עברית: המילה בלי הקשר; בוחרים את התרגום מבין 4 (כשיש מספיק מילים, אחרת מדרגים בעצמכם).
//  • האזנה: רק השמעה של המילה; מקלידים מה ששמעתם.
// בכל המצבים הדירוג (שוב / קשה / טוב / קל) נכנס לאותו יומן ולאותו FSRS.
// אין AI ואין רשת (היומן מסונכרן ברקע).

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ReviewRating } from '../../../shared/review';
import type { SavedWord } from '../../../shared/words';
import type { PracticeMode } from '../deviceSettings';
import { Icon } from '../Icon';
import { tokenize } from '../paging';
import { unitOffsets } from '../savedWords';
import { speak, stopSpeaking, useSpeakingKey } from '../speech';
import { SpeakButton } from '../WordSheet';
import { checkAnswer, suggestedRating, type Verdict } from './answer';
import { pickChoices } from './choices';
import { formatInterval, previewIntervals } from './schedule';
import { usePractice } from './usePractice';

/** מילה שחוזרת בתוך פחות מזה – חוזרת עוד בסבב הנוכחי (שלבי הלמידה של דקה ו-10 דקות) */
const IN_SESSION_MS = 20 * 60_000;

const RATINGS: { r: ReviewRating; label: string; cls: string }[] = [
  { r: 1, label: 'שוב', cls: 'again' },
  { r: 2, label: 'קשה', cls: 'hard' },
  { r: 3, label: 'טוב', cls: 'good' },
  { r: 4, label: 'קל', cls: 'easy' },
];

const MODES: { id: PracticeMode; label: string }[] = [
  { id: 'reveal', label: 'הצגה' },
  { id: 'type', label: 'הקלדה' },
  { id: 'heen', label: 'עברית ← אנגלית' },
  { id: 'enhe', label: 'אנגלית ← עברית' },
  { id: 'listen', label: 'האזנה' },
];

const VERDICT: Record<Verdict, { icon: string; title: string; cls: string }> = {
  correct: { icon: '✓', title: 'נכון!', cls: 'ok' },
  close: { icon: '≈', title: 'כמעט – שגיאת כתיב', cls: 'near' },
  wrong: { icon: '✗', title: 'לא נכון', cls: 'bad' },
};

/** המשפט: היחידה מוסתרת (רווח) עד שחושפים, ואז מודגשת */
function Cloze({ w, revealed }: { w: SavedWord; revealed: boolean }) {
  const hide = useMemo(() => new Set(unitOffsets(w)), [w]);
  const toks = tokenize(w.sentence);
  return (
    <p class="cloze en" lang="en">
      {toks.map((t, i) => {
        if (!t.word || !hide.has(t.offset)) return t.text;
        return revealed ? (
          <mark key={i} class="cloze-word">
            {t.text}
          </mark>
        ) : (
          <span key={i} class="cloze-gap" aria-label="מילה חסרה">
            {' '.repeat(Math.max(3, Math.min(10, t.text.length)))}
          </span>
        );
      })}
    </p>
  );
}

/** מה שנחשב נכון: בהקשר (משפט) – הצורה שבמשפט; בלי הקשר – גם צורת המילון */
function accepted(w: SavedWord, inContext: boolean): { ok: string[]; near: string[] } {
  const lemma = w.lemma && w.lemma.toLowerCase() !== w.unit.toLowerCase() ? [w.lemma] : [];
  return inContext ? { ok: [w.unit], near: lemma } : { ok: [w.unit, ...lemma], near: [] };
}

/** כפתור השמעה גדול למצב האזנה: רגיל, ואיטי */
function ListenButtons({ text, id }: { text: string; id: string }) {
  const key = useSpeakingKey();
  return (
    <div class="listen-row">
      <button class="listen-btn" onClick={() => speak(text, `listen:${id}`)} aria-pressed={key === `listen:${id}`}>
        <Icon name="speak" size={28} />
        השמעה
      </button>
      <button class="secondary listen-slow" onClick={() => speak(text, `listen:${id}`, 0.55)}>
        לאט
      </button>
    </div>
  );
}

export function Practice({ newPerDay, mode, onMode, onBack }: {
  newPerDay: number;
  mode: PracticeMode;
  onMode: (m: PracticeMode) => void;
  onBack: () => void;
}) {
  const p = usePractice(newPerDay);
  /** סדר הסבב: נקבע פעם אחת כשהנתונים מוכנים; מילים בשלבי למידה חוזרות לסופו */
  const [order, setOrder] = useState<string[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  /** בחירה מבין 4 (אנגלית ← עברית): מזהה המילה שנבחרה */
  const [picked, setPicked] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const counts = useRef({ again: 0, total: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (order === null && p.ready) setOrder([...p.queue.due, ...p.queue.fresh].map((w) => w.id));
  }, [p.ready, order]);
  useEffect(() => () => stopSpeaking(), []);

  const byId = useMemo(() => new Map(p.words.items.map((w) => [w.id, w])), [p.words.items]);
  // מילה שנמחקה בינתיים – מדלגים
  const currentId = order?.find((id) => byId.has(id));
  const current = currentId ? byId.get(currentId)! : null;
  const wc = current ? p.cards.get(current.id) : undefined;
  const intervals = useMemo(
    () => (p.scheduler && wc ? previewIntervals(p.scheduler, wc, Date.now()) : null),
    [p.scheduler, wc, currentId],
  );

  /** אפשרויות הבחירה (אנגלית ← עברית); אם אין מספיק משמעויות שונות – מדרגים בעצמכם */
  const choices = useMemo(
    () => (mode === 'enhe' && current ? pickChoices(current, p.words.items) : null),
    [mode, current, p.words.items],
  );
  const typing = mode === 'type' || mode === 'heen' || mode === 'listen';
  const choosing = mode === 'enhe' && !!choices;

  /** התשובה נחשפה */
  const shown = typing || choosing ? verdict !== null : revealed;

  // כרטיס חדש או מצב חדש: מאפסים; בהקלדה מכוונים את הסמן לשדה (פותח את המקלדת); בהאזנה משמיעים
  useEffect(() => {
    setRevealed(false);
    setTyped('');
    setVerdict(null);
    setPicked(null);
    if (typing) setTimeout(() => inputRef.current?.focus(), 50);
    if (mode === 'listen' && current) setTimeout(() => speak(current.unit, `listen:${current.id}`), 250);
  }, [currentId, mode]);

  const check = () => {
    if (!current || verdict) return;
    const a = accepted(current, mode === 'type');
    setVerdict(checkAnswer(typed, a.ok, a.near));
    inputRef.current?.blur();
  };
  /** "לא זוכר": חושפים בלי לנחש, ומוצע "שוב" */
  const giveUp = () => {
    setTyped('');
    setVerdict('wrong');
    inputRef.current?.blur();
  };
  const choose = (id: string) => {
    if (!current || verdict) return;
    setPicked(id);
    setVerdict(id === current.id ? 'correct' : 'wrong');
  };

  const rate = (rating: ReviewRating) => {
    if (!current || !order) return;
    const next = p.rate(current, rating);
    const rest = order.filter((id) => id !== current.id);
    counts.current.total++;
    if (rating === 1) counts.current.again++;
    if (next && next.due - Date.now() < IN_SESSION_MS) rest.push(current.id);
    else setDone((d) => d + 1);
    setOrder(rest);
    stopSpeaking();
  };

  const suggested = verdict ? suggestedRating(verdict) : null;

  // מקלדת (מחשב): בהצגה – רווח/Enter לחשיפה; אחרי חשיפה – 1–4 לדירוג, ו-Enter מאשר את המוצע
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (!current) return;
      if (!shown && !typing && !choosing && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
      } else if (shown && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as ReviewRating);
      else if (shown && e.key === 'Enter' && suggested) {
        e.preventDefault();
        rate(suggested);
      } else if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const left = order ? order.filter((id) => byId.has(id)).length : 0;
  /** במצבים שבהם המשמעות לא מוצגת בשאלה – מציגים אותה עם התשובה */
  const meaningInAnswer = mode === 'enhe' || mode === 'listen';

  return (
    <main class="page practice-page">
      <div class="row top-row">
        <button class="icon-btn" onClick={onBack} aria-label="חזרה">
          <Icon name="back" />
        </button>
        <h1>תרגול</h1>
        <span class="spacer" />
        {order && (left > 0 || done > 0) && (
          <span class="muted practice-count" aria-live="polite">
            {done} הושלמו · {left} נשארו
          </span>
        )}
      </div>

      <div class="segmented practice-modes" role="group" aria-label="סוג התרגול">
        {MODES.map((m) => (
          <button key={m.id} aria-pressed={mode === m.id} onClick={() => onMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      {!order && <p class="muted">טוען…</p>}

      {order && !current && (
        <section class="card practice-done">
          {counts.current.total > 0 ? (
            <>
              <h2>סיימתם להיום</h2>
              <p>
                תרגלתם {done} {done === 1 ? 'מילה' : 'מילים'}
                {counts.current.again > 0 && ` · ${counts.current.again === 1 ? 'פעם אחת' : `${counts.current.again} פעמים`} "שוב"`}.
              </p>
            </>
          ) : p.words.items.length === 0 ? (
            <>
              <h2>עוד אין מילים לתרגול</h2>
              <p class="muted">בזמן הקריאה לוחצים על מילה ואז על "שמירת מילה". המילים השמורות יגיעו לכאן.</p>
            </>
          ) : (
            <>
              <h2>אין מה לתרגל כרגע</h2>
              <p class="muted">
                כל המילים מתוזמנות לימים הבאים
                {p.queue.newTotal > 0 && newPerDay > 0 && ' ומכסת המילים החדשות של היום נוצלה'}.
              </p>
            </>
          )}
          {p.queue.newTotal > 0 && newPerDay === 0 && <p class="muted small">מכסת המילים החדשות ביום היא 0 (בהגדרות).</p>}
          <button onClick={onBack}>חזרה</button>
        </section>
      )}

      {current && (
        <section class="card practice-card" key={current.id}>
          {/* ---------- השאלה ---------- */}
          {mode === 'heen' && (
            <>
              <p class="practice-ask">מהי המילה באנגלית?</p>
              <p class="practice-meaning">{current.meaning}</p>
              {current.pos && !shown && <p class="muted small">{current.pos}</p>}
              {shown && <Cloze w={current} revealed />}
            </>
          )}
          {mode === 'enhe' && (
            <>
              <p class="practice-ask">מה המשמעות?</p>
              <div class="word-head">
                <span class="practice-word en" lang="en">
                  {current.unit}
                </span>
                <SpeakButton text={current.unit} speakKey={`practice-q:${current.id}`} />
              </div>
              {shown && <Cloze w={current} revealed />}
            </>
          )}
          {mode === 'listen' && (
            <>
              <p class="practice-ask">הקשיבו והקלידו את המילה</p>
              <ListenButtons text={current.unit} id={current.id} />
              {shown && <Cloze w={current} revealed />}
            </>
          )}
          {(mode === 'reveal' || mode === 'type') && (
            <>
              <p class="practice-hint">
                <span class="muted">רמז: </span>
                {current.meaning}
              </p>
              <Cloze w={current} revealed={shown} />
            </>
          )}
          <p class="word-source">{current.bookTitle}</p>

          {/* ---------- קלט ---------- */}
          {typing && !verdict && (
            <form
              class="type-form"
              onSubmit={(e) => {
                e.preventDefault();
                check();
              }}
            >
              <input
                ref={inputRef}
                class="type-input en"
                type="text"
                lang="en"
                dir="ltr"
                value={typed}
                onInput={(e) => setTyped(e.currentTarget.value)}
                placeholder="הקלידו (או הכתיבו) את המילה"
                aria-label="התשובה באנגלית"
                autocapitalize="none"
                autocomplete="off"
                autocorrect="off"
                spellcheck={false}
                enterkeyhint="done"
              />
              <div class="row">
                <button type="submit" class="check-btn" disabled={!typed.trim()}>
                  בדיקה
                </button>
                <button type="button" class="secondary" onClick={giveUp}>
                  לא זוכר
                </button>
              </div>
            </form>
          )}

          {choosing && choices && (
            <ul class="choice-list" aria-label="בחרו את התרגום">
              {choices.map((c) => {
                const state = !verdict ? '' : c.id === current.id ? 'right' : c.id === picked ? 'wrong' : 'dim';
                return (
                  <li key={c.id}>
                    <button class={`choice ${state}`} disabled={!!verdict} onClick={() => choose(c.id)}>
                      {c.meaning}
                    </button>
                  </li>
                );
              })}
              {!verdict && (
                <li>
                  <button class="secondary choice-skip" onClick={giveUp}>
                    לא זוכר
                  </button>
                </li>
              )}
            </ul>
          )}

          {!typing && !choosing && !revealed && (
            <button class="reveal-btn" onClick={() => setRevealed(true)}>
              הצגת התשובה
            </button>
          )}

          {/* ---------- התשובה והדירוג ---------- */}
          {shown && (
            <div class="practice-answer reveal">
              {verdict && (typing || choosing) && (
                <div class={`verdict ${VERDICT[verdict].cls}`} role="status">
                  <span class="verdict-icon" aria-hidden="true">
                    {VERDICT[verdict].icon}
                  </span>
                  <span class="verdict-text">
                    <strong>{VERDICT[verdict].title}</strong>
                    {typing && verdict !== 'correct' && typed.trim() && (
                      <span class="verdict-typed">
                        {' '}
                        כתבתם: <span class="en" lang="en">{typed.trim()}</span>
                      </span>
                    )}
                  </span>
                </div>
              )}
              <div class="word-head">
                <span class="word-unit en" lang="en">
                  {current.unit}
                </span>
                {current.ipa && (
                  <span class="ipa-chip en" lang="en">
                    {current.ipa}
                  </span>
                )}
                <span class="spacer" />
                <SpeakButton text={current.unit} speakKey={`practice:${current.id}`} />
              </div>
              {meaningInAnswer && <p class="sheet-meaning">{current.meaning}</p>}
              {(current.pos || (current.lemma && current.lemma.toLowerCase() !== current.unit.toLowerCase())) && (
                <p class="sheet-meta">
                  {current.pos}
                  {current.lemma && current.lemma.toLowerCase() !== current.unit.toLowerCase() && (
                    <>
                      {current.pos && ' · '}
                      <span class="en" lang="en">
                        {current.lemma}
                      </span>
                    </>
                  )}
                </p>
              )}
              <p class="muted small rate-q">{suggested ? 'הציון המוצע מסומן. אפשר לשנות:' : 'כמה קל היה לזכור?'}</p>
              <div class="rate-row" role="group" aria-label="דירוג">
                {RATINGS.map(({ r, label, cls }) => (
                  <button key={r} class={`rate-btn ${cls} ${suggested === r ? 'suggested' : ''}`} onClick={() => rate(r)}>
                    <span class="rate-label">{label}</span>
                    {intervals && <span class="rate-when">{formatInterval(intervals[r])}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
