import { createClient } from '@supabase/supabase-js';
import { fetchTracking } from './lib/courier-clients.js';
import { determineStage } from './lib/stage-engine.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // service key for server-side updates
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { order_id, resi, ekspedisi } = req.body;

    if (!order_id || !resi) {
      return res.status(400).json({ error: 'order_id dan resi wajib diisi' });
    }

    // Fetch tracking from courier API
    const trackingResult = await fetchTracking(resi, ekspedisi);

    if (!trackingResult) {
      return res.status(200).json({
        status_resi: 'MANUAL',
        message: 'Tidak bisa mengecek resi otomatis. Coba lagi nanti.'
      });
    }

    // Determine stage from tracking result
    const stage = determineStage(trackingResult);

    // Update database
    const { error } = await supabase
      .from('mp_orders')
      .update({
        status_resi: stage.status_resi,
        status_resi_step: stage.status_resi_step,
        status_resi_detail: stage.detail,
        status_resi_updated_at: new Date().toISOString()
      })
      .eq('id', order_id);

    if (error) {
      console.error('DB update error:', error);
      return res.status(500).json({ error: 'Gagal update status resi' });
    }

    return res.status(200).json({
      status_resi: stage.status_resi,
      status_resi_step: stage.status_resi_step,
      detail: stage.detail,
      courier: trackingResult.courier
    });
  } catch (e) {
    console.error('Tracking check error:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
