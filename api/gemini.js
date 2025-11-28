export const config = {
  runtime: 'edge', // 使用 Vercel Edge Runtime，速度更快，更稳定
};

export default async function handler(req) {
  // 1. 处理 CORS (允许前端访问)
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
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 2. 解析前端发来的数据
    const body = await req.json();
    
    // 3. 获取 API Key (直接读取 Vercel 环境变量)
    const apiKey = process.env.GEMINI_API_KEY;
    const model = body.model || 'gemini-1.5-pro';

    if (!apiKey) {
      console.error("Error: GEMINI_API_KEY is missing in environment variables.");
      return new Response(JSON.stringify({ error: 'Server configuration error: API Key missing' }), {
        status: 500,
        headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*' 
        },
      });
    }

    // 4. 拼接 Google API 地址
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // 5. 转发请求给 Google
    const upstreamResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await upstreamResponse.json();

    // 6. 检查 Google 的返回状态
    if (!upstreamResponse.ok) {
      console.error("Google API Error:", data);
      return new Response(JSON.stringify(data), {
        status: upstreamResponse.status,
        headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*' 
        },
      });
    }

    // 7. 成功返回
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*' 
      },
    });

  } catch (error) {
    console.error("Proxy Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*' 
      },
    });
  }
}
