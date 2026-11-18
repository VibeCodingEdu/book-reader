// "המילים שלי": רשימת המילים השמורות – חיפוש, מיון, סינון לפי ספר ושלב, עריכת תרגום, שינוי שלב ומחיקה.

import { useMemo, useState } from 'preact/hooks';
import { STAGE_LABEL, STAGES, type SavedWord, type WordStage } from '../../shared/words';
import { stripNiqqud } from '../../shared/translate';
import { Icon } from './Icon';
import { tokenize } from './paging';
import { SpeakButton } from './WordSheet';
import { useWords } from './useWords';
import { buildAnkiCsv, downloadCsv } from './anki';

type Sort = 'recent' | 'alpha' | 'stage';
const SORT_KEY = 'words.sort';
const STAGE_RANK: Record<WordStage, number> = { new: 0, learning: 1, known: 2 };

const readSort = (): Sort => {
  try {
    const v = localStorage.getItem(SORT_KEY);
    if (v === 'recent' || v === 'alpha' || v === 'stage') return v;
  } catch {
    /* ignore */
  }
  return 'recent';
};

/** המשפט עם היחידה שנשמרה מודגשת: מחפשים את המילים של היחידה בחלון קטן סביב המיקום השמור */
function SentenceMarked({ w }: { w: SavedWord }) {
  const toks = tokenize(w.sentence);
  const want = new Set(w.unit.toLowerCase().split(/\s+/).map((x) => x.replace(/[^\w'’-]/g, '')));
  const words = toks.filter((t) => t.word);
  const at = words.findIndex((t) => t.offset === w.wordOffset);
  const marked = new Set<number>();
  if (at >= 0) {
    for (let i = Math.max(0, at - 3); i <= Math.min(words.length - 1, at + 3); i++) {
      if (i === at || want.has(words[i].text.toLowerCase())) marked.add(words[i].offset);
    }
  }
  return (
    <p class="word-sentence en" lang="en">
      {toks.map((t) => (marked.has(t.offset) ? <mark key={t.offset}>{t.text}</mark> : t.text))}
    </p>
  );
}

function WordRow({ w, onStage, onSaveMeaning, onDelete, onOpenSentence }: {
  w: SavedWord;
  onStage: (s: WordStage) => void;
  onSaveMeaning: (m: string) => void;
  onDelete: () => void;
  onOpenSentence: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(w.meaning);
  const [confirm, setConfirm] = useState(false);
  return (
    <li class="word-row card">
      <div class="word-head">
        <span class={`stage-dot sv-${w.stage}`} aria-hidden="true" />
        <span class="word-unit en" lang="en">{w.unit}</span>
        {w.ipa && <span class="ipa-chip en" lang="en">{w.ipa}</span>}
        <span class="spacer" />
        <SpeakButton text={w.unit} speakKey={`words:${w.id}`} />
      </div>
      {w.lemma && w.lemma.toLowerCase() !== w.unit.toLowerCase() && (
        <p class="sheet-meta">
          {w.pos && <span>{w.pos} · </span>}
          <span class="en" lang="en">{w.lemma}</span>
        </p>
      )}
      {editing ? (
        <form
          class="row word-edit"
          onSubmit={(e) => {
            e.preventDefault();
            const m = draft.trim();
            if (m) onSaveMeaning(m);
            setEditing(false);
          }}
        >
          <input value={draft} onInput={(e) => setDraft(e.currentTarget.value)} maxLength={500} aria-label="עריכת התרגום" autoFocus />
          <button type="submit">שמירה</button>
          <button type="button" class="secondary" onClick={() => { setDraft(w.meaning); setEditing(false); }}>ביטול</button>
        </form>
      ) : (
        <p class="sheet-meaning">
          {w.meaning}
          <button class="icon-btn" aria-label="עריכת התרגום" onClick={() => { setDraft(w.meaning); setEditing(true); }}>
            <Icon name="note" size={16} />
          </button>
        </p>
      )}
      <SentenceMarked w={w} />
      <p class="word-source">
        <button class="link-btn" onClick={onOpenSentence}>
          {w.bookTitle} · למשפט בספר
        </button>
      </p>
      <div class="row word-actions">
        <label class="stage-pick">
          <span class="visually-hidden">שלב</span>
          <select value={w.stage} onChange={(e) => onStage(e.currentTarget.value as WordStage)}>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
        </label>
        <span class="spacer" />
        {confirm ? (
          <>
            <button class="secondary" onClick={() => setConfirm(false)}>ביטול</button>
            <button class="danger" onClick={onDelete}>למחוק?</button>
          </>
        ) : (
          <button class="icon-btn" aria-label="מחיקת המילה" onClick={() => setConfirm(true)}>
            <Icon name="trash" size={18} />
          </button>
        )}
      </div>
    </li>
  );
}

export function Words({ onBack, onPractice, onOpenSentence }: {
  onBack: () => void;
  onPractice: () => void;
  onOpenSentence: (bookId: string, sid: string) => void;
}) {
  const words = useWords();
  const [q, setQ] = useState('');
  const [sort, setSortState] = useState<Sort>(readSort);
  const [book, setBook] = useState('');
  const [stage, setStage] = useState<WordStage | ''>('');
  const setSort = (s: Sort) => {
    setSortState(s);
    try {
      localStorage.setItem(SORT_KEY, s);
    } catch {
      /* ignore */
    }
  };

  const books = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of words.items) m.set(w.bookId, w.bookTitle);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'en', { sensitivity: 'base' }));
  }, [words.items]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = words.items.filter((w) => {
      if (book && w.bookId !== book) return false;
      if (stage && w.stage !== stage) return false;
      if (!s) return true;
      return (
        w.unit.toLowerCase().includes(s) ||
        w.lemma.toLowerCase().includes(s) ||
        stripNiqqud(w.meaning).includes(stripNiqqud(s)) ||
        w.sentence.toLowerCase().includes(s)
      );
    });
    list = [...list];
    if (sort === 'recent') list.sort((a, b) => b.createdAt - a.createdAt);
    else if (sort === 'alpha') list.sort((a, b) => a.unit.localeCompare(b.unit, 'en', { sensitivity: 'base' }));
    else list.sort((a, b) => STAGE_RANK[a.stage] - STAGE_RANK[b.stage] || b.createdAt - a.createdAt);
    return list;
  }, [words.items, q, sort, book, stage]);

  const counts = useMemo(() => {
    const c: Record<WordStage, number> = { new: 0, learning: 0, known: 0 };
    for (const w of words.items) c[w.stage]++;
    return c;
  }, [words.items]);

  return (
    <main class="page words-page">
      <div class="row top-row">
        <button class="icon-btn" onClick={onBack} aria-label="חזרה לספרייה">
          <Icon name="back" />
        </button>
        <h1>המילים שלי</h1>
        <span class="muted">{words.items.length}</span>
        <span class="spacer" />
        {words.items.length > 0 && (
          <button class="secondary practice-btn" onClick={onPractice}>
            <Icon name="star" size={18} />
            תרגול
          </button>
        )}
      </div>

      {words.loaded && words.items.length === 0 ? (
        <section class="card empty-words">
          <p>עוד לא שמרתם מילים.</p>
          <p class="muted">בזמן הקריאה לוחצים על מילה, ואחרי שהתרגום מגיע לוחצים על "שמירת מילה". המילים השמורות יסומנו בטקסט בכל הספרים.</p>
        </section>
      ) : (
        <>
          <div class="word-tools">
            <label class="search-field">
              <Icon name="search" size={18} />
              <input type="search" value={q} onInput={(e) => setQ(e.currentTarget.value)} placeholder="חיפוש באנגלית או בעברית" aria-label="חיפוש מילים" />
            </label>
            <div class="row">
              <select class="sort-select" aria-label="מיון" value={sort} onChange={(e) => setSort(e.currentTarget.value as Sort)}>
                <option value="recent">נוספו לאחרונה</option>
                <option value="alpha">א-ב</option>
                <option value="stage">לפי שלב</option>
              </select>
              {books.length > 1 && (
                <select class="sort-select" aria-label="סינון לפי ספר" value={book} onChange={(e) => setBook(e.currentTarget.value)}>
                  <option value="">כל הספרים</option>
                  {books.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
                </select>
              )}
            </div>
            <div class="row" role="group" aria-label="סינון לפי שלב">
              <button class="chip" aria-pressed={stage === ''} onClick={() => setStage('')}>הכול</button>
              {STAGES.map((s) => (
                <button key={s} class="chip" aria-pressed={stage === s} onClick={() => setStage(stage === s ? '' : s)}>
                  {STAGE_LABEL[s]} · {counts[s]}
                </button>
              ))}
            </div>
          </div>

          {shown.length === 0 && <p class="muted">לא נמצאו מילים שמתאימות.</p>}
          {shown.length > 0 && (
            <div class="row export-row">
              <button
                class="secondary"
                onClick={() => downloadCsv(buildAnkiCsv(shown), `lingoread-words-${new Date().toISOString().slice(0, 10)}.csv`)}
              >
                <Icon name="upload" size={18} />
                ייצוא ל-Anki ({shown.length})
              </button>
              <span class="muted small">קובץ CSV של המילים המוצגות</span>
            </div>
          )}
          <ul class="word-list">
            {shown.map((w) => (
              <WordRow
                key={w.id}
                w={w}
                onStage={(s) => words.setStage(w, s)}
                onSaveMeaning={(m) => words.update(w, { meaning: m })}
                onDelete={() => words.remove(w)}
                onOpenSentence={() => onOpenSentence(w.bookId, w.sentenceId)}
              />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
