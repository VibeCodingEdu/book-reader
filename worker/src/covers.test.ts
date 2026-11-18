import { describe, expect, it } from 'vitest';
import { coverSourceFor, decodeCoverDataUrl, isImageType, MAX_COVER_BYTES, ogImageFrom } from './covers';

describe('coverSourceFor', () => {
  it('Gutenberg → כתובת הכריכה הקבועה שלהם', () => {
    expect(coverSourceFor({ id: 'gutenberg-14838', source: 'gutenberg' })).toEqual({
      kind: 'image',
      urls: [
        'https://www.gutenberg.org/cache/epub/14838/pg14838.cover.medium.jpg',
        'https://gutenberg.pglaf.org/cache/epub/14838/pg14838.cover.medium.jpg',
      ],
    });
  });
  it('english-e-reader → דף הספר (og:image)', () => {
    const url = 'https://english-e-reader.net/book/47-ronin-a-samurai-from-japan-jennifer-bassett';
    expect(coverSourceFor({ id: 'english-e-reader-47-ronin', source: 'english-e-reader', sourceUrl: url })).toEqual({ kind: 'page', url });
  });
  it('english-e-reader עם כתובת זרה → אין מקור', () => {
    expect(coverSourceFor({ id: 'english-e-reader-x', source: 'english-e-reader', sourceUrl: 'https://evil.example/book/x' })).toBeNull();
  });
  it('קובץ שהועלה / learnenglishteam → אין מקור', () => {
    expect(coverSourceFor({ id: 'upload-a-1', source: 'upload' })).toBeNull();
    expect(coverSourceFor({ id: 'learnenglishteam-a', source: 'learnenglishteam', sourceUrl: 'https://drive.google.com/uc?x' })).toBeNull();
  });
});

describe('ogImageFrom', () => {
  it('מחלץ כריכה מתיקיית /covers/', () => {
    const html = '<head><meta property="og:image" content="https://english-e-reader.net/covers/47_Ronin_a_Samurai_from_Japan-Jennifer_Bassett.jpg"></head>';
    expect(ogImageFrom(html)).toBe('https://english-e-reader.net/covers/47_Ronin_a_Samurai_from_Japan-Jennifer_Bassett.jpg');
  });
  it('דוחה תמונה מאתר אחר או מתיקייה אחרת', () => {
    expect(ogImageFrom('<meta property="og:image" content="https://evil.example/covers/a.jpg">')).toBeNull();
    expect(ogImageFrom('<meta property="og:image" content="https://english-e-reader.net/img/logo.png">')).toBeNull();
    expect(ogImageFrom('<p>no meta</p>')).toBeNull();
  });
});

describe('decodeCoverDataUrl', () => {
  it('מפענח JPEG תקין', () => {
    const r = decodeCoverDataUrl(`data:image/jpeg;base64,${btoa('abc')}`);
    expect(r?.mime).toBe('image/jpeg');
    expect(Array.from(r!.bytes)).toEqual([97, 98, 99]);
  });
  it('דוחה סוג אחר, base64 שבור, ריק או גדול מדי', () => {
    expect(decodeCoverDataUrl(`data:image/svg+xml;base64,${btoa('<svg/>')}`)).toBeNull();
    expect(decodeCoverDataUrl('data:image/jpeg;base64,***')).toBeNull();
    expect(decodeCoverDataUrl('data:image/jpeg;base64,')).toBeNull();
    expect(decodeCoverDataUrl(`data:image/jpeg;base64,${btoa('x'.repeat(MAX_COVER_BYTES + 1))}`)).toBeNull();
    expect(decodeCoverDataUrl(undefined)).toBeNull();
  });
});

describe('isImageType', () => {
  it('מקבל רק תמונות רגילות', () => {
    expect(isImageType('image/jpeg')).toBe(true);
    expect(isImageType('image/png; charset=binary')).toBe(true);
    expect(isImageType('text/html')).toBe(false);
    expect(isImageType('image/svg+xml')).toBe(false);
    expect(isImageType(null)).toBe(false);
  });
});
