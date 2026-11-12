import{createClient}from'@supabase/supabase-js';
export const supabase=import.meta.env.VITE_SUPABASE_URL&&import.meta.env.VITE_SUPABASE_ANON_KEY?createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY):null;
export const tables=['profiles','shops','assignments','products','skus','mappings','orders','ads','daily','imports','ad_parts','order_days','targets','ad_rules'];
export const lightTables=['profiles','shops','assignments','products','skus','mappings','imports','targets','ad_rules'];
export const heavyTables=['orders','ads','daily','ad_parts','order_days'];
export const empty=()=>Object.fromEntries(tables.map(k=>[k,[]]));

// Step 1: Load profiles cepat (1 row, PK lookup, RLS ringan) → user langsung masuk dashboard
export async function loadProfiles(signal){
 let query=supabase.from('mp_profiles').select('*');
 if(signal)query=query.abortSignal(signal);
 const{data,error}=await query;
 if(error)throw error;
 return data||[];
}

// Step 2: Load data ringan + summary (cepat, < 2 detik)
export async function loadFast(signal,dateRange){
 const args={p_from:dateRange?.from||null,p_to:dateRange?.to||null};
 let query=supabase.rpc('mp_load_fast',args);
 if(signal)query=query.abortSignal(signal);
 const{data,error}=await query;
 if(error)throw error;
 if(data?.error==='not_active')throw new Error('Akun belum aktif.');
 const result={};
 for(const k of lightTables)result[k]=data[k]||[];
 // Heavy tables empty dulu, di-load on-demand
 for(const k of heavyTables)result[k]=[];
 // Server-computed summaries
 result._summary=data.summary||{};
 result._dailySummary=data.daily_summary||[];
 result._shopSummary=data.shop_summary||[];
 result._adSummary=data.ad_summary||{};
 return result;
}

// Step 3: Load data berat (on-demand, saat user buka halaman yang butuh)
export async function loadHeavy(signal,dateRange){
 const args={p_from:dateRange?.from||null,p_to:dateRange?.to||null};
 let query=supabase.rpc('mp_load_data',args);
 if(signal)query=query.abortSignal(signal);
 const{data,error}=await query;
 if(error)throw error;
 const result={};
 for(const k of tables)result[k]=data[k]||[];
 return result;
}

// Full load (fallback / refresh)
export async function loadData(signal,dateRange){
 const args={p_from:dateRange?.from||null,p_to:dateRange?.to||null};
 let query=supabase.rpc('mp_load_data',args);
 if(signal)query=query.abortSignal(signal);
 const{data,error}=await query;
 if(error)throw error;
 if(data?.error==='not_active')throw new Error('Akun belum aktif.');
 const result={};
 for(const k of tables)result[k]=data[k]||[];
 return result;
}

// Refresh: pakai RPC yang sama, ambil yang diminta
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
