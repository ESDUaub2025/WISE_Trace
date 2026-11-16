import { createDatabase, scopedClient } from './database.mjs';
import { deliverPush } from './functions/_shared/push.mjs';
import { deliverAlerts } from './functions/_shared/alerts.mjs';
import { deliverMonthlyReports } from './functions/_shared/monthly-reports.mjs';
const database = createDatabase(process.env.DATABASE_URL);
let stopped = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    stopped = true;
  });
try {
  while (!stopped) {
    const lease = await database.pool.connect();
    try {
      if ((await lease.query('select pg_try_advisory_lock(867450232) as claimed')).rows[0].claimed) {
        const client = scopedClient(database, { service: true });
        const result = await client.rpc('generate_tasks');
        if (result.error) throw result.error;
        await deliverPush(client);
        await deliverAlerts(client);
        await deliverMonthlyReports(client);
      }
    } catch {
      process.stderr.write('Scheduled processing failed; will retry.\n');
    } finally {
      await lease.query('select pg_advisory_unlock(867450232)');
      lease.release();
    }
    for (let second = 0; second < 60 && !stopped; second++) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  await database.close();
}
