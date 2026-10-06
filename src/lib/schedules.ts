import type {Config,Lot,Task} from './domain';
import type {Row,Snapshot} from './data';

export function lotConfig(data:Snapshot,lot?:Lot|null):Config {
 return (data.configs.find(c=>c.id===lot?.config_version_id) as unknown as Config)??data.config;
}
export function stageTimeline(lot:Lot,events:Row[],config:Config,now=Date.now()) {
 const ordered=events.filter(e=>e.lot_id===lot.id).sort((a,b)=>Date.parse(String(a.observed_at))-Date.parse(String(b.observed_at)));
 return ordered.map((event,index)=>{
  const start=Date.parse(String(event.observed_at));const end=ordered[index+1]?Date.parse(String(ordered[index+1].observed_at)):null;
  const definition=config.definition.stages.find(s=>s.key===event.stage);
  const hours=Math.max(0,((end??now)-start)/3600000);
  return {...event,observed_at:String(event.observed_at),ended_at:end?new Date(end).toISOString():null,elapsed_hours:Math.round(hours*10)/10,overdue:end===null&&definition?.expected_hours!==undefined&&hours>definition.expected_hours};
 });
}
export function localProductionTasks(data:Snapshot,now=Date.now()):Task[] {
 const result:Task[]=[];
 for(const lot of data.lots.filter(l=>l.type==='batch'&&['draft','in_production'].includes(l.state))){
  const config=lotConfig(data,lot);const current=stageTimeline(lot,data.stageEvents,config,now).at(-1);
  const start=current?Date.parse(String(current.observed_at)):Date.parse(lot.observed_at);
  for(const check of config.definition.checkpoints.filter(c=>c.stage===lot.stage&&c.required)){
   const records=data.records.filter(r=>r.lot_id===lot.id&&r.definition_key===check.key&&r.sync_status!=='conflict'&&Date.parse(String(r.observed_at))>=start);
   const latest=records.length?Math.max(...records.map(r=>Date.parse(String(r.observed_at)))):null;
   if(latest!==null&&!check.interval_hours)continue;
   const due=(latest??start)+(latest!==null?check.interval_hours??0:check.offset_hours??0)*3600000;
   result.push({id:`local-check:${lot.id}:${check.key}:${due}`,kind:'checkpoint_due',lot_id:lot.id,status:'open',due_at:new Date(due).toISOString(),details:{definition_key:check.key,local_schedule:true}});
  }
  if(current?.overdue)result.push({id:`local-stage:${lot.id}:${lot.stage}`,kind:'stage_overdue',lot_id:lot.id,status:'open',due_at:new Date(start+(config.definition.stages.find(s=>s.key===lot.stage)?.expected_hours??0)*3600000).toISOString(),details:{local_schedule:true}});
 }
 return result;
}
