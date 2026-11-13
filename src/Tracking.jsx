import React,{useState,useMemo,useEffect,useCallback}from'react';
import{SearchBox,Empty,usePaging,Modal}from'./ui.jsx';
import{money,num}from'./model.js';
import{supabase}from'./db.js';
import{RefreshCw,Truck,Package,MapPin,CheckCircle,AlertTriangle,Clock,ArrowRight,RotateCcw}from'lucide-react';

const STAGES={
 MENUNGGU_RESI:{label:'Menunggu Resi',color:'#94a3b8',icon:Clock,step:0,emoji:'📋'},
 BELUM_DICEK:{label:'Belum Dicek',color:'#60a5fa',icon:Package,step:1,emoji:'📦'},
 DIKIRIM:{label:'Dikirim',color:'#38bdf8',icon:Truck,step:2,emoji:'🚚'},
 KOTA_TUJUAN:{label:'Kota Tujuan',color:'#a78bfa',icon:MapPin,step:3,emoji:'📍'},
 OTW:{label:'OTW Penerima',color:'#fbbf24',icon:ArrowRight,step:4,emoji:'🏃'},
 SAMPAI:{label:'Sampai',color:'#34d399',icon:CheckCircle,step:5,emoji:'✅'},
 BERMASALAH:{label:'Bermasalah',color:'#f87171',icon:AlertTriangle,step:-1,emoji:'⚠️'},
 RETUR:{label:'Retur',color:'#fb923c',icon:RotateCcw,step:-2,emoji:'↩️'},
 MANUAL:{label:'Manual',color:'#94a3b8',icon:Clock,step:-3,emoji:'🔧'},
};
const STAGE_ORDER=['MENUNGGU_RESI','BELUM_DICEK','DIKIRIM','KOTA_TUJUAN','OTW','SAMPAI','BERMASALAH','RETUR'];
const STEPPER_STAGES=['BELUM_DICEK','DIKIRIM','KOTA_TUJUAN','OTW','SAMPAI'];

function stageBadge(status){
 const s=STAGES[status]||STAGES.MENUNGGU_RESI;
 return <span className="tr-badge" style={{background:s.color+'22',color:s.color}}>{s.emoji} {s.label}</span>;
}

function avatarColor(name){
 let h=0;for(let i=0;i<(name||'').length;i++)h=name.charCodeAt(i)+((h<<5)-h);
 const colors=['#4361EE','#F72585','#7209B7','#3A0CA3','#4CC9F0','#06D6A0','#EF476F','#118AB2','#073B4C','#FF6B35'];
 return colors[Math.abs(h)%colors.length];
}

function Stepper({status}){
 const st=STAGES[status]||STAGES.MENUNGGU_RESI;
 const currentStep=st.step;
 const isBermasalah=currentStep<0;
 return <div className="tr-stepper">
  {STEPPER_STAGES.map((key,i)=>{
   const step=STAGES[key].step;
   const done=!isBermasalah&&currentStep>=step;
   const active=!isBermasalah&&currentStep===step;
   const problem=isBermasalah&&i===1;
   return <div key={key} className={'tr-step'+(done?' tr-step-done':'')+(active?' tr-step-active':'')+(problem?' tr-step-problem':'')}>
    {i>0&&<div className={'tr-step-line'+(done?' done':'')}/>}
    <div className="tr-step-circle">{done&&!active?'✓':problem?'!':i+1}</div>
    <div className="tr-step-label">{problem?(status==='RETUR'?'Retur':'Masalah'):STAGES[key].label}</div>
   </div>;
  })}
 </div>;
}

