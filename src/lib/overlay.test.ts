import {it,expect,vi} from 'vitest';
import {overlay,type Snapshot} from './data';
import {db,enqueue} from '../offline/db';
import {demoIdentity,demoConfig,demoLots,ids} from './demo';
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
it('offline packaging, sale, return and loss preserve package units and genealogy',async()=>{
 vi.stubGlobal('navigator',{onLine:false});await db.outbox.clear();
 const pack=crypto.randomUUID();const envelope:Envelope={id:pack,author_id:demoIdentity.id,cooperative_id:ids.coop,device_id:ids.device,config_version_id:demoConfig.id,observed_at:'2026-10-07T09:00:00Z',action:'packaging',payload:{batch_id:ids.batch,packaging_material_id:ids.material,package_count:10,size_kg:.5,best_before:'2026-12-31',storage_location:'Dry store'}};
 await enqueue(envelope);for(const [action,payload] of [['sale',{packaging_lot_id:pack,transaction_type:'sale',quantity:3}],['sale',{packaging_lot_id:pack,transaction_type:'return',quantity:1}],['movement',{lot_id:pack,type:'lost',quantity:-2}]] as const)await enqueue({...envelope,id:crypto.randomUUID(),action,payload});
 const data={config:demoConfig,configs:[demoConfig],lots:demoLots,materialBalances:[],notifications:[],tasks:[],records:[],stageEvents:[],edges:[],dispositions:[],deviations:[],completions:[],packaging:[],sales:[]} as unknown as Snapshot;
 const result=await overlay(data,demoIdentity);expect(result.lots.find(l=>l.id===pack)).toMatchObject({unit:'unit',initial_quantity:10,available:6,state:'awaiting_review'});expect(result.packaging[0]).toMatchObject({mass_kg:5,package_count:10});expect(result.edges.filter(e=>e.output_lot_id===pack)).toHaveLength(2);expect(result.lots.find(l=>l.id===ids.material)?.available).toBe(394);await db.outbox.clear();vi.unstubAllGlobals();
});
