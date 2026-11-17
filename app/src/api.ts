import type { BookMeta, Chapter } from '../../shared/book';
import type {
  ChapterTranslateRequest,
  ChapterTranslateResponse,
  SentenceTranslateRequest,
  SentenceTranslateResponse,
  TextTranslateRequest,
  TextTranslateResponse,
  WordLookupRequest,
  WordLookupResponse,
} from '../../shared/translate';
import { WORKER_URL } from './config';
import { idbGet, idbSet } from './idb';

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

/** נקרא כשהשרת מחזיר 401 – האפליקציה חוזרת למסך ההתחברות */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(path: string, init: RequestInit = {}, token = loadSession()?.token): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'אין חיבור לשרת');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (res.status === 401 && token && path !== '/auth/login') {
    saveSession(null);
    onUnauthorized();
  }
  if (!res.ok) throw new ApiError(res.status, body.error ?? `שגיאת שרת (${res.status})`);
  return body;
}

// ---------- התחברות ----------

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

// ---------- ספרייה ----------

export interface SearchResult {
  gutenbergId: number;
  title: string;
  author: string;
  downloads: number;
}

export const searchGutenberg = (q: string) =>
  request<{ results: SearchResult[] }>(`/api/gutenberg/search?q=${encodeURIComponent(q)}`).then((r) => r.results);

export const listBooks = () => request<{ books: BookMeta[] }>('/api/books').then((r) => r.books);

/** hint: שם ומחבר שהאפליקציה כבר יודעת (מהצעה או מחיפוש) – למקרה שהקטלוג לא זמין */
export const importBook = (gutenbergId: number, hint?: { title: string; author: string }) =>
  request<{ book: BookMeta }>('/api/books/import', {
    method: 'POST',
    body: JSON.stringify({ gutenbergId, ...hint }),
  }).then((r) => r.book);

export const uploadBook = (meta: BookMeta, chapters: Chapter[]) =>
  request<{ book: BookMeta }>('/api/books/upload', { method: 'POST', body: JSON.stringify({ meta, chapters }) }).then(
    (r) => r.book,
  );

/** קובץ ספר מאתר קטלוג, דרך השרת (בלחיצת המשתמש) */
export async function fetchExternal(url: string): Promise<ArrayBuffer> {
  const token = loadSession()?.token;
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/api/external?url=${encodeURIComponent(url)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new ApiError(0, 'אין חיבור לשרת');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `ההורדה נכשלה (${res.status})`);
  }
  return res.arrayBuffer();
}

export const deleteBook = (id: string) => request(`/api/books/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** פרק – קודם מהמטמון המקומי (IndexedDB), אחר כך מהשרת */
export async function getChapter(bookId: string, idx: number): Promise<Chapter> {
  const key = `chapter:${bookId}:${idx}`;
  const cached = await idbGet<Chapter>(key);
  if (cached) return cached;
  const { chapter } = await request<{ chapter: Chapter }>(`/api/books/${encodeURIComponent(bookId)}/chapters/${idx}`);
  void idbSet(key, chapter);
  return chapter;
}

// ---------- מיקום והגדרות ----------

export interface ServerPosition {
  sentenceId: string;
  device: string;
  updatedAt: number;
}

export const getPosition = (bookId: string) =>
  request<{ position: ServerPosition | null }>(`/api/positions/${encodeURIComponent(bookId)}`).then((r) => r.position);

export function putPosition(bookId: string, sentenceId: string, updatedAt: number, keepalive = false) {
  return request<{ position: ServerPosition }>(`/api/positions/${encodeURIComponent(bookId)}`, {
    method: 'PUT',
    body: JSON.stringify({ sentenceId, updatedAt }),
    keepalive,
  });
}

export const getServerSettings = () =>
  request<{ settings: { data: unknown; updatedAt: number } | null }>('/api/settings').then((r) => r.settings);

export const putServerSettings = (data: unknown, updatedAt: number) =>
  request('/api/settings', { method: 'PUT', body: JSON.stringify({ data, updatedAt }) });

// ---------- תרגום ----------

export const lookupWord = (req: WordLookupRequest) =>
  request<WordLookupResponse>('/api/translate/word', { method: 'POST', body: JSON.stringify(req) });

export const translateText = (req: TextTranslateRequest) =>
  request<TextTranslateResponse>('/api/translate/text', { method: 'POST', body: JSON.stringify(req) });

/** תרגום מקביל של פרק שלם (מזהה משפט → תרגום) */
export const translateChapter = (req: ChapterTranslateRequest) =>
  request<ChapterTranslateResponse>('/api/translate/chapter', { method: 'POST', body: JSON.stringify(req) });

/** תרגום משפט בודד */
export const translateSentence = (req: SentenceTranslateRequest) =>
  request<SentenceTranslateResponse>('/api/translate/sentence', { method: 'POST', body: JSON.stringify(req) });

export interface Spend {
  month: string;
  cap: number;
  total: number;
  byEngine: Record<string, { usd: number; calls: number }>;
}
export const getSpend = () => request<Spend>('/api/spend');
