import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConnectivity } from './connectivity';

const config = {
  healthPath: '/health',
  timeoutMs: 100,
  checkEveryMs: 30_000,
  retry: { firstMs: 5_000, maxMs: 20_000 },
};

describe('connectivity', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(initial: { network: boolean; server: boolean }) {
    const world = { ...initial };
    const probe = vi.fn(async () => world.server);
    const link = createConnectivity({ probe, browserOnline: () => world.network, config });
    return { world, probe, link };
  }

  it('is unreachable, not online, when the phone has a network but the server does not answer', async () => {
    const { link } = setup({ network: true, server: false });
    expect(link.get()).toBe('online'); // optimistic until the first answer
    expect(await link.check()).toBe('unreachable');
    expect(link.isOnline()).toBe(false);
  });

  it('is offline without asking the server when the phone has no network', async () => {
    const { link, probe } = setup({ network: false, server: true });
    expect(await link.check()).toBe('offline');
    expect(probe).not.toHaveBeenCalled();
  });

  it('retries sooner after a failure, backs off to the limit, and recovers', async () => {
    const { link, probe, world } = setup({ network: true, server: false });
    link.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000); // first retry
    await vi.advanceTimersByTimeAsync(10_000); // doubled
    await vi.advanceTimersByTimeAsync(20_000); // capped at maxMs
    expect(probe).toHaveBeenCalledTimes(4);
    world.server = true;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(link.get()).toBe('online');
    link.stop();
  });

  it('tells listeners only when the state changes, and reacts to the network going away', async () => {
    const { link, world } = setup({ network: true, server: true });
    const listener = vi.fn();
    link.subscribe(listener);
    await link.check();
    expect(listener).not.toHaveBeenCalled(); // already online
    world.network = false;
    link.networkChanged();
    expect(link.get()).toBe('offline');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('verifies at once when a request fails, instead of waiting for the next scheduled check', async () => {
    const { link, world, probe } = setup({ network: true, server: true });
    await link.check();
    world.server = false;
    link.reportFailure();
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(link.get()).toBe('unreachable');
  });
});
