import {norm} from './model.js';
const compact=v=>norm(v).replace(/[^A-Z0-9]/g,'');
const known=[['PRIMAGOLD',['PRIMA','PRIMAGOLD']],['HERBAPIL',['HRB','HERBAPIL']],['YOUZHI',['YOU','YOUZHI']],['IWEDARKENSHAMPOO',['IDS','IWE','IWEDARKENSHAMPOO']]];
function aliases(product){const name=compact(product?.name);if(!name)return [];const result=new Set([name]);for(const [brand,shorts]of known)if(name===brand)for(const s of shorts)result.add(s);return [...result].sort((a,b)=>b.length-a.length);}
const unitNames={BOX:'box',BOXES:'box',BOTOL:'botol',BTL:'botol',PCS:'pcs',PAKET:'paket',PACK:'paket'};
// Parse only a recognizable product prefix + a pack quantity. Listing IDs,
// volumes, ambiguous multi-product bundles and arbitrary suffixes are not quantities.
export function inferPackUnits(code,product){if(!product)return null;let sku=norm(code).replace(/[_-]/g,' ');sku=sku.replace(/\s*\+\s*(GS|GULA\s+SEMUT)\s*$/,'');if(sku.includes('+')||/\b(ML|LITER|GRAM|GR|KG)\b/.test(sku))return null;
 for(const prefix of aliases(product)){const pattern=new RegExp('^'+prefix.split('').join('\\s*')+'\\s*(\\d{1,4})\\s*(BOXES|BOX|BOTOL|BTL|PCS|PAKET|PACK)?$');const m=sku.match(pattern);if(!m)continue;const qty=Number(m[1]);if(qty<1||qty>1000)return null;if(m[2]&&unitNames[m[2]]!==String(product.unit).toLowerCase())return null;return qty;}
 return null;}
