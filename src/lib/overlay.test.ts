import {it,expect,vi} from 'vitest';
import {overlay,type Snapshot} from './data';
import {db,enqueue} from '../offline/db';
import {demoIdentity,demoConfig,ids} from './demo';
import type {Envelope} from './domain';
it('offline receipt, acceptance, allocation and diversion preserve mass and original SOP expiry',async()=>{
 vi.stubGlobal('navigator',{onLine:false});
 await db.outbox.clear();
 const original=structuredClone(demoConfig);original.definition.whey_max_age_hours=24;
 const latest=structuredClone(demoConfig);latest.id=crypto.randomUUID();latest.definition.whey_max_age_hours=72;
 const lot=crypto.randomUUID(),generation='2026-10-06T08:00:00Z';
 const receipt:Envelope={id:lot,author_id:demoIdentity.id,cooperative_id:ids.coop,device_id:ids.device,config_version_id:original.id,observed_at:'2026-10-06T09:00:00Z',action:'receipt',payload:{type:'whey',quantity:10,unit:'kg',generation_at:generation}};
 await enqueue(receipt);
 for(const [action,payload] of [
  ['whey_decision',{lot_id:lot,outcome:'accepted'}],
  ['allocation',{input_lot_id:lot,output_lot_id:crypto.randomUUID(),quantity:4,unit:'kg'}],
  ['material_disposition',{lot_id:lot,kind:'diverted',quantity:6,close_lot:true}]
 ] as const)await enqueue({...receipt,id:crypto.randomUUID(),action,payload});
 const data={config:latest,configs:[original,latest],lots:[],materialBalances:[],notifications:[],tasks:[],records:[],stageEvents:[],edges:[],dispositions:[],deviations:[],completions:[]} as unknown as Snapshot;
 const result=await overlay(data,demoIdentity),balance=result.materialBalances[0];
 expect(balance).toMatchObject({received:10,accepted:10,allocated:4,diverted:6,remaining:0});
 expect(result.lots[0]).toMatchObject({state:'closed',available:0,expires_at:'2026-10-07T08:00:00.000Z'});
 expect(data.lots).toEqual([]); // Cached authoritative snapshot stays immutable.
 await db.outbox.clear();vi.unstubAllGlobals();
});
