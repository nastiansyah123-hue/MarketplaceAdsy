import {adProductFor} from './adTitles.js';
import {resolvePrefixSku} from './skuPrefix.js';
export const platforms={shopee:'Shopee',tiktok:'TikTok Shop',lazada:'Lazada'};
export const statuses={valid:'Aktif',cancelled:'Dibatalkan',unpaid:'Belum Bayar',returned:'Dikembalikan',unknown:'Perlu Dicek',mixed:'Status Campuran'};
export const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0);
export const num=n=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(n||0);
export const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
export const norm=v=>String(v??'').trim().replace(/\s+/g,' ').toUpperCase();
export const round=n=>Math.round((n+Number.EPSILON)*100)/100;
export const skuTokens=key=>norm(key).split('+').map(x=>x.trim().replace(/^(?:BONUS|FREE)\s+/,'')).filter(Boolean);
// --- Indexed lookups (built lazily, invalidated when data changes) ---
let _indexData=null,_skuByCode=null,_mappingIdx=null;
function ensureIndex(data){if(_indexData===data)return;_indexData=data;_skuByCode=new Map();for(const m of data.skus||[])if(m.match_mode!=='prefix')_skuByCode.set(m.code,m);_mappingIdx=new Map();for(const m of data.mappings||[]){const k=m.shop_id+'|'+m.kind+'|'+m.code;if(!_mappingIdx.has(k))_mappingIdx.set(k,m);}}
export function invalidateIndex(){_indexData=null;}
function directProduct(data,shop,key){ensureIndex(data);const nk=norm(key);return _skuByCode.get(nk)||_mappingIdx.get(shop+'|sku|'+nk)||resolvePrefixSku(data,key);}
// --- productFor cache (cleared per render cycle via buildProductCache) ---
let _pfCache=null,_pfData=null;
export function buildProductCache(data){if(_pfData!==data){_pfCache=new Map();_pfData=data;}return _pfCache;}
export function productFor(data,shop,type,key){ensureIndex(data);const nk=norm(key);if(type!=='sku')return _mappingIdx?.get(shop+'|'+type+'|'+nk);const cacheKey=shop+'|'+key;const cache=_pfData===data?_pfCache:null;if(cache?.has(cacheKey))return cache.get(cacheKey);const tokens=skuTokens(key),whole=directProduct(data,shop,key);let result;if(tokens.length<2){result=whole;}else{const main=directProduct(data,shop,tokens[0])||whole;if(!main){result=undefined;}else{const bonus=[],unmapped_bonus=[];for(const code of tokens.slice(1)){const m=directProduct(data,shop,code);if(m)bonus.push({product_id:m.product_id,units:Number(m.units),code});else unmapped_bonus.push(code);}result={...main,bonus,unmapped_bonus};}}if(cache)cache.set(cacheKey,result);return result;}
export function orderProductStats(data,o,product){const m=productFor(data,o.shop_id,'sku',o.sku),pid=product||o.report_product_id;const main=m&&(!pid||m.product_id===pid);return {revenue:main||(!m&&!pid)?Number(o.amount):0,units:main?Number(o.quantity)*Number(m.units||0):0,bonus:(m?.bonus||[]).filter(b=>!pid||b.product_id===pid).reduce((n,b)=>n+Number(o.quantity)*b.units,0),mapped:!!m,bonusMissing:m?.unmapped_bonus?.length||0};}
export function scopeData(data,me){if(!me||me.status!=='active')return {...data,shops:[],orders:[],ads:[],daily:[],imports:[],mappings:[],skus:[],ad_parts:[],order_days:[],targets:[],ad_rules:[]};if(me.role==='admin')return data;const ids=new Set(data.assignments.filter(a=>a.profile_id===me.id&&a.active).map(a=>a.shop_id));return {...data,...Object.fromEntries(['shops','orders','ads','daily','imports','mappings','ad_parts','order_days','targets'].map(k=>[k,(data[k]||[]).filter(r=>ids.has(k==='shops'?r.id:r.shop_id))]))};}
export function filtered(data,f){const shops=data.shops.filter(s=>(!f.platform||s.platform===f.platform)&&(!f.shop||s.id===f.shop)&&(!f.staff||data.assignments.some(a=>a.shop_id===s.id&&a.profile_id===f.staff&&a.active)));const ids=new Set(shops.map(s=>s.id));const inRange=r=>ids.has(r.shop_id)&&r.date>=f.from&&r.date<=f.to;if(f.product)buildProductCache(data);const orders=data.orders.filter(inRange).filter(o=>!f.product||(()=>{const m=productFor(data,o.shop_id,'sku',o.sku);return m?.product_id===f.product||m?.bonus?.some(b=>b.product_id===f.product);})());const scopedOrders=f.product?orders.map(o=>({...o,report_product_id:f.product})):orders;const ads=data.ads.filter(inRange).filter(a=>!f.product||adProductFor(data,a)===f.product);return {product:f.product||'',shops,orders:scopedOrders,ads,daily:f.product?[]:data.daily.filter(inRange)};}
export function summary({orders=[],ads=[],daily=[],shops=[]},data){buildProductCache(data);const active=orders.filter(o=>o.status==='valid');const orderKeys=new Set(active.map(o=>o.shop_id+'|'+o.order_id));let revenue=0,units=0,unmapped=0,unmappedBonus=0;
 // Single pass over active orders
 const revenueByShopDate=new Map();
 for(const o of active){const m=productFor(data,o.shop_id,'sku',o.sku);const rev=m||!o.report_product_id?Number(o.amount):0;revenue+=rev;if(m){const u=Number(o.quantity)*Number(m.units||0);units+=u;}else unmapped++;unmappedBonus+=(m?.unmapped_bonus?.length||0);const dk=o.shop_id+'|'+o.date;revenueByShopDate.set(dk,(revenueByShopDate.get(dk)||0)+rev);}
 revenue=round(revenue);
 const spend=round(ads.reduce((a,r)=>a+Number(r.spend),0)),tax=round(ads.reduce((a,r)=>a+Number(r.spend)*Number(r.tax_rate)/100,0)),gross=round(spend+tax),affiliate=round(daily.reduce((a,r)=>a+Number(r.affiliate),0));
 // Fee: pre-index daily + shops for O(1) lookup
 const dailyIdx=new Map();for(const d of daily)dailyIdx.set(d.shop_id+'|'+d.date,d);
 const shopIdx=new Map();for(const s of shops)shopIdx.set(s.id,s);
 const days=new Set([...orders.map(r=>r.shop_id+'|'+r.date),...ads.map(r=>r.shop_id+'|'+r.date),...daily.map(r=>r.shop_id+'|'+r.date)]);let fee=0;for(const key of days){const [shop,date]=key.split('|'),d=dailyIdx.get(key),s=shopIdx.get(shop);fee+=d?.platform_fee!=null?Number(d.platform_fee):(revenueByShopDate.get(key)||0)*Number(s?.fee_rate||0)/100;}
 fee=round(fee);const denominator=gross+affiliate+fee;return {revenue,orders:orderKeys.size,units,unmapped,unmappedBonus,spend,tax,gross,affiliate,fee,roas:denominator?revenue/denominator:null,caq:revenue?(gross+affiliate)/revenue:null,cac:orderKeys.size?(gross+affiliate)/orderKeys.size:null};}
export function exceptions(orders){return orders.filter(o=>o.status!=='valid'||Number(o.returned_quantity)>0||Number(o.refund)>0);}
export function groupOrders(orders){const map=new Map();for(const r of orders){const key=r.shop_id+'|'+r.order_id;const old=map.get(key);if(old){old.lines.push(r);old.amount=round(old.amount+Number(r.amount));if(old.status!==r.status){old.status='mixed';old.raw_status='Status Campuran';}}else map.set(key,{...r,lines:[r],amount:Number(r.amount)});}return [...map.values()].sort((a,b)=>b.date.localeCompare(a.date));}
export function csv(rows){return rows.map(r=>r.map(v=>'"'+String(v??'').replace(/^\s*[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');}

export function isFailedPayment(o){return o.status==='cancelled'&&/pembayaran|payment|bayar/i.test(o.reason||'')&&/gagal|tidak dibayar|belum dibayar|kedaluwarsa|expired|batas waktu|timeout/i.test(o.reason||'');}
