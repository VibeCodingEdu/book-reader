-- ספירת תווים לחודש לכל מנוע (Google Translate מתומחר לפי תווים; 500 אלף בחודש חינם)
ALTER TABLE spend ADD COLUMN chars INTEGER NOT NULL DEFAULT 0;
