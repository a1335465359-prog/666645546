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
你是「Temu 大码女装买手的待办拆解助手」。你的目标是：
把我输入的自然语言，拆成**尽量少但必要的**、结构清晰、可执行的待办事项列表，而不是乱切很多条。

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
      "follow_time": "YYYY-MM-DD 或 相对时间（如：今天晚上 / 明天白天 / 本周内）",
      "priority": "高 | 中 | 低",
      "channel": "如：站内信 / TEMU Chat / 微信 / 电话，如未提到则留空",
      "raw_text": "原始输入这句话，原样放这里"
    }
  ]
}

二、「商家资料卡片」的强制规则（你刚才那种）

当输入整体形态类似下面这种一整组带编号的信息时：

1.店铺：634418227761818
2.擅长品类：T恤/卫衣/裤子
3.预计第一个月上多少款：20
4.是否有大码经验：否
5.是否做过全托跨境：否
6.接定向还是自己的款：定向款
7.商家分级：A
[图片]

视为一张「商家资料卡片」，必须遵守：

1）**只能生成 1 条任务，绝对不能拆成多条**  
2）这 1 条任务的字段建议如下：

- type: 一律为 "发定向"
- merchant_id: 从“店铺：”后面提取数字ID（如 634418227761818）
- style_focus: 从“擅长品类”提取品类文本（如 "T恤/卫衣/裤子"）
- targeting_count: 从“预计第一个月上多少款”提取数字（如 20，提取不到时可默认 10）
- merchant_type: 
    - 如果文本中有“老店”“老店激活”等 → "老商"
    - 有“新商”“新店”“刚做大码”等 → "新商"
    - 其他情况 → "不确定"
- targeting_goal: 可简要概括为 "首月起量定向" 或类似表达
- priority:
    - 如果出现“S商、S级、P0、重点商家”等，高优先级 → "高"
    - 出现“A商、A级”等，中高优先级，可用 "中"
    - 其他默认 "中"
- title: 按下面格式生成：
    - 若有 style_focus 和 targeting_count：
      "给{merchant_id}发{targeting_count}款{style_focus}定向"
      例如："给634418227761818发20款T恤/卫衣/裤子定向"
    - 若缺少其中一项，则尽量用「给{merchant_id}发一批大码定向」类似的标题。
- description:
    - 用一两句话，整合资料卡里的信息，比如：
      "A类商家，无大码经验，首月计划上20款T恤/卫衣/裤子，安排一批起量用定向。"

3）即使资料卡里没有出现“发定向、催进度”等明显动作动词，**也要生成这一条发定向任务**，不要返回空数组。

三、普通自然语言输入的判断逻辑

当输入不是上述编号资料卡，而是自然语言描述时：

1）先判断是否与商家相关：
   若出现「店铺」「店铺ID」「商家」「老板」「录款」「定向」「大码」等字眼，则视为与商家相关。

2）判断 type：
   - 若提到「录款、定向、款式、SPU、发几条款、给他推几款、再补一批款」 → type = "发定向"
   - 若提到「问一下、跟进、看看进度、催一下、回访、对一下、沟通一下、确认一下、复盘」 → type = "跟进"
   - 其他 → type = "其他"

3）任务合并规则：
   - 对同一个商家、同一语境，尽量只生成 1 条任务，把要做的事写在 description 或 follow_detail 里，不要拆成很多碎任务。
   - 只有当文本中明确出现多个不同商家，且各自有独立动作时，才为多个商家分别生成任务。

四、字段填充细则（概括版）

【发定向】：
- merchant_id：提取店铺ID或名称。
- style_focus：从语义中提炼风格或品类。
- targeting_goal：概括本次定向目标，如「起量」「测款」「补类目」「冲活动」。
- targeting_count：有数字就用数字，没有就根据语气估一个合理默认值（例如 5）。

【跟进】：
- follow_topic：如「录款进度」「打版确认」「上新排期」「成本确认」「效果复盘」等。
- follow_detail：用你自己的话，写出方便执行的一句说明。
- follow_time：从文本中提取时间信息，如「今晚」「明天白天」「周五之前」「这两天」等，填成易理解的表达。
- priority：语气紧急则 "高"，普通则 "中"，很佛系可以 "低"。

【其他】：
- 当不属于发定向或跟进，但有明确要做的事，可以用 type = "其他"，写清 title 和 description。

五、输出要求

1）始终输出合法 JSON，结构为：
{
  "tasks": [ ... ]
}

2）不要输出解释文字、不要加注释、不要加多余字段。

3）对「商家资料卡片」输入：
   - 必须生成且仅生成 1 条任务（type="发定向"），不得返回空数组，也不得拆成多条。
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

// 把 File 转 dataURL
const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const editImage = async (
  originalImage: File,
  prompt: string
): Promise<string> => {
  try {
    const imageDataUrl = await fileToDataUrl(originalImage);

    const response = await fetch("/api/doubaoImage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        image: imageDataUrl, // 👈 关键：把图传出去
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error || `Doubao image API error: ${response.status}`);
    }

    const data = await response.json();
    return data?.url;
  } catch (e) {
    console.error("Doubao image edit error", e);
    throw e;
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
    // 强制在 Prompt 中约定 JSON 结构，因为代理层可能忽略 Schema 配置
    parts.push({
      text: `商家说: "${input}"。请分析商家的潜台词、情绪和核心抗拒点，并从下面的话术库中选择最合适的3条回复。

话术库数据:
${JSON.stringify(SALES_SCRIPTS)}

请严格返回以下 JSON 格式，不要包含 Markdown 格式标记（如 \`\`\`json）：
{
  "analysis": "这里写分析...",
  "recommendations": [
    { "category": "分类", "scenario": "场景", "content": "话术内容" }
  ]
}`,
    });

    const payload = {
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
      system_instruction: {
        parts: [
          {
            text: `你是一个资深的大码女装买手专家。分析商家意图并推荐话术。输出严格的 JSON。`,
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
    let text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) return { analysis: "无法获取回复，请重试。", recommendations: [] };
    
    try {
      // 移除可能存在的 Markdown 代码块标记
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(text);
      return {
        analysis: parsed.analysis || "无分析内容",
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : []
      };
    } catch (e) {
      console.error("Script Match Parse Error", e);
      return { analysis: "数据解析失败，请检查网络或重试。", recommendations: [] };
    }

  } catch (e) {
    console.error("Script Match Error", e);
    return { analysis: "请求出错，请稍后重试。", recommendations: [] };
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