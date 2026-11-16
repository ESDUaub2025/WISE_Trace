self.addEventListener('push', (event) => {
  // Display generic text even if a provider sends unexpected payload fields.
  event.waitUntil(
    self.registration.showNotification('WISE', {
      body: 'New alert / تنبيه جديد',
      icon: '/wise.svg',
      tag: 'wise-alert',
      data: { url: '/' },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const target = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (target) return target.focus();
      return self.clients.openWindow('/');
    }),
  );
});
