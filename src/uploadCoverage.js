import{sourceCoverage}from'./adSources.js';
import{today}from'./model.js';
export function uploadCoverage(data,shop,month,asOf=today()){
 if(!shop||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return [];
 const[y,m]=month.split('-').map(Number),days=new Date(Date.UTC(y,m,0)).getUTCDate();
 const observed=sourceCoverage(data,[shop],month+'-01',month+'-31');const byDate=new Map(observed.map(r=>[r.date,r]));
 return Array.from({length:days},(_,i)=>{const date=month+'-'+String(i+1).padStart(2,'0'),required=shop.platform==='shopee'?['orders','overall','automatic','shop']:['orders'];
 const received=shop.platform==='shopee'?[...(byDate.get(date)?.received||[])]:((data.order_days||[]).some(r=>r.shop_id===shop.id&&r.date===date)||(data.orders||[]).some(r=>r.shop_id===shop.id&&r.date===date)?['orders']:[]);
 const missing=required.filter(k=>!received.includes(k)),mismatch=byDate.get(date)?.mismatch||false,due=date<asOf;
 const status=!missing.length&&!mismatch?'complete':received.length?'partial':due?'missing':'upcoming';
 return {date,shop_id:shop.id,required,received,missing,mismatch,due,status};
 });
}
