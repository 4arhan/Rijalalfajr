import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles.css';
import { initLang } from './lib/i18n';

const saved = localStorage.getItem('raf.theme');
const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.dataset.theme = dark ? 'dark' : 'light';

// The language is loaded first, so every screen can read its text as it is built.
await initLang();
const [{ App }, { SessionProvider, ToastProvider }] = await Promise.all([import('./App'), import('./ui')]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);

// The app shell is kept on the phone so the attendance list opens with no signal.
// (Registered straight away: by the time the language has loaded, the page's load event may have passed.)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
