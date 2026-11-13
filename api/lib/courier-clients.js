// HTTP mentah ke tiap sumber tracking -- TIDAK ada logic penentu stage di sini.
// Port dari Adsytraking-main/lib/courier-clients.js (versi paling matang).

export async function fetchMengantar(trackingNumber, courier) {
  const url = `https://app.mengantar.com/api/order/getPublic?tracking_number=${encodeURIComponent(trackingNumber)}&courier=${encodeURIComponent(courier)}`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'application/json',
      Referer: 'https://www.mengantar.com/',
      Origin: 'https://www.mengantar.com',
    },
  });
  return r.json();
}

export async function fetchPos(resi) {
  const body = new URLSearchParams({ kode_booking: resi }).toString();
  const r = await fetch('https://www.bosampuh.id/api_home/lacak_kiriman', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36',
      Referer: 'https://www.bosampuh.id/',
      Origin: 'https://www.bosampuh.id',
    },
    body,
  });
  const raw = await r.text();
  return typeof raw === 'string' && raw.startsWith('"') ? JSON.parse(JSON.parse(raw)) : JSON.parse(raw);
}

export async function fetchSpx(resi) {
  const url = `https://spx.co.id/shipment/order/open/order/get_order_info?spx_tn=${encodeURIComponent(resi)}&language_code=id`;
  const r = await fetch(url, {
    headers: {
      accept: 'application/json, text/plain, */*',
      referer: `https://spx.co.id/track?${encodeURIComponent(resi)}`,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  return r.json();
}

// Mapping ekspedisi name → courier code for Mengantar API
export const MENGANTAR_COURIER_MAP = {
  JNE: 'JNE', 'J&T': 'JT', SICEPAT: 'SiCepat', ANTERAJA: 'anteraja',
  NINJA: 'Ninja', IDEXPRESS: 'iDexpress', LION: 'lion', SAP: 'SAP',
};

// Auto-detect ekspedisi from resi prefix
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
  if (MENGANTAR_COURIER_MAP[e]) return e;

  // Then check prefix
  for (const [re, name] of COURIER_PREFIXES) {
    if (re.test(r)) return name;
  }

  return null;
}

export const AUTO_EKSPEDISI_LIST = ['SPX', 'POS', 'JNE', 'J&T', 'SICEPAT', 'ANTERAJA', 'NINJA', 'IDEXPRESS', 'LION', 'SAP'];
