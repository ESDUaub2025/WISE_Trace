import {flushDiagnostics,captureDiagnostic} from './telemetry';
import {TZDate} from '@date-fns/tz';
import {incrementalSnapshot,scopedReadClient,commitSnapshot,withSnapshotLock,checkSnapshotAccess} from './snapshot-sync';
import {flushNotificationReads} from '../notifications';
import { db, enqueue, syncOutbox, revokeLocalDevice } from '../offline/db';
import { configured, demo, supabase } from './supabase';
import { cachedSessionLimits,offlineExpired,inactive } from './session-policy';
import {signOfflineDecision} from './offline-signoff';
import {localProductionTasks,lotConfig} from './schedules';
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
export async function snapshot(identity: Identity): Promise<Snapshot> {return withSnapshotLock(identity.id,()=>readSnapshot(identity));}
async function readSnapshot(identity: Identity): Promise<Snapshot> {
 const key=`snapshot:${identity.id}`;
 let result: Snapshot;let replicaGeneration:string|undefined;
 if (demo) result={materialBalances:[],dispositions:[],trainingHistory:[],trainingAssets:[],cooperatives:[{id:ids.coop,name:'Akkar Harvest',code:'AKR01',region:'Akkar',status:'active'}],lots:demoLots,suppliers:demoSuppliers,tasks:demoTasks,config:demoConfig,records:[],stageEvents:[],attachments:[],deviations:[],equipment:[{id:'eq-1',label:'PH-02',type:'pH meter',next_due_at:new Date(Date.now()+86400000).toISOString()}],training:[{id:'70000000-0000-4000-8000-000000000001',module_key:'gmp',version:1,content:introTrainingContent,assessment:introAssessment}],completions:[],packaging:[],sales:[],recalls:[],notifications:[],audits:[],members:[{...demoIdentity}],devices:[{id:ids.device,label:'Cooperative phone 1'}],configs:[{...demoConfig}],edges:demoEdges};
 else {
 const cached=(await db.cache.get(key))?.value as Snapshot|undefined;
 if (!navigator.onLine) { if(cached)return overlay(cached,identity);throw new Error('userNotCached'); }
 if(!supabase||!configured)throw new Error('setup');
 const device=await getDevice();
 const client=await scopedReadClient(identity);
 const revocation=await client.from('device').select('revoked_at').eq('id',device).maybeSingle();
 if(revocation.data?.revoked_at){await revokeLocalDevice();throw new Error('deviceRevoked');}
 const partnerScope=identity.roles.includes('partner')?await client.from('cooperative').select('id'):null;if(partnerScope?.error)throw partnerScope.error;
 if(identity.roles.includes('donor')||identity.roles.includes('partner')&&!partnerScope?.data?.length){
 await checkSnapshotAccess(identity,client);
 const viewer:Snapshot={materialBalances:[],dispositions:[],trainingHistory:[],trainingAssets:[],cooperatives:[],lots:[],suppliers:[],tasks:[],records:[],stageEvents:[],attachments:[],deviations:[],equipment:[],training:[],completions:[],packaging:[],sales:[],recalls:[],notifications:[],audits:[],members:[],devices:[],configs:[],edges:[],config:{id:'',placeholder:false,definition:{stages:[],checkpoints:[],whey_max_age_hours:0,shelf_life_days:0,multi_lot:false,blending_enabled:false,self_release:false,lab_before_release:false}}};
 await db.cache.put({key,value:viewer});return viewer;
 }
 const replica=await incrementalSnapshot(identity,client);const rows=replica.rows;replicaGeneration=replica.generation;
 const reads=await client.from('notification_receipt').select('notification_id,read_at').eq('user_id',identity.id);if(reads.error)throw reads.error;
 const configs=rows[15] as unknown as Config[];
 const config=configs.filter(c=>((c as unknown as Row).cooperative_id==null||(c as unknown as Row).cooperative_id===identity.cooperative_id)&&(c as unknown as Row).kind==='sop'&&(c as unknown as Row).status==='approved'&&Date.parse(String((c as unknown as Row).effective_at))<=Date.now()).sort((a,b)=>Number((b as unknown as Row).cooperative_id===identity.cooperative_id)-Number((a as unknown as Row).cooperative_id===identity.cooperative_id)||Number((b as unknown as Row).version)-Number((a as unknown as Row).version))[0];
 const setupDraft=!config&&identity.roles.some(r=>['admin','food_safety'].includes(r))?configs.find(c=>(c as unknown as Row).status==='draft'&&(c as unknown as Row).kind==='sop'):undefined;
 if(!config&&!setupDraft)throw new Error('setup');
 const effectiveConfig=config??setupDraft!;
 const lots=rows[0] as unknown as Lot[];
 const byId=new Map<string,number>(replica.balanceIds===null?[]:(cached?.lots??[]).map(lot=>[lot.id,lot.available??0]));
 const materialById=new Map<string,Row>(replica.balanceIds===null?[]:(cached?.materialBalances??[]).map(row=>[String(row.id),row]));
 const targets=replica.balanceIds??lots.map(lot=>lot.id);
 for(let offset=0;offset<targets.length;offset+=500){const ids=targets.slice(offset,offset+500);for(const id of ids){byId.delete(id);materialById.delete(id);}const reply=await client.rpc('snapshot_balances',{targets:ids});if(reply.error)throw new Error(reply.error.message);for(const row of reply.data as {id:string;available:number;material:Row|null}[]){byId.set(row.id,Number(row.available));if(row.material)materialById.set(row.id,row.material);}}
 lots.forEach(lot=>{lot.available=byId.get(lot.id)??0;lot.sync_status='synced';});
 const lotIds=new Set(lots.map(lot=>lot.id)),materialBalances=[...materialById.values()].filter(row=>lotIds.has(String(row.id)));
 result={materialBalances,dispositions:rows[21],trainingHistory:rows[6],trainingAssets:rows[20],cooperatives:rows[19],lots,suppliers:rows[1] as unknown as Supplier[],tasks:rows[2] as unknown as Task[],records:rows[3],stageEvents:rows[17],attachments:rows[18],deviations:rows[4],equipment:rows[5],training:rows[6].filter(module=>module.config_version_id===effectiveConfig.id&&(String(module.effective_at)==='-infinity'||Date.parse(String(module.effective_at))<=Date.now())&&!rows[6].some(newer=>newer.module_key===module.module_key&&newer.config_version_id===module.config_version_id&&Number(newer.version)>Number(module.version)&&(String(newer.effective_at)==='-infinity'||Date.parse(String(newer.effective_at))<=Date.now()))),completions:rows[7],packaging:rows[8],sales:rows[9],recalls:rows[10],notifications:rows[11].map(row=>({...row,read_at:reads.data.find(read=>read.notification_id===row.id)?.read_at??null})),audits:rows[12],members:rows[13],devices:rows[14],configs:rows[15],edges:rows[16] as unknown as Snapshot['edges'],config:effectiveConfig};
 }
 await commitSnapshot(identity,result,replicaGeneration);return overlay(result,identity);
}
export async function overlay(data: Snapshot,identity: Identity) {
 const result=structuredClone(data);
 for(const read of await db.cache.where('key').startsWith(`notification-read:${identity.id}:`).toArray()){const notification=result.notifications.find(row=>row.id===read.key.split(':').at(-1));if(notification)notification.read_at=read.value;}
 const entries=await db.outbox.filter(e=>e.envelope.author_id===identity.id && (demo||e.status!=='synced')).toArray();
 entries.sort((a,b)=>(a.sequence??0)-(b.sequence??0)||a.envelope.observed_at.localeCompare(b.envelope.observed_at));
 for(const entry of entries){const e=entry.envelope;const p=e.payload;
 if(['receipt','batch','packaging'].includes(e.action)&&!result.lots.some(l=>l.id===e.id))result.lots.unshift({id:e.id,cooperative_id:e.cooperative_id,type:e.action==='batch'?'batch':e.action==='packaging'?'packaging':String(p.type),code:entry.code??`~${e.action==='batch'?'KB':'WL'}-${e.id.slice(0,6)}`,state:e.action==='batch'?'draft':'received',unit:String(p.unit??'kg'),initial_quantity:Number(p.quantity??0),available:Number(p.quantity??0),producer_id:e.author_id,device_id:e.device_id,config_version_id:e.config_version_id,observed_at:e.observed_at,generation_at:p.generation_at as string|undefined,stage:e.action==='batch'?((result.configs.find(config=>config.id===e.config_version_id) as unknown as Config)?.definition??result.config.definition).stages[0]?.key:undefined,facts:p.facts as Record<string,unknown>??{},sync_status:entry.status});
 if(e.action==='receipt'&&entry.status!=='conflict'&&!result.materialBalances.some(balance=>balance.id===e.id))result.materialBalances.push({id:e.id,received:Number(p.quantity??0),accepted:0,rejected:0,on_hold:0,allocated:0,disposed:0,diverted:0,lost:0,measurement_difference:0,remaining:Number(p.quantity??0),valorized:0,sync_status:entry.status});
 if(e.action==='whey_decision'&&entry.status!=='conflict'){const lot=result.lots.find(l=>l.id===p.lot_id);if(lot){lot.state=String(p.outcome);lot.sync_status=entry.status;if(lot.generation_at&&p.outcome==='accepted')lot.expires_at=new Date(Date.parse(lot.generation_at)+lotConfig(result,lot).definition.whey_max_age_hours*3600000).toISOString();const balance=result.materialBalances.find(row=>row.id===lot.id);if(balance){for(const key of ['accepted','rejected','on_hold'])balance[key]=0;balance[p.outcome==='hold'?'on_hold':String(p.outcome)]=Number(balance.received);balance.sync_status=entry.status;}}}
 if(['measurement','checklist','storage_inspection','note','sample','lab','calibration','complaint','handover'].includes(e.action))result.records.push({id:e.id,lot_id:p.lot_id,kind:e.action,definition_key:p.definition_key,payload:p.values??p,observed_at:e.observed_at,sync_status:entry.status});
 if(e.action==='checkpoint'){result.records.push({id:e.id,lot_id:p.lot_id,kind:e.action,definition_key:p.definition_key,payload:p.values,observed_at:e.observed_at,sync_status:entry.status});if(entry.status!=='conflict')result.tasks=result.tasks.filter(task=>!(task.lot_id===p.lot_id&&task.details.definition_key===p.definition_key));}
 if(e.action==='stage'&&entry.status!=='conflict'){const lot=result.lots.find(l=>l.id===p.lot_id);if(lot){lot.stage=String(p.next_stage);lot.state='in_production';result.stageEvents.push({id:e.id,lot_id:lot.id,stage:lot.stage,observed_at:e.observed_at});}}
 if(e.action==='handover'&&entry.status!=='conflict'){const lot=result.lots.find(l=>l.id===p.lot_id);if(lot)lot.facts.responsible_producer=p.next_producer;}
 if(e.action==='abandon'&&entry.status!=='conflict'){const lot=result.lots.find(l=>l.id===p.lot_id);if(lot){lot.state='rejected';lot.facts.abandoned=true;lot.sync_status=entry.status;}}
 if(e.action==='deviation')result.deviations.push({id:e.id,...p,sync_status:entry.status});
 if(e.action==='training'&&entry.status!=='conflict')result.completions.push({id:e.id,user_id:e.author_id,...p});
 if(e.action==='packaging'&&entry.status!=='conflict'){
 const lot=result.lots.find(l=>l.id===e.id);if(lot){lot.state='awaiting_review';lot.unit='unit';lot.initial_quantity=Number(p.package_count);lot.available=Number(p.package_count);const [year,month,day]=String(p.best_before).split('-').map(Number);lot.expires_at=new TZDate(year,month-1,day+1,0,0,0,'Asia/Beirut').toISOString();lot.facts={...p};}
 result.packaging??=[];result.packaging.push({lot_id:e.id,batch_id:p.batch_id,package_type:p.package_type,size_kg:p.size_kg,package_count:p.package_count,mass_kg:Number(p.size_kg)*Number(p.package_count),best_before:p.best_before,storage_location:p.storage_location,label:p.label});
 const batch=result.lots.find(l=>l.id===p.batch_id);if(batch)batch.state='awaiting_review';
 const material=result.lots.find(l=>l.id===p.packaging_material_id);if(material)material.available=(material.available??0)-Number(p.package_count);
 result.edges.push({input_lot_id:String(p.batch_id),output_lot_id:e.id,quantity:Number(p.package_count)*Number(p.size_kg),unit:'kg'},{input_lot_id:String(p.packaging_material_id),output_lot_id:e.id,quantity:Number(p.package_count),unit:'unit'});
 }
 if(e.action==='sale'){
 result.sales??=[];result.sales.push({id:e.id,...p,observed_at:e.observed_at,sync_status:entry.status});
 if(entry.status!=='conflict'){const lot=result.lots.find(l=>l.id===p.packaging_lot_id);if(lot)lot.available=(lot.available??0)+(p.transaction_type==='return'?1:-1)*Number(p.quantity);}
 }
 if(e.action==='movement'&&entry.status!=='conflict'){const lot=result.lots.find(l=>l.id===p.lot_id);if(lot)lot.available=(lot.available??0)+Number(p.quantity);}
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
 await flushDiagnostics();
 await syncOutbox(async(envelope:Envelope)=>{const {data,error}=await supabase!.functions.invoke('sync',{body:{records:[envelope]}});if(error){void captureDiagnostic('sync_failure');throw error;}return data.receipts[0];},identity.id);
 const media=await db.media.filter(m=>!m.uploaded).toArray();
 for(const entry of media){const receipt=await db.outbox.get(entry.record_id);if(receipt?.status!=='synced'||receipt.envelope.author_id!==identity.id)continue;
 const path=`${entry.cooperative_id}/${entry.id}.${entry.type.startsWith('image')?'jpg':'webm'}`;
 const {error}=await supabase.storage.from('evidence').upload(path,entry.blob,{contentType:entry.type,upsert:false});
 if(error&&String((error as {statusCode?:string}).statusCode)!=='409')continue; const metadata=await supabase.rpc('register_attachment',{target:entry.id,record:entry.record_id,path,media_type:entry.type});if(!metadata.error)await db.media.update(entry.id,{uploaded:true});
 }
 await db.cache.put({key:'last-sync',value:new Date().toISOString()});
 // A stale notification acknowledgment must never block traceability or media.
 // Failed acknowledgments remain queued and can be retried independently.
 await flushNotificationReads(identity).catch(()=>{});
}
export async function signedAction(identity:Identity,action:string,target:string,pin:string,args:Record<string,unknown>){
 if(!navigator.onLine||!supabase||demo)throw new Error('onlineRequired');
 const {data:sign,error}=await supabase.rpc('pin_signoff',{pin,device:await getDevice(),action,object_id:target});if(error||!sign)throw new Error('authFailed');
 const endpoint=action==='decision'?'transition_lot':action==='recall'?'start_recall':'close_deviation';
 const reply=await supabase.rpc(endpoint,{target,sign,...args});if(reply.error)throw new Error(reply.error.message);return reply.data;
}
