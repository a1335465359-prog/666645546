import { AITaskResponse } from "../types";
import { SALES_SCRIPTS, ScriptItem } from "../data/scriptLibrary";

// --- REST API Types (Strict Snake Case for Google JSON API) ---
interface GeminiPart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
}

interface GeminiContent {
  role?: string;
  parts: GeminiPart[];
}

const SchemaType = {
  STRING: "STRING",
  NUMBER: "NUMBER",
  INTEGER: "INTEGER",
  BOOLEAN: "BOOLEAN",
  ARRAY: "ARRAY",
  OBJECT: "OBJECT",
};

// Helper: Convert file to base64 for REST API
export const fileToGenerativePart = async (
  file: File
): Promise<GeminiPart> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:image/jpeg;base64,")
      const base64Data = base64String.split(",")[1];
      resolve({
        inline_data: {
          data: base64Data,
          mime_type: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// --- CORE API CALLER ---
// 统一调用后端代理 /api/gemini
const callGeminiApi = async (payload: any) => {
  try {
    console.log(
      "[Gemini Service] Sending request to /api/gemini with model:",
      payload.model
    );

    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const apiMsg = data.error?.message || JSON.stringify(data.error);
      throw new Error(apiMsg || "Gemini API Request Failed");
    }

    return data;
  } catch (error) {
    console.error("Gemini Proxy Error:", error);
    throw error;
  }
};

/**
 * 1. 任务分析模块 (Task Input)
 */
export const analyzeImageAndText = async (
  text: string,
  imageFile?: File
): Promise<AITaskResponse> => {
  try {
    const parts: GeminiPart[] = [];

    if (imageFile) {
      parts.push(await fileToGenerativePart(imageFile));
    }

    if (text) {
      parts.push({ text });
    }

    if (parts.length === 0) {
      throw new Error("No input provided");
    }

    // System Prompt：带“商家资料卡片合并”规则
    const systemPrompt = `
【角色：
你是「Temu 大码女装买手的待办拆解助手」。你的唯一目标是：
把我输入的自然语言，拆成结构清晰、可执行、但数量尽量少的待办事项列表。

一、输出格式（必须遵守）
一律输出为 JSON 对象，不要输出任何解释或多余文字：

{
  "tasks": [
    {
      "type": "发定向 | 跟进 | 其他",
      "merchant_id": "商家ID或店铺名",
      "title": "一句话标题",
      "description": "简短说明，要做什么",
      "merchant_type": "新商 / 老商 / 低录款 / 已起量 / 不确定",
      "targeting_goal": "仅当 type=发定向 时填写",
      "style_focus": "仅当 type=发定向 时填写",
      "spu_ids": ["仅当 type=发定向 时，解析到的SPU或商品ID"],
      "targeting_count": 0,
      "follow_topic": "仅当 type=跟进 时填写，如：录款进度 / 打版 / 成本 / 上新 / 效果复盘 等",
      "follow_detail": "仅当 type=跟进 时填写，描述具体要聊什么",
      "follow_time": "YYYY-MM-DD 或 相对时间",
      "priority": "高 | 中 | 低",
      "channel": "如：站内信 / TEMU Chat / 微信 / 电话，如未提到则留空",
      "raw_text": "原始输入这句话，原样放这里，方便回溯"
    }
  ]
}

二、【商家资料卡片】的最高优先级规则

如果输入看起来像「资料表单」，例如包含这些编号式信息：
1.店铺：XXX
2.擅长品类：YYY
3.预计第一个月上多少款：10
4.是否有大码经验：有 / 无
5.是否做过全托跨境：是 / 否
6.接定向还是自己的款：定向款 / 自己款
7.商家分级：S / A / B / C
[图片] 等

则按以下规则处理：

1）如果这段话里 **没有明确的动作指令**（比如“帮我给他发几条定向”“明天催他录完10款”等）：
   - 视为「纯商家资料登记」，不生成任何任务；
   - 输出：{"tasks": []}。

2）如果在资料后面有明确动作指令：
   - 只为同一个商家生成 **一条合并后的任务**，严禁拆成多条。
   - type：按动作判断（例如“帮他做一批定向”→ "发定向"；“明天催他录款”→ "跟进"）。
   - merchant_id：用“店铺”后的ID。
   - style_focus：尽量从「擅长品类」「风格」中提炼。
   - targeting_count：从「预计上多少款」「发几条」里提取数字。
   - merchant_type：结合「是否有大码经验」「老店激活」等判断；不确定填“不确定”。
   - priority：如果出现「S级商家」「S档」「重点」「优先做」等词，优先设为 "高"。

三、普通自然语言任务拆解逻辑（不属于资料卡片时）

1）先判断是否与商家相关：
若出现店铺名、店铺ID、商家、老板、录款、定向、大码等字眼，则视为与商家相关。

2）判断 type：
- 若提到录款、定向、款式、SPU、发几条款、给他推几款、补一批款 → type = "发定向"
- 若提到“问一下、跟进、看看进度、催一下、回访、对一下、沟通一下、确认一下、复盘” → type = "跟进"
- 其他 → type = "其他"

3）拆分原则：
- 默认一个输入里，同一个商家只生成 0～1 条任务，优先合并，不要乱拆。
- 只有当一句话里出现多个商家，且各自有独立动作时，才拆成多条（每个商家一条）。

四、字段填充要点

【发定向】
- merchant_id：商家ID或店铺名。
- merchant_type：新商 / 老商 / 低录款 / 已起量 / 不确定。
- targeting_goal：如 起量 / 测款 / 补礼服类目 / 冲活动。
- style_focus：如 大码礼服 / 大码印花裤 / 秋冬针织 / 泳装。
- spu_ids：解析到的 SPU 或商品ID 列表。
- targeting_count：有明确数字就用原文；没有就根据语气给一个合理的小数字（建议默认 5）。

【跟进】
- merchant_id：商家ID或店铺名。
- follow_topic：录款进度 / 打版 / 上新 / 成本确认 / 效果复盘 等。
- follow_detail：用你自己的话，写成一条清晰易执行的说明。
- follow_time：把“今晚”“明天”“周五前”“这两天”统一成易懂的时间描述。
- priority：有“马上”“今天务必”“优先”→ 高；一般 → 中；很佛系才用 低。

五、输出要求（再强调一次）

- 始终输出合法 JSON，对象结构为：{"tasks":[ ... ]}。
- 不要输出任何解释性中文，不要加注释。
- 若判断为「纯资料登记」，务必输出：{"tasks": []}。
- 同一商家、同一语境下的动作，优先合并成一条完整任务，避免碎片化 todo。
`.trim();

    const payload = {
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      generation_config: {
        response_mime_type: "application/json",
        response_schema: {
          type: SchemaType.OBJECT,
          properties: {
            tasks: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  type: { type: SchemaType.STRING },
                  merchant_id: { type: SchemaType.STRING },
                  title: { type: SchemaType.STRING },
                  description: { type: SchemaType.STRING },
                  merchant_type: { type: SchemaType.STRING },
                  targeting_goal: { type: SchemaType.STRING },
                  style_focus: { type: SchemaType.STRING },
                  spu_ids: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                  },
                  targeting_count: { type: SchemaType.INTEGER },
                  follow_topic: { type: SchemaType.STRING },
                  follow_detail: { type: SchemaType.STRING },
                  follow_time: { type: SchemaType.STRING },
                  priority: { type: SchemaType.STRING },
                  channel: { type: SchemaType.STRING },
                  raw_text: { type: SchemaType.STRING },
                },
                required: ["title", "priority", "type"],
              },
            },
          },
        },
      },
    };

    const result = await callGeminiApi(payload);
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) return { tasks: [] };

    const rawData = JSON.parse(responseText);
    const rawTasks = rawData.tasks || [];

    const mappedTasks = rawTasks.map((item: any) => {
      let p = "P2";
      if (item.priority === "高") p = "P0";
      else if (item.priority === "中") p = "P2";
      else if (item.priority === "低") p = "P4";

      let desc = item.description || "";
      if (item.type === "发定向") {
        const focus = item.style_focus ? `风格:${item.style_focus}` : "";
        const goal = item.targeting_goal ? `目标:${item.targeting_goal}` : "";
        const mType = item.merchant_type ? `(${item.merchant_type})` : "";
        desc = [mType, focus, goal, desc].filter(Boolean).join(" ");
      } else if (item.type === "跟进") {
        desc = item.follow_detail || desc;
      }

      return {
        title: item.title,
        description: desc,
        priority: p,
        shopId: item.merchant_id,
        quantity: item.targeting_count
          ? String(item.targeting_count)
          : undefined,
        actionTime: item.follow_time,
        estimatedMinutes: 30,
      };
    });

    return { tasks: mappedTasks } as AITaskResponse;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

