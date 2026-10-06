import {test,expect} from '@playwright/test';
import {login,actor} from './fixtures';

test('Receiving device signs an offline receipt decision, reloads, and syncs without persisting PIN',async({page,context})=>{
 await login(page);await page.goto('/whey');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await context.setOffline(true);
 await page.getByRole('button',{name:'Receive material',exact:true}).click();
 const ref='OFFLINE-'+crypto.randomUUID();
 await page.getByLabel('Quantity',{exact:true}).fill('5');await page.getByLabel('Supplier reference',{exact:true}).fill(ref);
 await page.locator('input[name=generation_at]').fill(new Date(Date.now()-3600000).toISOString().slice(0,16));
 await page.locator('input[name=temperature]').fill('5');await page.locator('input[name=ph]').fill('5');await page.locator('input[name=declarations_confirmed]').check();
 await page.getByRole('button',{name:'Save record',exact:true}).click();
 await page.getByRole('button',{name:/^~WL-/}).click();await page.getByRole('button',{name:'Decision required',exact:true}).click();
 await page.getByLabel('Reason / justification',{exact:true}).fill('Checked before offline acceptance');await page.getByLabel('Personal PIN',{exact:true}).fill('1111');
 await page.getByRole('button',{name:'Save record',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();
 await page.getByLabel('Personal PIN',{exact:true}).fill('2468');await page.getByRole('button',{name:'Save record',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();
 await page.reload();
 const stored=await page.evaluate(async()=>{
  const connection=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('wise-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const rows=await new Promise<unknown[]>((resolve,reject)=>{const r=connection.transaction('outbox').objectStore('outbox').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});connection.close();return JSON.stringify(rows);
 });
 await page.getByRole('button',{name:/^~WL-/}).click();await expect(page.locator('.detail-summary').getByText('Accepted',{exact:true})).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
 expect(stored).not.toContain('2468');expect(stored).not.toContain('"pin"');expect(stored).not.toContain('"secret"');expect(JSON.parse(stored).filter((row:{envelope:{action:string}})=>row.envelope.action==='whey_decision')).toHaveLength(1);
 await context.setOffline(false);await page.getByRole('button',{name:'Sync records',exact:true}).click();const a=await actor();
 await expect.poll(async()=>{const r=await a.c.from('lot').select('state').eq('facts->>supplier_reference',ref).single();return r.data?.state;}).toBe('accepted');
});
