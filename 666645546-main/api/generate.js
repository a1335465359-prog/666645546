// Main Generation Endpoint (Serverless Function)
import { pickKey, reportSuccess, reportFailure, getKeyCount } from './keyManager.js';

// Configuration
// Note: If using Gemini Keys, MODEL_API_URL should likely be the Google OpenAI-compatible endpoint:
// https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
// But per requirements, default is standard OpenAI.
const MODEL_API_URL = process.env.MODEL_API_URL || 'https://api.openai.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '10000', 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '2', 10);
const KEY_COOLDOWN_MS = parseInt(process.env.KEY_COOLDOWN_MS || '60000', 10);

export default async function handler(req, res) {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  if (getKeyCount() === 0) {
    return res.status(500).json({ ok: false, error: 'no_keys_configured' });
  }

  // 1. Parse & Validate Body
  let body;
  try {
    // Vercel handles body parsing automatically if not using raw body
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'invalid_json' });
  }

  const { prompt, system, model, temperature, max_tokens } = body || {};

  if (!prompt) {
    return res.status(400).json({ ok: false, error: 'missing_prompt' });
  }

  // 2. Prepare Upstream Payload (OpenAI Format)
  const messages = [];
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  messages.push({ role: 'user', content: prompt });

  const upstreamPayload = {
    model: model || 'gpt-3.5-turbo', // Default model if not provided
    messages,
    temperature: temperature ?? 0.1,
    max_tokens: max_tokens ?? 500,
    n: 1
  };

  // 3. Retry Loop
  let attempts = 0;
  let lastError = null;

  while (attempts <= MAX_RETRIES) {
    attempts++;
    const key = pickKey();
    const keySuffix = key ? '...' + key.slice(-4) : 'null';

    if (!key) {
      logSummary(requestId, 'none', upstreamPayload.model, 0, 500, false, 'No keys available');
      return res.status(503).json({ ok: false, error: 'all_keys_exhausted' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const upstreamRes = await fetch(MODEL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify(upstreamPayload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const status = upstreamRes.status;
      const latency = Date.now() - startTime;

      // Case A: 429 Too Many Requests -> Rate Limited
      if (status === 429) {
        // Mark key cooldown
        reportFailure(key, { cooldownMs: KEY_COOLDOWN_MS });
        logSummary(requestId, keySuffix, upstreamPayload.model, latency, status, true, 'Rate Limit (429)');
        lastError = 'rate_limited';
        // Continue to next attempt (loop will pick new key)
        continue;
      }

      // Case B: 4xx (Client Error) -> Do not retry
      if (status >= 400 && status < 500) {
        const errText = await upstreamRes.text();
        reportSuccess(key); // Technically the key worked, the request was just bad
        logSummary(requestId, keySuffix, upstreamPayload.model, latency, status, false, errText.substring(0, 100));
        return res.status(status).json({ ok: false, error: 'upstream_error', details: errText });
      }

      // Case C: 5xx (Server Error) -> Retry
      if (status >= 500) {
        const errText = await upstreamRes.text();
        reportFailure(key);
        logSummary(requestId, keySuffix, upstreamPayload.model, latency, status, true, errText.substring(0, 100));
        lastError = `upstream_5xx: ${errText}`;
        continue;
      }

      // Case D: Success
      if (upstreamRes.ok) {
        const data = await upstreamRes.json();
        reportSuccess(key);
        logSummary(requestId, keySuffix, upstreamPayload.model, latency, status, false, 'Success');
        return res.status(200).json({ ok: true, data });
      }

    } catch (err) {
      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;
      const isTimeout = err.name === 'AbortError';
      
      reportFailure(key);
      lastError = isTimeout ? 'timeout' : err.message;
      
      logSummary(requestId, keySuffix, upstreamPayload.model, latency, isTimeout ? 408 : 0, true, lastError);
      
      // Retry on network errors or timeouts
      continue;
    }
  }

  // 4. Final Failure
  return res.status(502).json({
    ok: false,
    error: 'all_retries_failed',
    lastError: typeof lastError === 'string' ? lastError : 'Unknown error'
  });
}

function logSummary(rid, key, model, lat, status, retry, snippet) {
  // Safe console log for Vercel logs
  console.log(JSON.stringify({
    requestId: rid,
    key: key,
    model: model,
    latencyMs: lat,
    status: status,
    retry: retry,
    snippet: snippet ? snippet.toString().substring(0, 200) : ''
  }));
}
