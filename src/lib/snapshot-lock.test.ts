import 'fake-indexeddb/auto';
import {it,expect,afterEach,vi} from 'vitest';
import {withSnapshotLock} from './snapshot-sync';
import {db} from '../offline/db';
afterEach(async()=>{await db.cache.clear();vi.unstubAllGlobals();});
it('waits for an existing tab lease and removes only its own lease',async()=>{
 vi.stubGlobal('navigator',{});
 await db.cache.put({key:'snapshot-lease:test-user',value:{owner:'other-tab',expires:Date.now()+5000}});
 let entered=false;
 const task=withSnapshotLock('test-user',async()=>{entered=true;return 'finished';});
 await new Promise(resolve=>setTimeout(resolve,30));expect(entered).toBe(false);
 await db.cache.delete('snapshot-lease:test-user');expect(await task).toBe('finished');expect(await db.cache.get('snapshot-lease:test-user')).toBeUndefined();
});
