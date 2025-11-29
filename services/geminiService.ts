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
const callGeminiApi = async (payload: any) => {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
 * 1. 任务分析模块 (Task Input) — 最新 Prompt 已更新
 */
export const analyzeImageAndText = async (text: string, imageFile?: File): Promise<AITaskResponse> => {
  try {
    const parts: GeminiPart[] = [];

    if (imageFile) parts.push(await fileToGenerativePart(imageFile));
    if (text) parts.push({ text });

    if (parts.length === 0) throw new Error("No input provided");

    // === 最新 Prompt（已优化：不会把商家信息拆成一堆 todo） ===
    const systemPrompt = `
【角色：
你是「Temu 大码女装买手的待办拆解助手」。你的唯一目标是：
把我输入的自然语言，拆成**尽量少且必要的**、结构清晰、可执行的待办事项列表，而不是机械乱切很多条。

一、输出格式（必须遵守）
一律输出为 JSON 对象： { "tasks": [ ... ] }

每条任务字段如下：
{
  "type": "发定向 | 跟进 | 其他",
  "merchant_id": "",
  "title": "",
  "description": "",
  "merchant_type": "",
  "targeting_goal": "",
  "style_focus": "",
  "spu_ids": [],
  "targeting_count": 0,
  "follow_topic": "",
  "follow_detail": "",
  "follow_time": "",
  "priority": "",
  "channel": "",
  "raw_text": ""
}

二、判断逻辑
出现“店铺、商家、录款、定向” = 商家相关。

type 判断：
- 发定向：出现“录款、定向、发几款、给款、推款”
- 跟进：出现“问一下、催一下、对一下、确认、跟一下进度”
- 默认：其他

三、最重要规则：商家信息表单不生成任务
以下类似内容：
1. 店铺：634418219200983
2. 擅长品类：衬衫 连衣裙
3. 预计第一个月上多少款：10
4. 是否有大码经验：有
5. 是否做过全托跨境：是
6. 接定向还是自己的款：定向款
7. 分级：S
[图片]

如果用户**没有明确提动作（发/问/催/安排/对齐）** → 必须返回：
{"tasks": []}

不要造任务，不要拆任务，不要从画像生成任何动作。

四、拆分规则（极度重要）
一个输入只说一个商家 → 只生成 0～1 条任务。
不要拆成多个小 todo。

只有出现多个商家、且每个都有自己动作时才拆分。

五、合并规则
对同一商家出现多个动作词时，若这些动作是在一次沟通中能一起完成，则合并为一个任务，不要拆。

六、字段提取规则（精简版）
【发定向】
- focusing: 目标、风格、数量、spu_ids

【跟进】
- follow_topic: 录款/打版/成本/上新/复盘
- follow_time：时间词标准化
- follow_detail：你归纳成一句话即可

七、输出要求
- 必须是合法 JSON
- 必须是 { "tasks": [...] }
- 不得输出解释性文字
- 纯画像输入 → 返回空数组
`.trim();

    const payload = {
      model: "gemini-2.5-flash",
      contents: [{ role: 'user', parts }],
      system_instruction: { parts: [{ text: systemPrompt }] },
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

    const rawData = JSON.parse(responseText);
    const rawTasks = rawData.tasks || [];

    // === 映射到前端使用模型 ===
    const mapped = rawTasks.map((item: any) => {
      let p = 'P2';
      if (item.priority === '高') p = 'P0';
      else if (item.priority === '中') p = 'P2';
      else if (item.priority === '低') p = 'P4';

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
        estimatedMinutes: 30
      };
    });

    return { tasks: mapped };

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

    return `data:${imagePart.inline_data!.mime_type};base64,${imagePart.inline_data!.data}`;
  } catch (error) {
    console.error("Gemini Image Edit Error:", error);
    throw error;
  }
};

/**
 * 3. 话术推荐模块
 */
export const matchScript = async (input: string, image?: File): Promise<{
  analysis: string;
  recommendations: ScriptItem[]
}> => {
  try {
    const parts: GeminiPart[] = [];
    if (image) parts.push(await fileToGenerativePart(image));
    parts.push({
      text: `商家说: "${input}"。请分析潜台词、情绪、抗拒点，并从话术库中选 3 条最佳回复。\n\n话术库:\n${JSON.stringify(SALES_SCRIPTS)}`
    });

    const payload = {
      model: "gemini-2.5-flash",
      contents: [{ role: 'user', parts }],
      system_instruction: { parts: [{ text: `你是资深大码女装买手专家，输出JSON。` }] },
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

    const res = await callGeminiApi(payload);
    const text = res.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { analysis: "无法分析", recommendations: [] };
    return JSON.parse(text);

  } catch (e) {
    console.error("Script Match Error", e);
    throw e;
  }
};

/**
 * 4. Temu 助理聊天模块
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
        if (p.inline_data) return p;
        return { text: p.text || "" };
      })
    }));

    const newParts: GeminiPart[] = [];
    if (image) newParts.push(await fileToGenerativePart(image));
    newParts.push({ text: message || " " });

    const contents = [...restHistory, { role: 'user', parts: newParts }];

    const payload = {
      model: "gemini-2.5-flash",
      contents,
      tools: [{ google_search: {} }],
      system_instruction: {
        parts: [{ text: `你是Temu大码女装资深买手专家。风格：简洁、狠、行话、效率优先。必要时可搜索最新市场。` }]
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
