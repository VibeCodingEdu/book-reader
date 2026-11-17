import { describe, expect, it } from 'vitest';
import { normalizeMeta, PARSER_VERSION, parserVersionOf, type BookMeta, type Chapter } from './book';

const chapters: Chapter[] = [
  { title: 'Chapter 1', paragraphs: [['One two three.', 'Four five.']] },
  { title: 'Chapter 2', paragraphs: [['Six seven.']] },
];

// דוגמה עם *כל* שדות BookMeta. Required<> מחייב: שדה חדש ב-BookMeta בלי עדכון כאן לא יקומפל.
const full: Required<BookMeta> = {
  id: 'english-e-reader-brown-eyes',
  lang: 'en',
  title: 'Brown Eyes',
  author: 'Paul Stewart',
  source: 'english-e-reader',
  level: 'A2',
  sourceUrl: 'https://english-e-reader.net/book/brown-eyes',
  audioUrl: 'https://english-e-reader.net/download?link=brown-eyes&format=mp3',
  parserVersion: 1,
  chapterCount: 2,
  wordCount: 7,
  chapterTitles: ['Chapter 1', 'Chapter 2'],
};

describe('normalizeMeta', () => {
  it('אף שדה של BookMeta לא נעלם בדרך', () => {
    const out = normalizeMeta(full, chapters);
    for (const key of Object.keys(full) as (keyof BookMeta)[]) {
      expect(out[key], `השדה ${key} נעלם ב-normalizeMeta`).toEqual(full[key]);
    }
    expect(Object.keys(out).sort()).toEqual(Object.keys(full).sort());
  });

  it('מחשב מספר פרקים, שמות פרקים ומספר מילים מהפרקים עצמם', () => {
    const out = normalizeMeta({ ...full, wordCount: 999 }, chapters);
    expect(out.chapterCount).toBe(2);
    expect(out.chapterTitles).toEqual(['Chapter 1', 'Chapter 2']);
    expect(out.wordCount).toBe(7);
  });

  it('שומר על מגבלות האורך', () => {
    const long = (n: number) => 'x'.repeat(n);
    const out = normalizeMeta(
      { ...full, title: long(400), author: long(400), level: long(20), sourceUrl: long(600) },
      [{ title: long(300), paragraphs: [['Hi.']] }],
    );
    expect(out.title.length).toBe(300);
    expect(out.author.length).toBe(300);
    expect(out.level!.length).toBe(10);
    expect(out.sourceUrl!.length).toBe(500);
    expect(out.chapterTitles[0].length).toBe(200);
  });

  it('שדות אופציונליים ריקים לא נשמרים', () => {
    const out = normalizeMeta(
      { id: 'gutenberg-11', lang: 'en', title: 'Alice', author: '', source: 'gutenberg', level: '  ' },
      chapters,
    );
    expect('level' in out).toBe(false);
    expect('sourceUrl' in out).toBe(false);
    expect('audioUrl' in out).toBe(false);
  });
});

describe('parserVersion', () => {
  it('מסלול שלא העביר גרסה מקבל את הגרסה הנוכחית', () => {
    const out = normalizeMeta({ id: 'gutenberg-1', lang: 'en', title: 'T', author: '', source: 'gutenberg' }, chapters);
    expect(out.parserVersion).toBe(PARSER_VERSION);
  });
  it('גרסה לא תקינה מוחלפת בגרסה הנוכחית', () => {
    expect(normalizeMeta({ ...full, parserVersion: -3 }, chapters).parserVersion).toBe(PARSER_VERSION);
    expect(normalizeMeta({ ...full, parserVersion: 1.5 }, chapters).parserVersion).toBe(PARSER_VERSION);
  });
  it('ספר ישן בלי השדה נחשב לגרסה 1', () => {
    expect(parserVersionOf({})).toBe(1);
    expect(parserVersionOf({ parserVersion: 3 })).toBe(3);
  });
});
