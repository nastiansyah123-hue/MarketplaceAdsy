// Cek manual satu resi (tombol "Cek Ulang" di UI).
// Routing: SPX → spx.co.id, POS → bosampuh.id, lainnya → Mengantar public API.

import { createClient } from '@supabase/supabase-js';
import { fetchSpx, fetchPos, fetchMengantar, detectCourier } from './lib/courier-clients.js';
import { mapSpxStage, mapPosStage, mapMengantarStage, STAGE_STEP, MENGANTAR_COURIER_MAP } from './lib/stage-engine.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkResi(resi, ekspedisi, kota_tujuan) {
  const courier = detectCourier(resi, ekspedisi);
  if (!courier) throw new Error('Ekspedisi tidak dikenali dari resi: ' + resi);

  if (courier === 'SPX') {
    const data = await fetchSpx(resi);
    if (data.retcode !== 0) throw new Error(data.message || 'Resi tidak ditemukan');
    return mapSpxStage(data, kota_tujuan);
  }

  if (courier === 'POS') {
    const data = await fetchPos(resi);
    if (data.error || !data.connote_code) throw new Error(data.error || 'Resi tidak ditemukan');
    return mapPosStage(data, kota_tujuan);
  }

  // JNE, J&T, SiCepat, AnterAja, Ninja, IDExpress, Lion, SAP → Mengantar
  const mengantarCode = MENGANTAR_COURIER_MAP[courier];
  if (!mengantarCode) throw new Error('Ekspedisi belum didukung: ' + courier);
  const data = await fetchMengantar(resi, mengantarCode);
  return mapMengantarStage(data);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { order_id, resi, ekspedisi } = req.body;

    if (!order_id || !resi) {
      return res.status(400).json({ error: 'order_id dan resi wajib diisi' });
    }

    const { stage, detail } = await checkResi(resi, ekspedisi, null);
    const step = STAGE_STEP[stage] || 1;

    // Format history for frontend (consistent format)
    const history = (detail?.records || []).map(r => {
      let dateStr = '';
      if (r.actual_time) {
        dateStr = new Date(r.actual_time * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      }
      return {
        date: dateStr,
        desc: r.description || r.tracking_name || '',
      };
    });

    const patch = {
      status_resi: stage,
      status_resi_step: step,
      status_resi_updated_at: new Date().toISOString(),
      status_resi_detail: {
        history,
        masalah: detail?.masalah_kategori || null,
        keterangan: history[0]?.desc || null,
      },
    };

    const { error } = await supabase
      .from('mp_orders')
      .update(patch)
      .eq('id', order_id);

    if (error) {
      console.error('DB update error:', error);
      return res.status(500).json({ error: 'Gagal update status resi' });
    }

    return res.status(200).json({
      status_resi: stage,
      status_resi_step: step,
      detail: patch.status_resi_detail,
    });
  } catch (e) {
    console.error('Tracking check error:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
