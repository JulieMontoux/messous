import { useEffect, useState } from 'react';

const CHECK_EVERY_MS = 5 * 60 * 1000;

// Détecte un nouveau déploiement (version.json ≠ version chargée).
// Onglet en arrière-plan → rechargement automatique ; sinon on propose de recharger.
export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return undefined;
    let stopped = false;

    async function check() {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = await res.json();
        if (stopped || !version || version === __APP_VERSION__) return;
        if (document.visibilityState === 'hidden') window.location.reload();
        else setUpdateAvailable(true);
      } catch { /* hors ligne : on réessaiera */ }
    }

    const timer = setInterval(check, CHECK_EVERY_MS);
    const onVisibility = () => check();
    document.addEventListener('visibilitychange', onVisibility);
    check();
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return updateAvailable;
}
