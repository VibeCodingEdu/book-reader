import { useEffect, useMemo, useState } from 'preact/hooks';
import type { BookMeta } from '../../shared/book';
import { FILTER_LEVELS, levelMatches, levelRank } from './levels';
import { ACCEPT, audioUrlFor, directFileUrl, importFromCatalog, uploadFile, type CatalogLink } from './upload';

interface Entry {
  id: string;
  title: string;
  author: string;
  level: string;
  levelLabel?: string;
  genre?: string;
  description?: string;
  format?: string;
  url: string;
}

type SourceId = CatalogLink['source'];

const SOURCES: { id: SourceId; label: string; file: string; hint: string }[] = [
  {
    id: 'english-e-reader',
    label: 'English e-Reader',
    file: 'english-e-reader.json',
    hint: '"ייבוא לספרייה" מוריד את הספר בפורמט EPUB ומוסיף קישור להקראה (MP3) מהאתר.',
  },
  {
    id: 'learnenglishteam',
    label: 'Learn English Team',
    file: 'learnenglishteam.json',
    hint: 'הספרים באתר הם קובצי PDF. "ייבוא לספרייה" מוריד ומפענח אותם.',
  },
];

type Sort = 'title' | 'level' | 'author';

export function Catalog(props: { have: Set<string>; onBack: () => void; onUploaded: (b: BookMeta) => void }) {
  const [source, setSource] = useState<SourceId>('english-e-reader');
  const [data, setData] = useState<Record<string, Entry[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [levels, setLevels] = useState<Set<string>>(new Set());
  const [genre, setGenre] = useState('');
  const [sort, setSort] = useState<Sort>('title');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ id: string; stage: string } | null>(null);

  const src = SOURCES.find((s) => s.id === source)!;

  useEffect(() => {
    if (data[source]) return;
    fetch(`${import.meta.env.BASE_URL}catalogs/${src.file}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { books: Entry[] }) => setData((d) => ({ ...d, [source]: j.books })))
      .catch(() => setError('לא ניתן לטעון את הקטלוג'));
  }, [source]);

  const books = data[source];
  const genres = useMemo(
    () => [...new Set((books ?? []).map((b) => b.genre).filter(Boolean) as string[])].sort(),
    [books],
  );

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (books ?? []).filter(
      (b) =>
        levelMatches(b.level, levels) &&
        (!genre || b.genre === genre) &&
        (!term || `${b.title} ${b.author}`.toLowerCase().includes(term)),
    );
    const byTitle = (a: Entry, b: Entry) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' });
    return list.sort((a, b) =>
      sort === 'level'
        ? levelRank(a.level) - levelRank(b.level) || byTitle(a, b)
        : sort === 'author'
          ? (a.author || '~').localeCompare(b.author || '~', 'en') || byTitle(a, b)
          : byTitle(a, b),
    );
  }, [books, q, levels, genre, sort]);

  const toggleLevel = (l: string) =>
    setLevels((s) => {
      const n = new Set(s);
      if (n.has(l)) n.delete(l);
      else n.add(l);
      return n;
    });

  const linkFor = (e: Entry): CatalogLink => ({
    source,
    id: e.id,
    title: e.title,
    author: e.author,
    level: e.level,
    url: e.url,
    audioUrl: audioUrlFor(source, e.id),
  });

  const run = async (e: Entry, job: (onStage: (s: string) => void) => Promise<BookMeta>) => {
    setError(null);
    setBusy({ id: e.id, stage: 'מתחיל…' });
    try {
      props.onUploaded(await job((stage) => setBusy({ id: e.id, stage })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הייבוא נכשל');
    } finally {
      setBusy(null);
    }
  };

  const onImport = (e: Entry) => run(e, (st) => importFromCatalog(linkFor(e), st));
  const onFile = (e: Entry, file: File | undefined) => {
    if (file) run(e, (st) => uploadFile(file, linkFor(e), st));
  };

  return (
    <main class="page">
      <div class="row top-row">
        <button class="icon-btn" onClick={props.onBack} aria-label="חזרה לספרייה">
          →
        </button>
        <h1>קטלוגים</h1>
      </div>

      <div class="segmented two" role="tablist" aria-label="מקור">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-pressed={source === s.id}
            onClick={() => {
              setSource(s.id);
              setGenre('');
              setOpen(null);
              setError(null);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p class="muted small">{src.hint}</p>

      <div class="filters">
        <input
          type="search"
          class="en-input"
          dir="auto"
          placeholder="חיפוש לפי שם או מחבר"
          value={q}
          onInput={(e) => setQ(e.currentTarget.value)}
        />
        <div class="chips" role="group" aria-label="סינון לפי רמה">
          {FILTER_LEVELS.map((l) => (
            <button key={l} class="chip" aria-pressed={levels.has(l)} onClick={() => toggleLevel(l)}>
              {l}
            </button>
          ))}
        </div>
        <div class="row">
          {genres.length > 0 && (
            <select class="grow" aria-label="ז'אנר" value={genre} onChange={(e) => setGenre(e.currentTarget.value)}>
              <option value="">כל הז'אנרים</option>
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}
          <select class="grow" aria-label="מיון" value={sort} onChange={(e) => setSort(e.currentTarget.value as Sort)}>
            <option value="title">מיון: שם (א-ב)</option>
            <option value="level">מיון: רמה</option>
            <option value="author">מיון: מחבר</option>
          </select>
        </div>
      </div>

      {error && (
        <p class="msg bad" role="alert">
          {error}
        </p>
      )}
      {!books && !error && <p class="muted">טוען…</p>}
      {books && (
        <p class="muted small">
          {shown.length} מתוך {books.length} ספרים
        </p>
      )}

      <ul class="catalog-list">
        {shown.map((e) => {
          const inLib = props.have.has(`${source}-${e.id}`);
          const isOpen = open === e.id;
          return (
            <li key={e.id} class="catalog-item">
              <button class="catalog-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.id)}>
                <span class="level">{e.level || '?'}</span>
                <span class="grow">
                  <span class="en sug-title" lang="en">
                    {e.title}
                  </span>
                  <span class="muted small en" lang="en">
                    {[e.author, e.genre].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {inLib && <span class="small">בספרייה ✓</span>}
              </button>
              {isOpen && (
                <div class="catalog-detail">
                  {e.description && (
                    <p class="en small" lang="en">
                      {e.description}
                    </p>
                  )}
                  {directFileUrl(source, e.id, e.url) && (
                    <button class="import-btn" disabled={!!busy} onClick={() => onImport(e)}>
                      {busy?.id === e.id ? busy.stage : inLib ? 'ייבוא מחדש לספרייה' : 'ייבוא לספרייה'}
                    </button>
                  )}
                  <div class="row small-actions">
                    <a class="btn secondary" href={e.url} target="_blank" rel="noopener noreferrer">
                      פתיחה באתר
                    </a>
                    <label class={`btn secondary ${busy ? 'disabled' : ''}`}>
                      העלאה ידנית של קובץ
                      <input
                        type="file"
                        accept={ACCEPT}
                        hidden
                        disabled={!!busy}
                        onChange={(ev) => {
                          const f = ev.currentTarget.files?.[0];
                          ev.currentTarget.value = '';
                          onFile(e, f);
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
