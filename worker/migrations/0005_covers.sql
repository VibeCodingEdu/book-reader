-- כריכות ספרים: תמונה אחת לכל ספר (כמה עשרות KB), או סימון שאין כריכה.
-- missing = 1: ניסינו ולא נמצאה כריכה; ננסה שוב רק אחרי כמה ימים (checked_at).
CREATE TABLE IF NOT EXISTS covers (
  book_id TEXT PRIMARY KEY,
  mime TEXT,
  data BLOB,
  missing INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER NOT NULL
);
