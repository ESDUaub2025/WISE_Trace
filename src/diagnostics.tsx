import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {supabase} from './lib/supabase';
import type {Row} from './lib/data';
import {RecordList} from './App';
export function DiagnosticPanel(){const {t}=useTranslation();const [rows,setRows]=useState<Row[]>([]);useEffect(()=>{if(supabase&&navigator.onLine)void supabase.from('client_diagnostic').select('*').order('recorded_at',{ascending:false}).limit(100).then(r=>{if(!r.error)setRows(r.data);});},[]);return <details className="card"><summary>{t('diagnostics')}</summary><p>{t('diagnosticsHelp')}</p><RecordList rows={rows} fields={['code','screen','device_id','observed_at']}/></details>;}
