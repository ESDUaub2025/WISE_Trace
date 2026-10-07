import {it,expect} from 'vitest';
import {mergeSnapshotChanges,snapshotTables,type SnapshotChange} from './snapshot-sync';
it('replays snapshot pages idempotently and removes records hidden by changed permissions',()=>{
 const rows=snapshotTables.map(()=>[] as Record<string,unknown>[]),lotIndex=snapshotTables.indexOf('lot'),memberIndex=snapshotTables.indexOf('membership');
 const page:SnapshotChange[]=[{table:'lot',key:'lot-1',row:{id:'lot-1',state:'received'},balance_lots:['lot-1']},{table:'membership',key:'user-1',row:{user_id:'user-1',roles:['producer']},balance_lots:[]}];
 mergeSnapshotChanges(rows,page);mergeSnapshotChanges(rows,page);
 expect(rows[lotIndex]).toHaveLength(1);expect(rows[memberIndex]).toHaveLength(1);
 mergeSnapshotChanges(rows,[{...page[0],row:{id:'lot-1',state:'accepted'}},{...page[1],row:null}]);
 expect(rows[lotIndex][0].state).toBe('accepted');expect(rows[memberIndex]).toEqual([]);
});
