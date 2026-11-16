import { isOnline } from '../connectivity/connectivity';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, demo } from '../lib/api';
import { formatNumber } from '../lib/format';
import type { Lot } from '../lib/domain';
import type { Row } from '../lib/data';
export function StockBalance({ lot }: { lot: Lot }) {
  const { t, i18n } = useTranslation();
  const [balance, setBalance] = useState<Row | null>(null);
  useEffect(() => {
    let cancelled = false;
    setBalance(null);
    if (api && !demo && isOnline())
      void api.rpc('finished_stock_balance', { target: lot.id }).then((result) => {
        if (!cancelled && !result.error) setBalance(result.data);
      });
    return () => {
      cancelled = true;
    };
  }, [lot.id, lot.available]);
  return balance ? (
    <section className="card material-balance">
      <h2>{t('stockBalance')}</h2>
      <p>{t('stockBalanceFormula')}</p>
      <dl>
        {[
          'produced',
          'sold_distributed',
          'removed_lost',
          'returned',
          'adjusted',
          'in_stock',
          'difference',
          'tolerance',
        ].map((key) => (
          <div key={key}>
            <dt>{t('stock_' + key)}</dt>
            <dd>{formatNumber(Number(balance[key]), i18n.language)}</dd>
          </div>
        ))}
      </dl>
      <p className={balance.balanced ? 'quiet' : 'error-box'}>
        {t(balance.balanced ? 'stockBalanced' : 'stockUnbalanced')}
      </p>
    </section>
  ) : null;
}
