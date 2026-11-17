-- תרגום מקביל: תרגום עברי לכל משפט בפרק, לפי מזהי המשפטים.
-- המפתח כולל את גרסת הפענוח: אם הפירוק למשפטים ישתנה, תרגום ישן לא יוצמד למשפטים אחרים.
CREATE TABLE IF NOT EXISTS chapter_translations (
  book_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  engine TEXT NOT NULL,
  parser_version INTEGER NOT NULL,
  data TEXT NOT NULL,            -- JSON: { "<sentenceId>": "<תרגום>" }
  created_at INTEGER NOT NULL,
  PRIMARY KEY (book_id, idx, engine, parser_version)
);
