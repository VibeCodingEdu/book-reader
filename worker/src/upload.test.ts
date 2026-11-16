import { describe, expect, it } from 'vitest';
import type { BookMeta } from '../../shared/book';
import { validateUpload } from './upload';

const meta: BookMeta = {
  id: 'english-e-reader-brown-eyes', lang: 'en', title: 'Brown Eyes', author: 'Paul Stewart',
  source: 'english-e-reader', level: 'A2', chapterCount: 1, wordCount: 5, chapterTitles: ['1'],
};
const chapters = [{ title: '1', paragraphs: [['Hello there.', 'Bye.']] }];

describe('validateUpload', () => {
  it('ספר תקין עובר', () => expect(validateUpload(meta, chapters)).toBeNull());
  it('מזהה לא תקין נדחה', () => expect(validateUpload({ ...meta, id: '../x' }, chapters)).not.toBeNull());
  it('מקור לא מוכר נדחה (גם לא gutenberg – אותו מייבא רק השרת)', () =>
    expect(validateUpload({ ...meta, source: 'gutenberg' }, chapters)).not.toBeNull());
  it('ספר ריק נדחה', () => expect(validateUpload(meta, [])).not.toBeNull());
  it('פסקה במבנה שגוי נדחית', () =>
    expect(validateUpload(meta, [{ title: '1', paragraphs: [['ok', 5 as unknown as string]] }])).not.toBeNull());
});
