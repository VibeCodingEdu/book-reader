-- יומן חזרות (תרגול FSRS). רק מוסיפים שורות – אין עדכונים ואין מחיקות.
-- seq הוא מונה של השרת: מכשיר מושך "מה שאחרי seq N", כך ששעון לא מדויק במכשיר לא גורם לפספוס.
-- אם יתווסף בעתיד ריבוי משתמשים – תתווסף עמודת user_id.
CREATE TABLE IF NOT EXISTS reviews (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  word_id TEXT NOT NULL,
  rating INTEGER NOT NULL,         -- 1 שוב, 2 קשה, 3 טוב, 4 קל
  reviewed_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reviews_by_word ON reviews (word_id);
