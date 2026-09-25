/*
 * http_ece ships no types. The one call the notifier test makes is declared
 * here: decrypting an RFC 8291 push body as the browser would. No top-level
 * import, so this stays a declaration rather than an augmentation, which an
 * untyped module cannot take.
 */
declare module 'http_ece' {
  export function decrypt(
    body: Buffer,
    params: {
      version: 'aes128gcm';
      /** The subscription's own key pair, as the browser holds it. */
      privateKey: import('node:crypto').ECDH;
      /** The subscription's auth secret, base64url. */
      authSecret: string;
    },
  ): Buffer;
}
