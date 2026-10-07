import type {SupabaseClient} from 'npm:@supabase/supabase-js@2.117.2';
function attachment(rows:Record<string,unknown>[],filename:string){
 const columns=[...new Set(rows.flatMap(row=>Object.keys(row)))];const cell=(v:unknown)=>`"${String(typeof v==='object'?JSON.stringify(v):v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')}"`;
 const csv='\uFEFF'+[columns.map(cell).join(','),...rows.map(row=>columns.map(key=>cell(row[key])).join(','))].join('\r\n');const bytes=new TextEncoder().encode(csv);if(bytes.length>1024*1024)throw new Error('Report exceeds email attachment limit');
 let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return {filename,content:btoa(binary)};
}
export async function deliverMonthlyReports(client:SupabaseClient){
 const key=Deno.env.get('RESEND_API_KEY'),sender=Deno.env.get('REPORT_EMAIL_FROM');if(!key||!sender)return {enabled:false,sent:0,failed:0};
 const {data,error}=await client.rpc('claim_monthly_reports');if(error)throw error;let sent=0,failed=0;
 for(const job of data){let status='sent',last_error=null;try{
  const attachments=[attachment(job.impact,`wise-impact-${job.period}.csv`),attachment(job.operations,`wise-operations-${job.period}.csv`)];
  for(let index=0;index<job.recipients.length;index++){
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`wise-monthly-${job.schedule_id}-${job.period}-${index}`},body:JSON.stringify({from:sender,to:[job.recipients[index]],subject:`WISE monthly reports · ${job.period}`,text:'Attached are the previous calendar month’s WISE impact indicators and operational summary. Small impact groups are suppressed. Open WISE to inspect indicator definitions and detailed records.',attachments}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Email provider rejected report');
  }sent++;
 }catch{status='failed';last_error='Report generation or email provider failed';failed++;}
 const saved=await client.from('report_delivery').update({status,last_error,sent_at:status==='sent'?new Date().toISOString():null,next_attempt_at:new Date(Date.now()+15*60000).toISOString()}).eq('schedule_id',job.schedule_id).eq('period',job.period);if(saved.error)throw saved.error;
 }
 return {enabled:true,sent,failed};
}