function OrderCard({o,shop,onClick}){
 const shopName=shop?.name||'—';
 const initial=(shopName[0]||'?').toUpperCase();
 const checkedAt=o.status_resi_updated_at?new Date(o.status_resi_updated_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}):'';
 return <div className="tr-card" onClick={onClick}>
  <div className="tr-card-top">
   <div className="tr-card-left">
    <div className="tr-avatar" style={{background:avatarColor(shopName)}}>{initial}</div>
    <div style={{minWidth:0}}>
     <div className="tr-name">{shopName}</div>
     <div className="tr-sub">{o.source_channel}</div>
     <div className="tr-meta">
      {stageBadge(o.status_resi)}
      {o.ekspedisi&&<span className="tr-badge tr-badge-gray">{o.ekspedisi}</span>}
     </div>
     <div className="tr-produk">{o.skus?o.skus.map(s=>s.sku+' × '+s.quantity).join(', '):o.sku+' × '+o.quantity}</div>
    </div>
   </div>
   <div className="tr-card-right">
    <div className="tr-price">{money(o.totalAmount||o.amount)}</div>
    <div className="tr-date">{o.date}</div>
    {o.resi&&<div className="tr-resi">{o.resi}</div>}
    {checkedAt&&<div className="tr-checked-at">🕐 {checkedAt}</div>}
   </div>
  </div>
  <div className="tr-divider"/>
  <Stepper status={o.status_resi}/>
 </div>;
}

const COURIER_OPTIONS=['SPX','J&T','JNE','SICEPAT','ANTERAJA','NINJA','IDEXPRESS','LION','SAP','POS'];

// Detect courier short name from raw ekspedisi string (e.g. "Reguler (Cashless)-SPX Standard" → "SPX")
function detectCourierName(raw){
 if(!raw)return '';
 const u=(raw||'').toUpperCase();
 if(/SPX|SHOPEE/.test(u))return 'SPX';
 if(/J&T|J\s*&\s*T|JNT/.test(u))return 'J&T';
 if(/JNE/.test(u))return 'JNE';
 if(/SICEPAT|SI CEPAT/.test(u))return 'SICEPAT';
 if(/ANTERAJA|ANTER\s*AJA/.test(u))return 'ANTERAJA';
 if(/NINJA/.test(u))return 'NINJA';
 if(/IDEXPRESS|ID\s*EXPRESS/.test(u))return 'IDEXPRESS';
 if(/LION/.test(u))return 'LION';
 if(/SAP/.test(u))return 'SAP';
 if(/POS\s|^POS$|POS\sINDONESIA/.test(u))return 'POS';
 return raw;
}

function TrackingDetail({order,shop,onCheck,checking,onClose}){
 const detail=order.status_resi_detail;
 const history=detail?.history||[];
 const detectedCourier=detectCourierName(order.ekspedisi);
 const[editEksp,setEditEksp]=useState(detectedCourier||order.ekspedisi||'');
 const[saving,setSaving]=useState(false);

 async function saveEkspedisi(){
  if(!supabase||saving)return;
  setSaving(true);
  try{
   const{error}=await supabase.from('mp_orders').update({ekspedisi:editEksp}).eq('order_id',order.order_id).eq('shop_id',order.shop_id);
   if(error)throw error;
  }catch{}finally{setSaving(false);}
 }

 return <div className="form-body">
  <div className="td-header">
   <div className="td-resi-line">{order.resi||'Belum ada resi'}{detectedCourier?' · '+detectedCourier:''}</div>
   {stageBadge(order.status_resi)}
  </div>

  <Stepper status={order.status_resi}/>

  <div className="td-ekspedisi-row">
   <span>Ekspedisi:</span>
   <select value={editEksp} onChange={e=>setEditEksp(e.target.value)}>
    <option value="">— Pilih —</option>
    {COURIER_OPTIONS.map(c=><option key={c} value={c}>{c}</option>)}
    {editEksp&&!COURIER_OPTIONS.includes(editEksp)&&<option value={editEksp}>{editEksp}</option>}
   </select>
   <button className="primary td-save-btn" disabled={saving||editEksp===order.ekspedisi} onClick={saveEkspedisi}>{saving?'…':'Simpan'}</button>
  </div>

  {history.length>0?<>
   <div className="tracking-timeline" style={{marginTop:'1rem'}}>
    {history.map((h,i)=><div key={i} className="timeline-item">
     <div className="timeline-dot" style={{background:i===0?'var(--accent)':'var(--border)'}}/>
     <div><strong>{h.date||h.waktu||''}</strong><p>{h.desc||h.keterangan||h.description||''}</p></div>
    </div>)}
   </div>
  </>:<p className="td-no-history">Belum ada history — klik "Cek Ulang".</p>}

  {detail?.masalah&&<div className="td-problem"><AlertTriangle size={14}/> {detail.masalah}</div>}

  <div className="td-actions">
   <button className="td-close-btn" onClick={onClose}>Tutup</button>
   {order.resi&&<button className="primary td-check-btn" disabled={checking} onClick={()=>onCheck(order)}>
    {checking?<><RefreshCw size={15} className="spin"/> Mengecek…</>:<><RefreshCw size={15}/> Cek Ulang</>}
   </button>}
  </div>
 </div>;
}

