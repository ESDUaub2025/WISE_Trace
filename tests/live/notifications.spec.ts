import {execSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {test,expect} from '@playwright/test';
import {actor,api,coop,login,rpc} from './fixtures';

test('critical alerts use saved consent and offline acknowledgment remains personal',async({page,context})=>{
 const status=JSON.parse(execSync('npx supabase status -o json',{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 const service=createClient(api,status.SERVICE_ROLE_KEY??status.SECRET_KEY,{auth:{persistSession:false}});
 const id=crypto.randomUUID();const inserted=await service.from('notification').insert({id,cooperative_id:coop,kind:'critical_deviation',payload:{lot_code:'NTF-TEST-'+id.slice(0,6)}});expect(inserted.error).toBeNull();
 const receiver=await actor();const supervisor=await actor('karim');
 await login(page);await page.goto('/organization');await page.getByRole('button',{name:'Alert preferences',exact:true}).click();await page.getByLabel('Phone number',{exact:true}).fill('+96170000000');await page.getByLabel('I opt in to critical recall, deviation and held whey expiry alerts.',{exact:true}).check();await page.getByRole('button',{name:'Save record',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();
 const delivery=await supervisor.c.functions.invoke('notifications',{body:{notification_id:id,recipient_id:receiver.user,opt_in:false,destination:'+19999999999'}});expect(delivery.error).toBeNull();expect(delivery.data).toMatchObject({provider:'log',delivered:false,channel:'sms'});expect(delivery.data).not.toHaveProperty('destination');
 await page.getByRole('button',{name:'Notifications',exact:true}).click();const card=page.locator('.notification-list article').filter({hasText:'NTF-TEST-'+id.slice(0,6)});await expect(card).toBeVisible();await context.setOffline(true);await card.getByRole('button',{name:'Mark as read',exact:true}).click();await expect(card.getByRole('button',{name:'Read',exact:true})).toBeDisabled();await page.reload();await page.getByRole('button',{name:'Notifications',exact:true}).click();await expect(page.locator('.notification-list article').filter({hasText:'NTF-TEST-'+id.slice(0,6)}).getByRole('button',{name:'Read',exact:true})).toBeDisabled();await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();await context.setOffline(false);await page.getByRole('button',{name:'Sync records',exact:true}).click();
 await expect.poll(async()=>{const row=await receiver.c.from('notification_receipt').select('read_at').eq('notification_id',id);return row.data?.length??0;}).toBe(1);
 expect((await supervisor.c.from('notification_receipt').select('*').eq('notification_id',id)).data).toHaveLength(0);
 await rpc(receiver.c,'set_notification_preference',{channel:'sms',destination:'+96170000000',opted_in:false});
 const denied=await supervisor.c.functions.invoke('notifications',{body:{notification_id:id,recipient_id:receiver.user,opt_in:true,destination:'+19999999999'}});expect(denied.error).not.toBeNull();
});
