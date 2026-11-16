import { actingHeaders, api, apiBase, getActingUser } from './api';
export async function downloadReport(
  report: string,
  format: 'csv' | 'xlsx' | 'pdf',
  target?: string,
  filters: {
    status_filter?: string;
    product_filter?: string;
    from_date?: string;
    to_date?: string;
    cooperative_id?: string;
    config_version_id?: string;
    region?: string;
    lot_type?: string;
  } = {},
) {
  if (!api) throw new Error('setup');
  if (!getActingUser()) throw new Error('signInRequired');
  const response = await fetch(`${apiBase}/functions/report`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { ...actingHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ report, format, target, ...filters }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? 'error');
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `wise-${report}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
