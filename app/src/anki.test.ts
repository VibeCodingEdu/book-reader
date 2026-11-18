import { describe, expect, it } from 'vitest';
import type { SavedWord } from '../../shared/words';
import { ANKI_HEADER, buildAnkiCsv, csvField, sentenceWithGap } from './anki';

const w = (over: Partial<SavedWord> = {}): SavedWord => ({
  id: 'word-00000001', bookId: 'b', bookTitle: 'Peter Rabbit', sentenceId: 'c0.p0.s0', parserVersion: 1, wordOffset: 4, unit: 'squeezed',
  unitType: 'word', lemma: 'squeeze', pos: 'פועל', ipa: '/skwiːzd/', meaning: 'נדחק', sentence: 'And squeezed under the gate!', stage: 'new',
  createdAt: 1, updatedAt: 1, deleted: false, ...over,
});

describe('csvField', () => {
  it('שדה רגיל – כמו שהוא', () => expect(csvField('abc')).toBe('abc'));
  it('פסיק, מרכאות ושורה חדשה – במרכאות, ומרכאות מוכפלות', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('a\nb')).toBe('"a\nb"');
  });
});

describe('sentenceWithGap', () => {
  it('מילה אחת', () => expect(sentenceWithGap(w())).toBe('And _____ under the gate!'));
  it('ביטוי – רווח אחד', () => {
    const p = w({ unit: 'ran after', lemma: 'run after', sentence: 'He jumped and ran after Peter.', wordOffset: 14 });
    expect(sentenceWithGap(p)).toBe('He jumped and _____ Peter.');
  });
});

describe('buildAnkiCsv', () => {
  const csv = buildAnkiCsv([w(), w({ id: 'word-00000002', unit: 'gate', lemma: 'gate', sentence: 'Close the gate, please.', wordOffset: 10, meaning: 'שער, דלת' })]);
  it('מתחיל ב-BOM וכותרת', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).startsWith(ANKI_HEADER.join(','))).toBe(true);
  });
  it('שורה לכל מילה, ושדות עם פסיק מוגנים', () => {
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('"שער, דלת"');
    expect(lines[2]).toContain('"Close the gate, please."');
  });
  it('העברית נשמרת', () => expect(csv).toContain('נדחק'));
});
