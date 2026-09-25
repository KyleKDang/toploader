import { generateVapidKeys } from '../../supabase/functions/_shared/vapid.ts';

/*
 * Makes the app's VAPID key pair, once:
 *
 *   npm run vapid:generate
 *
 * The public key goes wherever the app is built (VITE_VAPID_PUBLIC_KEY); the
 * private key is a secret of the notify function (VAPID_PRIVATE_KEY) and
 * lives nowhere else (docs/operations.md). Changing the pair invalidates
 * every browser's subscription, so it is generated once and kept.
 */

const { publicKey, privateKey } = await generateVapidKeys();

console.log(`VITE_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
