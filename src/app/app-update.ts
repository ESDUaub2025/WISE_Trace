// Keeps an installed app on the current version.
// When a new version has taken over in the background, the open page is still running the old code.
// An old page talking to a new server is how "cannot sign in" appears after a release, so the page
// reloads itself, but only at a moment that cannot lose anything someone is typing:
//   - immediately on the sign-in screens (nobody is working yet), or
//   - the next time the app goes to the background.
// Saved records are never at risk: they are already in the device database.
import { getActingUser } from '../lib/api';

export function watchForAppUpdate() {
  if (!('serviceWorker' in navigator)) return;
  // No controller yet means this is the first install, not an update.
  let hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  const reload = () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (!getActingUser() || document.visibilityState === 'hidden') return reload();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') reload();
    });
  });
}
