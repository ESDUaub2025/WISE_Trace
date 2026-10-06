import { supabase } from './supabase';
export async function downloadReport(report:string,format:'csv'|'xlsx'|'pdf',target?:string,filters:{from_date?:string;to_date?:string;cooperative_id?:string;config_version_id?:string;region?:string;lot_type?:string}={}){
 if(!supabase)throw new Error('setup');const session=await supabase.auth.getSession();if(!session.data.session)throw new Error('authFailed');
 const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/report`,{method:'POST',headers:{Authorization:`Bearer ${session.data.session.access_token}`,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({report,format,target,...filters})});
 if(!response.ok){const error=await response.json();throw new Error(error.error??'error');}const url=URL.createObjectURL(await response.blob());const anchor=document.createElement('a');anchor.href=url;anchor.download=`wise-${report}.${format}`;anchor.click();URL.revokeObjectURL(url);
}
