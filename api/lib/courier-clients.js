// Courier API clients - all public endpoints, no auth required

export async function fetchMengantar(resi) {
  const res = await fetch('https://app.mengantar.com/api/order/getPublic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ waybill: resi })
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.data) return null;
  return {
    courier: data.data.courier_name || '',
    status: data.data.status || '',
    records: (data.data.history || []).map(h => ({
      date: h.date || '',
      desc: h.desc || h.description || ''
    }))
  };
}

export async function fetchSpx(resi) {
  const res = await fetch(`https://spx.co.id/shipment/order/tracking/v2?order_id=${encodeURIComponent(resi)}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.data?.tracking_list) return null;
  return {
    courier: 'SPX',
    status: data.data.status || '',
    records: data.data.tracking_list.map(t => ({
      date: t.timestamp || '',
      desc: t.message || ''
    }))
  };
}

export async function fetchPos(resi) {
  const res = await fetch(`https://bosampuh.id/tracking?noresi=${encodeURIComponent(resi)}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.data?.history) return null;
  return {
    courier: 'POS',
    status: data.data.status || '',
    records: data.data.history.map(h => ({
      date: h.date || '',
      desc: h.description || ''
    }))
  };
}

// Auto-detect courier from resi prefix
const COURIER_PREFIXES = [
  [/^SPXID|^SPX/i, 'SPX'],
  [/^JP\d|^JD\d|^JX\d/i, 'J&T'],
  [/^JNE|^CGK/i, 'JNE'],
  [/^00\d{11}$|^SCP/i, 'SICEPAT'],
  [/^ANT/i, 'ANTERAJA'],
  [/^NLKE|^NINJA/i, 'NINJA'],
  [/^IDE/i, 'IDEXPRESS'],
  [/^LP\d/i, 'LION'],
  [/^SAP/i, 'SAP'],
  [/^\d{13}$/i, 'POS'],
];

export function detectCourier(resi, ekspedisi) {
  if (!resi) return null;
  const r = resi.toUpperCase().trim();
  const e = (ekspedisi || '').toUpperCase();

  // Check ekspedisi name first
  if (/SPX|SHOPEE/.test(e)) return 'SPX';
  if (/POS/.test(e)) return 'POS';

  // Then check prefix
  for (const [re, name] of COURIER_PREFIXES) {
    if (re.test(r)) return name;
  }

  // Default: try Mengantar (covers JNE, J&T, SiCepat, etc.)
  return 'MENGANTAR';
}

export async function fetchTracking(resi, ekspedisi) {
  const courier = detectCourier(resi, ekspedisi);
  if (!courier) return null;

  if (courier === 'SPX') return fetchSpx(resi);
  if (courier === 'POS') return fetchPos(resi);
  // All others go through Mengantar
  return fetchMengantar(resi);
}
