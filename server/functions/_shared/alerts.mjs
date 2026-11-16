const env = (key) => process.env[key];
export async function deliverAlerts(client) {
  const { data, error } = await client.rpc('claim_alert_deliveries');
  if (error) throw error;
  const endpoint = env('ALERT_PROVIDER_URL'),
    token = env('ALERT_PROVIDER_TOKEN');
  let delivered = 0,
    logged = 0,
    failed = 0;
  for (const job of data) {
    let status = 'logged',
      last_error = null;
    try {
      if (endpoint && token) {
        if (!endpoint.startsWith('https://')) throw new Error('HTTPS provider required');
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `wise-alert-${job.notification_id}-${job.recipient_id}`,
          },
          body: JSON.stringify({
            ...job,
            message: 'WISE: a critical operational alert requires your review. Open WISE for details.',
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error('Provider rejected delivery');
        status = 'delivered';
        delivered++;
      } else {
        console.info(
          JSON.stringify({
            provider: 'log',
            notification_id: job.notification_id,
            recipient_id: job.recipient_id,
            channel: job.channel,
            delivered: false,
          }),
        );
        logged++;
      }
    } catch {
      status = 'failed';
      last_error = 'Alert provider unavailable';
      failed++;
    }
    const saved = await client
      .from('alert_delivery')
      .update({
        status,
        last_error,
        delivered_at: status === 'delivered' ? new Date().toISOString() : null,
        next_attempt_at: new Date(Date.now() + 15 * 60000).toISOString(),
      })
      .eq('notification_id', job.notification_id)
      .eq('recipient_id', job.recipient_id);
    if (saved.error) throw saved.error;
  }
  return { delivered, logged, failed, provider: endpoint && token ? 'configured' : 'log' };
}
