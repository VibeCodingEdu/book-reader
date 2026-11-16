import { useEffect, useState } from 'preact/hooks';
import type { BookMeta } from '../../shared/book';
import { deleteBook, importBook, listBooks, searchGutenberg, type SearchResult } from './api';
import { loadLocalPosition } from './position';
import { parseSentenceId } from '../../shared/book';

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

export function Library({ onOpen, onOpenSettings }: { onOpen: (b: BookMeta) => void; onOpenSettings: () => void }) {
  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);
  const [byNumber, setByNumber] = useState('');

  const refresh = () =>
    listBooks()
      .then(setBooks)
      .catch((e: Error) => setError(e.message));

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
      setError(e instanceof Error ? e.message : 'הייבוא נכשל');
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
      setError(err instanceof Error ? err.message : 'החיפוש נכשל');
    } finally {
      setSearching(false);
    }
  };

  const have = new Set(books?.map((b) => b.id));

  return (
    <main class="page">
      <div class="row top-row">
        <h1>הספרייה</h1>
        <span class="spacer" />
        <button class="icon-btn" onClick={onOpenSettings} aria-label="הגדרות">
          ⚙︎
        </button>
      </div>

      {error && (
        <p class="msg bad" role="alert">
          {error}
        </p>
      )}

      <section aria-labelledby="h-books">
        <h2 id="h-books" class="visually-hidden">
          הספרים שלי
        </h2>
        {books === null && !error && <p class="muted">טוען…</p>}
        {books?.length === 0 && <p class="muted">עוד אין ספרים. אפשר לבחור הצעה או לחפש למטה.</p>}
        <ul class="book-list">
          {books?.map((b) => {
            const pos = loadLocalPosition(b.id);
            const ch = pos ? parseSentenceId(pos.sentenceId)?.c : undefined;
            return (
              <li key={b.id} class="book-card">
                <button class="book-open" onClick={() => onOpen(b)}>
                  <span class="book-title en" lang="en">
                    {b.title}
                  </span>
                  <span class="book-author en" lang="en">
                    {b.author}
                  </span>
                  <span class="book-meta">
                    {b.chapterCount} פרקים · {Math.round(b.wordCount / 1000)} אלף מילים
                    {ch !== undefined && ` · הגעת לפרק ${ch + 1}`}
                  </span>
                </button>
                <button
                  class="icon-btn"
                  aria-label={`מחיקת ${b.title}`}
                  onClick={async () => {
                    if (!confirm(`למחוק את "${b.title}" מהספרייה?`)) return;
                    await deleteBook(b.id).catch(() => {});
                    refresh();
                  }}
                >
                  🗑
                </button>
              </li>
            );
          })}
        </ul>
      </section>

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
                        {importing === s.id ? 'מייבא…' : `${s.author} · ${s.note}`}
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
            {searching ? 'מחפש…' : 'חיפוש'}
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
                  {have.has(`gutenberg-${r.gutenbergId}`) ? 'קיים' : importing === r.gutenbergId ? 'מייבא…' : 'ייבוא'}
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
              {importing !== null ? 'מייבא…' : 'ייבוא'}
            </button>
          </form>
          <p class="muted small">המספר מופיע בכתובת הספר באתר: gutenberg.org/ebooks/1513</p>
        </details>
      </section>
    </main>
  );
}
