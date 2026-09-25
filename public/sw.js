/*
 * The service worker: for now, only the push handler. A push arrives as the
 * JSON the notifier encrypted (supabase/functions/_shared/notify.ts): a
 * title, a body, the app path a tap opens, and a tag, which the browser
 * uses to collapse notifications about the same thing into one.
 *
 * Installability and the offline shell come with #29, which folds this file
 * into the PWA plugin's worker; the handlers stay as they are.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const { title, body, url, tag } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, { body, tag, data: { url } }),
  );
});

// A tap opens the app at the notification's path, in the app's tab if one
// is open rather than a second one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin)
    .href;
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (windows) => {
        const open = windows.find((w) =>
          w.url.startsWith(self.location.origin),
        );
        if (open) {
          await open.focus();
          // A tab this worker does not control yet refuses to be navigated;
          // it still gets the focus, and the URL opens beside it.
          try {
            await open.navigate(url);
            return;
          } catch {
            // Falls through to a new window.
          }
        }
        await self.clients.openWindow(url);
      }),
  );
});
