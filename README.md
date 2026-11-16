# קורא ספרים אישי

אפליקציית ווב אישית לקריאת ספרים באנגלית, עם תרגום בהקשר לעברית, הקראה ותרגול מילים.
ההחלטות והתוכנית המלאה: [SPEC.md](SPEC.md).

## איך זה בנוי (בקצרה)

| חלק | איפה רץ | מה עושה |
|---|---|---|
| `app/` | GitHub Pages | האתר עצמו (מה שרואים בטלפון וב-Boox). ציבורי, בלי סודות |
| `worker/` | Cloudflare | השרת: סיסמה, מפתחות API, סנכרון, ספרים. הסודות רק כאן |

**כלל ברזל:** סודות (סיסמה, מפתחות API) לעולם לא נכנסים לקוד או ל-Git.
הם נשמרים ב-Cloudflare בפקודה `wrangler secret put`, ובמחשב רק בקובץ `worker/.dev.vars` (שמוחרג מ-Git).

## עדכון האתר והשרת

אין צורך להריץ שום דבר במחשב: כל `push` לענף `main` מפעיל את GitHub Actions, ש:
1. מריץ בדיקות;
2. בונה את האתר ומעלה ל-GitHub Pages;
3. מעדכן את ה-Worker ב-Cloudflare (אם הוגדר הסוד `CLOUDFLARE_API_TOKEN`).

הכתובת: `https://vibecodingedu.github.io/book-reader/`

### הגדרה חד-פעמית
- **GitHub → Settings → Pages**: Source = *GitHub Actions*.
- **GitHub → Settings → Secrets and variables → Actions**:
  - משתנה (Variable) `WORKER_URL` = כתובת ה-Worker, למשל `https://book-reader-api.<שם>.workers.dev`
  - סוד (Secret) `CLOUDFLARE_API_TOKEN` = טוקן מ-Cloudflare עם הרשאת *Edit Cloudflare Workers*
- **סודות ה-Worker** (פעם אחת, מתיקיית `worker`):
  ```bash
  npx wrangler secret put PASSPHRASE
  ```
  ```bash
  npx wrangler secret put TOKEN_SECRET
  ```

## הרצה מקומית (לפיתוח בלבד)

```bash
npm install
```
```bash
cp worker/.dev.vars.example worker/.dev.vars
```
```bash
npm run dev:worker
```
```bash
npm run dev
```
האתר נפתח ב-`http://localhost:5173/book-reader/`. בדיקות: `npm test`.

## הוספת ספר
יתווסף באבן דרך 1 (ייבוא מ-Project Gutenberg מתוך האפליקציה).
