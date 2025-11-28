import { pickKey, reportSuccess, reportFailure } from './keyManager.js';

export default async function handler(req, res) {
  // CORS Headers
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
    const body = req.json ? await req.json() : req.body;
    
    // 1. Get Model & API Key
    let model = body.model || 'gemini-1.5-pro';
    const apiKey = pickKey();

    if (!apiKey) {
      return res.status(503).json({ error: 'Service Busy (No API Keys Available)' });
    }

    // 2. Construct Google API URL
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // 3. Forward Request with Injected Headers (AppID/AppKey)
    const upstreamResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Injecting User Credentials for Networking/Gateway Auth
        'AppID': 'ql70SMSyYo8XrjYh4N6AoHnf-MdYXbMMI',
        'AppKey': '4rLsxocvIXzTbb2MEqW9ZDbS'
      },
      body: JSON.stringify(body)
    });

    const data = await upstreamResponse.json();

    // 4. Error Handling & Key Reporting
    if (!upstreamResponse.ok) {
      if (upstreamResponse.status === 429) {
        reportFailure(apiKey, { cooldownMs: 60000 }); // Cooldown on rate limit
      } else if (upstreamResponse.status >= 500) {
        reportFailure(apiKey); // Count failure on server error
      }
      
      return res.status(upstreamResponse.status).json(data);
    }

    // Success
    reportSuccess(apiKey);
    return res.status(200).json(data);

  } catch (error) {
    console.error("Proxy Error:", error);
    return res.status(500).json({ error: error.message });
  }
}