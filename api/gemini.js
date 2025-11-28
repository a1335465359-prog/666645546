export const config = {
  runtime: 'edge',
};

const API_KEYS = [
  "AIzaSyA3KtYJgk1XqLAm-SrJi4JoC0589p2O8cE",
  "AIzaSyDMnKE7ZfhdV_iC3MIe4Yj6GHqrKDcPXe8",
  "AIzaSyB3GvITGbZ4s3mruUi4_-vvGkaezO-98PI",
  "AIzaSyBrLFml9nuPHgRf2ZYfJkT2uYLMNjrQkzo",
  "AIzaSyDKhesr7XngUpHCiis7huXms8MsIdxMooQ"
];

export default async function handler(req) {
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
    
    // Pick a random key for basic load balancing
    const apiKey = API_KEYS[Math.floor(Math.random() * API_KEYS.length)];
    
    // Default to 1.5-flash if not specified, but TRUST the frontend if it sends something else (e.g. 1.5-pro)
    const model = body.model || 'gemini-1.5-flash';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const upstreamResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok) {
      return new Response(JSON.stringify(data), { 
          status: upstreamResponse.status,
          headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}