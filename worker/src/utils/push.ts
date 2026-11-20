import type { Env } from '../types';

const encoder = new TextEncoder();
const DEFAULT_VAPID_PUBLIC_KEY = 'BGvyPwMeRMb1G1hLvvkrBjrqI3lHA4jp4N1qkZmu9Gs01_FvDXF6lqBB8FQyowXZOgZ8tMssFQ03kWH8oXT0s30';
const decode = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};
const encode = (value: Uint8Array) => {
  let raw = '';
  for (const byte of value) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};
const concat = (...parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
};
async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}
async function encryptPayload(payload: string, p256dh: string, auth: string) {
  const clientPublic = decode(p256dh), authSecret = decode(auth);
  const clientKey = await crypto.subtle.importKey('raw', clientPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const serverKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverKeys.privateKey, 256));
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));
  const keyInfo = concat(encoder.encode('WebPush: info\0'), clientPublic, serverPublic);
  const ikm = await hkdf(shared, authSecret, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, encoder.encode('Content-Encoding: nonce\0'), 12);
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const plain = concat(encoder.encode(payload), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, plain));
  const header = new Uint8Array(21 + serverPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = serverPublic.length;
  header.set(serverPublic, 21);
  return concat(header, cipher);
}
async function vapidToken(endpoint: string, env: Env) {
  const publicKey = env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!privateKey) throw new Error('VAPID keys are not configured');
  const rawPublic = decode(publicKey);
  if (rawPublic.length !== 65 || rawPublic[0] !== 4) throw new Error('Invalid VAPID public key');
  const jwk = { kty: 'EC', crv: 'P-256', x: encode(rawPublic.slice(1, 33)), y: encode(rawPublic.slice(33, 65)), d: encode(decode(privateKey)), ext: true, key_ops: ['sign'] };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const header = encode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = encode(encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: now + 12 * 60 * 60, sub: env.VAPID_SUBJECT || 'mailto:admin@safefield.app' })));
  const unsigned = header + '.' + claims;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(unsigned)));
  return unsigned + '.' + encode(signature);
}
export async function sendWebPush(env: Env, subscription: { endpoint: string; p256dh: string; auth: string }, payload: { title: string; body: string; url: string }) {
  const token = await vapidToken(subscription.endpoint, env);
  const body = await encryptPayload(JSON.stringify(payload), subscription.p256dh, subscription.auth);
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: 'vapid t=' + token + ', k=' + (env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '300',
      Urgency: 'high'
    },
    body
  });
}
