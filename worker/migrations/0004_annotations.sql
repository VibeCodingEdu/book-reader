-- סימניות והערות על משפטים, מסונכרנות בין המכשירים.
-- הכתיבה האחרונה גוברת (updated_at); מחיקה נשמרת כ-deleted=1.
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  kind TEXT NOT NULL,              -- 'bookmark' | 'note'
  sentence_id TEXT NOT NULL,
  parser_version INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS annotations_by_book ON annotations (book_id);
