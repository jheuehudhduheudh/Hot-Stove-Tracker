import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expectedPassword = process.env.ADMIN_PASSWORD || 'admin';
  const providedPassword = req.headers['x-admin-password'] || req.body?.password;

  if (providedPassword !== expectedPassword) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Supabase server credentials not configured' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { action, payload } = req.body || {};

  if (action === 'update') {
    const { id, updates } = payload;
    const { data, error } = await supabase
      .from('transactions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ data });
  }

  if (action === 'create') {
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        external_id: `manual-${Date.now()}`,
        ...payload,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ data });
  }

  if (action === 'delete') {
    const { id } = payload;
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ deleted: true });
  }

  return res.status(400).json({ error: 'Unknown admin action' });
}
