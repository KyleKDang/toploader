/*
 * VAPID (RFC 8292): how a push service knows a message came from this app.
 * Every push carries a short-lived JWT signed with the app's private key,
 * and the browser was handed the matching public key when it subscribed, so
 * a push service refuses anything signed with a different key.
 *
 * Web Crypto only, because this runs in the Deno edge runtime and, in the
 * seam-2 suite, in Node. The keys are the shape `web-push` made
 * conventional: the public key is the uncompressed P-256 point, base64url;
 * the private key is the scalar, base64url. The public one is exactly what
 * a browser's `pushManager.subscribe` takes as `applicationServerKey`.
 */

export interface VapidKeys {
  /** Who to contact about this sender: a `mailto:` or an https URL. */
  subject: string;
  /** The uncompressed P-256 point, 65 bytes, base64url. */
  publicKey: string;
  /** The private scalar, 32 bytes, base64url. */
  privateKey: string;
}

/** How long a signed token is good for: the maximum RFC 8292 allows. */
const TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;

/**
 * The `Authorization` header for one push: a token for the push service's
 * origin, and the public key it should check it with.
 */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
): Promise<string> {
  const publicKey = fromBase64Url(keys.publicKey);
  if (publicKey.byteLength !== 65 || publicKey[0] !== 0x04) {
    throw new Error('VAPID public key is not an uncompressed P-256 point');
  }
  const signingKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: toBase64Url(publicKey.slice(1, 33)),
      y: toBase64Url(publicKey.slice(33, 65)),
      d: keys.privateKey,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(encodeJson({ typ: 'JWT', alg: 'ES256' }));
  const claims = toBase64Url(
    encodeJson({
      aud: new URL(endpoint).origin,
      exp: now + TOKEN_LIFETIME_SECONDS,
      iat: now,
      sub: keys.subject,
    }),
  );
  // Web Crypto's ECDSA signature is the raw r||s that JWS wants.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    new TextEncoder().encode(`${header}.${claims}`),
  );

  return `vapid t=${header}.${claims}.${toBase64Url(new Uint8Array(signature))}, k=${keys.publicKey}`;
}

/** A fresh key pair, in the shape the app's configuration holds. */
export async function generateVapidKeys(): Promise<
  Pick<VapidKeys, 'publicKey' | 'privateKey'>
> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  if (!jwk.d) throw new Error('The generated key has no private scalar');
  return { publicKey: toBase64Url(new Uint8Array(raw)), privateKey: jwk.d };
}

function encodeJson(value: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array {
  const padded =
    text.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}
