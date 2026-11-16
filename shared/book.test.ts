import { describe, expect, it } from 'vitest';
import { parsePlainText, parseSentenceId, sentenceId, splitSentences, stripGutenbergBoilerplate } from './book';

const SAMPLE = `The Project Gutenberg eBook of A Test Tale

*** START OF THE PROJECT GUTENBERG EBOOK A TEST TALE ***

A TEST TALE

by Somebody

CHAPTER I.
In Verona

Two rich noble families lived in the city.
They hated each other.

One day a fight broke out in the street. Mr. Montague
was there. The Prince ordered them to stop.

[Illustration]

CHAPTER II.

You can begin to _court_ her, said Dr. Lawrence.
The conflict eventually ended.

*** END OF THE PROJECT GUTENBERG EBOOK A TEST TALE ***
License text here.`;

describe('stripGutenbergBoilerplate', () => {
  it('מסיר כותרת ורישיון', () => {
    const body = stripGutenbergBoilerplate(SAMPLE);
    expect(body).not.toContain('START OF');
    expect(body).not.toContain('License');
    expect(body).toContain('Two rich noble families');
  });
});

describe('splitSentences', () => {
  it('לא חותך אחרי Mr. ו-Dr.', () => {
    expect(splitSentences('One day Mr. Smith came. Dr. Who left.')).toEqual([
      'One day Mr. Smith came.',
      'Dr. Who left.',
    ]);
  });

  it('לא חותך ציטוט שהמשפט ממשיך אחריו באות קטנה', () => {
    expect(splitSentences('“Curiouser and curiouser!” cried Alice. Then she ran.')).toEqual([
      '“Curiouser and curiouser!” cried Alice.',
      'Then she ran.',
    ]);
  });
});

describe('parsePlainText', () => {
  const book = parsePlainText(SAMPLE);

  it('מזהה פרקים עם כותרות משנה', () => {
    expect(book.chapters.map((c) => c.title)).toEqual(['פתיחה', 'CHAPTER I. In Verona', 'CHAPTER II.']);
  });

  it('מאחד שורות שבורות לפסקה ומפצל למשפטים', () => {
    const ch1 = book.chapters[1];
    expect(ch1.paragraphs[0]).toEqual(['Two rich noble families lived in the city.', 'They hated each other.']);
    expect(ch1.paragraphs[1]).toEqual([
      'One day a fight broke out in the street.',
      'Mr. Montague was there.',
      'The Prince ordered them to stop.',
    ]);
  });

  it('מסיר איורים וקווים תחתונים של הטיה', () => {
    const ch2 = book.chapters[2];
    expect(ch2.paragraphs.flat().join(' ')).not.toContain('Illustration');
    expect(ch2.paragraphs[0][0]).toBe('You can begin to court her, said Dr. Lawrence.');
  });

  it('סופר מילים', () => {
    expect(book.wordCount).toBeGreaterThan(30);
  });

  it('ספר בלי כותרות נחתך לחלקים', () => {
    const plain = Array.from({ length: 700 }, (_, i) => `Sentence number ${i} is here and it is long enough to count.\n\n`).join('');
    const b = parsePlainText(plain);
    expect(b.chapters.length).toBeGreaterThan(1);
    expect(b.chapters[0].title).toBe('חלק 1');
  });
});

describe('sentence ids', () => {
  it('הלוך וחזור', () => {
    expect(parseSentenceId(sentenceId(3, 12, 2))).toEqual({ c: 3, p: 12, s: 2 });
    expect(parseSentenceId('nonsense')).toBeNull();
  });
});

describe('שורות קצרות', () => {
  it('תוכן עניינים ושירה נשארים שורה-שורה', () => {
    const raw = 'CHAPTER I.\n\nIntro text that is long enough to be a normal paragraph line here.\n\nContents\n\nTwinkle, twinkle, little bat!\nHow I wonder what you’re at!\nUp above the world you fly,\n\nCHAPTER II.\n\nMore text.';
    const b = parsePlainText(raw);
    const all = b.chapters.flatMap((c) => c.paragraphs.map((p) => p.join(' ')));
    expect(all).toContain('Twinkle, twinkle, little bat!');
    expect(all).toContain('How I wonder what you’re at!');
  });
});
