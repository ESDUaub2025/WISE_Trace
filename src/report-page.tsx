import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {FileText} from 'lucide-react';
import {Button} from './components/ui/button';
import {Field} from './features';
import {downloadReport} from './lib/reports';
import {demo} from './lib/supabase';
import type {Snapshot} from './lib/data';

export function ReportPage({data,canViewImpact}:{data:Snapshot;canViewImpact:boolean}){
 const {t}=useTranslation();const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [from,setFrom]=useState(`${new Date().getFullYear()}-01-01`),[to,setTo]=useState(new Date().toISOString().slice(0,10)),[coop,setCoop]=useState(''),[config,setConfig]=useState(''),[target,setTarget]=useState(data.lots.find(l=>l.type==='batch')?.id??'');
 const sections=[{name:'whey',report:'lot',type:'whey'},{name:'batches',report:'lot',type:'batch'},{name:'traceability',report:'traceability'},{name:'productionRecord',report:'production_record'},{name:'calibration',report:'calibration'},{name:'materialDisposition',report:'material_disposition'},{name:'inventory',report:'inventory_movement'},{name:'deviations',report:'deviation'},{name:'sale',report:'sale'},{name:'training',report:'training_completion'},{name:'equipment',report:'equipment'},{name:'audit',report:'audit_event'},{name:'recall',report:'recall'},...(canViewImpact?[{name:'impact',report:'impact'}]:[])];
 return <>
  <div className="date-filter"><Field name="start" label={t('startDate')}><input type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></Field><Field name="end" label={t('endDate')}><input type="date" required value={to} onChange={e=>setTo(e.target.value)}/></Field><Field name="cooperative" label={t('organization')}><select value={coop} onChange={e=>setCoop(e.target.value)}><option value="">{t('allAuthorizedCoops')}</option>{data.cooperatives.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>)}</select></Field><Field name="sop" label={t('version')}><select value={config} onChange={e=>setConfig(e.target.value)}><option value="">{t('allVersions')}</option>{data.configs.filter(c=>c.status==='approved'||demo).map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.kind??'sop')} · {String(c.version??1)}</option>)}</select></Field></div>
  <Field name="target_lot" label={t('traceabilityLot')}><select value={target} onChange={e=>setTarget(e.target.value)}>{data.lots.filter(l=>l.type==='batch').map(l=><option value={l.id} key={l.id}>{l.code}</option>)}</select></Field>
  {demo&&<p className="callout">{t('demoExport')}</p>}
  <div className="report-grid">{sections.map(section=><article className="card" key={section.name}><FileText size={25}/><h2>{t(section.name)}</h2><p>{t('reportTitle')}</p><div className="button-group">{(['csv','xlsx','pdf'] as const).map(format=><Button key={format} variant="outline" disabled={busy||demo||!navigator.onLine||(['traceability','production_record'].includes(section.report)&&!target)} onClick={async()=>{setError('');setBusy(true);try{await downloadReport(section.report,format,['traceability','production_record'].includes(section.report)?target||undefined:undefined,{from_date:from,to_date:to,cooperative_id:coop||undefined,config_version_id:config||undefined,lot_type:section.type});}catch(e){setError(e instanceof Error?e.message:'error');}finally{setBusy(false);}}}>{format.toUpperCase()}</Button>)}</div></article>)}</div>
  {error&&<p role="alert" className="error-box">{t(error)}</p>}
 </>;
}
