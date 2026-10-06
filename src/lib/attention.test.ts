import {expect,it} from 'vitest';
import {attentionTasks} from './attention';
import {demoIdentity,demoConfig,demoLots,demoTasks,ids} from './demo';
import type {Snapshot} from './data';

it('follows batch handover and personal training assignment on shared devices',()=>{
 const data={config:demoConfig,configs:[demoConfig],lots:structuredClone(demoLots),tasks:[...demoTasks,{id:'training-other',kind:'training',status:'open',user_id:ids.supervisor,due_at:new Date().toISOString(),details:{}}]} as unknown as Snapshot;
 expect(attentionTasks(data,demoIdentity).map(t=>t.id)).toContain('task-1');
 expect(attentionTasks(data,demoIdentity).map(t=>t.id)).not.toContain('training-other');
 data.lots.find(l=>l.id===ids.batch)!.facts.responsible_producer=ids.supervisor;
 expect(attentionTasks(data,demoIdentity).map(t=>t.id)).not.toContain('task-1');
 expect(attentionTasks(data,{...demoIdentity,id:ids.supervisor,roles:['supervisor']}).map(t=>t.id)).toContain('task-1');
});
it('uses the original checkpoint role and excludes resolved tasks',()=>{
 const original=structuredClone(demoConfig);original.definition.checkpoints.find(c=>c.key==='drying_temperature')!.responsible_role='supervisor';
 const data={config:demoConfig,configs:[original],lots:demoLots,tasks:[...demoTasks,{...demoTasks[0],id:'done',status:'resolved'}]} as unknown as Snapshot;
 expect(attentionTasks(data,demoIdentity).map(t=>t.id)).not.toContain('task-1');
 expect(attentionTasks(data,{...demoIdentity,roles:['supervisor']}).map(t=>t.id)).not.toContain('done');
});
