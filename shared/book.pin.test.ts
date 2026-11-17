// טסט "נעיצה" של מזהי המשפטים.
// מיקום קריאה, סימניות והערות מצביעים על מזהה כמו c1.p0.s1. אם הטסט הזה נכשל,
// שינוי בפירוק הזיז מזהים: מעלים את PARSER_VERSION ב-shared/book.ts ומעדכנים כאן את הצפוי.

import { describe, expect, it } from 'vitest';
import { chaptersFromRaw, parsePlainText, PARSER_VERSION, sentenceId, type Chapter } from './book';

const REMINDER = `המזהים זזו – העלו את PARSER_VERSION (כרגע ${PARSER_VERSION}) ועדכנו את הטסט`;

const flat = (chapters: Chapter[]) =>
  chapters.flatMap((c, ci) => c.paragraphs.flatMap((p, pi) => p.map((s, si) => [sentenceId(ci, pi, si), s])));

const TEXT = `*** START OF THE PROJECT GUTENBERG EBOOK PIN TEST ***

A Short Tale

CHAPTER I.
The Garden

Mr. Brown and Dr. Smith met in the garden. They talked
for a long time about the weather.

“Curiouser and curiouser!” cried Alice. She was so surprised
that she forgot how to speak.

Twinkle, twinkle, little bat!
How I wonder what you’re at!
Up above the world you fly,

CHAPTER II.

The conflict eventually ended. J. R. Hartley smiled.

*** END OF THE PROJECT GUTENBERG EBOOK PIN TEST ***`;

describe('מזהי משפטים נעוצים', () => {
  it('טקסט (Gutenberg / TXT / PDF)', () => {
    expect(flat(parsePlainText(TEXT).chapters), REMINDER).toEqual([
      ['c0.p0.s0', 'A Short Tale'],
      ['c1.p0.s0', 'Mr. Brown and Dr. Smith met in the garden.'],
      ['c1.p0.s1', 'They talked for a long time about the weather.'],
      ['c1.p1.s0', '“Curiouser and curiouser!” cried Alice.'],
      ['c1.p1.s1', 'She was so surprised that she forgot how to speak.'],
      ['c1.p2.s0', 'Twinkle, twinkle, little bat!'],
      ['c1.p3.s0', 'How I wonder what you’re at!'],
      ['c1.p4.s0', 'Up above the world you fly,'],
      ['c2.p0.s0', 'The conflict eventually ended.'],
      ['c2.p0.s1', 'J. R. Hartley smiled.'],
    ]);
  });

  it('פרקים מוכנים (EPUB): פרק ריק לא מקבל מספר', () => {
    const raw = chaptersFromRaw([
      { title: 'Cover', paras: [] },
      { title: 'One', paras: ['Hello there. Mr. Lee waved.', '“Stop!” said the man.'] },
    ]);
    expect(flat(raw.chapters), REMINDER).toEqual([
      ['c0.p0.s0', 'Hello there.'],
      ['c0.p0.s1', 'Mr. Lee waved.'],
      ['c0.p1.s0', '“Stop!” said the man.'],
    ]);
  });
});
