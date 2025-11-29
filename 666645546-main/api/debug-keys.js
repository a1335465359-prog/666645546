// Debug/Admin Endpoint to view key states
import { getDebug } from './keyManager.js';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

export default function handler(req, res) {
  // Check Auth
  const token = req.query.token || req.headers['x-admin-token'];
  
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const debugInfo = getDebug();
  
  res.status(200).json({
    timestamp: new Date().toISOString(),
    keys: debugInfo
  });
}
