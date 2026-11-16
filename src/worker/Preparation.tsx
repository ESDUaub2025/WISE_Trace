import { useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { saveAction, type Snapshot } from '../lib/data';
import type { Identity } from '../lib/domain';
import { saveFileRegistry } from '../testing/file-backend';
import { useText } from '../simple/text';
import { useWorkerText } from './copy';

export function Preparation({
  data,
  identity,
  refresh,
}: {
  data: Snapshot;
  identity: Identity;
  refresh: () => Promise<Snapshot | undefined>;
}) {
  const { w } = useWorkerText();
  const { error: errorText } = useText();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const section = params.get('section');
  const destination = params.get('return');
  // Only return to an internal worker task, never a URL supplied by an external query string.
  const returnTo = destination?.startsWith('/task/') ? destination : undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [materialKind, setMaterialKind] = useState(
    params.get('kind') === 'ingredient' ? 'ingredient' : 'packaging_material',
  );
  const [materialUnit, setMaterialUnit] = useState(materialKind === 'ingredient' ? 'kg' : 'unit');
  const supplierId = useRef(crypto.randomUUID());
  const materialId = useRef<string | null>(null);
  const choose = (value: string) => {
    setSaved(false);
    setError('');
    setParams({ section: value, ...(returnTo ? { return: returnTo } : {}) }, { replace: true });
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    setBusy(true);
    setError('');
    try {
      if (!name) throw new Error('positive_quantity');
      if (section === 'supplier') {
        if (
          data.suppliers.some(
            (s) => s.id !== supplierId.current && s.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
          )
        ) {
          setError(w('supplierExists'));
          return;
        }
        await saveFileRegistry('supplier', supplierId.current, {
          name,
          type: 'dairy',
          status: 'approved',
          declarations: {},
        });
      } else {
        const quantity = Number(form.get('quantity'));
        if (!Number.isFinite(quantity) || quantity <= 0) {
          setError(w('invalid'));
          return;
        }
        if (!materialId.current)
          materialId.current = await saveAction(identity, data.config, 'receipt', {
            type: form.get('type'),
            quantity,
            unit: form.get('unit'),
            facts: { name, ingredient_type: name },
          });
      }
      const result = await refresh();
      const visible =
        section === 'supplier'
          ? result?.suppliers.some((s) => s.id === supplierId.current)
          : result?.lots.some((l) => l.id === materialId.current);
      if (!visible) throw new Error('serverUnreachable');
      if (returnTo) void navigate(returnTo, { replace: true });
      else setSaved(true);
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : 'error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="w-main w-narrow">
      <button className="w-back" onClick={() => void navigate(returnTo ?? '/help')}>
        <ArrowLeft size={20} />
        {w('back')}
      </button>
      <h1>{w('prepare')}</h1>
      <p className="w-subtitle">{w('prepareNote')}</p>
      <div className="w-tabs" aria-label={w('prepare')}>
        <button aria-pressed={section === 'supplier'} onClick={() => choose('supplier')}>
          {w('suppliers')}
        </button>
        <button aria-pressed={section === 'materials'} onClick={() => choose('materials')}>
          {w('materials')}
        </button>
      </div>
      {saved ? (
        <section className="w-card w-empty" role="status">
          <Check size={36} />
          <h2>{w('saved')}</h2>
          <button
            className="w-primary"
            onClick={() => {
              supplierId.current = crypto.randomUUID();
              materialId.current = null;
              setSaved(false);
            }}
          >
            {section === 'supplier' ? w('addSupplier') : w('addMaterial')}
          </button>
          <button className="w-secondary" onClick={() => void navigate('/today')}>
            {w('home')}
          </button>
        </section>
      ) : (
        <form className="w-card w-form" onSubmit={(event) => void submit(event)} key={section}>
          <h2>{section === 'supplier' ? w('addSupplier') : w('addMaterial')}</h2>
          <label>
            {section === 'supplier' ? w('supplierName') : w('materialName')}
            <input name="name" required maxLength={100} autoComplete="off" dir="auto" />
          </label>
          {section !== 'supplier' && (
            <>
              <label>
                {w('materialKind')}
                <select
                  name="type"
                  value={materialKind}
                  onChange={(event) => {
                    setMaterialKind(event.target.value);
                    setMaterialUnit(event.target.value === 'packaging_material' ? 'unit' : 'kg');
                  }}
                >
                  <option value="packaging_material">{w('packagingMaterial')}</option>
                  <option value="ingredient">{w('ingredient')}</option>
                </select>
              </label>
              <div className="w-form-row">
                <label>
                  {w('amount')}
                  <input name="quantity" required type="number" inputMode="decimal" min="0.001" step="any" />
                </label>
                <label>
                  {w('unit')}
                  <select name="unit" value={materialUnit} onChange={(event) => setMaterialUnit(event.target.value)}>
                    {materialKind === 'packaging_material' ? (
                      <option value="unit">{w('units')}</option>
                    ) : (
                      <>
                        <option value="kg">kg</option>
                        <option value="L">L</option>
                      </>
                    )}
                  </select>
                </label>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="w-error">
              {error}
            </p>
          )}
          <button className="w-primary" disabled={busy}>
            <Plus size={20} />
            {busy ? w('saving') : returnTo ? w('returnTask') : w('save')}
          </button>
        </form>
      )}
      <section className="w-section">
        <h2>{section === 'supplier' ? w('suppliers') : w('materials')}</h2>
        {section === 'supplier' ? (
          data.suppliers.length ? (
            <ul className="w-plain-list">
              {data.suppliers.map((s) => (
                <li key={s.id}>{s.name}</li>
              ))}
            </ul>
          ) : (
            <p>{w('noSupplier')}</p>
          )
        ) : data.lots.filter((l) => ['ingredient', 'packaging_material'].includes(l.type)).length ? (
          <ul className="w-plain-list">
            {data.lots
              .filter((l) => ['ingredient', 'packaging_material'].includes(l.type))
              .map((l) => (
                <li key={l.id}>
                  {String(l.facts.name ?? w('materials'))}
                  <span>
                    {l.available} {l.unit}
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <p>{w('noMaterials')}</p>
        )}
      </section>
    </main>
  );
}
