export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    
    // 1. Load keys from Vercel Environment Variables
    // The user will configure GEMINI_API_KEY1, GEMINI_API_KEY2, etc. in Vercel Dashboard
    const envKeys = [
      process.env.GEMINI_API_KEY1,
      process.env.GEMINI_API_KEY2,
      process.env.GEMINI_API_KEY3,
      process.env.GEMINI_API_KEY4,
      process.env.GEMINI_API_KEY5
    ].filter(Boolean); // Filter out undefined/empty keys

    if (envKeys.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'Server Configuration Error: No API Keys found in environment variables.' 
      }), { status: 500 });
    }

    // 2. Random Load Balancing
    const apiKey = envKeys[Math.floor(Math.random() * envKeys.length)];

    // 3. Determine Model
    // Default to 1.5-pro as requested for high intelligence, or use what frontend sent
    let model = body.model || 'gemini-1.5-pro';

    // 4. Construct Upstream URL
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // 5. Proxy Request
    const upstreamResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body) 
    });

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok) {
      // Forward the upstream error
      return new Response(JSON.stringify(data), { 
          status: upstreamResponse.status,
          headers: { 'Content-Type': 'application/json' }
      });
    }

    // Success
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}