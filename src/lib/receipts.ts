import type {Identity,ReceptionMeasurement} from './domain';
export function receiptField(key:string){return key==='reception_temperature'?'temperature':key;}
export function measurementUnit(rule:ReceptionMeasurement){return rule.unit??(rule.key==='ph'?'pH':rule.key==='reception_temperature'?'°C':'');}
export function receiptMeasurements(form:FormData,rules:ReceptionMeasurement[],identity:Identity,observedAt:string,hasPhoto:boolean):Record<string,unknown>&{measurements:Record<string,unknown>[]} {
 const readings:Record<string,number|string>={};const measurements:Record<string,unknown>[]=[];
 for(const rule of rules){const raw=String(form.get(receiptField(rule.key))??'').trim();if(!raw){if(rule.required)throw new Error('receptionMeasurementRequired');continue;}const value=rule.response_type==='text'?raw:Number(raw);if(typeof value==='number'&&(!Number.isFinite(value)||(rule.min_plausible!==undefined&&value<rule.min_plausible)||(rule.max_plausible!==undefined&&value>rule.max_plausible)))throw new Error('implausibleMeasurement');const equipmentId=String(form.get('equipment:'+rule.key)??'');if(rule.equipment_required&&!equipmentId)throw new Error('equipmentRequired');const unit=String(form.get('unit:'+rule.key)??measurementUnit(rule));readings[rule.key]=value;measurements.push({key:rule.key,value,unit,observed_at:observedAt,user_id:identity.id,equipment_id:equipmentId||undefined,image:hasPhoto?'receipt_photo':undefined});}
 return {...readings,measurements};
}
