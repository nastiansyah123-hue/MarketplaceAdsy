import { createClient } from '@supabase/supabase-js';
import { fetchSpx, fetchPos, fetchMengantar, detectCourier } from './lib/courier-clients.js';
import { mapSpxStage, mapPosStage, mapMengantarStage, STAGE_STEP, MENGANTAR_COURIER_MAP } from './lib/stage-engine.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkResi(resi, ekspedisi) {
  const courier = detectCourier(resi, ekspedisi);
  if (!courier) return null;

  if (courier === 'SPX') {
    const data = await fetchSpx(resi);
    if (data.retcode !== 0) return null;
    return mapSpxStage(data, null);
  }

  if (courier === 'POS') {
    const data = await fetchPos(resi);
    if (data.error || !data.connote_code) return null;
    return mapPosStage(data, null);
  }

  const mengantarCode = MENGANTAR_COURIER_MAP[courier];
  if (!mengantarCode) return null;
  const data = await fetchMengantar(resi, mengantarCode);
  return mapMengantarStage(data);
}

// Vercel Cron: auto-check resi yang belum sampai
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: orders, error } = await supabase
      .from('mp_orders')
      .select('id, resi, ekspedisi, status_resi, status_resi_updated_at')
      .not('resi', 'is', null)
      .not('status_resi', 'is', null)
      .not('status_resi', 'in', '("SAMPAI","RETUR")')
      .or(`status_resi_updated_at.is.null,status_resi_updated_at.lt.${thirtyMinAgo}`)
      .order('status_resi_updated_at', { ascending: true, nullsFirst: true })
      .limit(200);

    if (error) throw error;
    if (!orders?.length) {
      return res.status(200).json({ checked: 0, message: 'Tidak ada resi untuk dicek' });
    }

    let checked = 0, updated = 0, errors = 0;

    for (const order of orders) {
      try {
        const result = await checkResi(order.resi, order.ekspedisi);
        checked++;

        if (!result) continue;

        const { stage, detail } = result;
        const step = STAGE_STEP[stage] || 1;

        const history = (detail?.records || []).map(r => {
          let dateStr = '';
          if (r.actual_time) {
            dateStr = new Date(r.actual_time * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
          }
          return { date: dateStr, desc: r.description || r.tracking_name || '' };
        });

        if (stage !== order.status_resi) {
          // Pakai RPC mp_update_tracking
          const { error: updateErr } = await supabase.rpc('mp_update_tracking', {
            p_order_id: order.id,
            p_status_resi: stage,
            p_status_resi_step: step,
            p_status_resi_detail: {
              history,
              masalah: detail?.masalah_kategori || null,
              keterangan: history[0]?.desc || null,
            },
          });
          if (!updateErr) updated++;
          else errors++;
        } else {
          // Update timestamp saja
          await supabase.rpc('mp_update_tracking', {
            p_order_id: order.id,
            p_status_resi: order.status_resi,
            p_status_resi_step: step,
          });
        }

        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        errors++;
        console.error(`Error checking ${order.resi}:`, e.message);
      }
    }

    return res.status(200).json({ checked, updated, errors, total: orders.length });
  } catch (e) {
    console.error('Auto-track error:', e);
    return res.status(500).json({ error: e.message });
  }
}
