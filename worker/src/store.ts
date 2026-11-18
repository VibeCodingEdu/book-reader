// גישה למסד הנתונים (Cloudflare D1)

import type { Annotation } from '../../shared/annotations';
import type { SavedWord } from '../../shared/words';
import { wordsInChapter, type BookMeta, type Chapter } from '../../shared/book';
import type { WordLookup } from '../../shared/translate';

export async function listBooks(db: D1Database): Promise<BookMeta[]> {
  const { results } = await db.prepare('SELECT meta FROM books ORDER BY created_at DESC').all<{ meta: string }>();
  return results.map((r) => JSON.parse(r.meta) as BookMeta);
}

export async function getBook(db: D1Database, id: string): Promise<BookMeta | null> {
  const row = await db.prepare('SELECT meta FROM books WHERE id = ?').bind(id).first<{ meta: string }>();
  return row ? (JSON.parse(row.meta) as BookMeta) : null;
}

export async function saveBook(db: D1Database, meta: BookMeta, chapters: Chapter[]): Promise<void> {
  const stmts = [
    db.prepare('DELETE FROM chapters WHERE book_id = ?').bind(meta.id),
    db
      .prepare('INSERT OR REPLACE INTO books (id, meta, created_at) VALUES (?, ?, ?)')
      .bind(meta.id, JSON.stringify(meta), Date.now()),
    ...chapters.map((c, i) =>
      db.prepare('INSERT INTO chapters (book_id, idx, data) VALUES (?, ?, ?)').bind(meta.id, i, JSON.stringify(c)),
    ),
  ];
  await db.batch(stmts);
}

export async function deleteBook(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM chapters WHERE book_id = ?').bind(id),
    db.prepare('DELETE FROM books WHERE id = ?').bind(id),
    db.prepare('DELETE FROM positions WHERE book_id = ?').bind(id),
    db.prepare('DELETE FROM covers WHERE book_id = ?').bind(id),
  ]);
}

export async function getChapter(db: D1Database, bookId: string, idx: number): Promise<Chapter | null> {
  const row = await db
    .prepare('SELECT data FROM chapters WHERE book_id = ? AND idx = ?')
    .bind(bookId, idx)
    .first<{ data: string }>();
  return row ? (JSON.parse(row.data) as Chapter) : null;
}

// ---------- מיקום קריאה ----------

export interface Position {
  sentenceId: string;
  device: string;
  updatedAt: number;
}

export async function getPosition(db: D1Database, bookId: string): Promise<Position | null> {
  const row = await db
    .prepare('SELECT sentence_id, device, updated_at FROM positions WHERE book_id = ?')
    .bind(bookId)
    .first<{ sentence_id: string; device: string; updated_at: number }>();
  return row ? { sentenceId: row.sentence_id, device: row.device, updatedAt: row.updated_at } : null;
}

/** שומר רק אם העדכון חדש יותר ממה שכבר שמור (הכתיבה האחרונה גוברת) */
export async function putPosition(db: D1Database, bookId: string, p: Position): Promise<Position> {
  await db
    .prepare(
      `INSERT INTO positions (book_id, sentence_id, device, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(book_id) DO UPDATE SET sentence_id = excluded.sentence_id, device = excluded.device,
         updated_at = excluded.updated_at
       WHERE excluded.updated_at > positions.updated_at`,
    )
    .bind(bookId, p.sentenceId, p.device, p.updatedAt)
    .run();
  return (await getPosition(db, bookId))!;
}

// ---------- הגדרות מכשיר ----------

export async function getSettings(db: D1Database, device: string): Promise<{ data: unknown; updatedAt: number } | null> {
  const row = await db
    .prepare('SELECT data, updated_at FROM device_settings WHERE device = ?')
    .bind(device)
    .first<{ data: string; updated_at: number }>();
  return row ? { data: JSON.parse(row.data), updatedAt: row.updated_at } : null;
}

