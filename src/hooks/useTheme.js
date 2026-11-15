import { useEffect } from 'react';

const STORAGE_KEY = 'messous_theme';

// Applique le thème du profil (auto = réglage du système) sur <html>, et le mémorise
// pour l'appliquer dès le chargement suivant (script dans index.html, sans flash blanc).
export function useTheme(theme = 'auto') {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'auto' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1120' : '#6366f1');
    };
    apply();
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* stockage indisponible */ }
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}
