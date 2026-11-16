const env = (key) => process.env[key];
import { json, serverClient } from '../_shared/http.mjs';
import { deliverPush } from '../_shared/push.mjs';
import { deliverAlerts } from '../_shared/alerts.mjs';
import { deliverMonthlyReports } from '../_shared/monthly-reports.mjs';
export default async (request) => {
  const secret = env('SCHEDULER_SECRET');
  if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) return json({ error: 'Forbidden' }, 403);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const client = serverClient();
    const { data, error } = await client.rpc('generate_tasks');
    if (error) throw error;
    return json({
      open_tasks: data,
      push: await deliverPush(client),
      alerts: await deliverAlerts(client),
      reports: await deliverMonthlyReports(client),
    });
  } catch {
    return json({ error: 'Scheduled task processing failed' }, 500);
  }
};
