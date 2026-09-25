import { supabase } from './supabase';

/*
 * Web push, the browser's side. A browser that has said yes holds a
 * subscription: an endpoint at its push service and two keys it made, which
 * the notifier encrypts every message to. This saves that subscription
 * under the signed-in Trader through `save_push_subscription`, and keeps it
 * saved.
 *
 * The permission is asked on a gesture, never on load (the spec's Onboarding
 * flow, step 2): a browser asked out of nowhere says no, and a no is
 * remembered. Until #29 puts the ask on the install step, Matches offers it.
 *
 * The VAPID public key is the one the notifier signs with; a browser hands
 * it to its push service at subscribe time, and a message signed with any
 * other key is refused. Where it is not configured, push is simply not on
 * offer, which is how the local stack and the browser tracer run.
 */

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

/** Whether this browser can do push at all, and the app is set up for it. */
export function pushSupported(): boolean {
  return (
    !!vapidPublicKey &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Whether to offer alerts: push is possible and the browser has not been asked. */
export function canOfferPush(): boolean {
  return pushSupported() && Notification.permission === 'default';
}

/** Registers the worker that shows a push. Called once, as the app starts. */
export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  await navigator.serviceWorker.register('/sw.js');
}

/**
 * Asks, on the Trader's gesture, and subscribes this browser if they say
 * yes. Returns whether alerts are now on.
 */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  if ((await Notification.requestPermission()) !== 'granted') return false;
  await saveThisBrowser();
  return true;
}

/**
 * Keeps a browser that already said yes subscribed and saved under whoever
 * is signed in now: a push service can rotate the endpoint, and the Trader
 * on this browser can change. A no-op anywhere alerts are not on.
 */
export async function syncPushSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  await saveThisBrowser();
}

async function saveThisBrowser(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // The key as the notifier's configuration holds it, base64url, which
      // every browser that can push at all takes as is.
      applicationServerKey: vapidPublicKey,
    }));
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    throw new Error('The browser handed back an incomplete push subscription');
  }
  const { error } = await supabase.rpc('save_push_subscription', {
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });
  if (error) throw error;
}
