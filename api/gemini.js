export const config = {
  runtime: 'edge', // 使用 Edge Runtime 获得更快的响应速度
};

export default async function handler(req) {
  // CORS 处理
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
    const { model, contents, systemInstruction, config } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error: API Key missing' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 映射前端 Model 到 Google REST API 接受的 Model
    // 兼容 gemini-2.5 别名到实际可用模型
    let targetModel = model || 'gemini-1.5-flash';
    if (targetModel.includes('2.5')) {
       // 如果 Google 尚未开放 2.5 API 别名，回退到 1.5 或 2.0-flash-exp
       // 这里假设用户想要高性能模型，暂时映射到 1.5-flash 以确保稳定，或者 gemini-2.0-flash-exp
       targetModel = 'gemini-1.5-flash'; 
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;

    // 构建 REST API Payload
    const payload = {
      contents: contents,
      generationConfig: config || {},
    };

    if (systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }
    
    // 如果是 JSON 模式，需要传递 responseMimeType
    if (config?.responseMimeType) {
        payload.generationConfig.responseMimeType = config.responseMimeType;
    }
    if (config?.responseSchema) {
        payload.generationConfig.responseSchema = config.responseSchema;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API Error:', data);
      return new Response(JSON.stringify({ error: data.error?.message || 'Upstream API Error' }), {
        status: response.status,
        headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*' 
      },
    });

  } catch (error) {
    console.error('Server Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*' 
      },
    });
  }
}