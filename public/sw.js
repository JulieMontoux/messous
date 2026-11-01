// Service worker minimal : rend l'app installable, sans aucun cache
// (les mises à jour restent gérées par /version.json et le rechargement automatique).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
