#!/usr/bin/env python3
"""אינדקס של english-e-reader.net: שם, מחבר, רמה, ז'אנר ותיאור לכל ספר.
משתמש רק בדפים שמותרים לתוכנות לפי robots.txt של האתר (sitemap.xml ו-/book/...).
את הקבצים עצמם לא מוריד – ההורדה נעשית ידנית מהאתר.
הרצה: python3 scripts/catalogs/build_eer.py app/public/catalogs/english-e-reader.json
"""
import html, json, re, sys, time, urllib.request

UA = 'Mozilla/5.0 (book-reader personal index; 1 request per 0.5s)'
BASE = 'https://english-e-reader.net'
LEVELS = ['A1', 'A2', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C2']
LEVEL_RE = re.compile(r'\b(A1|A2|B1\+?|B2\+?|C1|C2)\s+(Starter|Elementary|Pre-intermediate|Intermediate-plus|Intermediate|Upper-intermediate|Advanced|Unabridged)\b', re.I)


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'ignore')


def text_of(s):
    s = re.sub(r'<script.*?</script>|<style.*?</style>', '', s, flags=re.S)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def parse_book(url, page):
    og = re.search(r'<meta property="og:title" content="([^"]+)"', page)
    full = html.unescape(og.group(1)) if og else ''
    title, _, author = full.rpartition(' by ')
    if not title:
        title, author = full, ''
    body = text_of(page)
    # רמה: מופיעה מיד אחרי שם הספר בגוף הדף (לא בתפריט)
    i = body.rfind(title) if title else -1
    lv = LEVEL_RE.search(body, i if i >= 0 else 0)
    level = lv.group(1).upper() if lv else ''
    label = lv.group(2) if lv else ''
    genres = [html.unescape(g) for g in re.findall(r'href="/genre/([^"]+)"', page)]
    genre = genres[0] if genres else ''
    desc = ''
    if lv and author:
        rest = body[lv.end():]
        j = rest.find(author)
        if j >= 0:
            rest = rest[j + len(author):]
        rest = re.sub(r'^\s*' + re.escape(genre) + r'\s*', '', rest) if genre else rest
        rest = re.sub(r'^[\d\s]+', '', rest)
        desc = rest[:280].rsplit(' ', 1)[0] + '…' if len(rest) > 280 else rest
    return {
        'id': url.rstrip('/').rsplit('/', 1)[-1],
        'title': title.strip(),
        'author': author.strip(),
        'level': level,
        'levelLabel': label,
        'genre': genre,
        'description': desc,
        'url': url.rstrip('/'),
    }


def main(out):
    sm = get(BASE + '/sitemap.xml')
    urls = sorted(set(u.rstrip('"') for u in re.findall(r'<loc>([^<]*/book/[^<]*)</loc>', sm)))
    print(f'{len(urls)} books', file=sys.stderr)
    books = []
    for n, u in enumerate(urls, 1):
        try:
            books.append(parse_book(u, get(u)))
        except Exception as e:  # דף שנכשל – מדלגים
            print(f'skip {u}: {e}', file=sys.stderr)
        if n % 10 == 0 or n == len(urls):
            # מחוון התקדמות: מודפס מיד, וגם נכתב לקובץ שאפשר לבדוק בכל רגע
            msg = f'{n}/{len(urls)} ({n * 100 // len(urls)}%)'
            print(msg, file=sys.stderr, flush=True)
            with open(out + '.progress', 'w') as pf:
                pf.write(msg + '\n')
        time.sleep(0.5)
    books.sort(key=lambda b: b['title'].lower())
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'source': 'english-e-reader.net', 'updated': time.strftime('%Y-%m-%d'), 'books': books}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'wrote {len(books)} books to {out}', file=sys.stderr)
    try:
        import os
        os.remove(out + '.progress')
    except OSError:
        pass


if __name__ == '__main__':
    main(sys.argv[1])
