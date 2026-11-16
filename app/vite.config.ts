import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// באתר GitHub Pages הכתובת היא https://<user>.github.io/book-reader/
// ולכן כל הקבצים נטענים מתחת ל-/book-reader/.
export default defineConfig({
  base: '/book-reader/',
  plugins: [preact()],
  build: {
    // Chrome ישן יחסית על Boox ו-Safari על אייפון
    target: ['chrome90', 'safari15'],
  },
});
