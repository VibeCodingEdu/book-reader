-- ספרים: מטא-דאטה
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  meta TEXT NOT NULL,          -- JSON של BookMeta
  created_at INTEGER NOT NULL
);

-- פרקים: הטקסט המעובד (JSON של Chapter)
CREATE TABLE IF NOT EXISTS chapters (
  book_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (book_id, idx)
);

-- מיקום קריאה לכל ספר (משותף לכל המכשירים)
CREATE TABLE IF NOT EXISTS positions (
  book_id TEXT PRIMARY KEY,
  sentence_id TEXT NOT NULL,
  device TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- הגדרות תצוגה – נפרדות לכל מכשיר
CREATE TABLE IF NOT EXISTS device_settings (
  device TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- מטמון תרגומים: מפתח = hash(מנוע + שפה + מילה + משפט)
CREATE TABLE IF NOT EXISTS translations (
  key TEXT PRIMARY KEY,
  engine TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- הוצאות חודשיות משוערות (לאכיפת התקרה)
CREATE TABLE IF NOT EXISTS spend (
  month TEXT NOT NULL,         -- "2026-11"
  engine TEXT NOT NULL,
  usd REAL NOT NULL DEFAULT 0,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (month, engine)
);
