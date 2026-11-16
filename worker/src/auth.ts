// אימות פשוט לשימוש אישי: סיסמה אחת → טוקן חתום (HMAC) לכל מכשיר.
// הטוקן לא פג מעצמו. כדי לנתק את כל המכשירים מחליפים את TOKEN_SECRET.
// (ניתוק מכשיר בודד יתווסף עם D1 באבן דרך 1.)

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export interface TokenPayload {
  d: string; // שם המכשיר
  iat: number; // זמן יצירה (שניות)
  jti: string; // מזהה ייחודי
}

export async function signToken(payload: TokenPayload, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as TokenPayload;
    return typeof payload.d === 'string' ? payload : null;
  } catch {
    return null;
  }
}

/** השוואת סיסמאות בזמן קבוע (משווים hash, כדי שהאורך לא ידלוף). */
export async function passphraseMatches(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
