import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { passphraseMatches, signToken, verifyToken, type TokenPayload } from './auth';

export interface Env {
  ALLOWED_ORIGINS: string;
  PASSPHRASE: string;
  TOKEN_SECRET: string;
}

type AppEnv = { Bindings: Env; Variables: { user: TokenPayload } };

export const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim());
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  })(c, next);
});

app.get('/health', (c) => c.json({ ok: true }));

app.post('/auth/login', async (c) => {
  if (!c.env.PASSPHRASE || !c.env.TOKEN_SECRET) {
    return c.json({ error: 'השרת לא הוגדר: חסרים סודות' }, 500);
  }
  const body = await c.req.json<{ passphrase?: string; device?: string }>().catch(() => ({}) as never);
  const pass = typeof body.passphrase === 'string' ? body.passphrase : '';
  const device = (typeof body.device === 'string' ? body.device : 'מכשיר').slice(0, 40);

  if (!(await passphraseMatches(pass, c.env.PASSPHRASE))) {
    await new Promise((r) => setTimeout(r, 600)); // מאט ניחושים
    return c.json({ error: 'סיסמה שגויה' }, 401);
  }
  const token = await signToken(
    { d: device, iat: Math.floor(Date.now() / 1000), jti: crypto.randomUUID() },
    c.env.TOKEN_SECRET,
  );
  return c.json({ token });
});

// כל מה שמתחת לכאן דורש טוקן
const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = token ? await verifyToken(token, c.env.TOKEN_SECRET) : null;
  if (!user) return c.json({ error: 'לא מחובר' }, 401);
  c.set('user', user);
  await next();
});

app.use('/api/*', requireAuth);
app.use('/auth/me', requireAuth);

app.get('/auth/me', (c) => c.json({ device: c.get('user').d }));


export default app;
