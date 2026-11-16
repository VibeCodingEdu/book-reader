import { describe, expect, it } from 'vitest';
import { passphraseMatches, signToken, verifyToken } from './auth';
import { app } from './index';

const env = {
  ALLOWED_ORIGINS: 'http://localhost:5173',
  PASSPHRASE: 'correct horse',
  TOKEN_SECRET: 'test-secret',
};

describe('tokens', () => {
  it('טוקן חתום מאומת ומחזיר את שם המכשיר', async () => {
    const t = await signToken({ d: 'אייפון', iat: 1, jti: 'x' }, 'secret');
    expect((await verifyToken(t, 'secret'))?.d).toBe('אייפון');
  });

  it('טוקן עם סוד אחר נדחה', async () => {
    const t = await signToken({ d: 'Boox', iat: 1, jti: 'x' }, 'secret');
    expect(await verifyToken(t, 'other')).toBeNull();
  });

  it('טוקן ששונה נדחה', async () => {
    const t = await signToken({ d: 'Boox', iat: 1, jti: 'x' }, 'secret');
    expect(await verifyToken('A' + t.slice(1), 'secret')).toBeNull();
    expect(await verifyToken('garbage', 'secret')).toBeNull();
  });

  it('השוואת סיסמאות', async () => {
    expect(await passphraseMatches('abc', 'abc')).toBe(true);
    expect(await passphraseMatches('abd', 'abc')).toBe(false);
  });
});

describe('API', () => {
  it('התחברות עם סיסמה נכונה ואז /auth/me', async () => {
    const res = await app.request(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ passphrase: 'correct horse', device: 'Boox' }) },
      env,
    );
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    const me = await app.request('/auth/me', { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ device: 'Boox' });
  });

  it('סיסמה שגויה מחזירה 401', async () => {
    const res = await app.request(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ passphrase: 'wrong' }) },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('בלי טוקן /auth/me מחזיר 401', async () => {
    const res = await app.request('/auth/me', {}, env);
    expect(res.status).toBe(401);
  });

  it('CORS מאשר רק מקורות מורשים', async () => {
    const ok = await app.request('/health', { headers: { Origin: 'http://localhost:5173' } }, env);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    const bad = await app.request('/health', { headers: { Origin: 'https://evil.example' } }, env);
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
