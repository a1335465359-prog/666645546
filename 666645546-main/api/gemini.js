import { reportSuccess, reportFailure } from './keyManager.js';

export default async function handler(req, res) {
  // CORS
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
    const apiKey = process.env.GEMINI_API_KEY1;
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: 'Missing GEMINI_API_KEY1 (Doubao API key)' });
    }

    // 前端传的是 Google Gemini 的格式：{ model, contents, system_instruction, generation_config }
    const body = req.body || {};
    const { contents = [], system_instruction, generation_config } = body;

    // 组装成 Doubao(OpenAI 风格) 的 messages
    const messages = [];

    // system 提示词
    if (system_instruction?.parts?.length) {
      const sysText = system_instruction.parts
        .map((p) => p.text || '')
        .filter(Boolean)
        .join('\n');
      if (sysText) {
        messages.push({ role: 'system', content: sysText });
      }
    }

    // 对话内容
    for (const c of contents) {
      const role = c.role === 'model' ? 'assistant' : c.role || 'user';
      const text = (c.parts || [])
        .map((p) => p.text || '')
        .filter(Boolean)
        .join('\n');
      if (text) {
        messages.push({ role, content: text });
      }
    }

    if (messages.length === 0) {
      return res.status(400).json({ error: 'Empty messages' });
    }

    // 调用豆包文本模型 Doubao-Seed-1.6
    const upstreamRes = await fetch(
      'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'doubao-seed-1-6-flash-250828',
          messages,
          temperature: 0.4,
          ...(generation_config?.response_mime_type === 'application/json'
            ? { response_format: { type: 'json_object' } }
            : {}),
        }),
      }
    );

    const data = await upstreamRes.json();

    if (!upstreamRes.ok) {
      console.error('[Doubao text upstream error]', upstreamRes.status, data);
      reportFailure(apiKey);
      return res.status(upstreamRes.status).json({
        error: 'Doubao upstream error',
        details: data,
      });
    }

    // Doubao 返回 OpenAI 风格：
    // { choices: [{ message: { content: '...' } }] }
    const text =
      data.choices?.[0]?.message?.content ??
      data.choices?.[0]?.delta?.content ??
      '';

    // 包装成“伪 Gemini 格式”，让前端 geminiService.ts 不用改：
    const wrapped = {
      candidates: [
        {
          content: {
            parts: [{ text }],
          },
        },
      ],
    };

    reportSuccess(apiKey);
    return res.status(200).json(wrapped);
  } catch (err) {
    console.error('[Doubao text proxy internal error]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
