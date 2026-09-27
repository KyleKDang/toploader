import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

/*
 * The service worker: the offline shell, and the push handler.
 *
 * vite-plugin-pwa builds this file to /sw.js, the URL #20 first registered
 * it at, so a browser that already turned alerts on keeps its registration
 * and its push subscription through the update. It has its own tsconfig
 * (tsconfig.sw.json), because a worker's globals are not a page's.
 */

declare const self: ServiceWorkerGlobalScope;

/*
 * The offline shell. The build writes every file it emits into
 * `__WB_MANIFEST`, and installing this worker downloads them all, so the
 * whole app - every screen's chunk, the fonts, the icons - opens from the
 * cache with no network. A new deploy is a new worker with a new list; the
 * old copies go when it takes over.
 *
 * Any navigation gets the app's one page, which is what the static host
 * does too (render.yaml): the router owns every path. Supabase is on
 * another origin, so data is never cached here, and a screen that needs it
 * offline shows the route error screen and its way to try again.
 */
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// A new worker takes over at once rather than waiting for every tab to
// close, so a push is always handled by the current code.
self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/*
 * A push arrives as the JSON the notifier encrypted
 * (supabase/functions/_shared/notify.ts): a title, a body, the app path a
 * tap opens, and a tag, which the browser uses to collapse notifications
 * about the same thing into one.
 */
type PushMessage = { title: string; body: string; url: string; tag: string };

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const { title, body, url, tag } = event.data.json() as PushMessage;
  // A notification that replaces one with the same tag is shown silently
  // unless told otherwise, so a Trade's second chat message onward would
  // make no sound. `renotify` asks for the alert each time; TypeScript's
  // lib no longer lists it, and browsers without it ignore it.
  const options: NotificationOptions & { renotify: boolean } = {
    body,
    tag,
    renotify: true,
    data: { url },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// A tap opens the app at the notification's path, in the app's tab if one
// is open rather than a second one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data as { url?: string } | null;
  const url = new URL(data?.url ?? '/', self.location.origin).href;
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
