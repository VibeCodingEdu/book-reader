import { describe, expect, it } from 'vitest';
import { resolvePath } from './epub';
import { itemsToLines, linesToParagraphs, type PdfLine } from './pdf';

const L = (text: string, y: number, x = 50, width = 400): PdfLine => ({ text, x, y, width, height: 12 });

describe('itemsToLines', () => {
  it('מקבץ פריטים באותו גובה לשורה אחת, לפי סדר אופקי', () => {
    const lines = itemsToLines([
      { str: 'world', transform: [12, 0, 0, 12, 120, 700], width: 40, height: 12 },
      { str: 'Hello', transform: [12, 0, 0, 12, 50, 700], width: 40, height: 12 },
      { str: 'Next line', transform: [12, 0, 0, 12, 50, 684], width: 70, height: 12 },
    ]);
    expect(lines.map((l) => l.text)).toEqual(['Hello world', 'Next line']);
  });
});

describe('linesToParagraphs', () => {
  const header = (n: number) => L(`Brown Eyes   ${n}`, 780, 50, 120);
  const pages: PdfLine[][] = [1, 2, 3, 4].map((n) => [
    header(n),
    L(`Paragraph ${n} starts here and goes on for a full line of`, 700),
    L('text until it reaches the end of the sentence.', 686, 50, 250),
    L(`A second para-`, 672, 70, 400),
    L('graph follows on the same page and it ends here.', 658, 50, 280),
    L(String(n), 40, 290, 10),
  ]);

  const paras = linesToParagraphs(pages);

  it('מסיר מספרי עמודים וכותרות חוזרות', () => {
    expect(paras.join(' ')).not.toMatch(/Brown Eyes/);
    expect(paras.every((p) => !/^\d+$/.test(p))).toBe(true);
  });

  it('מאחד שורות לפסקה ומחבר מילה שנחתכה במקף', () => {
    expect(paras[0]).toBe('Paragraph 1 starts here and goes on for a full line of text until it reaches the end of the sentence.');
    expect(paras[1]).toBe('A second paragraph follows on the same page and it ends here.');
  });

  it('פסקה שנמשכת לעמוד הבא לא נחתכת', () => {
    const p = linesToParagraphs([
      [L('The story begins on one page and the sentence', 700), L('continues to the bottom of the page and', 686)],
      [L('ends on the next page.', 700, 50, 150)],
    ]);
    expect(p).toEqual(['The story begins on one page and the sentence continues to the bottom of the page and ends on the next page.']);
  });
});

describe('resolvePath (EPUB)', () => {
  it('פותר נתיבים יחסיים', () => {
    expect(resolvePath('OEBPS/content.opf', 'Text/ch1.xhtml#a')).toBe('OEBPS/Text/ch1.xhtml');
    expect(resolvePath('OEBPS/Text/nav.xhtml', '../Text/ch%202.xhtml')).toBe('OEBPS/Text/ch 2.xhtml');
    expect(resolvePath('content.opf', 'ch1.html')).toBe('ch1.html');
  });
});