/**
 * 2. 智能改图模块 (Image Editor)
 */
export const editImage = async (
  originalImage: File,
  prompt: string
): Promise<string> => {
  try {
    const imagePart = await fileToGenerativePart(originalImage);

    console.log("Image edit requested via Proxy:", prompt);

    await callGeminiApi({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            imagePart,
            { text: `Describe detailed changes for: ${prompt}` },
          ],
        },
      ],
    });

    // Mock return: Return the original image base64 because simple gemini text models don't output image bytes.
    return `data:${imagePart.inline_data!.mime_type};base64,${
      imagePart.inline_data!.data
    }`;
  } catch (error) {
    console.error("Gemini Image Edit Error:", error);
    throw error;
  }
};

/**
 * 3. 话术推荐模块 (Script Matcher)
 */
export const matchScript = async (
  input: string,
  image?: File
): Promise<{
  analysis: string;
  recommendations: ScriptItem[];
}> => {
  try {
    const parts: GeminiPart[] = [];
    if (image) {
      parts.push(await fileToGenerativePart(image));
    }
    parts.push({
      text: `商家说: "${input}"。请分析商家的潜台词、情绪和核心抗拒点，并从下面的话术库中选择最合适的3条回复。\n\n话术库数据:\n${JSON.stringify(
        SALES_SCRIPTS
      )}`,
    });

    const payload = {
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
      system_instruction: {
        parts: [
          {
            text: `你是一个资深的大码女装买手专家。分析商家意图并推荐话术。输出JSON。`,
          },
        ],
      },
      generation_config: {
        response_mime_type: "application/json",
        response_schema: {
          type: SchemaType.OBJECT,
          properties: {
            analysis: { type: SchemaType.STRING },
            recommendations: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  category: { type: SchemaType.STRING },
                  scenario: { type: SchemaType.STRING },
                  content: { type: SchemaType.STRING },
                },
              },
            },
          },
        },
      },
    };

    const result = await callGeminiApi(payload);
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { analysis: "无法分析", recommendations: [] };
    return JSON.parse(text);
  } catch (e) {
    console.error("Script Match Error", e);
    throw e;
  }
};

