import { authenticate,cors,json } from '../_shared/http.ts';
import ExcelJS from 'npm:exceljs@4.4.0';
import { PDFDocument,rgb } from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';
import { z } from 'npm:zod@4.6.5';
import {TZDate} from 'npm:@date-fns/tz@1.5.0';
function midnight(date:string,extraDays=0){const [y,m,d]=date.split('-').map(Number);return new TZDate(y,m-1,d+extraDays,0,0,0,'Asia/Beirut').toISOString();}
const schema=z.object({report:z.enum(['lot','operational_record','deviation','inventory_movement','sale','training_completion','equipment','audit_event','recall','impact','traceability','production_record','calibration','material_disposition']),format:z.enum(['csv','xlsx','pdf']),target:z.uuid().optional(),cooperative_id:z.uuid().optional(),lot_type:z.enum(['whey','ingredient','batch','packaging','packaging_material']).optional(),config_version_id:z.uuid().optional(),from_date:z.iso.date().default(`${new Date().getFullYear()}-01-01`),to_date:z.iso.date().default(new Date().toISOString().slice(0,10))});
const text=(v:unknown)=>typeof v==='object'?JSON.stringify(v):String(v??'');
Deno.serve(async request=>{if(request.method==='OPTIONS')return json({});try{const {user,identity}=await authenticate(request);const body=schema.parse(await request.json());let rows:Record<string,unknown>[]=[];
 if(body.from_date>body.to_date)throw new Error('Invalid reporting period');
 const member=await user.from('membership').select('roles,status').eq('user_id',identity.id).single();if(member.error||member.data.status!=='active')throw new Error('Active account required');
 if(member.data.roles.includes('donor')&&body.report!=='impact')throw new Error('Donor reports are aggregate only');
 async function read(table:string,reference?:{column:string;ids:string[]},period=false){
  const result:Record<string,unknown>[]=[];const dates:Record<string,string>={training_completion:'completed_at',equipment:'calibrated_at',recall:'started_at',audit_event:'recorded_at'};
  for(let offset=0;offset<=100000;offset+=1000){
   let query=user.from(table).select('*').order(table==='packaging_detail'?'lot_id':'id').range(offset,offset+999);
   if(reference){if(!reference.ids.length)return result;query=query.in(reference.column,reference.ids);}
   if(body.cooperative_id)query=query.eq('cooperative_id',body.cooperative_id);
   if(period){const date=dates[table]??'observed_at';query=query.gte(date,midnight(body.from_date)).lt(date,midnight(body.to_date,1));}
   if(table==='lot'&&body.lot_type)query=query.eq('type',body.lot_type);
   if(table==='operational_record'&&body.report==='calibration')query=query.eq('kind','calibration');
   if(body.config_version_id&&['lot','operational_record'].includes(table))query=query.eq('config_version_id',body.config_version_id);
   const response=await query;if(response.error)throw response.error;
   if(offset===100000&&response.data.length)throw new Error('Report is too large; choose a shorter period');
   result.push(...response.data);if(response.data.length<1000)return result;
  }return result;
 }
 if(body.report==='impact'){const response=await user.rpc('impact_metrics',{from_date:body.from_date,to_date:body.to_date});if(response.error)throw response.error;rows=response.data;}
 else if(['traceability','production_record'].includes(body.report)){
  if(!body.target)throw new Error('Lot required');const back=await user.rpc('genealogy',{target:body.target,direction:'back'}),forward=await user.rpc('genealogy',{target:body.target,direction:'forward'});if(back.error||forward.error)throw back.error??forward.error;
  const ids:string[]=[...new Set([...back.data,...forward.data].map((r:{id:string})=>r.id))] as string[];if(!ids.length)throw new Error('Lot unavailable');rows=await read('lot',{column:'id',ids});rows=rows.map(row=>({record_type:'lot',...row}));
  const recordIds:string[]=[...ids];
  for(const table of ['operational_record','deviation','inventory_movement','material_disposition','decision','amendment','lot_state_event','stage_event','packaging_detail','sale']){
   const found=await read(table,{column:table==='sale'?'packaging_lot_id':table==='amendment'?'object_id':'lot_id',ids});recordIds.push(...found.filter(r=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(r.id))).map(r=>String(r.id)));rows.push(...found.map(r=>({record_type:table,...r})));
  }
  const allocations=await read('consumption',{column:'output_lot_id',ids});recordIds.push(...allocations.map(row=>String(row.id)));rows.push(...allocations.map(row=>({record_type:'consumption',...row})));
  rows.push(...(await read('attachment',{column:'record_id',ids:recordIds})).map(row=>({record_type:'attachment',...row})),...(await read('audit_event',{column:'object_id',ids:recordIds})).map(row=>({record_type:'audit_event',...row})));

 }
 else rows=await read(body.report==='calibration'?'operational_record':body.report,undefined,true);
 const columns=[...new Set(rows.flatMap(row=>Object.keys(row)))];let bytes:Uint8Array|string;let type:string;
 if(body.format==='csv'){const cell=(v:unknown)=>`"${text(v).replace(/^[=+@-]/,"'$&").replaceAll('"','""')}"`;bytes='\uFEFF'+[columns.map(cell).join(','),...rows.map(row=>columns.map(key=>cell(row[key])).join(','))].join('\r\n');type='text/csv;charset=utf-8';}
 else if(body.format==='xlsx'){const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('WISE');sheet.columns=columns.map(key=>({header:key,key,width:24}));for(const row of rows)sheet.addRow(Object.fromEntries(columns.map(key=>[key,text(row[key])])));sheet.getRow(1).font={bold:true};bytes=new Uint8Array(await workbook.xlsx.writeBuffer());type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';}
 else{const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const fontBytes=await Deno.readFile(new URL('../_shared/plex-arabic.ttf',import.meta.url));const font=await pdf.embedFont(fontBytes,{subset:false});let page=pdf.addPage([595,842]);let y=800;const line=(value:string,size=9)=>{const chunks=value.match(/.{1,85}/gu)??[''];for(const chunk of chunks){if(y<45){page=pdf.addPage([595,842]);y=800;}page.drawText(chunk,{x:35,y,size,font,color:rgb(.18,.24,.15)});y-=size+6;}};line(`WISE — ${body.report}`,16);line(`${body.from_date} — ${body.to_date}`);for(const row of rows){y-=10;for(const key of columns)if(row[key]!==undefined)line(`${key}: ${text(row[key])}`);}bytes=await pdf.save();type='application/pdf';}
 return new Response(bytes as BodyInit,{headers:{...cors,'Content-Type':type,'Content-Disposition':`attachment; filename="wise-${body.report}.${body.format}"`}});
 }catch(e){return json({error:e instanceof Error?e.message:typeof e==='object'&&e!==null&&'message' in e?String(e.message):'Report failed'},400);}});
