import '@fontsource-variable/manrope';
import './about.css';

// The tour: each tab swaps the phone's screenshot.
const shot = document.getElementById('tour-shot') as HTMLImageElement | null;
const tabs = [...document.querySelectorAll<HTMLButtonElement>('.tabs [role="tab"]')];
for (const tab of tabs) {
  tab.addEventListener('click', () => {
    if (!shot) return;
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    shot.style.opacity = '0';
    const next = new Image();
    next.onload = () => {
      shot.src = next.src;
      shot.alt = `The ${tab.querySelector('b')?.textContent} screen of the app`;
      shot.style.opacity = '1';
    };
    next.src = `/shots/${tab.dataset.shot}.webp`;
  });
}
