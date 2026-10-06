import { z } from 'zod';
export type Role = 'producer' | 'supervisor' | 'manager' | 'admin' | 'food_safety' | 'partner' | 'donor';
export type SyncStatus = 'saved' | 'syncing' | 'synced' | 'conflict';
export interface Identity { id: string; cooperative_id: string; username: string; display_name: string; roles: Role[]; authorizations: Record<string, boolean>; }
export interface Lot { id: string; cooperative_id: string; type: string; code: string; state: string; unit: string; initial_quantity: number; available?: number; supplier_id?: string; producer_id: string; device_id: string; config_version_id: string; observed_at: string; expires_at?: string; generation_at?:string; stage?: string; facts: Record<string, unknown>; sync_status?: SyncStatus; }
export interface Checkpoint { key: string; label: { en: string; ar: string }; stage: string; required: boolean; response_type?:'boolean'|'number'; required_photo?:boolean; responsible_role?:Role; checklist_items?:{key:string;label:{en:string;ar:string}}[]; unit?: string; min?: number; max?: number; min_plausible?: number; max_plausible?: number; interval_hours?: number; offset_hours?:number; severity?: string;help_module_key?:string;help_step?:number; }
export interface ReceptionMeasurement {key:string;label?:{en:string;ar:string};min?:number;max?:number;required:boolean;unit?:string;response_type?:'number'|'text';min_plausible?:number;max_plausible?:number;equipment_required?:boolean;}
export interface Config { id: string; placeholder: boolean; definition: { thermal_printer?:{service:string;characteristic:string;width_dots?:number};session_offline_days?:number; session_inactivity_minutes?:number; stages: { key: string; label: { en: string; ar: string };expected_hours?:number }[]; checkpoints: Checkpoint[]; whey_max_age_hours: number; shelf_life_days: number; multi_lot: boolean; blending_enabled: boolean; self_release: boolean; lab_before_release: boolean; reception_measurements?: ReceptionMeasurement[]; packaging_options?: string[]; shelf_life_by_package?: Record<string,number>; label_template?: Record<string,unknown>; expected_yield?: {min:number;max:number}; }; }
export interface Task { [key: string]: unknown; id: string; kind: string; lot_id?: string; due_at: string; status: string; details: Record<string, unknown>; }
export interface Supplier { id: string; name: string; type: string; status: string; declarations: Record<string, unknown>; cooperative_id: string; }
export const envelopeSchema = z.object({ id: z.uuid(), cooperative_id: z.uuid(), author_id: z.uuid(), device_id: z.uuid(), config_version_id: z.uuid(), action: z.string(), observed_at: z.iso.datetime(), payload: z.record(z.string(), z.unknown()) });
export type Envelope = z.infer<typeof envelopeSchema>;
export type ActionClass = 'safe' | 'provisional' | 'online';
export function actionClass(action: string): ActionClass {
 if (['checkpoint','measurement','checklist','storage_inspection','note','deviation','training','sample','lab','calibration','complaint'].includes(action)) return 'safe';
 if (['abandon','material_disposition','whey_decision','receipt','batch','allocation','packaging','sale','movement','stage','handover'].includes(action)) return 'provisional';
 return 'online';
}
export function allocationCheck(available: number, quantity: number, online: boolean, reason?: string) {
 if (!Number.isFinite(quantity) || quantity <= 0) return { allowed: false, conflict: false, reason: 'positive_quantity' };
 if (quantity > available) return { allowed: !online && Boolean(reason?.trim()), conflict: true, reason: 'over_allocation' };
 return { allowed: true, conflict: false, reason: '' };
}
export function trace(lots: Lot[], edges: { input_lot_id: string; output_lot_id: string }[], start: string, direction: 'forward'|'back') {
 const visited = new Set<string>(); const queue = [start];
 while (queue.length) { const id = queue.shift()!; if (visited.has(id)) continue; visited.add(id); for (const edge of edges) { if (direction === 'forward' && edge.input_lot_id === id) queue.push(edge.output_lot_id); if (direction === 'back' && edge.output_lot_id === id) queue.push(edge.input_lot_id); } }
 return lots.filter(l => visited.has(l.id));
}
export function recallTrace(lots:Lot[],edges:{input_lot_id:string;output_lot_id:string}[],start:string) {
 const source=trace(lots,edges,start,'back').filter(l=>l.type==='whey');
 const affected=new Set([start,...source.flatMap(l=>trace(lots,edges,l.id,'forward').map(item=>item.id))]);
 // A batch review shows its sources and sibling batches sharing that whey.
 for(const lot of trace(lots,edges,start,'forward'))affected.add(lot.id);
 return lots.filter(l=>affected.has(l.id));
}
