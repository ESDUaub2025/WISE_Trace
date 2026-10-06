import { readFileSync,writeFileSync } from 'node:fs';
import { demoConfig } from '../src/lib/demo.ts';
import {introTrainingContent,introAssessment} from '../src/lib/learning-demo.ts';
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const uuid=(family,n)=>`${family}0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const coop=uuid(1,1),coop2=uuid(1,2),device=uuid(3,1),cfg=uuid(4,1),producer=uuid(2,1),supervisor=uuid(2,2),supplier=uuid(5,1);
let sql=`-- LOCAL DEMO ONLY. Fictional users; never apply this seed to production.\n`;
sql+=`insert into public.cooperative(id,code,name,region) values ('${coop}','AKR01','Akkar Harvest','Akkar'),('${coop2}','BEK01','Bekaa Roots','Bekaa');\n`;
const roles=['producer','supervisor','manager','admin','food_safety','partner','donor'];
for(let c=1;c<=2;c++)for(let r=0;r<roles.length;r++){
 const id=uuid(2,(c-1)*7+r+1);const name=c===1&&r===0?'rima':c===1&&r===1?'karim':`${roles[r]}${c}`;
 sql+=`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change) values ('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${name}@users.wise.invalid',extensions.crypt('wise-demo-only',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');\n`;
 sql+=`insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${id}','${id}',jsonb_build_object('sub','${id}','email','${name}@users.wise.invalid'),'email',now(),now(),now());\n`;
 sql+=`insert into public.membership(user_id,cooperative_id,username,display_name,roles,authorizations) values('${id}','${uuid(1,c)}','${name}','${c===1&&r===0?'Rima Haddad':c===1&&r===1?'Karim Nassar':`${roles[r]} Demo ${c}`}','{${roles[r]}}','{"receive_whey":true}');\ninsert into private.user_pin values('${id}',extensions.crypt('2468',extensions.gen_salt('bf')),0,null);\n`;
}
sql+=`insert into public.device values('${device}','${coop}','Cooperative phone 1','${producer}',null,now());\n`;
sql+=`insert into public.config_version(id,kind,version,effective_at,status,placeholder,definition,drafted_by,approved_by,approved_at) values('${cfg}','sop',1,'2026-01-01','approved',true,${quote(JSON.stringify(demoConfig.definition))},'${uuid(2,4)}','${uuid(2,5)}',now());\n`;
sql+=`insert into public.supplier values('${supplier}','${coop}','Cedar Dairy','dairy','approved','{}','{"pasteurized":true,"starter_culture":"Cultured labneh","salt_stage":"After separation"}');\n`;
const module=uuid(7,1);
sql+=`insert into public.training_module(id,config_version_id,module_key,version,content,assessment) values('${module}','${cfg}','gmp',1,${quote(JSON.stringify(introTrainingContent))},${quote(JSON.stringify(introAssessment))});\n`;
for(let i=1;i<=14;i++)sql+=`insert into public.training_completion values('${uuid(8,i)}','${uuid(1,i<=7?1:2)}','${uuid(2,i)}','${module}','2026-01-02',100,null);\n`;
const states=['accepted','in_production','released','received','hold','rejected','received','draft','awaiting_review','on_hold','rejected','closed'];
for(let i=1;i<=states.length;i++){
 const type=i===1||[5,6,7].includes(i)?'whey':i===3?'packaging':i===4?'packaging_material':'batch';const quantity=type==='whey'?120:type==='packaging'?96:type==='packaging_material'?500:0;const unit=['packaging','packaging_material'].includes(type)?'unit':'kg';
 sql+=`insert into public.lot(id,cooperative_id,type,code,state,unit,initial_quantity,supplier_id,producer_id,device_id,config_version_id,observed_at,generation_at,expires_at,stage,facts) values('${uuid(6,i)}','${coop}','${type}','${type==='batch'?'KB':type==='whey'?'WL':type==='packaging'?'PL':'PM'}-AKR01-261006-${String(i).padStart(2,'0')}','${states[i-1]}','${unit}',${quantity},${type==='whey'?quote(supplier):'null'},'${producer}','${device}','${cfg}',now()-interval '1 hour',now()-interval '2 hours',${type==='whey'?"now()+interval '46 hours'":"now()+interval '180 days'"},${type==='batch'?quote(i===2?'drying':'preparation'):'null'},'{}');\n`;
 if(quantity>0)sql+=`insert into public.inventory_movement values(gen_random_uuid(),'${coop}','${uuid(6,i)}','produced',${quantity},'${unit}','demo receipt','${producer}','${device}',now()-interval '1 hour',now());\n`;
}
sql+=`insert into public.consumption values(gen_random_uuid(),'${coop}','${uuid(6,1)}','${uuid(6,2)}',85,'kg','${producer}','${device}',now()-interval '1 hour',now(),'demo allocation');\n`;
sql+=`insert into public.packaging_detail(lot_id,cooperative_id,batch_id,packaging_material_id,package_type,size_kg,package_count,mass_kg,best_before,storage_location,label,public_token) values('${uuid(6,3)}','${coop}','${uuid(6,9)}','${uuid(6,4)}','kraft',0.5,96,48,current_date+180,'Dry store A','{"product":"Whey kishk","ingredients":["Whey","Bulgur","Salt"],"allergens":["Milk","Gluten"],"storage_advice":"Keep cool and dry"}','demo-released-token');\n`;
sql+=`insert into public.inventory_movement values(gen_random_uuid(),'${coop}','${uuid(6,3)}','sold',-32,'unit','demo sales','${producer}','${device}',now(),now());\n`;
sql+=`insert into public.sale values(gen_random_uuid(),'${coop}','${uuid(6,3)}','sale',32,'retail',null,160,'USD',1,'${producer}','${device}',now(),now());\n`;
sql+=`insert into public.deviation(id,cooperative_id,lot_id,category,severity,issue,corrective_action,author_id,device_id,observed_at) values(gen_random_uuid(),'${coop}','${uuid(6,10)}','drying','critical','Drying evidence requires review','Hold pending supervisor review','${producer}','${device}',now());\n`;
sql+=`insert into public.equipment values(gen_random_uuid(),'${coop}','PH-02','pH meter',now()-interval '30 days',now()+interval '1 day','active');\n`;
sql+=`insert into public.recall(id,cooperative_id,trigger_lot_id,mock,reason,status,author_id,started_at,completed_at) values(gen_random_uuid(),'${coop}','${uuid(6,1)}',true,'Training drill','closed','${supervisor}',now()-interval '10 days 18 minutes',now()-interval '10 days');\n`;
const prd=readFileSync('WISE Digital Traceability and Impact Platform — PRD.md','utf8');
for(const line of prd.split('\n').filter(l=>/^\| KPI-\d+ \|/.test(l))){const values=line.split('|').slice(1,-1).map(s=>s.trim());sql+=`insert into public.kpi_definition values(${values.map(quote).join(',')});\n`;}
sql+='select public.generate_tasks();\n';writeFileSync('supabase/seed.sql',sql);

