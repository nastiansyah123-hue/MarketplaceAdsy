// Stage engine - determines tracking stage from courier response
// Stages: MENUNGGU_RESI(0) → BELUM_DICEK(1) → DIKIRIM(2) → KOTA_TUJUAN(3) → OTW(4) → SAMPAI(5)
// Special: BERMASALAH(-1), RETUR(-2), MANUAL(-3)

const MASALAH_PATTERNS = [
  [/tidak ada orang|no one|nobody|tdk ada org/i, 'Tidak Ada Orang'],
  [/alamat salah|wrong address|alamat tdk|alamat tidak/i, 'Alamat Salah'],
  [/tidak bisa dihubungi|tdk bs dihubungi|unreachable|no answer/i, 'Tidak Bisa Dihubungi'],
  [/ditolak|rejected|refuse|menolak/i, 'Ditolak'],
  [/simpan gudang|warehouse|hold at/i, 'Simpan Gudang'],
  [/retur|return|kirim balik|kembali ke pengirim/i, 'Retur'],
];

export function extractMasalahKategori(records) {
  if (!records?.length) return null;
  const latest = records.slice(0, 3).map(r => r.desc || '').join(' ');
  for (const [re, label] of MASALAH_PATTERNS) {
    if (re.test(latest)) return label;
  }
  return 'Lainnya';
}

export function determineStage(trackingResult) {
  if (!trackingResult || !trackingResult.records?.length) {
    return { status_resi: 'BELUM_DICEK', status_resi_step: 1, detail: null };
  }

  const { records, status } = trackingResult;
  const latest = (records[0]?.desc || '').toLowerCase();
  const allDescs = records.map(r => (r.desc || '').toLowerCase()).join(' ');
  const statusLower = (status || '').toLowerCase();

  // Check SAMPAI (delivered)
  if (/delivered|diterima|sampai|selesai|terkirim|completed/i.test(latest) ||
      /delivered|completed/i.test(statusLower)) {
    return {
      status_resi: 'SAMPAI',
      status_resi_step: 5,
      detail: { history: records, keterangan: 'Paket sudah diterima' }
    };
  }

  // Check RETUR
  if (/retur|return|kirim balik|kembali ke pengirim|returned/i.test(latest) ||
      /returned/i.test(statusLower)) {
    return {
      status_resi: 'RETUR',
      status_resi_step: -2,
      detail: { history: records, masalah: 'Retur', keterangan: latest }
    };
  }

  // Check BERMASALAH (problematic delivery)
  if (/gagal|failed|masalah|problem|tidak ada orang|alamat salah|ditolak|rejected|undelivered/i.test(latest)) {
    const kategori = extractMasalahKategori(records);
    return {
      status_resi: 'BERMASALAH',
      status_resi_step: -1,
      detail: { history: records, masalah: kategori, keterangan: latest }
    };
  }

  // Check OTW (out for delivery)
  if (/antar|delivery|kurir|out for|sedang dikirim ke|menuju alamat/i.test(latest)) {
    return {
      status_resi: 'OTW',
      status_resi_step: 4,
      detail: { history: records, keterangan: 'Sedang diantar kurir' }
    };
  }

  // Check KOTA_TUJUAN (arrived at destination city)
  if (/kota tujuan|destination|tiba di|arrived|hub.*tujuan/i.test(latest)) {
    return {
      status_resi: 'KOTA_TUJUAN',
      status_resi_step: 3,
      detail: { history: records, keterangan: 'Sampai di kota tujuan' }
    };
  }

  // Check DIKIRIM (in transit)
  if (/transit|proses|dikirim|pengiriman|shipped|in transit|picked|manifested|on process/i.test(latest) ||
      /shipped|in_transit|on_process/i.test(statusLower) ||
      records.length >= 2) {
    return {
      status_resi: 'DIKIRIM',
      status_resi_step: 2,
      detail: { history: records, keterangan: 'Dalam pengiriman' }
    };
  }

  // Default: still BELUM_DICEK if no meaningful status
  return {
    status_resi: 'BELUM_DICEK',
    status_resi_step: 1,
    detail: { history: records }
  };
}
