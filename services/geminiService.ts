import { GoogleGenAI, Type } from "@google/genai";
import { AITaskResponse } from "../types";
import { SALES_SCRIPTS, ScriptItem } from "../data/scriptLibrary";

declare const process: any;

// Use a fallback empty string to prevent "White Screen" crash on load if API_KEY is missing.
// The actual API calls will fail gracefully later if the key is invalid.
const apiKey = process.env.API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

// Helper to convert file to base64
export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:image/jpeg;base64,")
      const base64Data = base64String.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const analyzeImageAndText = async (text: string, imageFile?: File): Promise<AITaskResponse> => {
  try {
    const parts: any[] = [];
    
    if (imageFile) {
      const imagePart = await fileToGenerativePart(imageFile);
      parts.push(imagePart);
    }
    
    if (text) {
      parts.push({ text });
    }

    if (parts.length === 0) {
      throw new Error("No input provided");
    }

    // System instruction tailored for a Plus Size Fashion Buyer
    const systemPrompt = `
      你是一位大码女装买手的助理。请从输入（文本/截图）中提取待办任务。
      
      **核心提取目标**：
      1. **ID (shopId)**：提取长数字ID（如【634418219573470】）。
      2. **做什么 (title)**：简短的动词短语。例如：发定向、做文档、跟进、催货、审版。
      3. **多少个 (quantity)**：例如：5款、30件。
      4. **时间 (actionTime)**：例如：今天下午、马上、周五前。

      **优先级 (Priority) P0-P4**：
      - **P0** (最高/紧急)：包含“马上”、“急”、“截点”、“未发”、“断货”、“退单”。
      - **P1** (高)：包含“今天”、“今晚”、“务必”。
      - **P2** (中)：常规跟进、审版、日常工作。
      - **P3** (低)：周五前、本周内。
      - **P4** (缓)：长期关注、以后再说。

      **输出要求**：
      - 直接输出 JSON。
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts },
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tasks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: "简短的动作，如：发定向款" },
                  description: { type: Type.STRING, description: "原始文本或其他细节" },
                  shopId: { type: Type.STRING, description: "提取到的长数字ID" },
                  quantity: { type: Type.STRING, description: "数量" },
                  actionTime: { type: Type.STRING, description: "时间要求" },
                  priority: { type: Type.STRING, enum: ["P0", "P1", "P2", "P3", "P4"] },
                  estimatedMinutes: { type: Type.INTEGER, description: "预估耗时(分钟)" }
                },
                required: ["title", "priority"]
              }
            }
          }
        }
      }
    });

    if (!response.text) {
      return { tasks: [] };
    }

    return JSON.parse(response.text) as AITaskResponse;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

export const editImage = async (originalImage: File, prompt: string): Promise<string> => {
  try {
    const imagePart = await fileToGenerativePart(originalImage);
    
    // Using gemini-2.5-flash-image for image editing/generation
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          imagePart,
          { text: prompt }
        ]
      }
    });

    // Iterate through parts to find the image part (inlineData)
    // Add optional chaining to prevent crash if parts are missing
    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData) {
           return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    
    throw new Error("AI未能生成图片，请重试");
  } catch (error) {
    console.error("Gemini Image Edit Error:", error);
    throw error;
  }
};

export const matchScript = async (input: string, image?: File): Promise<{
    analysis: string;
    recommendations: ScriptItem[]
}> => {
    try {
        const parts: any[] = [];
        if (image) {
            parts.push(await fileToGenerativePart(image));
        }
        parts.push({ text: `商家说: "${input}"。请分析商家的潜台词、情绪和核心抗拒点，并从下面的话术库中选择最合适的3条回复。\n\n话术库数据:\n${JSON.stringify(SALES_SCRIPTS)}` });

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts },
            config: {
                systemInstruction: `你是一个资深的大码女装买手专家。你的任务是帮助买手应对商家的各种借口、推脱或疑问。
                
                步骤：
                1. 分析商家的输入（截图或文字）。如果是截图，请提取其中的聊天内容。
                2. 识别商家的核心意图（例如：借口忙、怕压货、质疑选品、觉得流程烦）。
                3. 从提供的【话术库数据】中，精准匹配 1-3 条最能解决问题的回复。
                4. 如果话术库里没有完全匹配的，你可以基于话术库的风格（犀利、专业、结果导向）生成一条新的。
                
                输出JSON格式：
                {
                    "analysis": "简短分析商家的心理，例如：商家其实是怕压货，借口说忙。",
                    "indices": [0, 5, 8] // 对应话术库数组的索引，或者直接返回匹配到的 ScriptItem 对象数组
                }
                `,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        analysis: { type: Type.STRING },
                        recommendations: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    category: { type: Type.STRING },
                                    scenario: { type: Type.STRING },
                                    content: { type: Type.STRING }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!response.text) return { analysis: "无法分析", recommendations: [] };
        return JSON.parse(response.text);

    } catch (e) {
        console.error("Script Match Error", e);
        throw e;
    }
};

export const chatWithBuyerAI = async (
  history: { role: string; parts: any[] }[],
  message: string,
  image?: File
): Promise<string> => {
  try {
    // Construct the current message content
    let messageContent: any = message;
    if (image) {
        const imagePart = await fileToGenerativePart(image);
        // When sending an image, we send an array of parts. 
        // Ensure text is not empty string if SDK complains (though usually fine), we use " " if empty.
        messageContent = [imagePart, { text: message || " " }];
    }

    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      history: history,
      config: {
        systemInstruction: `
          你现在是Temu平台资深的大码女装买手专家（Buyer Assistant）。
          你的核心职责是辅助买手完成：选品决策、成本核算、文案优化、商家沟通和JIT/VMI模式咨询。

          **你的人设与知识库：**
          1.  **平台规则**：
              - 熟悉Temu的JIT（即时发货）和VMI（备货仓）模式。
              - 知道核价红线：大码女装通常面料用量大，但平台压价狠，你需要帮买手计算极致性价比。
              - 质检标准：大码特别关注尺码足、弹力大、裆深够。

          2.  **大码女装专业知识**：
              - 知道 0XL-5XL 的尺码痛点。
              - 面料关键词：牛奶丝、罗马布、四面弹、坑条（显瘦）。
              - 版型关键词：A字、遮肚、高腰、收腰不勒肉。

          3.  **语言风格**：
              - 简洁、干练、数据导向。
              - 像一个经验丰富的老买手，偶尔会用行业黑话（如：推款、爆单、下架、卡审、寄样）。
              - 如果用户问Listing文案，请生成符合SEO逻辑的英文标题和五点描述。

          **你的任务**：
          - 当用户给出一个款式描述或图片时，帮他分析卖点、写英文Listing标题。
          - 当用户问如何回怼商家时，提供强硬但合规的建议。
          - 当用户问选品方向时，推荐当前的欧美大码流行趋势（如：Y2K大码、波西米亚印花、通勤西装）。
        `
      }
    });

    const result = await chat.sendMessage({ message: messageContent });
    return result.text || "";
  } catch (error) {
    console.error("Chat Error", error);
    return "AI 助理暂时开小差了，请稍后再试。";
  }
};