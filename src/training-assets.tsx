import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Upload} from 'lucide-react';
import {Button} from './components/ui/button';
import {supabase,demo} from './lib/supabase';
import {prepareTrainingMedia} from './lib/training-media';
import type {Identity} from './lib/domain';

export function TrainingAssetUpload({identity,config,onDone}:{identity:Identity;config:string;onDone:()=>Promise<void>}){
 const {t}=useTranslation();const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState('');const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 return <form className="record-form" onSubmit={async e=>{
  e.preventDefault();setError('');setBusy(true);setProgress(0);const fields=new FormData(e.currentTarget);const abort=new AbortController();controller.current=abort;
  try{
   if(!supabase||demo||!navigator.onLine||!file)throw new Error('onlineRequired');
   const blob=await prepareTrainingMedia(file,setProgress,abort.signal);if(abort.signal.aborted)throw new Error('compressionCancelled');setProgress(1);
   const id=crypto.randomUUID(),path=`${config}/${id}.${blob.type==='image/jpeg'?'jpg':blob.type==='video/mp4'?'mp4':'webm'}`;
   const upload=await supabase.storage.from('training').upload(path,blob,{contentType:blob.type,upsert:false});if(upload.error)throw upload.error;
   const register=await supabase.rpc('register_training_asset',{target:id,config,path,title:{en:String(fields.get('title_en')),ar:String(fields.get('title_ar'))}});if(register.error)throw register.error;
   setFile(null);await onDone();
  }catch(e){setError(e instanceof Error?e.message:'uploadFailed');}finally{setBusy(false);controller.current=null;}
 }}>
 <h2>{t('trainingMedia')}</h2><p className="quiet">{t('trainingMediaIntro')}</p>
 <label>{t('titleEnglish')}<input name="title_en" minLength={2} required/></label><label>{t('titleArabic')}<input name="title_ar" dir="rtl" minLength={2} required/></label>
 <label>{t('chooseMedia')}<input type="file" accept="image/*,video/*" onChange={e=>setFile(e.target.files?.[0]??null)} required/></label>
 {busy&&<><progress value={progress} max={1} aria-label={t('compressionProgress')}/><p>{t(progress>=1?'uploading':'compressingVideo')}</p>{progress<1&&<Button type="button" variant="outline" onClick={()=>controller.current?.abort()}>{t('cancel')}</Button>}</>}
 {error&&<p className="error-box" role="alert">{t(error)}</p>}
 <Button disabled={busy||demo||!identity.roles.includes('admin')}><Upload size={18}/>{t('uploadTrainingMedia')}</Button>
 </form>;
}
