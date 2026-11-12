import React,{useState,useMemo}from'react';
import{SearchBox,Empty,usePaging,Modal}from'./ui.jsx';
import{money,num}from'./model.js';
import{RefreshCw,Truck,Package,MapPin,CheckCircle,AlertTriangle,Clock,ArrowRight}from'lucide-react';

const STAGES={
 MENUNGGU_RESI:{label:'Menunggu Resi',color:'#94a3b8',icon:Clock,step:0},
 BELUM_DICEK:{label:'Belum Dicek',color:'#60a5fa',icon:Package,step:1},
 DIKIRIM:{label:'Dikirim',color:'#38bdf8',icon:Truck,step:2},
 KOTA_TUJUAN:{label:'Kota Tujuan',color:'#a78bfa',icon:MapPin,step:3},
 OTW:{label:'OTW Penerima',color:'#fbbf24',icon:ArrowRight,step:4},
 SAMPAI:{label:'Sampai',color:'#34d399',icon:CheckCircle,step:5},
 BERMASALAH:{label:'Bermasalah',color:'#f87171',icon:AlertTriangle,step:-1},
 RETUR:{label:'Retur',color:'#fb923c',icon:AlertTriangle,step:-2},
 MANUAL:{label:'Manual',color:'#94a3b8',icon:Clock,step:-3},
};
const STAGE_ORDER=['MENUNGGU_RESI','BELUM_DICEK','DIKIRIM','KOTA_TUJUAN','OTW','SAMPAI','BERMASALAH','RETUR'];

function stageBadge(status){
 const s=STAGES[status]||STAGES.MENUNGGU_RESI;
 return <span className="badge" style={{background:s.color+'22',color:s.color,border:'1px solid '+s.color+'44'}}>{s.label}</span>;
}

function TrackingDetail({order,shop,onCheck,checking}){
 const detail=order.status_resi_detail;
 const history=detail?.history||[];
 return <div className="form-body">
  <div className="detail-heading"><strong>{order.order_id}</strong>{stageBadge(order.status_resi)}</div>
  <p className="detail-shop">{shop?.name||'—'} · {order.source_channel}</p>
  <dl>
   <dt>Resi</dt><dd>{order.resi||<em>Belum ada</em>}</dd>
   <dt>Ekspedisi</dt><dd>{order.ekspedisi||'—'}</dd>
   <dt>Tanggal pesanan</dt><dd>{order.date}</dd>
   <dt>SKU</dt><dd>{order.sku}</dd>
   <dt>Jumlah</dt><dd>{num(order.quantity)}</dd>
   <dt>Nilai</dt><dd>{money(order.amount)}</dd>
   {order.status_resi_updated_at&&<><dt>Terakhir dicek</dt><dd>{new Date(order.status_resi_updated_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} WIB</dd></>}
   {detail?.masalah&&<><dt>Masalah</dt><dd className="danger-text">{detail.masalah}</dd></>}
   {detail?.keterangan&&<><dt>Keterangan</dt><dd>{detail.keterangan}</dd></>}
  </dl>
  {order.resi&&<button className="primary" style={{marginTop:'1rem'}} disabled={checking} onClick={()=>onCheck(order)}>
   {checking?<><RefreshCw size={15} className="spin"/> Mengecek…</>:<><RefreshCw size={15}/> Cek resi sekarang</>}
  </button>}
  {history.length>0&&<>
   <h3 style={{marginTop:'1.5rem',marginBottom:'.5rem'}}>Riwayat pengiriman</h3>
   <div className="tracking-timeline">
    {history.map((h,i)=><div key={i} className="timeline-item">
     <div className="timeline-dot" style={{background:i===0?'var(--accent)':'var(--border)'}}/>
     <div><strong>{h.date||h.waktu||''}</strong><p>{h.desc||h.keterangan||h.description||''}</p></div>
    </div>)}
   </div>
  </>}
 </div>;
}

export default function Tracking({data,orders}){
 const[q,setQ]=useState('');
 const[stage,setStage]=useState('');
 const[shop,setShop]=useState('');
 const[modal,setModal]=useState(null);
 const[checking,setChecking]=useState(false);
 const[toast,setToast]=useState('');

 // Only show orders that have tracking (status != cancelled/unpaid/returned OR have resi)
 const trackable=useMemo(()=>
  orders.filter(o=>o.status_resi!=null)
 ,[orders]);

 const filtered=useMemo(()=>
  trackable.filter(o=>
   (!stage||o.status_resi===stage)&&
   (!shop||o.shop_id===shop)&&
   (!q||(o.order_id+' '+(o.resi||'')+' '+(o.ekspedisi||'')+' '+o.sku).toLowerCase().includes(q.toLowerCase()))
  ).sort((a,b)=>(b.status_resi_updated_at||b.date||'').localeCompare(a.status_resi_updated_at||a.date||''))
 ,[trackable,stage,shop,q]);

 const counts=useMemo(()=>{
  const c={};
  for(const s of STAGE_ORDER)c[s]=0;
  for(const o of trackable)if(c[o.status_resi]!==undefined)c[o.status_resi]++;
  return c;
 },[trackable]);

 const paging=usePaging(filtered,q+stage+shop+filtered.length);

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
    <div><h2>Tracking Pesanan</h2><p>Status pengiriman berdasarkan resi dari file ekspor marketplace.</p></div>
    <SearchBox value={q} onChange={setQ} placeholder="Cari pesanan / resi / SKU…"/>
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

   <div className="table-scroll">
    <table>
     <thead><tr>
      <th>Pesanan / Tanggal</th>
      <th>Toko</th>
      <th>Resi / Ekspedisi</th>
      <th>Status Resi</th>
      <th>Terakhir Dicek</th>
      <th/>
     </tr></thead>
     <tbody>{paging.items.map(o=><tr key={o.id||o.shop_id+o.order_id+o.line_id}>
      <td data-label="Pesanan"><strong className="order-number">{o.order_id}</strong><small>{o.date} · {o.source_channel}</small></td>
      <td data-label="Toko">{data.shops.find(s=>s.id===o.shop_id)?.name||'—'}</td>
      <td data-label="Resi">{o.resi?<><strong>{o.resi}</strong><small>{o.ekspedisi||'—'}</small></>:<em style={{color:'var(--muted)'}}>Belum ada</em>}</td>
      <td data-label="Status">{stageBadge(o.status_resi)}</td>
      <td data-label="Dicek"><small>{o.status_resi_updated_at?new Date(o.status_resi_updated_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}):'—'}</small></td>
      <td><button className="text-button" onClick={()=>setModal(o)}>Detail</button></td>
     </tr>)}</tbody>
    </table>
   </div>
   {!filtered.length&&<Empty text="Belum ada pesanan untuk tracking" hint="Pesanan dengan resi akan muncul setelah file diimpor."/>}
   {paging.pager}
  </section>

  {toast&&<div className="toast">{toast}</div>}

  {modal&&<Modal title="Detail Tracking" onClose={()=>setModal(null)} wide>
   <TrackingDetail order={modal} shop={data.shops.find(s=>s.id===modal.shop_id)} onCheck={handleCheck} checking={checking}/>
  </Modal>}
 </>;
}
