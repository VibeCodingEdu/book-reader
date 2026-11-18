import { useEffect, useMemo, useState } from 'preact/hooks';
import { parseSentenceId, type BookMeta } from '../../shared/book';
import { deleteBook, friendlyError, importBook, listBooks, searchGutenberg, type SearchResult } from './api';
import { levelRank } from './levels';
import { Cover } from './Cover';
import { Icon } from './Icon';
import { loadLocalPosition } from './position';
import { ACCEPT, uploadFile } from './upload';

type MySort = 'recent' | 'title' | 'level';

/** אחוז הקריאה שנשמר בפעם האחרונה שהספר היה פתוח */
function readPercent(bookId: string): number | null {
  try {
    const v = localStorage.getItem(`reader.progress.${bookId}`);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}
const SORT_KEY = 'reader.librarySort';

const OPENED_KEY = (id: string) => `reader.lastOpened.${id}`;
function lastOpened(id: string): number {
  try {
    return Number(localStorage.getItem(OPENED_KEY(id))) || 0;
  } catch {
    return 0;
  }
}
function markOpened(id: string) {
  try {
    localStorage.setItem(OPENED_KEY(id), String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** "פרק 3 מתוך 12" לפי המיקום השמור */
function chapterNote(b: BookMeta): string {
  const pos = loadLocalPosition(b.id);
  const ch = pos ? parseSentenceId(pos.sentenceId)?.c : undefined;
  return ch === undefined ? `${b.chapterCount} פרקים` : `פרק ${ch + 1} מתוך ${b.chapterCount}`;
}

// ספרים קלים יחסית ברשות הציבור, לפי רמה (הערכה גסה; אלה גרסאות מקוריות, לא מפושטות).
const SUGGESTIONS = [
  { id: 14838, title: 'The Tale of Peter Rabbit', author: 'Beatrix Potter', level: 'A2', note: 'קצר מאוד' },
  { id: 11757, title: 'The Velveteen Rabbit', author: 'Margery Williams', level: 'A2–B1', note: 'סיפור קצר' },
  { id: 11339, title: 'Aesop’s Fables', author: 'Aesop', level: 'A2–B1', note: 'משלים קצרים' },
  { id: 7256, title: 'The Gift of the Magi', author: 'O. Henry', level: 'B1', note: 'סיפור קצר' },
  { id: 55, title: 'The Wonderful Wizard of Oz', author: 'L. Frank Baum', level: 'B1', note: 'ספר מלא' },
  { id: 500, title: 'The Adventures of Pinocchio', author: 'Carlo Collodi', level: 'B1', note: 'ספר מלא' },
  { id: 501, title: 'The Story of Doctor Dolittle', author: 'Hugh Lofting', level: 'B1', note: 'ספר מלא' },
];

interface Props {
  onOpen: (b: BookMeta) => void;
  onOpenSettings: () => void;
  onOpenCatalog: (have: Set<string>) => void;
}

export function Library({ onOpen: openBook, onOpenSettings, onOpenCatalog }: Props) {
  const onOpen = (b: BookMeta) => {
    markOpened(b.id);
    openBook(b);
  };
  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [mySort, setMySort] = useState<MySort>(() => {
    try {
      return (localStorage.getItem(SORT_KEY) as MySort) || 'recent';
    } catch {
      return 'recent';
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);
  const [byNumber, setByNumber] = useState('');
  // אזור ההוספה מקופל כשיש ספרים; תפריט מחיקה פתוח לספר אחד
  const [addOpen, setAddOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const refresh = () =>
    listBooks()
      .then(setBooks)
      .catch((e: Error) => setError(friendlyError(e)));

  useEffect(() => {
    refresh();
  }, []);

  const doImport = async (id: number, hint?: { title: string; author: string }) => {
    setImporting(id);
    setError(null);
    try {
      const book = await importBook(id, hint);
      await refresh();
      setResults(null);
      setQuery('');
      setByNumber('');
      onOpen(book);
    } catch (e) {
      setError(friendlyError(e, 'הייבוא נכשל'));
    } finally {
      setImporting(null);
    }
  };

  const doSearch = async (e: Event) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      setResults(await searchGutenberg(query.trim()));
    } catch (err) {
      setError(friendlyError(err, 'החיפוש נכשל'));
    } finally {
      setSearching(false);
    }
  };

  const have = new Set(books?.map((b) => b.id));

  const sorted = useMemo(() => {
    if (!books) return null;
    const list = [...books];
    if (mySort === 'title') list.sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
    if (mySort === 'level') list.sort((a, b) => levelRank(a.level) - levelRank(b.level));
    return list;
  }, [books, mySort]);

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading('מתחיל…');
    try {
      const book = await uploadFile(file, undefined, setUploading);
      await refresh();
      onOpen(book);
    } catch (e) {
      setError(friendlyError(e, 'ההעלאה נכשלה'));
    } finally {
      setUploading(null);
    }
  };

  // הספר שנקרא לאחרונה (לפי המיקום השמור במכשיר) – בכרטיס "ממשיכים לקרוא"
  const current = useMemo(() => {
    if (!books?.length) return null;
    let best: { b: BookMeta; t: number } | null = null;
    for (const b of books) {
      const t = Math.max(loadLocalPosition(b.id)?.updatedAt ?? 0, lastOpened(b.id));
      if (t && (!best || t > best.t)) best = { b, t };
    }
    return best?.b ?? null;
  }, [books]);
  const shelf = sorted?.filter((b) => b.id !== current?.id) ?? null;

  const removeBook = async (b: BookMeta) => {
    setMenuFor(null);
    await deleteBook(b.id).catch(() => {});
    refresh();
  };

  const addBlock = (
    <>
      <div class="add-row">
        <button class="secondary" onClick={() => onOpenCatalog(have)}>
          <Icon name="books" size={18} />
          קטלוגים: ספרים לפי רמה
        </button>
        <label class={`btn secondary ${uploading ? 'disabled' : ''}`}>
          <Icon name="upload" size={18} />
          {uploading ? <span class="busy">{uploading}</span> : 'העלאת קובץ: EPUB, PDF או TXT'}
          <input
            type="file"
            accept={ACCEPT}
            hidden
            disabled={!!uploading}
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              onUpload(f);
            }}
          />
        </label>
      </div>

      <section class="card" aria-labelledby="h-add">
        <h2 id="h-add">הוספת ספר מ-Project Gutenberg</h2>

        {SUGGESTIONS.some((s) => !have.has(`gutenberg-${s.id}`)) && (
          <>
            <h3 class="sub-h">מומלצים לרמה בינונית</h3>
            <ul class="suggestions">
              {SUGGESTIONS.filter((s) => !have.has(`gutenberg-${s.id}`)).map((s) => (
                <li key={s.id}>
                  <button
                    class="suggestion"
                    disabled={importing !== null}
                    onClick={() => doImport(s.id, { title: s.title, author: s.author })}
                  >
                    <span class="level">{s.level}</span>
                    <span class="grow">
                      <span class="en sug-title" lang="en">
                        {s.title}
                      </span>
                      <span class="muted small">
                        {importing === s.id ? <span class="busy">מייבא… זה לוקח כחצי דקה</span> : `${s.author} · ${s.note}`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <h3 class="sub-h">חיפוש ב-Gutenberg</h3>
          </>
        )}

        <form class="row" onSubmit={doSearch}>
          <input
            type="search"
            class="grow en-input"
            dir="auto"
            placeholder="שם ספר או סופר באנגלית"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <button type="submit" disabled={searching || !query.trim()}>
            {searching ? <span class="busy">מחפש…</span> : 'חיפוש'}
          </button>
        </form>

        {results && results.length === 0 && <p class="muted">לא נמצאו ספרים.</p>}
        {results && results.length > 0 && (
          <ul class="results">
            {results.map((r) => (
              <li key={r.gutenbergId}>
                <div class="grow">
                  <div class="en" lang="en">
                    {r.title}
                  </div>
                  <div class="muted en" lang="en">
                    {r.author}
                  </div>
                </div>
                <button
                  class="secondary"
                  disabled={importing !== null || have.has(`gutenberg-${r.gutenbergId}`)}
                  onClick={() => doImport(r.gutenbergId, { title: r.title, author: r.author })}
                >
                  {have.has(`gutenberg-${r.gutenbergId}`) ? 'קיים' : importing === r.gutenbergId ? <span class="busy">מייבא…</span> : 'ייבוא'}
                </button>
              </li>
            ))}
          </ul>
        )}

        <details class="by-number">
          <summary>ייבוא לפי מספר ספר ב-Gutenberg</summary>
          <form
            class="row"
            onSubmit={(e) => {
              e.preventDefault();
              const n = parseInt(byNumber, 10);
              if (n > 0) doImport(n);
            }}
          >
            <input
              type="text"
              inputMode="numeric"
              class="grow"
              placeholder="למשל 1513"
              value={byNumber}
              onInput={(e) => setByNumber(e.currentTarget.value.replace(/\D/g, ''))}
            />
            <button type="submit" disabled={importing !== null || !byNumber}>
              {importing !== null ? <span class="busy">מייבא…</span> : 'ייבוא'}
            </button>
          </form>
          <p class="muted small">המספר מופיע בכתובת הספר באתר: gutenberg.org/ebooks/1513</p>
        </details>
      </section>
    </>
  );

  return (
    <main class="page library">
      <div class="row top-row">
        <h1>חדר קריאה</h1>
        <span class="spacer" />
        <button class="icon-btn" onClick={() => setAddOpen(!addOpen)} aria-expanded={addOpen} aria-label="הוספת ספר">
          <Icon name="plus" />
        </button>
        <button class="icon-btn" onClick={onOpenSettings} aria-label="הגדרות">
          <Icon name="settings" />
        </button>
      </div>

      {error && (
        <p class="msg bad" role="alert">
          {error}
        </p>
      )}

      {books === null && !error && <p class="muted">טוען…</p>}

      {current && (
        <section class="continue" aria-label="ממשיכים לקרוא">
          <button class="continue-card" onClick={() => onOpen(current)}>
            <Cover book={current} size="lg" />
            <span class="continue-body">
              <span class="eyebrow">ממשיכים לקרוא</span>
              <span class="continue-title en" lang="en">
                {current.title}
              </span>
              {current.author && (
                <span class="continue-author en" lang="en">
                  {current.author}
                </span>
              )}
              <span class="continue-progress">
                <span class="pbar">
                  <span style={{ width: `${readPercent(current.id) ?? 0}%` }} />
                </span>
                <span class="muted small">{readPercent(current.id) ?? 0}% · {chapterNote(current)}</span>
              </span>
              <span class="btn continue-cta">המשך קריאה</span>
            </span>
          </button>
        </section>
      )}

      {current && (
        <p class="current-actions">
          {menuFor === current.id ? (
            <span class="shelf-menu inline" role="group" aria-label={`מחיקת ${current.title}`}>
              <span class="small">למחוק את "{current.title}"?</span>
              <button class="danger" onClick={() => removeBook(current)}>
                מחיקה
              </button>
              <button class="secondary" onClick={() => setMenuFor(null)}>
                ביטול
              </button>
            </span>
          ) : (
            <button class="link-btn" onClick={() => setMenuFor(current.id)}>
              <Icon name="trash" size={16} />
              מחיקת הספר הנוכחי
            </button>
          )}
        </p>
      )}

      {shelf && shelf.length > 0 && (
        <section aria-labelledby="h-books">
          <div class="row shelf-head">
            <h2 id="h-books">{current ? 'עוד בספרייה' : 'הספרים שלי'}</h2>
            <span class="spacer" />
            {books && books.length > 2 && (
              <select
                class="sort-select"
                aria-label="מיון הספרים שלי"
                value={mySort}
                onChange={(e) => {
                  const v = e.currentTarget.value as MySort;
                  setMySort(v);
                  try {
                    localStorage.setItem(SORT_KEY, v);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                <option value="recent">נוסף לאחרונה</option>
                <option value="title">שם (א-ב)</option>
                <option value="level">רמה</option>
              </select>
            )}
          </div>
          <ul class="shelf">
            {shelf.map((b) => {
              const pct = readPercent(b.id);
              return (
                <li key={b.id} class="shelf-item">
                  <button class="shelf-open" onClick={() => onOpen(b)}>
                    <Cover book={b} />
                    {b.level && <span class="level cover-level">{b.level}</span>}
                    <span class="shelf-title en" lang="en">
                      {b.title}
                    </span>
                    <span class="shelf-meta">{pct ? `${pct}% נקרא` : `${Math.max(1, Math.round(b.wordCount / 1000))} אלף מילים`}</span>
                  </button>
                  <button
                    class="icon-btn shelf-more"
                    aria-label={`אפשרויות עבור ${b.title}`}
                    aria-expanded={menuFor === b.id}
                    onClick={() => setMenuFor(menuFor === b.id ? null : b.id)}
                  >
                    <Icon name="more" size={18} />
                  </button>
                  {menuFor === b.id && (
                    <div class="shelf-menu" role="group" aria-label={`מחיקת ${b.title}`}>
                      <span class="small">למחוק מהספרייה?</span>
                      <button class="danger" onClick={() => removeBook(b)}>
                        מחיקה
                      </button>
                      <button class="secondary" onClick={() => setMenuFor(null)}>
                        ביטול
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {books?.length === 0 && (
        <section class="empty">
          <h2>חדר הקריאה מחכה לספר הראשון</h2>
          <p class="muted">אפשר לבחור ספר לפי רמה מהקטלוגים, לייבא מ-Gutenberg, או להעלות קובץ EPUB, PDF או TXT.</p>
        </section>
      )}

      {books?.length === 0 && addBlock}
      {addOpen && books && books.length > 0 && (
        <div class="overlay" onClick={() => setAddOpen(false)}>
          <div class="sheet add-sheet" role="dialog" aria-label="הוספת ספר" onClick={(e) => e.stopPropagation()}>
            <div class="sheet-head">
              <h2>הוספת ספר</h2>
              <span class="spacer" />
              <button class="icon-btn" aria-label="סגירה" onClick={() => setAddOpen(false)}>
                <Icon name="close" />
              </button>
            </div>
            {addBlock}
          </div>
        </div>
      )}
    </main>
  );
}
