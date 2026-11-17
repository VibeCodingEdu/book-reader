import { afterEach, describe, expect, it, vi } from 'vitest';
import { countChars, googleTranslate } from './google';

afterEach(() => vi.unstubAllGlobals());

describe('googleTranslate', () => {
  it('שולח את המפתח בכותרת ולא בכתובת, ומחזיר תרגומים לפי הסדר', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ data: { translations: [{ translatedText: 'טקס' }, { translatedText: 'שישה חודשים' }] } }));
    });
    const out = await googleTranslate('KEY123', ['ceremony', 'six months']);
    expect(out).toEqual(['טקס', 'שישה חודשים']);
    expect(calls[0].url).not.toContain('KEY123');
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe('KEY123');
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toMatchObject({ q: ['ceremony', 'six months'], source: 'en', target: 'he', format: 'text', model: 'nmt' });
  });

  it('שגיאה כשמספר התרגומים לא תואם', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ data: { translations: [{ translatedText: 'א' }] } })));
    await expect(googleTranslate('k', ['a', 'b'])).rejects.toThrow();
  });

  it('שגיאת שרת עוברת הלאה', async () => {
    vi.stubGlobal('fetch', async () => new Response('denied', { status: 403 }));
    await expect(googleTranslate('k', ['a'])).rejects.toThrow(/403/);
  });
});

describe('countChars', () => {
  it('סופר תווים', () => expect(countChars(['abc', 'de'])).toBe(5));
});
