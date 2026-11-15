// Service worker : rend l'app installable et affiche les notifications push, sans aucun cache
// (les mises à jour restent gérées par /version.json et le rechargement automatique).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'MesSous', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  }));
});

// Clic sur la notification : ouvre (ou réutilise) l'onglet de l'app sur la bonne page
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = tabs.find(t => t.url.startsWith(self.location.origin));
    if (tab) {
      await tab.navigate(url).catch(() => {});
      return tab.focus();
    }
    return self.clients.openWindow(url);
  })());
});
