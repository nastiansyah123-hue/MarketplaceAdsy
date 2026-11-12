import { createClient } from '@supabase/supabase-js';
import { fetchTracking } from './lib/courier-clients.js';
import { determineStage } from './lib/stage-engine.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Vercel Cron: auto-check resi yang belum sampai
// Jalankan setiap 30 menit via vercel.json crons
export default async function handler(req, res) {
  // Verify cron secret (Vercel sets this header for cron jobs)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Ambil orders yang perlu dicek:
    // - Punya resi
    // - Status bukan SAMPAI, RETUR, atau null
    // - Belum dicek dalam 30 menit terakhir (avoid spam)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: orders, error } = await supabase
      .from('mp_orders')
      .select('id, resi, ekspedisi, status_resi, status_resi_updated_at')
      .not('resi', 'is', null)
      .not('status_resi', 'is', null)
      .not('status_resi', 'in', '("SAMPAI","RETUR")')
      .or(`status_resi_updated_at.is.null,status_resi_updated_at.lt.${thirtyMinAgo}`)
      .order('status_resi_updated_at', { ascending: true, nullsFirst: true })
      .limit(200); // Max 200 per run (1x sehari, Hobby plan)

    if (error) throw error;
    if (!orders?.length) {
      return res.status(200).json({ checked: 0, message: 'Tidak ada resi untuk dicek' });
    }

    let checked = 0, updated = 0, errors = 0;

    for (const order of orders) {
      try {
        const trackingResult = await fetchTracking(order.resi, order.ekspedisi);
        checked++;

        if (!trackingResult) continue;

        const stage = determineStage(trackingResult);

        // Only update if stage changed
        if (stage.status_resi !== order.status_resi) {
          const { error: updateErr } = await supabase
            .from('mp_orders')
            .update({
              status_resi: stage.status_resi,
              status_resi_step: stage.status_resi_step,
              status_resi_detail: stage.detail,
              status_resi_updated_at: new Date().toISOString()
            })
            .eq('id', order.id);

          if (!updateErr) updated++;
          else errors++;
        } else {
          // Update timestamp even if stage didn't change
          await supabase
            .from('mp_orders')
            .update({ status_resi_updated_at: new Date().toISOString() })
            .eq('id', order.id);
        }

        // Small delay between API calls to avoid rate limiting
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
