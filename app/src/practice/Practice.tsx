// מסך התרגול: המשפט המקורי עם רווח במקום המילה, רמז בעברית, "הצגת התשובה", ודירוג עצמי
// (שוב / קשה / טוב / קל). FSRS קובע מתי כל מילה תחזור. בלי AI ובלי רשת (היומן מסונכרן ברקע).

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ReviewRating } from '../../../shared/review';
import type { SavedWord } from '../../../shared/words';
import { Icon } from '../Icon';
import { tokenize } from '../paging';
import { unitOffsets } from '../savedWords';
import { stopSpeaking } from '../speech';
import { SpeakButton } from '../WordSheet';
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

export function Practice({ newPerDay, onBack }: { newPerDay: number; onBack: () => void }) {
  const p = usePractice(newPerDay);
  /** סדר הסבב: נקבע פעם אחת כשהנתונים מוכנים; מילים בשלבי למידה חוזרות לסופו */
  const [order, setOrder] = useState<string[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const counts = useRef({ again: 0, total: 0 });

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

  const rate = (rating: ReviewRating) => {
    if (!current || !order) return;
    const next = p.rate(current, rating);
    const rest = order.filter((id) => id !== current.id);
    counts.current.total++;
    if (rating === 1) counts.current.again++;
    if (next && next.due - Date.now() < IN_SESSION_MS) rest.push(current.id);
    else setDone((d) => d + 1);
    setOrder(rest);
    setRevealed(false);
    stopSpeaking();
  };

  // מקלדת (מחשב): רווח/Enter לחשיפה, 1–4 לדירוג
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (!current) return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as ReviewRating);
      else if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const left = order ? order.filter((id) => byId.has(id)).length : 0;

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
          <p class="practice-hint">
            <span class="muted">רמז: </span>
            {current.meaning}
          </p>
          <Cloze w={current} revealed={revealed} />
          <p class="word-source">{current.bookTitle}</p>

          {!revealed ? (
            <button class="reveal-btn" onClick={() => setRevealed(true)}>
              הצגת התשובה
            </button>
          ) : (
            <div class="practice-answer reveal">
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
              <p class="muted small rate-q">כמה קל היה לזכור?</p>
              <div class="rate-row" role="group" aria-label="דירוג">
                {RATINGS.map(({ r, label, cls }) => (
                  <button key={r} class={`rate-btn ${cls}`} onClick={() => rate(r)}>
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
