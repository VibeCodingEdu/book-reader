#!/usr/bin/env python3
"""אינדקס של learnenglishteam.com (דף "English Story Books for Beginners"):
שם, רמה וקישור ההורדה של כל ספר. את הקבצים עצמם לא מוריד.
הרצה: python3 scripts/catalogs/build_let.py app/public/catalogs/learnenglishteam.json
"""
import html, json, re, sys, time, urllib.request

PAGE = 'https://www.learnenglishteam.com/english-story-books-for-beginners/'
UA = 'Mozilla/5.0 (book-reader personal index)'
HEAD = re.compile(r'<h3[^>]*>(.*?)</h3>', re.S)
LINK = re.compile(r'href="([^"]+(?:\.pdf|drive\.google\.com/[^"]*))"')
LEVEL = re.compile(r'\s*[–-]\s*((?:A1|A2|B1|B2)(?:/(?:A1|A2|B1|B2))?)\s*Level.*$', re.I)


def main(out):
    req = urllib.request.Request(PAGE, headers={'User-Agent': UA})
    s = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'ignore')
    heads = list(HEAD.finditer(s))
    books = []
    for i, h in enumerate(heads):
        name = html.unescape(re.sub(r'<[^>]+>', '', h.group(1))).strip()
        m = LEVEL.search(name)
        if not m:
            continue
        title = name[: m.start()].strip()
        author = ''
        if ' – ' in title:  # "Woman Of Mystery – Agatha Christie"
            title, author = [x.strip() for x in title.split(' – ', 1)]
        end = heads[i + 1].start() if i + 1 < len(heads) else len(s)
        link = LINK.search(s, h.end(), end)
        books.append({
            'id': re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-'),
            'title': title,
            'author': author,
            'level': m.group(1).upper(),
            'format': 'PDF',
            'url': html.unescape(link.group(1)) if link else PAGE,
        })
    books.sort(key=lambda b: b['title'].lower())
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'source': 'learnenglishteam.com', 'page': PAGE, 'updated': time.strftime('%Y-%m-%d'), 'books': books}, f, ensure_ascii=False, indent=1)
    print(f'wrote {len(books)} books', file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1])
