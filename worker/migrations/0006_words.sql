-- מילים שמורות (אוצר מילים), מסונכרנות בין המכשירים.
-- הכתיבה האחרונה גוברת (updated_at); מחיקה נשמרת כ-deleted=1.
-- הרשימה אחת לכל הספרים. אם יתווסף בעתיד ריבוי משתמשים – תתווסף עמודת user_id.
CREATE TABLE IF NOT EXISTS words (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  book_title TEXT NOT NULL DEFAULT '',
  sentence_id TEXT NOT NULL,
  parser_version INTEGER NOT NULL,
  word_offset INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  unit_type TEXT NOT NULL,         -- 'word' | 'phrasal_verb' | 'idiom' | 'proper_noun'
  lemma TEXT NOT NULL DEFAULT '',
  pos TEXT NOT NULL DEFAULT '',
  ipa TEXT NOT NULL DEFAULT '',
  meaning TEXT NOT NULL DEFAULT '',
  sentence TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'new', -- 'new' | 'learning' | 'known'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS words_by_book ON words (book_id);
