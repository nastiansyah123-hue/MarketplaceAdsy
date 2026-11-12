import{createClient}from'@supabase/supabase-js';
export const supabase=import.meta.env.VITE_SUPABASE_URL&&import.meta.env.VITE_SUPABASE_ANON_KEY?createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY):null;
export const tables=['profiles','shops','assignments','products','skus','mappings','orders','ads','daily','imports','ad_parts','order_days','targets','ad_rules'];
export const empty=()=>Object.fromEntries(tables.map(k=>[k,[]]));

// Satu RPC call = 1 query, cek role 1x, bypass per-row RLS
export async function loadData(signal,onProfiles,dateRange){
 const args={p_from:dateRange?.from||null,p_to:dateRange?.to||null};
 let query=supabase.rpc('mp_load_data',args);
 if(signal)query=query.abortSignal(signal);
 const{data,error}=await query;
 if(error)throw error;
 if(data?.error==='not_active')throw new Error('Akun belum aktif.');
 // Pastikan semua key ada
 const result={};
 for(const k of tables)result[k]=data[k]||[];
 onProfiles?.(result.profiles);
 return result;
}

// Refresh spesifik tabel — tetap pakai 1 RPC (ambil semua, tapi cuma pakai yang diminta)
export async function refreshTables(signal,tableNames,dateRange){
 const args={p_from:dateRange?.from||null,p_to:dateRange?.to||null};
 let query=supabase.rpc('mp_load_data',args);
 if(signal)query=query.abortSignal(signal);
 const{data,error}=await query;
 if(error)throw error;
 const result={};
 for(const k of tableNames)result[k]=data[k]||[];
 return result;
}

export async function put(table,row,exists){const q=exists?supabase.from('mp_'+table).update(row).eq('id',row.id):supabase.from('mp_'+table).insert(row);const {error}=await q;if(error)throw error;}
export async function rpc(name,args){const{data,error}=await supabase.rpc(name,args);if(error)throw error;return data;}

export async function removeRow(table,id){const{error}=await supabase.from('mp_'+table).delete().eq('id',id);if(error)throw error;}
