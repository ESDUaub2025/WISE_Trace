import {flushNotificationReads} from '../notifications';
import { db, enqueue, syncOutbox, revokeLocalDevice } from '../offline/db';
import { configured, demo, supabase } from './supabase';
import { cachedSessionLimits,offlineExpired,inactive } from './session-policy';
import {signOfflineDecision} from './offline-signoff';
import {localProductionTasks} from './schedules';
import {introTrainingContent,introAssessment} from './learning-demo';
import { demoConfig, demoEdges, demoIdentity, demoLots, demoSuppliers, demoTasks, ids } from './demo';
import { actionClass, envelopeSchema, type Config, type Envelope, type Identity, type Lot, type Supplier, type Task } from './domain';
export interface Snapshot { materialBalances:Row[]; dispositions:Row[]; trainingHistory:Row[]; trainingAssets:Row[]; cooperatives:Row[]; lots: Lot[]; suppliers: Supplier[]; tasks: Task[]; config: Config; records: Row[]; stageEvents:Row[]; attachments:Row[]; deviations: Row[]; equipment: Row[]; training: Row[]; completions: Row[]; packaging: Row[]; sales: Row[]; recalls: Row[]; notifications: Row[]; audits: Row[]; members: Row[]; devices: Row[]; configs: Row[]; edges: {input_lot_id:string;output_lot_id:string;quantity?:number;unit?:string}[]; }
export type Row = Record<string, unknown> & { id?: string };
export async function cachedIdentity(): Promise<Identity|null> {
 if(demo)return demoIdentity;const identity=(await db.cache.get('identity'))?.value as Identity|undefined;if(!identity)return null;
 const session=(await db.cache.get(`session:${identity.id}`))?.value as {authenticated_at:number}|undefined;
 const limits=await cachedSessionLimits(identity.id);const activity=Number(sessionStorage.getItem('last-activity:'+identity.id)??session?.authenticated_at??0);
 if(!session||offlineExpired(session.authenticated_at,Date.now(),limits)||inactive(activity,Date.now(),limits))return null;return identity;
}
export async function snapshot(identity: Identity): Promise<Snapshot> {
 const key=`snapshot:${identity.id}`;
 let result: Snapshot;
 if (demo) result={materialBalances:[],dispositions:[],trainingHistory:[],trainingAssets:[],cooperatives:[{id:ids.coop,name:'Akkar Harvest',code:'AKR01',region:'Akkar',status:'active'}],lots:demoLots,suppliers:demoSuppliers,tasks:demoTasks,config:demoConfig,records:[],stageEvents:[],attachments:[],deviations:[],equipment:[{id:'eq-1',label:'PH-02',type:'pH meter',next_due_at:new Date(Date.now()+86400000).toISOString()}],training:[{id:'70000000-0000-4000-8000-000000000001',module_key:'gmp',version:1,content:introTrainingContent,assessment:introAssessment}],completions:[],packaging:[],sales:[],recalls:[],notifications:[],audits:[],members:[{...demoIdentity}],devices:[{id:ids.device,label:'Cooperative phone 1'}],configs:[{...demoConfig}],edges:demoEdges};
 else {
 const cached=(await db.cache.get(key))?.value as Snapshot|undefined;
 if (!navigator.onLine) { if(cached)return overlay(cached,identity);throw new Error('userNotCached'); }
 if(!supabase||!configured)throw new Error('setup');
 const device=await getDevice();
 const revocation=await supabase.from('device').select('revoked_at').eq('id',device).maybeSingle();
 if(revocation.data?.revoked_at){await revokeLocalDevice();throw new Error('deviceRevoked');}
 if(identity.roles.includes('donor')){
 const viewer:Snapshot={materialBalances:[],dispositions:[],trainingHistory:[],trainingAssets:[],cooperatives:[],lots:[],suppliers:[],tasks:[],records:[],stageEvents:[],attachments:[],deviations:[],equipment:[],training:[],completions:[],packaging:[],sales:[],recalls:[],notifications:[],audits:[],members:[],devices:[],configs:[],edges:[],config:{id:'',placeholder:false,definition:{stages:[],checkpoints:[],whey_max_age_hours:0,shelf_life_days:0,multi_lot:false,blending_enabled:false,self_release:false,lab_before_release:false}}};
 await db.cache.put({key,value:viewer});return viewer;
 }
 const tables=['lot','supplier','task','operational_record','deviation','equipment','training_module','training_completion','packaging_detail','sale','recall','notification','audit_event','membership','device','config_version','consumption','stage_event','attachment','cooperative','training_asset','material_disposition'];
 const reads=await supabase.from('notification_receipt').select('notification_id,read_at').eq('user_id',identity.id);if(reads.error)throw reads.error;
 const rows=await Promise.all(tables.map(async table=>{
 const all:Row[]=[];for(let offset=0;;offset+=1000){const reply=await supabase!.from(table).select('*').order(table==='membership'?'user_id':table==='packaging_detail'?'lot_id':'id').range(offset,offset+999);if(reply.error)throw new Error(reply.error.message);all.push(...reply.data);if(reply.data.length<1000)break;}return all;
 }));
 const configs=rows[15] as unknown as Config[];
 const config=configs.filter(c=>((c as unknown as Row).cooperative_id==null||(c as unknown as Row).cooperative_id===identity.cooperative_id)&&(c as unknown as Row).kind==='sop'&&(c as unknown as Row).status==='approved'&&Date.parse(String((c as unknown as Row).effective_at))<=Date.now()).sort((a,b)=>Number((b as unknown as Row).cooperative_id===identity.cooperative_id)-Number((a as unknown as Row).cooperative_id===identity.cooperative_id)||Number((b as unknown as Row).version)-Number((a as unknown as Row).version))[0];
 const setupDraft=!config&&identity.roles.some(r=>['admin','food_safety'].includes(r))?configs.find(c=>(c as unknown as Row).status==='draft'&&(c as unknown as Row).kind==='sop'):undefined;
 if(!config&&!setupDraft)throw new Error('setup');
 const effectiveConfig=config??setupDraft!;
 const lots=rows[0] as unknown as Lot[];
 const byId=new Map<string,number>();for(let offset=0;;offset+=1000){const balances=await supabase.rpc('lot_balances').order('id').range(offset,offset+999);if(balances.error)throw new Error(balances.error.message);for(const b of balances.data as {id:string;available:number}[])byId.set(b.id,Number(b.available));if(balances.data.length<1000)break;}lots.forEach(l=>{l.available=byId.get(l.id)??0;l.sync_status='synced';});
 const materialBalances:Row[]=[];for(let offset=0;;offset+=1000){const response=await supabase.rpc('material_balances').range(offset,offset+999);if(response.error)throw response.error;materialBalances.push(...response.data);if(response.data.length<1000)break;}
 result={materialBalances,dispositions:rows[21],trainingHistory:rows[6],trainingAssets:rows[20],cooperatives:rows[19],lots,suppliers:rows[1] as unknown as Supplier[],tasks:rows[2] as unknown as Task[],records:rows[3],stageEvents:rows[17],attachments:rows[18],deviations:rows[4],equipment:rows[5],training:rows[6].filter(module=>module.config_version_id===effectiveConfig.id&&(String(module.effective_at)==='-infinity'||Date.parse(String(module.effective_at))<=Date.now())&&!rows[6].some(newer=>newer.module_key===module.module_key&&newer.config_version_id===module.config_version_id&&Number(newer.version)>Number(module.version)&&(String(newer.effective_at)==='-infinity'||Date.parse(String(newer.effective_at))<=Date.now()))),completions:rows[7],packaging:rows[8],sales:rows[9],recalls:rows[10],notifications:rows[11].map(row=>({...row,read_at:reads.data.find(read=>read.notification_id===row.id)?.read_at??null})),audits:rows[12],members:rows[13],devices:rows[14],configs:rows[15],edges:rows[16] as unknown as Snapshot['edges'],config:effectiveConfig};
 }
 await db.cache.put({key,value:result});return overlay(result,identity);
}
async function overlay(data: Snapshot,identity: Identity) {
 const result=structuredClone(data);
 for(const read of await db.cache.where('key').startsWith(`notification-read:${identity.id}:`).toArray()){const notification=result.notifications.find(row=>row.id===read.key.split(':').at(-1));if(notification)notification.read_at=read.value;}
 const entries=await db.outbox.filter(e=>e.envelope.author_id===identity.id && (demo||e.status!=='synced')).toArray();
 entries.sort((a,b)=>(a.sequence??0)-(b.sequence??0)||a.envelope.observed_at.localeCompare(b.envelope.observed_at));
 for(const entry of entries){const e=entry.envelope;const p=e.payload;
 if(['receipt','batch','packaging'].includes(e.action)&&!result.lots.some(l=>l.id===e.id))result.lots.unshift({id:e.id,cooperative_id:e.cooperative_id,type:e.action==='batch'?'batch':e.action==='packaging'?'packaging':String(p.type),code:entry.code??`~${e.action==='batch'?'KB':'WL'}-${e.id.slice(0,6)}`,state:e.action==='batch'?'draft':'received',unit:String(p.unit??'kg'),initial_quantity:Number(p.quantity??0),available:Number(p.quantity??0),producer_id:e.author_id,device_id:e.device_id,config_version_id:e.config_version_id,observed_at:e.observed_at,generation_at:p.generation_at as string|undefined,stage:e.action==='batch'?result.config.definition.stages[0].key:undefined,facts:p.facts as Record<string,unknown>??{},sync_status:entry.status});
 if(e.action==='whey_decision'&&entry.status!=='conflict'){const lot=result.lots.find(l=>l.id===p.lot_id);if(lot){lot.state=String(p.outcome);lot.sync_status=entry.status;if(lot.generation_at&&p.outcome==='accepted')lot.expires_at=new Date(Date.parse(lot.generation_at)+result.config.definition.whey_max_age_hours*3600000).toISOString();}}
 if(e.action==='checkpoint'){result.records.push({id:e.id,lot_id:p.lot_id,kind:e.action,definition_key:p.definition_key,payload:p.values,observed_at:e.observed_at,sync_status:entry.status});if(entry.status!=='conflict')result.tasks=result.tasks.filter(task=>!(task.lot_id===p.lot_id&&task.details.definition_key===p.definition_key));}
 if(e.action==='stage'&&entry.status!=='conflict'){const lot=result.lots.find(l=>l.id===p.lot_id);if(lot){lot.stage=String(p.next_stage);lot.state='in_production';result.stageEvents.push({id:e.id,lot_id:lot.id,stage:lot.stage,observed_at:e.observed_at});}}
 if(e.action==='handover'&&entry.status!=='conflict'){const lot=result.lots.find(l=>l.id===p.lot_id);if(lot)lot.facts.responsible_producer=p.next_producer;}
 if(e.action==='abandon'&&entry.status!=='conflict'){const lot=result.lots.find(l=>l.id===p.lot_id);if(lot){lot.state='rejected';lot.facts.abandoned=true;lot.sync_status=entry.status;}}
 if(['sample','lab','note','storage_inspection','handover'].includes(e.action))result.records.push({id:e.id,lot_id:p.lot_id,kind:e.action,payload:p.values??p,observed_at:e.observed_at,sync_status:entry.status});
 if(e.action==='deviation')result.deviations.push({id:e.id,...p,sync_status:entry.status});
 if(e.action==='training'&&entry.status!=='conflict')result.completions.push({id:e.id,user_id:e.author_id,...p});
 if(e.action==='material_disposition'&&entry.status!=='conflict'){const lot=result.lots.find(l=>l.id===p.lot_id);if(lot){lot.available=(lot.available??0)-Number(p.quantity);if(p.close_lot)lot.state='closed';}const balance=result.materialBalances?.find(b=>b.id===p.lot_id);if(balance){balance.remaining=Number(balance.remaining)-Number(p.quantity);balance[String(p.kind)]=Number(balance[String(p.kind)]??0)+Number(p.quantity);}result.dispositions??=[];result.dispositions.push({id:e.id,...p,observed_at:e.observed_at,sync_status:entry.status});}
 if(e.action==='allocation'&&entry.status!=='conflict'){result.edges.push({input_lot_id:String(p.input_lot_id),output_lot_id:String(p.output_lot_id),quantity:Number(p.quantity),unit:String(p.unit)});const input=result.lots.find(l=>l.id===p.input_lot_id);if(input)input.available=(input.available??0)-Number(p.quantity);const balance=result.materialBalances?.find(b=>b.id===p.input_lot_id);if(balance){balance.allocated=Number(balance.allocated)+Number(p.quantity);balance.remaining=Number(balance.remaining)-Number(p.quantity);}}
 if(entry.status==='conflict')result.tasks.unshift({id:`conflict:${e.id}`,kind:'sync_conflict',status:'open',due_at:e.observed_at,details:{error:entry.error,receipt_id:e.id}});
 }
 if(!demo&&!navigator.onLine){result.tasks=result.tasks.filter(task=>!['checkpoint_due','stage_overdue'].includes(task.kind));result.tasks.push(...localProductionTasks(result));}
 return result;
}
export async function getDevice() {
 let device=localStorage.getItem('wise-device');if(!device){device=crypto.randomUUID();localStorage.setItem('wise-device',device);}return demo?ids.device:device;
}
export async function saveAction(identity: Identity,config: Config,action: string,payload: Record<string,unknown>,media:{blob:Blob;type:string}[]=[],offlinePin?:string,observedAt?:string) {
 if(actionClass(action)==='online')throw new Error('onlineRequired');
 const envelope=envelopeSchema.parse({id:crypto.randomUUID(),author_id:identity.id,cooperative_id:identity.cooperative_id,device_id:await getDevice(),config_version_id:config.id,observed_at:observedAt??new Date().toISOString(),action,payload});
 if(action==='whey_decision'){if(!offlinePin||demo)throw new Error('offlineSignatureMissing');Object.assign(envelope.payload,await signOfflineDecision(envelope,offlinePin));}
 await enqueue(envelope,media.map(item=>({id:crypto.randomUUID(),record_id:envelope.id,cooperative_id:identity.cooperative_id,...item,uploaded:false})));return envelope.id;
}
export async function synchronize(identity: Identity) {
 if(demo||!supabase||!navigator.onLine)return;
 const session=await supabase.auth.getSession();
 if(session.data.session?.user.id!==identity.id){const cached=(await db.cache.get(`session:${identity.id}`))?.value as {session:{access_token:string;refresh_token:string}}|undefined;if(!cached)throw new Error('sessionExpired');const restored=await supabase.auth.setSession(cached.session);if(restored.error)throw new Error('sessionExpired');}
 await flushNotificationReads(identity);
 await syncOutbox(async(envelope:Envelope)=>{const {data,error}=await supabase!.functions.invoke('sync',{body:{records:[envelope]}});if(error)throw error;return data.receipts[0];},identity.id);
 const media=await db.media.filter(m=>!m.uploaded).toArray();
 for(const entry of media){const receipt=await db.outbox.get(entry.record_id);if(receipt?.status!=='synced'||receipt.envelope.author_id!==identity.id)continue;
 const path=`${entry.cooperative_id}/${entry.id}.${entry.type.startsWith('image')?'jpg':'webm'}`;
 const {error}=await supabase.storage.from('evidence').upload(path,entry.blob,{contentType:entry.type,upsert:false});
 if(error&&String((error as {statusCode?:string}).statusCode)!=='409')continue; const metadata=await supabase.rpc('register_attachment',{target:entry.id,record:entry.record_id,path,media_type:entry.type});if(!metadata.error)await db.media.update(entry.id,{uploaded:true});
 }
 await db.cache.put({key:'last-sync',value:new Date().toISOString()});
}
export async function signedAction(identity:Identity,action:string,target:string,pin:string,args:Record<string,unknown>){
 if(!navigator.onLine||!supabase||demo)throw new Error('onlineRequired');
 const {data:sign,error}=await supabase.rpc('pin_signoff',{pin,device:await getDevice(),action,object_id:target});if(error||!sign)throw new Error('authFailed');
 const endpoint=action==='decision'?'transition_lot':action==='recall'?'start_recall':'close_deviation';
 const reply=await supabase.rpc(endpoint,{target,sign,...args});if(reply.error)throw new Error(reply.error.message);return reply.data;
}
