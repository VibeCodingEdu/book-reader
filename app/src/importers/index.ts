// קובץ שהמשתמש בחר (EPUB / PDF / TXT) → ספר בפורמט הפנימי.

import { chaptersFromRaw, parsePlainText, type ParsedBook } from '../../../shared/book';

export interface ImportedFile {
  title: string;
  author: string;
  parsed: ParsedBook;
  /** כריכה מתוך הקובץ (כרגע רק EPUB) */
  cover?: { bytes: Uint8Array; mime: string };
}

function titleFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(pdf|epub|download|free|www\.\S+)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function importFile(file: File): Promise<ImportedFile> {
  const ext = file.name.toLowerCase().split('.').pop();
  const fallbackTitle = titleFromFileName(file.name) || 'ללא שם';

  if (ext === 'epub') {
    const { parseEpub } = await import('./epub');
    const raw = parseEpub(new Uint8Array(await file.arrayBuffer()));
    return { title: raw.title || fallbackTitle, author: raw.author, parsed: chaptersFromRaw(raw.chapters), cover: raw.cover };
  }

  if (ext === 'pdf') {
    const { extractPdf } = await import('./pdf');
    const pdf = await extractPdf(await file.arrayBuffer());
    // מעבירים דרך מפענח הטקסט הרגיל: הוא מזהה "Chapter 1" וכד', ואם אין – חותך לחלקים
    const parsed = parsePlainText(pdf.paras.join('\n\n'));
    return { title: pdf.title || fallbackTitle, author: pdf.author, parsed };
  }

  if (ext === 'txt' || file.type.startsWith('text/')) {
    const text = new TextDecoder('utf-8').decode(await file.arrayBuffer());
    const t = /^Title:\s*(.+)$/m.exec(text)?.[1]?.trim();
    const a = /^Author:\s*(.+)$/m.exec(text)?.[1]?.trim();
    return { title: t || fallbackTitle, author: a ?? '', parsed: parsePlainText(text) };
  }

  throw new Error('סוג קובץ לא נתמך. אפשר להעלות EPUB, PDF או TXT.');
}
