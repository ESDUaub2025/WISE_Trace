/** The local server trusts sign-ins only from 127.0.0.1, and a browser keeps a separate signed-in session for each address.
 * During development "localhost" therefore moves to 127.0.0.1, so the full and simple apps always share one address and one sign-in.
 * Returns true while the page is moving, so the caller renders nothing. */
export function movedToTrustedOrigin() {
  if (!import.meta.env.DEV || location.hostname !== 'localhost') return false;
  location.replace(location.href.replace('//localhost', '//127.0.0.1'));
  return true;
}
