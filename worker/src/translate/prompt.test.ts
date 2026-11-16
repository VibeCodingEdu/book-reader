import { describe, expect, it } from 'vitest';
import { cacheKey, currentMonth } from '../store';
import { markTappedWord } from './prompt';

describe('markTappedWord', () => {
  it('מסמן את המופע הנכון כשהמילה חוזרת', () => {
    const sentence = 'The end was near, but the end never came.';
    const offset = sentence.lastIndexOf('end');
    expect(markTappedWord({ sentence, word: 'end', offset })).toBe('The end was near, but the ⟦end⟧ never came.');
  });

  it('נופל חזרה לחיפוש כשהמיקום שגוי', () => {
    expect(markTappedWord({ sentence: 'A fight broke out.', word: 'broke', offset: 99 })).toBe('A fight ⟦broke⟧ out.');
  });
});

describe('cacheKey', () => {
  it('יציב ומבחין בין משפטים', async () => {
    const a = await cacheKey(['claude-haiku', 'en', 'end', 4, 'The end.']);
    expect(a).toBe(await cacheKey(['claude-haiku', 'en', 'end', 4, 'The end.']));
    expect(a).not.toBe(await cacheKey(['claude-haiku', 'en', 'end', 4, 'The end!']));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('currentMonth', () => {
  it('פורמט שנה-חודש', () => {
    expect(currentMonth(new Date('2026-11-16T12:00:00Z'))).toBe('2026-11');
  });
});

import { pickEngineId } from './engines';
describe('pickEngineId', () => {
  it('בקשה מפורשת גוברת', () => expect(pickEngineId('gemini-flash-lite', 'claude-haiku', {})).toBe('gemini-flash-lite'));
  it('ברירת מחדל בלי מפתח → המנוע שיש לו מפתח', () =>
    expect(pickEngineId(undefined, 'claude-haiku', { GEMINI_API_KEY: 'k' })).toBe('gemini-flash-lite'));
  it('ברירת מחדל עם מפתח נשארת', () =>
    expect(pickEngineId(undefined, 'claude-haiku', { GEMINI_API_KEY: 'k', ANTHROPIC_API_KEY: 'a' })).toBe('claude-haiku'));
});