/**
 * 4. Temu 助理聊天模块 (Chat Assistant)
 */
export const chatWithBuyerAI = async (
  history: { role: string; parts: any[] }[],
  message: string,
  image?: File
): Promise<string> => {
  try {
    const restHistory: GeminiContent[] = history.map((msg) => ({
      role: msg.role === "model" ? "model" : "user",
      parts: msg.parts.map((p: any) => {
        if (p.inlineData) {
          return {
            inline_data: {
              mime_type: p.inlineData.mimeType,
              data: p.inlineData.data,
            },
          };
        }
        if (p.inline_data) {
          return p;
        }
        return { text: p.text || "" };
      }),
    }));

    const newParts: GeminiPart[] = [];
    if (image) {
      newParts.push(await fileToGenerativePart(image));
    }
    newParts.push({ text: message || " " });

    const contents: GeminiContent[] = [
      ...restHistory,
      { role: "user", parts: newParts },
    ];

    const payload = {
      model: "gemini-2.5-flash",
      contents,
      tools: [{ google_search: {} }],
      system_instruction: {
        parts: [
          {
            text: `你现在是Temu平台资深的大码女装买手专家。职责：辅助买手选品、核价、怼商家。风格：简洁、数据导向、行话。如果需要查询最新市场信息，请使用搜索功能。`,
          },
        ],
      },
    };

    const result = await callGeminiApi(payload);

    const candidate = result.candidates?.[0];
    if (candidate?.content?.parts?.[0]?.text) {
      return candidate.content.parts[0].text;
    }

    return "AI 暂时没有回复";
  } catch (error) {
    console.error("Chat Error", error);
    return "AI 助理暂时开小差了，请稍后再试。";
  }
};