export default function Tracking({data,orders,onRefresh}){
 const[q,setQ]=useState('');
 const[stage,setStage]=useState('');
 const[shop,setShop]=useState('');
 const[modal,setModal]=useState(null);
 const[checking,setChecking]=useState(false);
 const[refreshing,setRefreshing]=useState(false);
 const[toast,setToast]=useState('');
 const[lastRefresh,setLastRefresh]=useState(Date.now());
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),4000);return()=>clearTimeout(t);},[toast]);

 // Supabase Realtime: auto-refresh saat status_resi berubah di DB
 useEffect(()=>{
  if(!supabase||!onRefresh)return;
  const channel=supabase.channel('tracking-changes')
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'mp_orders',filter:'status_resi=neq.NULL'},()=>{
    onRefresh();setLastRefresh(Date.now());
   }).subscribe();
  return()=>{supabase.removeChannel(channel);};
 },[onRefresh]);

 const doRefresh=useCallback(async()=>{
  if(!onRefresh||refreshing)return;
  setRefreshing(true);
  try{await onRefresh();setLastRefresh(Date.now());setToast('Data tracking diperbarui');}
  catch{setToast('Gagal memperbarui data');}
  finally{setRefreshing(false);}
 },[onRefresh,refreshing]);

 // Group by order_id (1 order = 1 resi = 1 card)
 const trackable=useMemo(()=>{
  const map=new Map();
  for(const o of orders){
   if(o.status_resi==null)continue;
   const key=o.shop_id+'|'+o.order_id;
   const existing=map.get(key);
   if(!existing){
    map.set(key,{...o,skus:[{sku:o.sku,quantity:o.quantity,title:o.title}],totalAmount:Number(o.amount)});
   }else{
    existing.skus.push({sku:o.sku,quantity:o.quantity,title:o.title});
    existing.totalAmount+=Number(o.amount);
    // Pakai resi/status dari baris yang punya data paling lengkap
    if(!existing.resi&&o.resi)existing.resi=o.resi;
    if(!existing.ekspedisi&&o.ekspedisi)existing.ekspedisi=o.ekspedisi;
    if(o.status_resi_updated_at>existing.status_resi_updated_at){
     existing.status_resi=o.status_resi;
     existing.status_resi_step=o.status_resi_step;
     existing.status_resi_detail=o.status_resi_detail;
     existing.status_resi_updated_at=o.status_resi_updated_at;
    }
   }
  }
  return [...map.values()];
 },[orders]);

 const filtered=useMemo(()=>
  trackable.filter(o=>
   (!stage||o.status_resi===stage)&&
   (!shop||o.shop_id===shop)&&
   (!q||(o.order_id+' '+(o.resi||'')+' '+(o.ekspedisi||'')+' '+o.skus.map(s=>s.sku).join(' ')).toLowerCase().includes(q.toLowerCase()))
  ).sort((a,b)=>(b.status_resi_updated_at||b.date||'').localeCompare(a.status_resi_updated_at||a.date||''))
 ,[trackable,stage,shop,q]);

 const counts=useMemo(()=>{
  const c={};
  for(const s of STAGE_ORDER)c[s]=0;
  for(const o of trackable)if(c[o.status_resi]!==undefined)c[o.status_resi]++;
  return c;
 },[trackable]);

 const paging=usePaging(filtered,q+stage+shop+filtered.length,15);

 async function handleCheck(order){
  setChecking(true);
  try{
   const res=await fetch('/api/tracking-check',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({order_id:order.id,resi:order.resi,ekspedisi:order.ekspedisi})
   });
   const result=await res.json();
   if(!res.ok)throw new Error(result.error||'Gagal cek resi');
   setToast('Resi dicek: '+result.status_resi);
   // Update modal langsung dengan result baru
   setModal(prev=>prev?{...prev,status_resi:result.status_resi,status_resi_step:result.status_resi_step,status_resi_detail:result.detail,status_resi_updated_at:new Date().toISOString()}:prev);
   if(onRefresh){await onRefresh();setLastRefresh(Date.now());}
  }catch(e){
   setToast('Error: '+e.message);
  }finally{
   setChecking(false);
  }
 }

 return <>
  <div className="tracking-stats">
   {STAGE_ORDER.map(s=>{
    const S=STAGES[s];
    const Icon=S.icon;
    return <button key={s} className={'tracking-stat'+(stage===s?' selected':'')} onClick={()=>setStage(stage===s?'':s)}>
     <div className="tracking-stat-icon" style={{background:S.color+'22',color:S.color}}><Icon size={20}/></div>
     <div><strong>{num(counts[s])}</strong><span>{S.label}</span></div>
    </button>;
   })}
  </div>

  <section className="panel">
   <div className="panel-heading">
    <div><h2>Tracking Pesanan</h2><p>Status pengiriman berdasarkan resi dari file ekspor marketplace.{lastRefresh?' Terakhir: '+new Date(lastRefresh).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta'}):''}</p></div>
    <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
     <button className="text-button" onClick={doRefresh} disabled={refreshing} title="Refresh data tracking" style={{display:'flex',alignItems:'center',gap:'4px',whiteSpace:'nowrap'}}><RefreshCw size={15} className={refreshing?'spin':''}/> Refresh</button>
     <SearchBox value={q} onChange={setQ} placeholder="Cari pesanan / resi / SKU…"/>
    </div>
   </div>
   <div className="table-toolbar">
    <select aria-label="Filter toko" value={shop} onChange={e=>setShop(e.target.value)}>
     <option value="">Semua toko</option>
     {data.shops.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
    <select aria-label="Filter status resi" value={stage} onChange={e=>setStage(e.target.value)}>
     <option value="">Semua status</option>
     {STAGE_ORDER.map(s=><option key={s} value={s}>{STAGES[s].label}</option>)}
    </select>
   </div>

   <div className="tr-grid">
    {paging.items.map(o=>
     <OrderCard key={o.id||o.shop_id+o.order_id+o.line_id} o={o} shop={data.shops.find(s=>s.id===o.shop_id)} onClick={()=>setModal(o)}/>
    )}
   </div>
   {!filtered.length&&<Empty text="Belum ada pesanan untuk tracking" hint="Pesanan dengan resi akan muncul setelah file diimpor."/>}
   {paging.pager}
  </section>

  {toast&&<div className="toast">{toast}</div>}

  {modal&&<Modal title="Detail Tracking" onClose={()=>setModal(null)}>
   <TrackingDetail order={modal} shop={data.shops.find(s=>s.id===modal.shop_id)} onCheck={handleCheck} checking={checking} onClose={()=>setModal(null)}/>
  </Modal>}
 </>;
}
