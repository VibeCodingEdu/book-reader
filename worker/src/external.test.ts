import { describe, expect, it } from 'vitest';
import { isAllowedExternal } from './external';

describe('isAllowedExternal', () => {
  it('מאשר רק כתובות הורדה של אתרי הקטלוג', () => {
    expect(isAllowedExternal('https://english-e-reader.net/download?link=dubliners-james-joyce&format=epub')).toBe(true);
    expect(isAllowedExternal('https://www.learnenglishteam.com/wp-content/uploads/2019/09/Brown_Eyes-min.pdf')).toBe(true);
    expect(isAllowedExternal('https://drive.google.com/uc?export=download&id=17WmVlRt3VQKYAb6')).toBe(true);
  });
  it('דוחה כל דבר אחר', () => {
    expect(isAllowedExternal('https://english-e-reader.net/download?link=x&format=mp3')).toBe(false);
    expect(isAllowedExternal('https://evil.example/file.epub')).toBe(false);
    expect(isAllowedExternal('http://english-e-reader.net/download?link=x&format=epub')).toBe(false);
    expect(isAllowedExternal('https://english-e-reader.net/download?link=x&format=epub&redirect=evil')).toBe(false);
  });
});
