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
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  INTEGER: 'INTEGER',
  BOOLEAN: 'BOOLEAN',
  ARRAY: 'ARRAY',
  OBJECT: 'OBJECT'
};

// Helper: Convert file to base64 for REST API
export const fileToGenerativePart = async (file: File): Promise<GeminiPart> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:image/jpeg;base64,")
      const base64Data = base64String.split(',')[1];
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
    console.log("[Gemini Service] Sending request to /api/gemini with model:", payload.model);
    
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const apiMsg = data.error?.message || JSON.stringify(data.error);
      throw new Error(apiMsg || 'Gemini API Request Failed');
    }

    return data;
  } catch (error) {
    console.error("Gemini Proxy Error:", error);
    throw error;
  }
};

/**
 * 1. 任务分析模块 (Task Input)
 * Updated with specific System Prompt for Temu Buyer context.
 */
export const analyzeImageAndText = async (text: string, imageFile?: File): Promise<AITaskResponse> => {
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

    // New System Prompt from User Request
    const systemPrompt = `
【角色：
你是「Temu 大码女装买手的待办拆解助手」。你的唯一目标是：
把我输入的自然语言，拆成结构清晰、可执行的待办事项列表。

一、输出格式（必须遵守）
一律输出为 JSON 数组（包裹在 tasks 字段中）。不要输出任何解释或多余文字。

每条待办的字段：
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
  "follow_time": "YYYY-MM-DD 或 相对时间（如：今天晚上 / 明天白天 / 本周内）",
  "priority": "高 | 中 | 低",
  "channel": "如：站内信 / TEMU Chat / 微信 / 电话，如未提到则留空",
  "raw_text": "原始输入这句话，原样放这里，方便回溯"
}

二、判断逻辑
先判断是否与商家相关：若出现店铺名、店铺ID、商家、老板、录款等字眼，则视为与商家相关。

判断 type：
若提到录款、定向、款式、SPU、发几条款 → type = "发定向"
若提到“问一下”、“跟进”、“看看进度”、“催一下”、“回访”、“对一下” → type = "跟进"
其他 → type = "其他"

对于发定向：
提取商家ID或店铺名放入 merchant_id。
从话里判断 merchant_type（新商 / 老商 / 低录款 / 已起量），不确定就填“不确定”。
从话里提炼这次定向的目标，填入 targeting_goal（如：起量 / 测款 / 拉动礼服类目 等）。
提炼定向风格关键词，填入 style_focus（如：大码礼服 / 大码印花裤 / 秋冬针织 等）。
任何出现的 SPU / 商品ID 写入 spu_ids 数组。
若提到“发 10 条”、“至少 5 条”等，写入 targeting_count；否则根据语气估个大致数字（比如默认 5）。

对于跟进：
提取 merchant_id。
从语句中提炼跟进主题，写入 follow_topic（录款进度 / 打版 / 上新 / 成本 / 走量效果 等）。
用你自己的话，归纳一句更具体的 follow_detail。
识别时间信息，如“今晚”、“明天”、“周五之前”，规范到 follow_time。
若语气紧急（“马上”“今天务必”“优先”），priority = "高"；一般情况 priority = "中"。

对于无法明确的情况：
type = "其他"；
写一个中性标题，例如「【确认信息】商家诉求不明确」；
description 简要概括；
raw_text 一定要带上原始话术。

三、输出要求
始终输出 合法 JSON。
每条待办只针对一个商家一次具体动作；如果一句话里涉及多个商家或多个动作，请拆成多条。
不要输出任何解释性中文，只输出 JSON。
`.trim();

    const payload = {
      model: "gemini-2.5-flash", 
      contents: [{ role: 'user', parts }],
      system_instruction: {
        parts: [{ text: systemPrompt }]
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
                  spu_ids: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                  targeting_count: { type: SchemaType.INTEGER },
                  follow_topic: { type: SchemaType.STRING },
                  follow_detail: { type: SchemaType.STRING },
                  follow_time: { type: SchemaType.STRING },
                  priority: { type: SchemaType.STRING },
                  channel: { type: SchemaType.STRING },
                  raw_text: { type: SchemaType.STRING }
                },
                required: ["title", "priority", "type"]
              }
            }
          }
        }
      }
    };

    const result = await callGeminiApi(payload);
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) return { tasks: [] };

    // Parse the new complex JSON structure
    const rawData = JSON.parse(responseText);
    const rawTasks = rawData.tasks || [];

    // Map new fields to the App's existing 'AITaskResponse' format so UI works
    // Mapping Logic:
    // merchant_id -> shopId
    // targeting_count -> quantity
    // follow_time -> actionTime
    // priority (Chinese) -> Priority Enum
    const mappedTasks = rawTasks.map((item: any) => {
        let p = 'P2';
        if (item.priority === '高') p = 'P0';
        else if (item.priority === '中') p = 'P2';
        else if (item.priority === '低') p = 'P4';
        
        // Construct a rich description based on type
        let desc = item.description || "";
        if (item.type === '发定向') {
            const focus = item.style_focus ? `风格:${item.style_focus}` : "";
            const goal = item.targeting_goal ? `目标:${item.targeting_goal}` : "";
            desc = [desc, focus, goal].filter(Boolean).join(' | ');
        } else if (item.type === '跟进') {
            desc = item.follow_detail || desc;
        }

        return {
            title: item.title,
            description: desc,
            priority: p,
            shopId: item.merchant_id,
            quantity: item.targeting_count ? String(item.targeting_count) : undefined,
            actionTime: item.follow_time,
            estimatedMinutes: 30 // Default estimate
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
export const editImage = async (originalImage: File, prompt: string): Promise<string> => {
  try {
    const imagePart = await fileToGenerativePart(originalImage);
    
    console.log("Image edit requested via Proxy:", prompt);
    
    await callGeminiApi({
      model: "gemini-2.5-flash",
      contents: [{
        role: 'user',
        parts: [
            imagePart,
            { text: `Describe detailed changes for: ${prompt}` }
        ]
      }]
    });

    // Mock return: Return the original image base64 because simple gemini text models don't output image bytes.
    return `data:${imagePart.inline_data!.mime_type};base64,${imagePart.inline_data!.data}`;
    
  } catch (error) {
    console.error("Gemini Image Edit Error:", error);
    throw error;
  }
};

/**
 * 3. 话术推荐模块 (Script Matcher)
 */
export const matchScript = async (input: string, image?: File): Promise<{
    analysis: string;
    recommendations: ScriptItem[]
}> => {
    try {
        const parts: GeminiPart[] = [];
        if (image) {
            parts.push(await fileToGenerativePart(image));
        }
        parts.push({ text: `商家说: "${input}"。请分析商家的潜台词、情绪和核心抗拒点，并从下面的话术库中选择最合适的3条回复。\n\n话术库数据:\n${JSON.stringify(SALES_SCRIPTS)}` });

        const payload = {
            model: "gemini-2.5-flash",
            contents: [{ role: 'user', parts }],
            system_instruction: {
                parts: [{ text: `你是一个资深的大码女装买手专家。分析商家意图并推荐话术。输出JSON。` }]
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
                                    content: { type: SchemaType.STRING }
                                }
                            }
                        }
                    }
                }
            }
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
    const restHistory: GeminiContent[] = history.map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: msg.parts.map((p: any) => {
        if (p.inlineData) {
          return { inline_data: { mime_type: p.inlineData.mimeType, data: p.inlineData.data } };
        }
        if (p.inline_data) {
          return p;
        }
        return { text: p.text || "" };
      })
    }));

    const newParts: GeminiPart[] = [];
    if (image) {
      newParts.push(await fileToGenerativePart(image));
    }
    newParts.push({ text: message || " " });
    
    const contents = [...restHistory, { role: 'user', parts: newParts }];

    const payload = {
      model: "gemini-2.5-flash",
      contents: contents,
      tools: [{ google_search: {} }],
      system_instruction: {
          parts: [{ text: `你现在是Temu平台资深的大码女装买手专家。职责：辅助买手选品、核价、怼商家。风格：简洁、数据导向、行话。如果需要查询最新市场信息，请使用搜索功能。` }]
      }
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