export async function putSettings(db: D1Database, device: string, data: unknown, updatedAt: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO device_settings (device, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(device) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
       WHERE excluded.updated_at > device_settings.updated_at`,
    )
    .bind(device, JSON.stringify(data), updatedAt)
    .run();
}

// ---------- מטמון תרגומים והוצאות ----------

export async function cacheKey(parts: (string | number)[]): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts)));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getCachedLookup(db: D1Database, key: string): Promise<WordLookup | null> {
  const row = await db.prepare('SELECT result FROM translations WHERE key = ?').bind(key).first<{ result: string }>();
  return row ? (JSON.parse(row.result) as WordLookup) : null;
}

export async function putCachedLookup(db: D1Database, key: string, engine: string, result: WordLookup): Promise<void> {
  await db
    .prepare('INSERT OR REPLACE INTO translations (key, engine, result, created_at) VALUES (?, ?, ?, ?)')
    .bind(key, engine, JSON.stringify(result), Date.now())
    .run();
}

export function currentMonth(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

export async function monthSpend(
  db: D1Database,
  month = currentMonth(),
): Promise<{ total: number; byEngine: Record<string, { usd: number; calls: number; chars: number }> }> {
  const { results } = await db
    .prepare('SELECT engine, usd, calls, chars FROM spend WHERE month = ?')
    .bind(month)
    .all<{ engine: string; usd: number; calls: number; chars: number }>();
  const byEngine: Record<string, { usd: number; calls: number; chars: number }> = {};
  let total = 0;
  for (const r of results) {
    byEngine[r.engine] = { usd: r.usd, calls: r.calls, chars: r.chars ?? 0 };
    total += r.usd;
  }
  return { total, byEngine };
}

export async function addSpend(db: D1Database, engine: string, usd: number, chars = 0, month = currentMonth()): Promise<void> {
  await db
    .prepare(
      `INSERT INTO spend (month, engine, usd, calls, chars) VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(month, engine) DO UPDATE SET usd = usd + excluded.usd, calls = calls + 1, chars = chars + excluded.chars`,
    )
    .bind(month, engine, usd, chars)
    .run();
}

// ---------- תרגום מקביל של פרקים ----------

export async function getChapterTranslations(
  db: D1Database,
  bookId: string,
  idx: number,
  engine: string,
  parserVersion: number,
): Promise<Record<string, string> | null> {
  const row = await db
    .prepare('SELECT data FROM chapter_translations WHERE book_id = ? AND idx = ? AND engine = ? AND parser_version = ?')
    .bind(bookId, idx, engine, parserVersion)
    .first<{ data: string }>();
  return row ? (JSON.parse(row.data) as Record<string, string>) : null;
}

export async function putChapterTranslations(
  db: D1Database,
  bookId: string,
  idx: number,
  engine: string,
  parserVersion: number,
  data: Record<string, string>,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO chapter_translations (book_id, idx, engine, parser_version, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(bookId, idx, engine, parserVersion, JSON.stringify(data), Date.now())
    .run();
}

// ---------- סימניות והערות ----------


interface AnnotationRow {
  id: string;
  book_id: string;
  kind: string;
  sentence_id: string;
  parser_version: number;
  text: string;
  excerpt: string;
  created_at: number;
  updated_at: number;
  deleted: number;
}

const fromRow = (r: AnnotationRow): Annotation => ({
  id: r.id,
  bookId: r.book_id,
  kind: r.kind as Annotation['kind'],
  sentenceId: r.sentence_id,
  parserVersion: r.parser_version,
  text: r.text,
  excerpt: r.excerpt,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deleted: !!r.deleted,
});

/** כל הרשומות של ספר, כולל מחוקות (כדי שמכשירים אחרים ידעו על המחיקה) */
export async function listAnnotations(db: D1Database, bookId: string): Promise<Annotation[]> {
  const { results } = await db.prepare('SELECT * FROM annotations WHERE book_id = ?').bind(bookId).all<AnnotationRow>();
  return results.map(fromRow);
}

/** שמירה: רשומה חדשה נכנסת; קיימת מתעדכנת רק אם הגרסה שהגיעה חדשה יותר (או מחיקה בשוויון) */
export async function upsertAnnotations(db: D1Database, items: Annotation[]): Promise<void> {
  if (!items.length) return;
  await db.batch(
    items.map((a) =>
      db
        .prepare(
          `INSERT INTO annotations (id, book_id, kind, sentence_id, parser_version, text, excerpt, created_at, updated_at, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             kind = excluded.kind, sentence_id = excluded.sentence_id, parser_version = excluded.parser_version,
             text = excluded.text, excerpt = excluded.excerpt, updated_at = excluded.updated_at, deleted = excluded.deleted
           WHERE excluded.updated_at > annotations.updated_at
              OR (excluded.updated_at = annotations.updated_at AND excluded.deleted = 1)`,
        )
        .bind(a.id, a.bookId, a.kind, a.sentenceId, a.parserVersion, a.text, a.excerpt, a.createdAt, a.updatedAt, a.deleted ? 1 : 0),
    ),
  );
}

// ---------- מילים שמורות ----------

interface WordRow {
  id: string;
  book_id: string;
  book_title: string;
  sentence_id: string;
  parser_version: number;
  word_offset: number;
  unit: string;
  unit_type: string;
  lemma: string;
  pos: string;
  ipa: string;
  meaning: string;
  sentence: string;
  stage: string;
  created_at: number;
  updated_at: number;
  deleted: number;
}

const wordFromRow = (r: WordRow): SavedWord => ({
  id: r.id,
  bookId: r.book_id,
  bookTitle: r.book_title,
  sentenceId: r.sentence_id,
  parserVersion: r.parser_version,
  wordOffset: r.word_offset,
  unit: r.unit,
  unitType: r.unit_type as SavedWord['unitType'],
  lemma: r.lemma,
  pos: r.pos,
  ipa: r.ipa,
  meaning: r.meaning,
  sentence: r.sentence,
  stage: r.stage as SavedWord['stage'],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deleted: !!r.deleted,
});

/** כל המילים, כולל מחוקות (כדי שמכשירים אחרים ידעו על המחיקה) */
export async function listWords(db: D1Database): Promise<SavedWord[]> {
  const { results } = await db.prepare('SELECT * FROM words ORDER BY created_at, id').all<WordRow>();
  return results.map(wordFromRow);
}

/** שמירה: רשומה חדשה נכנסת; קיימת מתעדכנת רק אם הגרסה שהגיעה חדשה יותר (או מחיקה בשוויון) */
export async function upsertWords(db: D1Database, items: SavedWord[]): Promise<void> {
  if (!items.length) return;
  await db.batch(
    items.map((w) =>
      db
        .prepare(
          `INSERT INTO words (id, book_id, book_title, sentence_id, parser_version, word_offset, unit, unit_type, lemma, pos, ipa,
                              meaning, sentence, stage, created_at, updated_at, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             book_title = excluded.book_title, sentence_id = excluded.sentence_id, parser_version = excluded.parser_version,
             word_offset = excluded.word_offset, unit = excluded.unit, unit_type = excluded.unit_type, lemma = excluded.lemma,
             pos = excluded.pos, ipa = excluded.ipa, meaning = excluded.meaning, sentence = excluded.sentence,
             stage = excluded.stage, updated_at = excluded.updated_at, deleted = excluded.deleted
           WHERE excluded.updated_at > words.updated_at
              OR (excluded.updated_at = words.updated_at AND excluded.deleted = 1)`,
        )
        .bind(
          w.id, w.bookId, w.bookTitle, w.sentenceId, w.parserVersion, w.wordOffset, w.unit, w.unitType, w.lemma, w.pos, w.ipa,
          w.meaning, w.sentence, w.stage, w.createdAt, w.updatedAt, w.deleted ? 1 : 0,
        ),
    ),
  );
}

/** ספר ישן בלי מספר מילים לכל פרק – מחשבים פעם אחת מהפרקים ושומרים */
export async function ensureChapterWords(db: D1Database, meta: BookMeta): Promise<BookMeta> {
  if (meta.chapterWords?.length === meta.chapterCount) return meta;
  const words: number[] = [];
  for (let i = 0; i < meta.chapterCount; i++) {
    const ch = await getChapter(db, meta.id, i);
    words.push(ch ? wordsInChapter(ch) : 0);
  }
  const updated = { ...meta, chapterWords: words };
  await db.prepare('UPDATE books SET meta = ? WHERE id = ?').bind(JSON.stringify(updated), meta.id).run();
  return updated;
}

// ---------- כריכות ----------
export interface CoverRow {
  mime: string | null;
  data: Uint8Array | null;
  missing: boolean;
  checkedAt: number;
}

export async function getCover(db: D1Database, bookId: string): Promise<CoverRow | null> {
  const row = await db
    .prepare('SELECT mime, data, missing, checked_at FROM covers WHERE book_id = ?')
    .bind(bookId)
    .first<{ mime: string | null; data: ArrayBuffer | number[] | null; missing: number; checked_at: number }>();
  if (!row) return null;
  return {
    mime: row.mime,
    // D1 מחזיר BLOB כ-ArrayBuffer או כמערך מספרים, לפי הגרסה
    data: row.data ? new Uint8Array(row.data as ArrayBuffer) : null,
    missing: row.missing === 1,
    checkedAt: row.checked_at,
  };
}

export async function putCover(db: D1Database, bookId: string, cover: { mime: string; bytes: Uint8Array } | null): Promise<void> {
  await db
    .prepare('INSERT OR REPLACE INTO covers (book_id, mime, data, missing, checked_at) VALUES (?, ?, ?, ?, ?)')
    .bind(bookId, cover?.mime ?? null, cover ? cover.bytes : null, cover ? 0 : 1, Date.now())
    .run();
}
