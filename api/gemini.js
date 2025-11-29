import { pickKey, reportSuccess, reportFailure } from './keyManager.js';

export default async function handler(req, res) {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 2. Parse Request
    const body = req.json ? await req.json() : req.body;
    let model = body.model || 'gemini-1.5-pro';

    // 3. Get API Key
    const apiKey = pickKey();
    if (!apiKey) {
      return res.status(503).json({ error: 'Service Busy (No API Keys Configured or Available)' });
    }

    // 4. Construct URL
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // 5. Forward Request
    const upstreamResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Inject App Credentials for Networking/Gateway Auth
        'AppID': 'ql70SMSyYo8XrjYh4N6AoHnf-MdYXbMMI',
        'AppKey': '4rLsxocvIXzTbb2MEqW9ZDbS'
      },
      body: JSON.stringify(body)
    });

    // 6. Handle Response
    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok) {
      console.error(`[Gemini Proxy] Error ${upstreamResponse.status}:`, data);
      
      // Report failure to KeyManager
      reportFailure(apiKey);
      
      return res.status(upstreamResponse.status).json({
        error: 'Gemini Upstream Error',
        details: data
      });
    }

    // Success
    reportSuccess(apiKey);
    return res.status(200).json(data);

  } catch (error) {
    console.error("[Gemini Proxy] Internal Error:", error);
    return res.status(500).json({ error: error.message });
  }
}