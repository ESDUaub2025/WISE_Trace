import {useEffect,useRef,useState} from 'react';
import {BrowserQRCodeReader,type IScannerControls} from '@zxing/browser';
import {useTranslation} from 'react-i18next';
import {Button} from './components/ui/button';
import {Camera} from 'lucide-react';
export function Scanner({onToken}:{onToken:(token:string)=>void}){
 const {t}=useTranslation();const video=useRef<HTMLVideoElement>(null);const controls=useRef<IScannerControls|null>(null);const [error,setError]=useState('');const reader=useRef(new BrowserQRCodeReader());
 const decoded=(value:string)=>{try{const url=new URL(value);if(url.origin!==location.origin||url.pathname!=='/p/')throw new Error('Unknown QR origin');const token=url.searchParams.get('t');if(!token)throw new Error('Unknown token');controls.current?.stop();onToken(token);}catch{setError('error');}};
 useEffect(()=>()=>controls.current?.stop(),[]);
 return <div className="record-form"><video ref={video} playsInline muted aria-label={t('qr')} style={{inlineSize:'100%',borderRadius:8}}/><Button onClick={async()=>{try{controls.current=await reader.current.decodeFromVideoDevice(undefined,video.current!,(result)=>{if(result)decoded(result.getText());});}catch{setError('error');}}}><Camera size={20}/>{t('qr')}</Button><label>{t('photo')}<input type="file" accept="image/*" onChange={async event=>{const file=event.target.files?.[0];if(!file)return;const url=URL.createObjectURL(file);try{decoded((await reader.current.decodeFromImageUrl(url)).getText());}catch{setError('error');}finally{URL.revokeObjectURL(url);}}}/></label>{error&&<p className="error-box" role="alert">{t(error)}</p>}</div>;
}
