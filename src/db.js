import{createClient}from'@supabase/supabase-js';import{readAllRows}from'./remoteRows.js';
export const supabase=import.meta.env.VITE_SUPABASE_URL&&import.meta.env.VITE_SUPABASE_ANON_KEY?createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY):null;
export const tables=['profiles','shops','assignments','products','skus','mappings','orders','ads','daily','imports','ad_parts','order_days','targets','ad_rules'];
export const empty=()=>Object.fromEntries(tables.map(k=>[k,[]]));
export async function loadData(signal,onProfiles){const profiles=await readAllRows(supabase,'mp_profiles',500,signal);onProfiles?.(profiles);const rest=tables.filter(k=>k!=='profiles');const all=await Promise.all(rest.map(k=>readAllRows(supabase,'mp_'+k,500,signal)));return {profiles,...Object.fromEntries(rest.map((k,i)=>[k,all[i]]))};}
export async function put(table,row,exists){const q=exists?supabase.from('mp_'+table).update(row).eq('id',row.id):supabase.from('mp_'+table).insert(row);const {error}=await q;if(error)throw error;}
export async function rpc(name,args){const{data,error}=await supabase.rpc(name,args);if(error)throw error;return data;}

export async function removeRow(table,id){const{error}=await supabase.from('mp_'+table).delete().eq('id',id);if(error)throw error;}
