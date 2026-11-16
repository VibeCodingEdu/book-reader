import { describe, expect, it } from 'vitest';
import { metaFromText, mirrorPath } from './gutenberg';

describe('mirrorPath', () => {
  it('בונה את נתיב המראה', () => {
    expect(mirrorPath(1513)).toBe('1/5/1/1513');
    expect(mirrorPath(55)).toBe('5/55');
    expect(mirrorPath(5)).toBe('0/5');
  });
});

describe('metaFromText', () => {
  it('שורות Title/Author', () => {
    expect(metaFromText('Title: The Gift of the Magi\nAuthor: O. Henry\n')).toEqual({
      title: 'The Gift of the Magi',
      author: 'O. Henry',
    });
  });
  it('שורת "End of the Project Gutenberg EBook of"', () => {
    expect(metaFromText("blah\nEnd of the Project Gutenberg EBook of Aesop's Fables, by Aesop\n")).toEqual({
      title: "Aesop's Fables",
      author: 'Aesop',
    });
  });
  it('שורת START עם שם הספר', () => {
    expect(metaFromText('*** START OF THIS PROJECT GUTENBERG EBOOK THE ADVENTURES OF PINOCCHIO ***')?.title).toBe(
      'The Adventures Of Pinocchio',
    );
  });
  it('שורת START עם מספר בלבד → אין מידע', () => {
    expect(metaFromText('*** START OF THE PROJECT GUTENBERG EBOOK 14838 ***\nOnce upon a time')).toBeNull();
  });
});
