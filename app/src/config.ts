// כתובת ה-Worker. בפיתוח מקומי: wrangler dev על פורט 8787.
// באתר עצמו: נקבעת בזמן הבנייה דרך המשתנה VITE_WORKER_URL (ב-GitHub Actions).
export const WORKER_URL: string =
  (import.meta.env.VITE_WORKER_URL as string | undefined) ?? 'http://localhost:8787';
