const text=v=>String(v||'').normalize('NFKC').toLocaleLowerCase('id-ID').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
export function adMatch(data,ad){
 if(['shopee_shop','shopee_rounding','shopee_auto_summary'].includes(ad.source))return {status:'shared'};
 if(ad.product_id)return {status:'matched',product_id:ad.product_id};
 const code=String(ad.product_code||'').trim().replace(/\s+/g,' ').toUpperCase();
 const explicit=(data.mappings||[]).find(m=>m.kind==='ad'&&m.shop_id===ad.shop_id&&m.code===code);
 if(explicit)return {status:'matched',product_id:explicit.product_id};
 const title=' '+text(ad.label)+' ',ids=new Set();
 for(const r of [...(data.products||[]).filter(p=>p.active).map(p=>({keyword:p.name,product_id:p.id})),...(data.ad_rules||[]).filter(r=>r.active)]){const word=text(r.keyword);if(word&&title.includes(' '+word+' '))ids.add(r.product_id);}
 return ids.size===1?{status:'matched',product_id:[...ids][0]}:{status:ids.size?'ambiguous':'unmapped',candidates:[...ids]};
}
export const adProductFor=(data,ad)=>adMatch(data,ad).product_id;
