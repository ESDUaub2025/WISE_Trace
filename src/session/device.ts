// This browser's identity as a registered device (PRD FR-ORG-05).
// The server ties a device to one cooperative, so a browser used by people from different
// cooperatives keeps one device id per cooperative and uses the active person's.
import { demo } from '../lib/api';
import { ids } from '../lib/demo';

const currentKey = 'wise-device';
const perCooperativeKey = 'wise-devices';

function readMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(perCooperativeKey) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

/** The device id records are stamped with. Created on first use. */
export async function getDevice(): Promise<string> {
  if (demo) return ids.device;
  let device = localStorage.getItem(currentKey);
  if (!device) {
    device = crypto.randomUUID();
    localStorage.setItem(currentKey, device);
  }
  return device;
}

/** Switches to the device id for a cooperative (creating one the first time) and returns it. */
export async function selectDevice(cooperativeId: string): Promise<string> {
  if (demo) return ids.device;
  const devices = readMap();
  if (!devices[cooperativeId]) {
    devices[cooperativeId] = crypto.randomUUID();
    localStorage.setItem(perCooperativeKey, JSON.stringify(devices));
  }
  localStorage.setItem(currentKey, devices[cooperativeId]);
  return devices[cooperativeId];
}

/** A friendly default label for the device list an administrator sees. */
export function deviceLabel(username: string) {
  const mobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent);
  return `${mobile ? 'Phone' : 'Computer'} · ${username}`;
}
