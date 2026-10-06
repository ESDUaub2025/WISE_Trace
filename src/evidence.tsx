import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Button} from './components/ui/button';
import {supabase} from './lib/supabase';
import type {Row} from './lib/data';
import {db} from './offline/db';
export function EvidenceList({recordIds,attachments}:{recordIds:string[];attachments:Row[]}){
 const {t}=useTranslation();const [local,setLocal]=useState<{id:string;url:string;type:string}[]>([]),[remote,setRemote]=useState<Record<string,string>>({}),[error,setError]=useState('');const key=recordIds.join(',');
 useEffect(()=>{let cancelled=false;let urls:string[]=[];void db.media.filter(m=>key.split(',').includes(m.record_id)&&!m.uploaded).toArray().then(rows=>{if(cancelled)return;const results=rows.map(row=>({id:row.id,url:URL.createObjectURL(row.blob),type:row.type}));urls=results.map(row=>row.url);setLocal(results);});return()=>{cancelled=true;urls.forEach(url=>URL.revokeObjectURL(url));};},[key]);
 const render=(url:string,type:string)=>type.startsWith('image')?<img src={url} alt={t('photo')} loading="lazy" style={{maxWidth:'100%',maxHeight:300}}/>:<audio src={url} controls preload="metadata" aria-label={t('voice')}/>;
 return <div className="evidence-list">{local.map(row=><figure key={row.id}>{render(row.url,row.type)}<figcaption>{t('saved')}</figcaption></figure>)}{attachments.filter(row=>recordIds.includes(String(row.record_id))).map(row=><figure key={String(row.id)}>{remote[String(row.id)]?render(remote[String(row.id)],String(row.media_type)):<Button variant="outline" onClick={async()=>{if(!supabase)return;const response=await supabase.storage.from('evidence').createSignedUrl(String(row.storage_path),180);if(response.error)setError(response.error.message);else setRemote(old=>({...old,[String(row.id)]:response.data.signedUrl}));}}>{t('viewEvidence')}</Button>}</figure>)}{error&&<p className="error-box">{t(error)}</p>}</div>;
}
