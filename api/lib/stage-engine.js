// Stage engine -- SATU-SATUNYA tempat logic penentu stage tracking hidup.
// Port dari Adsytraking-main/lib/stage-engine.js (versi paling matang, sudah divalidasi resi asli).
// Self-contained: no cross-file imports (Vercel bundler compatibility).

export const MENGANTAR_COURIER_MAP = {
  JNE: 'JNE', 'J&T': 'JT', SICEPAT: 'SiCepat', ANTERAJA: 'anteraja',
  NINJA: 'Ninja', IDEXPRESS: 'iDexpress', LION: 'lion', SAP: 'SAP',
};

export const STAGE_STEP = {
  MENUNGGU_RESI: 1, BELUM_DICEK: 1, DIKIRIM: 2, KOTA_TUJUAN: 3, OTW: 4, SAMPAI: 5,
  BERMASALAH: 2, RETUR: 2,
};

// ── Klasifikasi penyebab BERMASALAH dari teks history kurir ───────────────────
function extractMasalahKategori(records) {
  const texts = (records || []).map(r =>
    [r.description, r.tracking_name].filter(Boolean).join(' ').toLowerCase()
  );
  const combined = texts.join(' ');

  if (/tidak ada orang|tidak di tempat|tidak ditempat|tidak ada penerima|rumah kosong|penerima tidak di lokasi|tidak di lokasi|tidak ada di rumah|tidak ada dirumah|nobody at home|no one home|no one at home|not at home/i.test(combined))
    return 'TIDAK_ADA_ORANG';
  if (/alamat tidak ditemukan|alamat salah|salah alamat|alamat tidak ketemu|alamat tidak (lengkap|dikenal|valid|jelas)|incomplete consignee address|consignee unknown|wrong address|no such address|address not found|alamat tidak bisa/i.test(combined))
    return 'ALAMAT_SALAH';
  if (/nomor tidak aktif|tidak bisa dihubungi|tidak dapat dihubungi|tidak ada respon|hp tidak aktif|cannot contact|no answer|unreachable/i.test(combined))
    return 'TIDAK_BISA_DIHUBUNGI';
  if (/ditolak|menolak|tidak mau terima|refused|consignee refused/i.test(combined))
    return 'DITOLAK';
  if (/disimpan|drop point|pickup point|titip di|simpan di|dititip|counter/i.test(combined))
    return 'SIMPAN_GUDANG';
  return 'LAINNYA';
}

// ── Cocokkan kota tujuan pembeli ke lokasi event ───────────────────────────────
function trNormalizeCity(s) {
  return String(s || '').toUpperCase().replace(/^(KOTA|KAB\.?|KABUPATEN)\s+/g, '').replace(/\s+/g, ' ').trim();
}
function trCityMatches(destCity, locationName) {
  if (!destCity || !locationName) return false;
  const dest = trNormalizeCity(destCity);
  if (!dest) return false;
  const firstWord = dest.split(' ')[0];
  return firstWord.length >= 4 && String(locationName).toUpperCase().includes(firstWord);
}

// ── SPX ─────────────────────────────────────────────────────────────────────
const SPX_STAGE_BY_MILESTONE = { 1: 'DIKIRIM', 5: 'KOTA_TUJUAN', 6: 'OTW', 8: 'SAMPAI' };
const TR_STAGE_ORDER = ['DIKIRIM', 'KOTA_TUJUAN', 'OTW', 'SAMPAI'];

