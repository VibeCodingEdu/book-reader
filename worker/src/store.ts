// גישה למסד הנתונים (Cloudflare D1)

import type { BookMeta, Chapter } from '../../shared/book';
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

export async function monthSpend(db: D1Database, month = currentMonth()): Promise<{ total: number; byEngine: Record<string, { usd: number; calls: number }> }> {
  const { results } = await db
    .prepare('SELECT engine, usd, calls FROM spend WHERE month = ?')
    .bind(month)
    .all<{ engine: string; usd: number; calls: number }>();
  const byEngine: Record<string, { usd: number; calls: number }> = {};
  let total = 0;
  for (const r of results) {
    byEngine[r.engine] = { usd: r.usd, calls: r.calls };
    total += r.usd;
  }
  return { total, byEngine };
}

export async function addSpend(db: D1Database, engine: string, usd: number, month = currentMonth()): Promise<void> {
  await db
    .prepare(
      `INSERT INTO spend (month, engine, usd, calls) VALUES (?, ?, ?, 1)
       ON CONFLICT(month, engine) DO UPDATE SET usd = usd + excluded.usd, calls = calls + 1`,
    )
    .bind(month, engine, usd)
    .run();
}
