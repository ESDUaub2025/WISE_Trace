import {formatNumber} from './lib/format';
import {useTranslation} from 'react-i18next';
import type {Snapshot} from './lib/data';
import type {Lot} from './lib/domain';
export function MaterialBalance({data,lot}:{data:Snapshot;lot:Lot}){
 const {t,i18n}=useTranslation();const balance=data.materialBalances?.find(row=>row.id===lot.id);if(!balance)return null;
 const keys=['received','accepted','rejected','on_hold','allocated','disposed','diverted','lost','measurement_difference','remaining','valorized'];const number=(key:string)=>Number(balance[key]??0);const difference=number('received')-number('allocated')-number('disposed')-number('diverted')-number('lost')-number('measurement_difference')-number('remaining');
 return <section className="material-balance"><h2>{t('massBalance')}</h2><dl>{keys.map(key=><div key={key}><dt>{t('balance_'+key)}</dt><dd>{formatNumber(number(key),i18n.language,{maximumFractionDigits:3})} <bdi>{lot.unit}</bdi></dd></div>)}</dl>{Math.abs(difference)>.000001&&<p className="error-box">{t('balanceDifference')}: {formatNumber(difference,i18n.language)} {lot.unit}</p>}</section>;
}