export function mapSpxStage(apiData, destCity) {
  const info = apiData?.data?.sls_tracking_info || null;
  const records = info?.records || [];
  if (!records.length) return { stage: 'DIKIRIM', detail: { records: [] } };

  const problemWords   = ['retur', 'return', 'gagal', 'bermasalah', 'batal', 'cancel', 'rts', 'ditolak', 'undelivered'];
  const deliveredWords = ['delivered', 'terkirim', 'diterima', 'selesai', 'complete'];
  const otwWords       = ['out for delivery', 'otw', 'sedang diantar', 'dalam pengiriman', 'kurir sedang', 'menuju alamat'];

  let stage = 'DIKIRIM';
  let problem = false;
  let retur = false;
  const higher = s => { if (TR_STAGE_ORDER.indexOf(s) > TR_STAGE_ORDER.indexOf(stage)) stage = s; };

  records.forEach(r => {
    const text = [r.milestone_name, r.tracking_name, r.description].filter(Boolean).join(' ').toLowerCase();
    if (r.milestone_code === 10) { retur = true; return; }
    if (problemWords.some(w => text.includes(w))) problem = true;
    if (deliveredWords.some(w => text.includes(w))) { higher('SAMPAI'); return; }
    if (otwWords.some(w => text.includes(w))) { higher('OTW'); return; }
    const ms = SPX_STAGE_BY_MILESTONE[r.milestone_code];
    if (ms === 'KOTA_TUJUAN') {
      if (trCityMatches(destCity, r.current_location?.location_name)) higher('KOTA_TUJUAN');
    } else if (ms) {
      higher(ms);
    }
  });

  if (retur) stage = 'RETUR';
  else if (problem) stage = 'BERMASALAH';

  const trimmedRecords = records.map(r => ({
    description: r.description || null,
    tracking_name: r.tracking_name || r.milestone_name || null,
    actual_time: r.actual_time || null,
    current_location: r.current_location?.location_name
      ? { location_name: r.current_location.location_name }
      : undefined,
  }));
  const detail = { records: trimmedRecords };
  if (stage === 'BERMASALAH') detail.masalah_kategori = extractMasalahKategori(trimmedRecords);
  return { stage, detail };
}

// ── POS (via bosampuh.id) ──────────────────────────────────────────────────────
const POS_TRANSIT_STATES = ['inBag', 'INVEHICLE', 'INLOCATION', 'unBag'];

export function mapPosStage(apiData, destCity) {
  const history = apiData?.connote_history || [];
  const state = apiData?.connote_state || '';
  const cf = apiData?.connote_customfield || {};
  const destNopen = cf.destination_nopen || null;

  const hasRetur = cf.is_retur === true || /return/i.test(state);
  const hasProblem = history.some(h => h.state === 'FAILEDTODELIVERED' || !!h.reason_delivery);

  let stage;
  if (hasRetur) stage = 'RETUR';
  else if (state === 'DELIVERED') stage = 'SAMPAI';
  else if (hasProblem) stage = 'BERMASALAH';
  else if (state === 'DELIVERYRUNSHEET') stage = 'OTW';
  else if (POS_TRANSIT_STATES.includes(state)) {
    const latest = history.length ? history[history.length - 1] : null;
    const atDestination = !!(destNopen && latest && latest.state === 'INLOCATION' && latest.nopen === destNopen);
    stage = (atDestination || trCityMatches(destCity, latest?.city)) ? 'KOTA_TUJUAN' : 'DIKIRIM';
  } else {
    stage = 'DIKIRIM';
  }

  const records = history.slice().reverse().map(h => ({
    description: h.content2 || h.content,
    tracking_name: h.action,
    actual_time: h.created_at ? Math.floor(new Date(h.created_at.replace(' ', 'T')).getTime() / 1000) : null,
    current_location: { location_name: h.location_name || h.city || '' },
  }));
  const detail = { records };
  if (stage === 'BERMASALAH') detail.masalah_kategori = extractMasalahKategori(records);
  return { stage, detail };
}

// ── Kurir lain via Mengantar (JNE/J&T/SiCepat/Anteraja/Ninja/IDExpress/Lion) ────
const TR_RETUR_PATTERN   = /retur|dikembalikan|\brts\b|\brto\b|return to sender/i;
const TR_PROBLEM_PATTERN = /gagal|kendala|bermasalah|problematic|tidak ditemukan|alamat tidak (lengkap|dikenal)|tidak ada orang|tidak ditempat|tidak dihuni|menunggu konfirmasi|disimpan di gudang|ditolak|pindah alamat|box undel/i;
const TR_OTW_PATTERN     = /sedang diantar|dalam pengantaran|out for delivery|kurir menuju|\botw\b|akan dikirim ke alamat penerima|with delivery courier|delivery courier|diantar ke alamat|on delivery|1st attempt|2nd attempt|percobaan/i;
const TR_KOTA_TUJUAN_PATTERN = /kota tujuan|gudang tujuan|tiba di kota|received at destination|received at warehouse|process and forward|inbound|sti-dest/i;

