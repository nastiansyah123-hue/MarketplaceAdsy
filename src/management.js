import {productFor} from './model.js';
import {composeShopeeAds} from './adSources.js';
export const upgradeManagement=data=>({...data,targets:data.targets||[],ad_rules:data.ad_rules||[]});
export function targetActual(data,target){let revenue=0,units=0;for(const o of data.orders){if(o.shop_id!==target.shop_id||o.status!=='valid'||o.date.slice(0,7)!==target.month.slice(0,7))continue;const m=productFor(data,o.shop_id,'sku',o.sku);if(m?.product_id===target.product_id){revenue+=Number(o.amount);units+=Number(o.quantity)*Number(m.units||0);}}return {revenue,units};}
export function shopHasData(data,id){return ['orders','ads','imports','ad_parts','daily','targets'].some(k=>(data[k]||[]).some(r=>r.shop_id===id));}
export function demoAction(data,action,row,options={}){
 let d=structuredClone(data);
 if(action==='unassign')d.assignments=d.assignments.filter(a=>a.id!==row.id);
 if(action==='delete-target')d.targets=d.targets.filter(a=>a.id!==row.id);
 if(action==='delete-rule')d.ad_rules=d.ad_rules.filter(a=>a.id!==row.id);
 if(action==='delete-shop'){if(shopHasData(d,row.id))throw Error('Toko masih memiliki laporan. Gabungkan ke toko yang benar atau nonaktifkan toko.');for(const k of ['shops','assignments','mappings','order_days'])d[k]=d[k].filter(r=>(k==='shops'?r.id:r.shop_id)!==row.id);}
 if(action==='delete-import'){
 const days=new Set([...d.ads,...d.ad_parts].filter(r=>r.import_id===row.id).map(r=>r.date));
 d.orders=d.orders.filter(r=>r.import_id!==row.id);d.ad_parts=d.ad_parts.filter(r=>r.import_id!==row.id);d.ads=d.ads.filter(r=>r.import_id!==row.id);
 for(const date of days){d.ads=d.ads.filter(a=>!(a.shop_id===row.shop_id&&a.date===date&&a.source.startsWith('shopee_')));const parts=d.ad_parts.filter(p=>p.shop_id===row.shop_id&&p.date===date);if(parts.length){const shop=d.shops.find(s=>s.id===row.shop_id);for(const a of composeShopeeAds(shop,parts).ads){const kind=a.source==='shopee_shop'?'shop':a.source==='shopee_auto'?'automatic':'overall';d.ads.push({...a,id:crypto.randomUUID(),shop_id:row.shop_id,import_id:parts.find(p=>p.kind===kind)?.import_id});}}}
 d.order_days=d.order_days.filter(r=>d.orders.some(o=>o.shop_id===r.shop_id&&o.date===r.date));d.imports=d.imports.filter(r=>r.id!==row.id);
 }
 if(action==='merge-shop'){
 const source=row.id,target=options.target,a=d.shops.find(s=>s.id===source),b=d.shops.find(s=>s.id===target);if(!b||!b.active||a.platform!==b.platform||source===target)throw Error('Pilih toko tujuan aktif pada platform yang sama.');
 const keys={orders:r=>r.order_id,imports:r=>r.fingerprint,ad_parts:r=>r.date+'|'+r.kind,ads:r=>r.source.startsWith('shopee_')?null:[r.date,r.source,r.external_key].join('|'),daily:r=>r.date,targets:r=>r.month+'|'+r.product_id,mappings:r=>r.kind+'|'+r.code};
 for(const[k,key]of Object.entries(keys)){const existing=new Map(d[k].filter(r=>r.shop_id===target).map(r=>[key(r),r]));for(const r of d[k].filter(r=>r.shop_id===source)){const other=existing.get(key(r));if(key(r)&&other&&(k!=='mappings'||other.product_id!==r.product_id||other.units!==r.units))throw Error('Ada data bertabrakan pada '+k+'. Periksa atau hapus upload duplikat terlebih dahulu.');}}
 const dates=new Set(d.ad_parts.filter(r=>[source,target].includes(r.shop_id)).map(r=>r.date));d.ads=d.ads.filter(r=>!([source,target].includes(r.shop_id)&&r.source.startsWith('shopee_')));
 d.mappings=d.mappings.filter(r=>!(r.shop_id===source&&d.mappings.some(m=>m.shop_id===target&&m.kind===r.kind&&m.code===r.code)));
 for(const k of ['orders','imports','ad_parts','ads','daily','targets','mappings','order_days'])d[k]=d[k].map(r=>r.shop_id===source?{...r,shop_id:target}:r);
 if(options.copy)for(const r of d.assignments.filter(r=>r.shop_id===source&&r.active&&d.profiles.some(p=>p.id===r.profile_id&&p.role==='staff'&&p.status==='active')))if(!d.assignments.some(x=>x.shop_id===target&&x.profile_id===r.profile_id))d.assignments.push({...r,id:crypto.randomUUID(),shop_id:target});
 d.assignments=d.assignments.filter(r=>r.shop_id!==source);d.shops=d.shops.filter(r=>r.id!==source);
 for(const date of dates){const parts=d.ad_parts.filter(r=>r.shop_id===target&&r.date===date);for(const ad of composeShopeeAds(b,parts).ads)d.ads.push({...ad,id:crypto.randomUUID(),shop_id:target,import_id:parts.find(p=>p.kind===(ad.source==='shopee_shop'?'shop':ad.source==='shopee_auto'?'automatic':'overall'))?.import_id});}
 }
 return d;
}
