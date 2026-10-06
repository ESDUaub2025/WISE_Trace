import {readFileSync,writeFileSync} from 'node:fs';
const uuid=(family,n)=>`${family}0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const config=uuid(4,1);let sql='\n-- Historical fictional production for KPI and traceability validation.\n';
const q=value=>`'${String(value).replaceAll("'","''")}'`;
for(let c=1;c<=2;c++){
 const coop=uuid(1,c),producer=uuid(2,c===1?1:8),device=uuid(3,c),supplier=uuid(5,c);
 if(c===2)sql+=`insert into public.device values('${device}','${coop}','Cooperative phone 1','${producer}',null,now());\ninsert into public.supplier values('${supplier}','${coop}','Valley Dairy','dairy','approved','{}','{"pasteurized":true}');\n`;
 for(let month=1;month<=5;month++){
 const day=`2026-${String(month+3).padStart(2,'0')}-10`;const whey=uuid(6,c*1000+month*10+1),batch=uuid(6,c*1000+month*10+2),pack=uuid(6,c*1000+month*10+3),material=uuid(6,c*1000+month*10+4),prefix=c===1?'AKR01':'BEK01';
 for(const [id,type,state,unit,qty]of [[whey,'whey','accepted','kg',150],[batch,'batch','in_production','kg',0],[material,'packaging_material','received','unit',200],[pack,'packaging','awaiting_review','unit',120]]){
 sql+=`insert into public.lot(id,cooperative_id,type,code,state,unit,initial_quantity,supplier_id,producer_id,device_id,config_version_id,observed_at,generation_at,expires_at,stage,facts) values('${id}','${coop}','${type}','${type==='whey'?'WL':type==='batch'?'KB':type==='packaging'?'PL':'PM'}-${prefix}-${day.replaceAll('-','').slice(2)}-01','${state}','${unit}',${qty},${type==='whey'?q(supplier):'null'},'${producer}','${device}','${config}','${day} 10:00Z','${day} 08:00Z',${type==='whey'?q(day+' 23:59Z'):'now()+interval \'180 days\''},${type==='batch'?"'drying'":'null'},'{}');\n`;
 if(qty)sql+=`insert into public.inventory_movement values(gen_random_uuid(),'${coop}','${id}','produced',${qty},'${unit}','historical receipt','${producer}','${device}','${day} 10:00Z','${day} 10:00Z');\n`;
 }
 // Controlled owner-only history fixture; restore historic expiry after allocation.
 sql+=`update public.lot set expires_at=now()+interval '1 day' where id='${whey}';\n`;
 sql+=`insert into public.consumption values(gen_random_uuid(),'${coop}','${whey}','${batch}',140,'kg','${producer}','${device}','${day} 11:00Z','${day} 11:00Z','historical allocation');\n`;
 sql+=`insert into public.inventory_movement values(gen_random_uuid(),'${coop}','${batch}','produced',60,'kg','historical production','${producer}','${device}','${day} 15:00Z','${day} 15:00Z');\n`;
 sql+=`insert into public.consumption values(gen_random_uuid(),'${coop}','${batch}','${pack}',60,'kg','${producer}','${device}','${day} 15:00Z','${day} 15:00Z','historical packaging');\n`;
 sql+=`insert into public.consumption values(gen_random_uuid(),'${coop}','${material}','${pack}',120,'unit','${producer}','${device}','${day} 15:00Z','${day} 15:00Z','historical packaging');\n`;
 sql+=`insert into public.packaging_detail(lot_id,cooperative_id,batch_id,packaging_material_id,package_type,size_kg,package_count,mass_kg,best_before,storage_location,label) values('${pack}','${coop}','${batch}','${material}','kraft',.5,120,60,('${day}'::date+180),'Dry store','{"product":"Whey kishk","ingredients":["Whey","Bulgur","Salt"],"allergens":["Milk","Gluten"],"storage_advice":"Keep cool and dry"}');\n`;
 for(const key of ['hygiene','drying_temperature'])sql+=`insert into public.operational_record(id,cooperative_id,lot_id,kind,definition_key,config_version_id,payload,author_id,device_id,observed_at) values(gen_random_uuid(),'${coop}','${batch}','checkpoint','${key}','${config}',${q(JSON.stringify(key==='hygiene'?{all_ok:true}:{value:25,unit:'°C'}))},'${producer}','${device}','${day} 12:00Z');\n`;
 sql+=`select set_config('wise.transition','authorized',true);update public.lot set state='released' where id in ('${batch}','${pack}');\n`;
 sql+=`insert into public.sale values(gen_random_uuid(),'${coop}','${pack}','sale',80,'retail',null,400,'USD',1,'${producer}','${device}','${day} 16:00Z','${day} 16:00Z');\ninsert into public.inventory_movement values(gen_random_uuid(),'${coop}','${pack}','sold',-80,'unit','historical sale','${producer}','${device}','${day} 16:00Z','${day} 16:00Z');\n`;
 }
}
sql+="update public.lot set expires_at=observed_at+interval '1 day' where type='whey' and observed_at<now()-interval '7 days';\n";
sql+='select public.generate_tasks();\n';const path='supabase/seed.sql';writeFileSync(path,readFileSync(path,'utf8')+sql);

