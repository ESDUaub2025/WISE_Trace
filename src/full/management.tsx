import { isOnline } from '../connectivity/connectivity';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import type { Identity } from '../lib/domain';
import { api, demo } from '../lib/api';
import { getDevice, type Snapshot } from '../lib/data';

export function RegistryFlow({
  entity,
  identity,
  data,
  onDone,
}: {
  entity: string;
  identity: Identity;
  data: Snapshot;
  onDone: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState('');
  const registryRows =
    entity === 'supplier'
      ? data.suppliers
      : entity === 'equipment'
        ? data.equipment
        : entity === 'cooperative'
          ? data.cooperatives
          : [];
  const existing = registryRows.find((row) => row.id === selected) as Record<string, unknown> | undefined;
  const fields: Record<string, string[]> = {
    sop_migration: ['lot_id', 'config_version_id', 'reason', 'pin'],
    anonymize: ['user_id', 'reason'],
    data_agreement: ['cooperative_id', 'reference'],
    supplier: ['name', 'type', 'status', 'contacts', 'declarations'],
    equipment: ['label', 'type', 'status', 'calibrated_at', 'next_due_at'],
    cooperative: ['code', 'name', 'region', 'status', 'joined_on', 'contacts', 'sites'],
    user: ['cooperative_id', 'username', 'display_name', 'password', 'pin', 'roles'],
    // A member forgot their password or PIN: fill in either or both (server/functions/user-admin).
    reset_access: ['user_id', 'password', 'pin'],
    amendment: ['lot_id', 'changes', 'reason'],
    stock_count: ['lot_id', 'quantity', 'reason'],
    resolve_conflict: ['receipt_id', 'corrected_payload', 'reason'],
    training_exception: ['user_id', 'reason', 'expires_at'],
    revoke_device: ['device_id', 'reason'],
    account: ['user_id', 'status', 'roles', 'authorizations', 'reason'],
    notification_preferences: ['channel', 'destination'],
    consent: ['sex', 'age_band'],
    complete_recall: ['recall_id', 'actions'],
  };
  const jsonFields = ['declarations', 'contacts', 'sites', 'changes', 'corrected_payload', 'authorizations', 'actions'];
  const defaults: Record<string, string> = {
    status: entity === 'supplier' ? 'provisional' : 'active',
    roles: 'producer',
    declarations: '{}',
    contacts: '{}',
    sites: '[]',
    changes: '{}',
    corrected_payload: '{}',
    authorizations: '{}',
    actions: '[{"action":"stop_sale","quantity":0,"notes":"Confirmed"}]',
  };
  function options(name: string) {
    if (name === 'config_version_id')
      return data.configs
        .filter((c) => c.status === 'approved' && c.kind === 'sop')
        .map((c) => ({ id: String(c.id), label: String(c.version) }));
    if (name === 'cooperative_id') return data.cooperatives.map((c) => ({ id: String(c.id), label: String(c.name) }));
    if (name === 'lot_id') return data.lots.map((l) => ({ id: l.id, label: l.code }));
    if (name === 'user_id')
      return data.members.map((m) => ({ id: String(m.user_id ?? m.id), label: String(m.display_name) }));
    if (name === 'device_id') return data.devices.map((d) => ({ id: String(d.id), label: String(d.label) }));
    if (name === 'receipt_id')
      return data.tasks
        .filter((task) => task.kind === 'sync_conflict')
        .map((task) => ({ id: String(task.details.receipt_id), label: String(task.details.error) }));
    if (name === 'recall_id')
      return data.recalls
        .filter((r) => r.status !== 'closed')
        .map((r) => ({ id: String(r.id), label: String(r.reason) }));
    return null;
  }
  return (
    <form
      className="record-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
          if (!api || demo || !isOnline()) throw new Error('onlineRequired');
          const f = new FormData(event.currentTarget);
          const value = (key: string) => String(f.get(key) ?? '');
          const payload = Object.fromEntries(
            (fields[entity] ?? []).map((field) => [
              field,
              jsonFields.includes(field) ? JSON.parse(value(field)) : value(field),
            ]),
          );
          let reply;
          if (entity === 'reset_access')
            reply = await api.functions.invoke('user-admin', {
              body: {
                action: 'reset_access',
                user_id: value('user_id'),
                ...(value('password') ? { password: value('password') } : {}),
                ...(value('pin') ? { pin: value('pin') } : {}),
              },
            });
          else if (entity === 'user')
            reply = await api.functions.invoke('user-admin', {
              body: {
                ...payload,
                roles: value('roles')
                  .split(',')
                  .map((r) => r.trim()),
                cooperative_id: value('cooperative_id') || identity.cooperative_id,
                authorizations: { receive_whey: f.has('receive_whey') },
              },
            });
          else if (entity === 'sop_migration') {
            const signed = await api.rpc('pin_signoff', {
              pin: value('pin'),
              device: await getDevice(),
              action: 'migrate_sop',
              object_id: value('lot_id'),
            });
            if (signed.error || !signed.data) throw new Error('authFailed');
            reply = await api.rpc('migrate_batch_sop', {
              target: value('lot_id'),
              configuration: value('config_version_id'),
              reason: value('reason'),
              sign: signed.data,
            });
          } else if (entity === 'anonymize') {
            if (!f.has('confirm')) throw new Error('privacyConfirm');
            reply = await api.functions.invoke('subject-privacy', {
              body: { target: value('user_id'), reason: value('reason') },
            });
          } else if (entity === 'data_agreement')
            reply = await api.rpc('set_partner_data_agreement', {
              target: value('cooperative_id'),
              consent: f.has('consent'),
              reference: value('reference'),
            });
          else if (entity === 'cooperative')
            reply = await api.rpc('manage_cooperative', { target: selected || crypto.randomUUID(), payload });
          else if (['supplier', 'equipment'].includes(entity))
            reply = await api.rpc('manage_registry', {
              entity,
              target: selected || crypto.randomUUID(),
              payload: { ...payload, cooperative_id: existing?.cooperative_id ?? identity.cooperative_id },
            });
          else if (entity === 'amendment')
            reply = await api.rpc('record_amendment', {
              target: value('lot_id'),
              changes: payload.changes,
              reason: value('reason'),
              device: await getDevice(),
            });
          else if (entity === 'stock_count')
            reply = await api.rpc('reconcile_stock', {
              target: value('lot_id'),
              counted: Number(value('quantity')),
              reason: value('reason'),
              device: await getDevice(),
            });
          else if (entity === 'resolve_conflict')
            reply = await api.rpc('resolve_sync_conflict', {
              target: value('receipt_id'),
              corrected_payload: payload.corrected_payload,
              reason: value('reason'),
            });
          else if (entity === 'training_exception')
            reply = await api.rpc('grant_training_exception', {
              target: value('user_id'),
              reason: value('reason'),
              expires: new Date(value('expires_at')).toISOString(),
              supervised: true,
            });
          else if (entity === 'revoke_device')
            reply = await api.rpc('revoke_device', { target: value('device_id'), reason: value('reason') });
          else if (entity === 'account')
            reply = await api.rpc('manage_account', {
              target: value('user_id'),
              status: value('status'),
              roles: value('roles')
                .split(',')
                .map((r) => r.trim()),
              authorizations: payload.authorizations,
              reason: value('reason'),
            });
          else if (entity === 'notification_preferences')
            reply = await api.rpc('set_notification_preference', {
              channel: value('channel'),
              destination: value('destination'),
              opted_in: f.has('opted_in'),
            });
          else if (entity === 'consent')
            reply = await api.rpc('record_consent', {
              sex: value('sex'),
              age_band: value('age_band'),
              consent: f.has('consent'),
            });
          else if (entity === 'complete_recall')
            reply = await api.rpc('complete_recall', { target: value('recall_id'), actions: payload.actions });
          else throw new Error('error');
          if (reply?.error) throw reply.error;
          await onDone();
        } catch (e) {
          setError(e instanceof Error ? e.message : 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      {['supplier', 'equipment', 'cooperative'].includes(entity) && (
        <label>
          {t('editOrCreate')}
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">{t('createNew')}</option>
            {registryRows.map((row) => (
              <option key={String(row.id)} value={String(row.id)}>
                {String('name' in row ? row.name : row.label)}
              </option>
            ))}
          </select>
        </label>
      )}
      {(fields[entity] ?? []).map((name) => {
        const choices = options(name);
        const stored = existing?.[name];
        const value =
          stored === undefined
            ? defaults[name]
            : jsonFields.includes(name)
              ? JSON.stringify(stored, null, 2)
              : ['calibrated_at', 'next_due_at', 'expires_at'].includes(name) && stored
                ? String(stored).slice(0, 16)
                : String(stored ?? '');
        const statusOptions = entity === 'supplier' ? ['approved', 'provisional', 'suspended'] : ['active', 'inactive'];
        return (
          <label key={selected + name}>
            {t(name)}
            {['sex', 'age_band'].includes(name) ? (
              <select name={name}>
                <option value="">{t('notSpecified')}</option>
                {(name === 'sex'
                  ? ['female', 'male', 'other']
                  : ['18-24', '25-34', '35-44', '45-54', '55-64', '65+']
                ).map((value) => (
                  <option key={value} value={value}>
                    {name === 'sex' ? t(value) : value}
                  </option>
                ))}
              </select>
            ) : name === 'channel' ? (
              <select name={name}>
                {['sms', 'whatsapp'].map((channel) => (
                  <option key={channel} value={channel}>
                    {t(channel)}
                  </option>
                ))}
              </select>
            ) : name === 'status' ? (
              <select name={name} defaultValue={value}>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {t(status)}
                  </option>
                ))}
              </select>
            ) : name === 'type' && entity === 'supplier' ? (
              <select name={name} defaultValue={value ?? 'dairy'}>
                {['dairy', 'bulgur', 'salt', 'ingredient', 'packaging'].map((type) => (
                  <option value={type} key={type}>
                    {t(type)}
                  </option>
                ))}
              </select>
            ) : choices ? (
              <select name={name} required>
                {choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
            ) : jsonFields.includes(name) ? (
              <textarea name={name} rows={5} defaultValue={value} required className="mono" />
            ) : (
              <input
                name={name}
                type={
                  ['password', 'pin'].includes(name)
                    ? 'password'
                    : ['calibrated_at', 'next_due_at', 'expires_at'].includes(name)
                      ? 'datetime-local'
                      : name === 'joined_on'
                        ? 'date'
                        : name === 'quantity'
                          ? 'number'
                          : 'text'
                }
                defaultValue={name === 'joined_on' ? value || new Date().toISOString().slice(0, 10) : value}
                required={!['calibrated_at', 'next_due_at'].includes(name) && entity !== 'reset_access'}
              />
            )}
          </label>
        );
      })}
      {entity === 'notification_preferences' && (
        <>
          <p>{t('alertPhoneFormat')}</p>
          <label className="checkbox">
            <input name="opted_in" type="checkbox" />
            {t('criticalAlertConsent')}
          </label>
        </>
      )}
      {entity === 'user' && (
        <label className="checkbox">
          <input name="receive_whey" type="checkbox" />
          {t('authorization')} · {t('whey')}
        </label>
      )}
      {entity === 'reset_access' && <p className="callout">{t('resetAccessHelp')}</p>}
      {entity === 'anonymize' && (
        <label className="checkbox">
          <input name="confirm" type="checkbox" required />
          {t('privacyConfirm')}
        </label>
      )}
      {entity === 'data_agreement' && (
        <label className="checkbox">
          <input name="consent" type="checkbox" />
          {t('partnerDataConsent')}
        </label>
      )}
      {entity === 'consent' && <p className="callout">{t('profileConsentHelp')}</p>}
      {entity === 'consent' && (
        <label className="checkbox">
          <input name="consent" type="checkbox" />
          {t('consent')}
        </label>
      )}
      {error && (
        <p className="error-box" role="alert">
          {t(error)}
        </p>
      )}
      <Button disabled={busy || !isOnline() || demo}>{t(busy ? 'loading' : 'save')}</Button>
    </form>
  );
}
