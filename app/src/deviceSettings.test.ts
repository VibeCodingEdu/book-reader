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
    const s = parseSettings(JSON.stringify({ theme: 'eink', fontSize: 24, fontFamily: 'sans' }));
    expect(s).toEqual({ theme: 'eink', fontSize: 24, fontFamily: 'sans' });
  });

  it('מחליף ערכים לא חוקיים בברירת המחדל', () => {
    const s = parseSettings(JSON.stringify({ theme: 'neon', fontSize: 400 }));
    expect(s).toEqual(DEFAULT_SETTINGS);
  });
});
