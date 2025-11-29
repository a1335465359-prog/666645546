import { pickKey, reportSuccess, reportFailure } from "./keyManager.js";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body = req.body || (req.json ? await req.json() : {});

    const model = body?.model || "gemini-1.5-flash";

    const apiKey = pickKey();
    if (!apiKey) {
      return res
        .status(503)
        .json({ error: "Service Busy (No API Keys Available)" });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const upstreamResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // 你原来联网用的这两个头我帮你保留
        AppID: "ql70SMSyYo8XrjYh4N6AoHnf-MdYXbMMI",
        AppKey: "4rLsxocvIXzTbb2MEqW9ZDbS",
      },
      body: JSON.stringify(body),
    });

    const text = await upstreamResponse.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!upstreamResponse.ok) {
      const status = upstreamResponse.status;

      // 429：强制冷却
      if (status === 429) {
        reportFailure(apiKey, { cooldownMs: 10 * 60 * 1000 });
      } else {
        reportFailure(apiKey);
      }

      console.error(
        "[Gemini Proxy] Upstream Error:",
        status,
        JSON.stringify(data).slice(0, 500)
      );

      return res.status(status).json({
        error: "Gemini Upstream Error",
        status,
        details: data,
      });
    }

    // 成功：重置这个 key 的失败 & 冷却
    reportSuccess(apiKey);
    return res.status(200).json(data);
  } catch (error) {
    console.error("[Gemini Proxy] Internal Error:", error);
    return res.status(500).json({ error: error?.message || "Server Error" });
  }
}
