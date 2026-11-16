function decode(value) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
}
function encode(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
const utf8 = (value) => new TextEncoder().encode(value);
export function pushEndpoint(endpoint) {
  const url = new URL(endpoint);
  if (
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    !/^(fcm\.googleapis\.com|([a-z0-9-]+\.)?push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)?notify\.windows\.com)$/.test(
      url.hostname,
    )
  )
    throw new Error('Unsupported push endpoint');
  return url;
}
export async function vapidAuthorization(endpoint, keys, now = Date.now()) {
  const url = pushEndpoint(endpoint),
    publicKey = decode(keys.publicKey),
    privateKey = decode(keys.privateKey);
  if (
    publicKey.length !== 65 ||
    publicKey[0] !== 4 ||
    privateKey.length !== 32 ||
    !/^mailto:[^\s@]+@[^\s@]+$|^https:\/\//.test(keys.subject)
  )
    throw new Error('Invalid VAPID configuration');
  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: encode(publicKey.slice(1, 33)),
      y: encode(publicKey.slice(33)),
      d: encode(privateKey),
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const message =
    encode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))) +
    '.' +
    encode(utf8(JSON.stringify({ aud: url.origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(message));
  return `vapid t=${message}.${encode(new Uint8Array(signature))}, k=${keys.publicKey}`;
}
export class PushProviderError extends Error {
  statusCode;
  constructor(statusCode) {
    super(`Push provider status ${statusCode}`);
    this.statusCode = statusCode;
  }
}
export async function sendPush(endpoint, keys) {
  const authorization = await vapidAuthorization(endpoint, keys);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: authorization, TTL: '86400', Urgency: 'normal' },
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new PushProviderError(response.status);
}
