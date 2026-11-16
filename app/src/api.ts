import { WORKER_URL } from './config';

const TOKEN_KEY = 'reader.token.v1';

export interface Session {
  token: string;
  device: string;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null): void {
  try {
    if (s) localStorage.setItem(TOKEN_KEY, JSON.stringify(s));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'אין חיבור לשרת');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new ApiError(res.status, body.error ?? `שגיאת שרת (${res.status})`);
  return body;
}

export async function login(passphrase: string, device: string): Promise<Session> {
  const { token } = await request<{ token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ passphrase, device }),
  });
  const s = { token, device };
  saveSession(s);
  return s;
}

export async function checkSession(s: Session): Promise<boolean> {
  try {
    await request('/auth/me', {}, s.token);
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      saveSession(null);
      return false;
    }
    throw e;
  }
}

export function logout(): void {
  saveSession(null);
}
