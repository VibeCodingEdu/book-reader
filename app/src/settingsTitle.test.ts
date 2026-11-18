import { describe, expect, it } from 'vitest';
import { settingsTitle } from './SettingsSheet';

describe('settingsTitle', () => {
  it('שם עברי – בלי מקף', () => expect(settingsTitle('אייפון')).toBe('הגדרות לאייפון'));
  it('שם לועזי – עם מקף', () => expect(settingsTitle('Boox')).toBe('הגדרות ל-Boox'));
  it('שם ריק', () => expect(settingsTitle('  ')).toBe('הגדרות למכשיר'));
});
