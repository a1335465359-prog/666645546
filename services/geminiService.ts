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
  "follow_topic": "仅当 type=跟进 时填写",
  "follow_detail": "仅当 type=跟进 时填写",
  "follow_time": "YYYY-MM-DD 或 相对时间",
  "priority": "高 | 中 | 低",
  "channel": "如：站内信 / TEMU Chat / 微信 / 电话",
  "raw_text": "原始输入"
}

二、判断逻辑

**【最高优先级规则：商家资料卡片合并】**
如果输入包含类似“1.店铺：... 2.品类：... 3.数量：...”这种带编号的商家资料格式：
1. **严禁拆分**：绝对不要生成多条任务，必须合并为 **唯一一条** 任务。
2. **强制设定**：
   - type: "发定向"
   - merchant_id: 提取 "1.店铺" 后的数字ID。
   - style_focus: 提取 "2.擅长品类" 或 "品类" 的内容（如 衬衫 连衣裙）。
   - targeting_count: 提取 "3.数量" 或 "上多少款" 里的数字（如 10）。
   - merchant_type: 提取 "4.经验" 或 "5.全托" 里的关键词（如 老店激活）。
   - priority: 如果 "7.商家分级" 包含 "S" 或 "A"，或者包含 "P0"，priority 必须设为 "高"。
   - title: 必须格式化为： "给 {merchant_id} 发 {targeting_count} 款 {style_focus} 定向"。

**【普通自然语言逻辑】**
只有当输入**不是**上述商家资料卡片时，才执行以下拆分逻辑：

1. 判断 type：
   - 提到录款、定向、款式、SPU、发几条款 → type = "发定向"
   - 提到问一下、跟进、进度、催一下 → type = "跟进"
   - 其他 → type = "其他"

2. 对于发定向：
   - 提取 merchant_id。
   - 提取 style_focus (风格/品类)。
   - 提取 targeting_count (数量)。

3. 对于跟进：
   - 提取 follow_topic (录款进度/打版/上新)。
   - 提取 priority (紧急/马上/今天务必 -> 高)。

三、输出要求
始终输出 合法 JSON。
不要输出任何解释性中文。
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
            const mType = item.merchant_type ? `(${item.merchant_type})` : "";
            // Combine relevant info into description for the UI
            desc = [mType, focus, goal, desc].filter(Boolean).join(' ');
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
          return { inline_data: { mime_type: p.inlineData.mimeType, data: p.inlineData
