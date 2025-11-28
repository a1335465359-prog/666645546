import { AITaskResponse } from "../types";
import { SALES_SCRIPTS, ScriptItem } from "../data/scriptLibrary";

// --- REST API Types (Strict Snake Case) ---
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
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      // Extract Google API error message if available
      const apiMsg = data.error?.message || JSON.stringify(data.error);
      throw new Error(apiMsg || 'Gemini API Request Failed');
    }

    return data;
  } catch (error) {
    console.error("Gemini Proxy Error:", error);
    throw error;
  }
};

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

    const systemPrompt = `你是一位大码女装买手的助理。请从输入（文本/截图）中提取待办任务。直接输出 JSON。`;

    const payload = {
      // Use Flash for tasks as it's faster and sufficient for extraction
      model: "gemini-1.5-flash",
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
                  title: { type: SchemaType.STRING, description: "简短的动作，如：发定向款" },
                  description: { type: SchemaType.STRING, description: "原始文本或其他细节" },
                  shopId: { type: SchemaType.STRING, description: "提取到的长数字ID" },
                  quantity: { type: SchemaType.STRING, description: "数量" },
                  actionTime: { type: SchemaType.STRING, description: "时间要求" },
                  priority: { type: SchemaType.STRING, enum: ["P0", "P1", "P2", "P3", "P4"] },
                  estimatedMinutes: { type: SchemaType.INTEGER, description: "预估耗时(分钟)" }
                },
                required: ["title", "priority"]
              }
            }
          }
        }
      }
    };

    const result = await callGeminiApi(payload);
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) return { tasks: [] };

    return JSON.parse(responseText) as AITaskResponse;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

export const editImage = async (originalImage: File, prompt: string): Promise<string> => {
  try {
    const imagePart = await fileToGenerativePart(originalImage);
    
    console.log("Image edit requested via Proxy:", prompt);
    
    // Using 1.5 Pro for better reasoning on visual tasks
    await callGeminiApi({
      model: 'gemini-1.5-pro',
      contents: [{
        role: 'user',
        parts: [
            imagePart,
            { text: `Describe how this image would look if: ${prompt}` }
        ]
      }]
    });

    // Note: The standard Gemini API does not yet support returning edited image bytes directly in this format.
    // We mock the return to prevent app crash, returning original.
    // In a full implementation, you would use the Imagen endpoint.
    return `data:${imagePart.inline_data!.mime_type};base64,${imagePart.inline_data!.data}`;
    
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
        const parts: GeminiPart[] = [];
        if (image) {
            parts.push(await fileToGenerativePart(image));
        }
        // Using strict instructions
        parts.push({ text: `商家说: "${input}"。请分析商家的潜台词、情绪和核心抗拒点，并从下面的话术库中选择最合适的3条回复。\n\n话术库数据:\n${JSON.stringify(SALES_SCRIPTS)}` });

        const payload = {
            // Use Pro for better semantic matching and emotional analysis
            model: "gemini-1.5-pro",
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

export const chatWithBuyerAI = async (
  history: { role: string; parts: any[] }[],
  message: string,
  image?: File
): Promise<string> => {
  try {
    // 1. Convert history to REST API format (snake_case)
    const restHistory: GeminiContent[] = history.map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: msg.parts.map((p: any) => {
        // Handle camelCase from old state if exists
        if (p.inlineData) {
          return { inline_data: { mime_type: p.inlineData.mimeType, data: p.inlineData.data } };
        }
        // Handle snake_case if already converted
        if (p.inline_data) {
          return p;
        }
        // Text parts
        return { text: p.text || "" };
      })
    }));

    // 2. Add current message
    const newParts: GeminiPart[] = [];
    if (image) {
      newParts.push(await fileToGenerativePart(image));
    }
    // Ensure text is never empty string if it's the only part, though API usually handles it.
    newParts.push({ text: message || " " });
    
    // 3. Combine
    const contents = [...restHistory, { role: 'user', parts: newParts }];

    const payload = {
      // Use Pro for better conversation
      model: "gemini-1.5-pro",
      contents: contents,
      system_instruction: {
          parts: [{ text: `你现在是Temu平台资深的大码女装买手专家。职责：辅助买手选品、核价、怼商家。风格：简洁、数据导向、行话。` }]
      }
    };

    const result = await callGeminiApi(payload);
    return result.candidates?.[0]?.content?.parts?.[0]?.text || "AI 暂时没有回复";
  } catch (error) {
    console.error("Chat Error", error);
    return "AI 助理暂时开小差了，请稍后再试。";
  }
};