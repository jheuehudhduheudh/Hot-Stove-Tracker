export default function handler(req, res) {
  return res.status(403).json({
    error: 'Admin write endpoints have been permanently disabled. Manage manual edits directly in Supabase.',
  });
}