function isPickupPhase(e) {
  return !!(e && e.code && /pickup/i.test(e.code));
}
function isSelfReceipt(e) {
  if (!e || !e.place) return false;
  const m = /diterima oleh\s+(.+)/i.exec(e.descOnly || '');
  if (!m) return false;
  const norm = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return norm(m[1]) === norm(e.place);
}
function hasReceivedBy(e) {
  return !!(e && e.receivedBy);
}

function mengantarComputeStep(entries) {
  let step = 2;
  (entries || []).forEach(e => {
    if (isPickupPhase(e)) return;
    const d = (e.desc || '').toLowerCase();
    if (TR_OTW_PATTERN.test(d)) step = Math.max(step, 4);
    else if (TR_KOTA_TUJUAN_PATTERN.test(d)) step = Math.max(step, 3);
  });
  return step;
}

export function mapMengantarStage(json) {
  if (!json || !json.success || !json.data) throw new Error(json?.message || 'Resi tidak ditemukan');
  const d = json.data;
  const history = Array.isArray(d.history) ? d.history : [];
  const entries = history.map(h => ({
    desc: [h.desc, h.code].filter(Boolean).join(' '),
    descOnly: h.desc || '',
    code: h.code || null,
    place: h.counter_name || h.city_name || null,
    receivedBy: (h.receiver || '').trim() || null,
    group: h.type?.group || null, tag: h.type?.tag || null
  }));
  const cat = (d.statusCategory || d.status || '').toUpperCase();
  const latest = entries.length ? entries[entries.length - 1] : null;
  const latestDesc = (latest ? latest.desc : '').toLowerCase();
  const reachedStep = mengantarComputeStep(entries);

  let stage;
  if (cat.includes('RETUR') || cat.includes('RETURN') || entries.some(e => TR_RETUR_PATTERN.test(e.desc || ''))) {
    stage = 'RETUR';
  } else if (cat === 'DELIVERED' || (/diterima oleh|\bdelivered\b|\bpod\b/.test(latestDesc) && !isSelfReceipt(latest)) || hasReceivedBy(latest)) {
    stage = 'SAMPAI';
  } else {
    const hasStructuredProblem = entries.some(e => !isPickupPhase(e) && (e.group === 'UNDELIVERED' || e.tag === 'actionRequired'));
    if (hasStructuredProblem || entries.some(e => !isPickupPhase(e) && TR_PROBLEM_PATTERN.test(e.desc || ''))) stage = 'BERMASALAH';
    else if (reachedStep >= 4) stage = 'OTW';
    else if (reachedStep >= 3) stage = 'KOTA_TUJUAN';
    else stage = 'DIKIRIM';
  }

  const records = history.slice().reverse().map(h => {
    let actual_time = null;
    if (h.date) {
      const m = String(h.date).match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/);
      if (m) {
        const dt = new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5]);
        if (!isNaN(dt)) actual_time = Math.floor(dt.getTime() / 1000);
      } else {
        const dt = new Date(h.date);
        if (!isNaN(dt)) actual_time = Math.floor(dt.getTime() / 1000);
      }
    }
    return {
      description: [h.desc, h.code].filter(Boolean).join(' ') || '-',
      actual_time,
      current_location: (h.location || h.counter_name || h.city_name)
        ? { location_name: h.location || h.counter_name || h.city_name }
        : undefined,
    };
  });
  const detail = { records };
  if (stage === 'BERMASALAH') detail.masalah_kategori = extractMasalahKategori(records);
  return { stage, detail };
}
