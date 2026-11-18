import { render } from 'preact';
import { App } from './App';
// גופנים לקריאה, בתוך האפליקציה (עובדים בלי רשת). רק תת-קבוצת הלטינית; הקובץ יורד רק כשהגופן בשימוש.
import '@fontsource/literata/latin-400.css';
import '@fontsource/literata/latin-400-italic.css';
import '@fontsource/literata/latin-700.css';
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/source-serif-4/latin-400-italic.css';
import '@fontsource/source-serif-4/latin-700.css';
import '@fontsource/lexend/latin-400.css';
import '@fontsource/lexend/latin-700.css';
import './styles.css';

render(<App />, document.getElementById('app')!);
