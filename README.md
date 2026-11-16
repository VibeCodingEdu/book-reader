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
  - סוד (Secret) `CLOUDFLARE_API_TOKEN` = טוקן מותאם מ-Cloudflare, על החשבון בלבד, עם ההרשאות:
    Workers Scripts: Edit, D1: Edit, Workers R2 Storage: Edit, Account Settings: Read
  - סוד `PASSPHRASE` = הסיסמה האישית לאפליקציה
  - סוד `TOKEN_SECRET` = מחרוזת אקראית ארוכה. ליצירה והעתקה בלי שתוצג על המסך:
    ```bash
    openssl rand -base64 32 | tr -d '\n' | pbcopy
    ```
  תהליך הפריסה מעביר את PASSPHRASE ו-TOKEN_SECRET לכספת של Cloudflare.
  החלפת TOKEN_SECRET מנתקת את כל המכשירים.

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
בספרייה באפליקציה: חיפוש לפי שם או סופר (באנגלית), או "ייבוא לפי מספר ספר"
(המספר מהכתובת `gutenberg.org/ebooks/<מספר>`). השרת מוריד את הטקסט מ-Gutenberg
(או מהמראה הרשמי pglaf כשהאתר הראשי למטה), מפצל לפרקים, פסקאות ומשפטים,
ושומר במסד הנתונים D1.

## בדיקות קבלה (תרגום מילה בהקשר)
GitHub → Actions → **Acceptance** → Run workflow. הבדיקה שולחת את 5 המשפטים מ-SPEC
לכל מנוע שיש לו מפתח (Claude / Gemini), ומציגה טבלת השוואה בעמוד הריצה. עלות: סנטים בודדים.
