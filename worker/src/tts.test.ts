import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAllowedVoice, listVoices, synthesize, toBase64, voiceLanguage } from './tts';

afterEach(() => vi.unstubAllGlobals());

describe('isAllowedVoice', () => {
  it.each([
    ['en-US-Wavenet-D', true],
    ['en-GB-Neural2-B', true],
    ['en-US-Chirp3-HD-Aoede', false],
    ['en-US-Standard-A', false],
    ['evil"; DROP', false],
  ])('%s → %s', (v, ok) => expect(isAllowedVoice(v)).toBe(ok));
  it('שפה מתוך שם הקול', () => expect(voiceLanguage('en-GB-Wavenet-A')).toBe('en-GB'));
});

describe('synthesize', () => {
  it('שולח SSML עם בקשת זמני מילים, והמפתח בכותרת', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ audioContent: btoa('ID3abc'), timepoints: [{ markName: 's0o0', timeSeconds: 0.1 }] }));
    });
    const r = await synthesize('KEY', '<speak>Hi</speak>', 'en-US-Wavenet-D');
    expect(calls[0].url).toContain('/v1beta1/text:synthesize');
    expect(calls[0].url).not.toContain('KEY');
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe('KEY');
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({
      input: { ssml: '<speak>Hi</speak>' },
      voice: { languageCode: 'en-US', name: 'en-US-Wavenet-D' },
      enableTimePointing: ['SSML_MARK'],
    });
    expect(new TextDecoder().decode(r.audio)).toBe('ID3abc');
    expect(r.timepoints).toEqual([{ markName: 's0o0', timeSeconds: 0.1 }]);
  });
  it('בלי timepoints בתשובה – רשימה ריקה', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ audioContent: btoa('x') })));
    expect((await synthesize('k', '<speak>a</speak>', 'en-US-Wavenet-D')).timepoints).toEqual([]);
  });
  it('קול לא מורשה נדחה לפני קריאה לרשת', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(synthesize('k', '<speak>a</speak>', 'en-US-Chirp3-HD-Aoede')).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
  it('שגיאת Google עוברת הלאה', async () => {
    vi.stubGlobal('fetch', async () => new Response('denied', { status: 403 }));
    await expect(synthesize('k', '<speak>a</speak>', 'en-US-Wavenet-D')).rejects.toThrow(/403/);
  });
});

describe('listVoices', () => {
  it('מסנן ל-WaveNet ו-Neural2 וממיין', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      new Response(
        JSON.stringify({
          voices: url.includes('en-GB')
            ? [{ name: 'en-GB-Standard-A', ssmlGender: 'FEMALE' }, { name: 'en-GB-Wavenet-B', ssmlGender: 'MALE' }]
            : [{ name: 'en-US-Neural2-J', ssmlGender: 'MALE' }, { name: 'en-US-Wavenet-C', ssmlGender: 'FEMALE' }, { name: 'en-US-Chirp3-HD-Aoede' }],
        }),
      ),
    );
    const v = await listVoices('k');
    expect(v.map((x) => x.name)).toEqual(['en-GB-Wavenet-B', 'en-US-Neural2-J', 'en-US-Wavenet-C']);
  });
});

describe('toBase64', () => {
  it('מקודד כמו btoa', () => expect(toBase64(new TextEncoder().encode('hello world'))).toBe(btoa('hello world')));
  it('מערך גדול לא קורס', () => expect(toBase64(new Uint8Array(200_000)).length).toBeGreaterThan(200_000));
});
