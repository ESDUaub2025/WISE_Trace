import { describe,expect,it } from 'vitest';
import { actionClass,allocationCheck,trace,envelopeSchema } from './domain';
import { demoLots,ids } from './demo';
describe('allocation and genealogy',()=>{
 it('blocks excess allocation online even with a reason',()=>expect(allocationCheck(35,40,true,'measurement difference').allowed).toBe(false));
 it('allows provisional excess only offline with a reason',()=>{expect(allocationCheck(35,40,false).allowed).toBe(false);expect(allocationCheck(35,40,false,'reconcile after sync')).toMatchObject({allowed:true,conflict:true});});
 it('rejects negative, zero and nonfinite quantities',()=>{for(const q of [-2,0,NaN,Infinity])expect(allocationCheck(35,q,false,'reason').allowed).toBe(false);});
 it('traverses split ancestry without cycles or unrelated lots',()=>{const edges=[{input_lot_id:ids.whey,output_lot_id:ids.batch},{input_lot_id:ids.batch,output_lot_id:ids.packaging},{input_lot_id:ids.packaging,output_lot_id:ids.whey}];expect(trace(demoLots,edges,ids.packaging,'back').map(l=>l.id).sort()).toEqual([ids.whey,ids.batch,ids.packaging].sort());});
 it('keeps safety approvals online-only',()=>{for(const action of ['release','recall','config','user_management','close_deviation','decision'])expect(actionClass(action)).toBe('online');});
 it('classifies PRD recording and stock actions',()=>{expect(actionClass('checkpoint')).toBe('safe');expect(actionClass('sale')).toBe('provisional');expect(actionClass('allocation')).toBe('provisional');});
 it('requires immutable attribution and device UUID',()=>{expect(envelopeSchema.safeParse({id:'bad',action:'receipt'}).success).toBe(false);});
});
