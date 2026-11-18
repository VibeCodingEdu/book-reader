import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from './deviceSettings';

describe('parseSettings', () => {
  it('מחזיר ברירות מחדל כשאין נתונים', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('מחזיר ברירות מחדל כשהנתונים פגומים', () => {
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
  });

  it('שומר ערכים תקינים', () => {
    const s = parseSettings(
      JSON.stringify({ theme: 'eink', fontSize: 24, fontFamily: 'sans', lineHeight: 1.8, margin: 32, engine: 'gemini-flash-lite', autoTranslate: false, viewMode: 'study', parallel: 'hide', updatedAt: 5 }),
    );
    expect(s).toEqual({ theme: 'eink', fontSize: 24, fontFamily: 'sans', lineHeight: 1.8, margin: 32, engine: 'gemini-flash-lite', autoTranslate: false, viewMode: 'study', parallel: 'hide', updatedAt: 5 });
  });

  it('מחליף ערכים לא חוקיים בברירת המחדל', () => {
    const s = parseSettings(JSON.stringify({ theme: 'neon', fontSize: 400, lineHeight: 9 }));
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it('הגדרות ישנות (לפני שדות חדשים) מקבלות ברירות מחדל לשדות החסרים', () => {
    const s = parseSettings(JSON.stringify({ theme: 'sepia', fontSize: 22, fontFamily: 'serif' }));
    expect(s.theme).toBe('sepia');
    expect(s.lineHeight).toBe(DEFAULT_SETTINGS.lineHeight);
  });

  it('גופנים חדשים ואפשרות "אוטומטי" נשמרים; גופן לא מוכר חוזר ל-serif', () => {
    expect(parseSettings(JSON.stringify({ fontFamily: 'literata', theme: 'auto' }))).toMatchObject({ fontFamily: 'literata', theme: 'auto' });
    expect(parseSettings(JSON.stringify({ fontFamily: 'lexend' })).fontFamily).toBe('lexend');
    expect(parseSettings(JSON.stringify({ fontFamily: 'comic-sans' })).fontFamily).toBe('serif');
  });
});
