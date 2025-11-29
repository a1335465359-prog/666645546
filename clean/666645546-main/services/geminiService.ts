import { AITaskResponse } from "../types";
import { ScriptItem, SALES_SCRIPTS } from "../data/scriptLibrary";

// --- Helpers ---

// 把 File 转 dataURL (for Doubao Image Edit)
const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// 把 File 转 raw base64 (for Gemini API)
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const res = reader.result as string;
        // Strip "data:image/xyz;base64," prefix
        const base64 = res.split(',')[1];
        resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Generic helper for the gemini proxy
async function callGeminiApi(contents: any[], systemInstruction?: string, jsonMode: boolean = false): Promise<string> {
    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        system_instruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        generation_config: jsonMode ? { response_mime_type: 'application/json' } : undefined
      })
    });
    
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || `Gemini API Error: ${response.status}`);
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// --- Exported Services ---

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

export const analyzeImageAndText = async (text: string, image?: File): Promise<AITaskResponse> => {
    const parts: any[] = [];
    if (text) parts.push({ text });
    if (image) {
        const b64 = await fileToBase64(image);
        parts.push({ inline_data: { mime_type: image.type, data: b64 } });
    }
    
    const systemPrompt = `You are a helpful assistant for a clothing buyer. 
    Analyze the input (text and/or image) and extract tasks.
    Return JSON format: { tasks: [{ title, description, priority (P0-P4), estimatedMinutes, shopId, quantity, actionTime }] }`;
    
    try {
        const responseText = await callGeminiApi([{ role: 'user', parts }], systemPrompt, true);
        return JSON.parse(responseText);
    } catch (e) {
        console.error("AI Analysis failed", e);
        return { tasks: [] };
    }
};

export const chatWithBuyerAI = async (history: any[], newMessage: string, image?: File): Promise<string> => {
    const newParts: any[] = [];
    if (newMessage) newParts.push({ text: newMessage });
    if (image) {
        const b64 = await fileToBase64(image);
        newParts.push({ inline_data: { mime_type: image.type, data: b64 } });
    }

    // Convert history format if necessary (handle camelCase to snake_case for inlineData)
    const contents = [
        ...history.map((h: any) => ({
            role: h.role,
            parts: h.parts.map((p: any) => {
                if (p.inlineData) {
                    return { inline_data: { mime_type: p.inlineData.mimeType, data: p.inlineData.data } };
                }
                return p;
            })
        })),
        { role: 'user', parts: newParts }
    ];

    const systemPrompt = "You are a friendly and professional Plus Size Women's Fashion Buyer Assistant for Temu.";
    return await callGeminiApi(contents, systemPrompt);
};

export const matchScript = async (text: string, image?: File): Promise<{ analysis: string, recommendations: ScriptItem[] }> => {
    const parts: any[] = [{ text: `Analyze this context: ${text}` }];
    if (image) {
        const b64 = await fileToBase64(image);
        parts.push({ inline_data: { mime_type: image.type, data: b64 } });
    }
    
    const systemPrompt = `
    Analyze the buyer-seller conversation or context. Identify the underlying intent or objection.
    Return JSON: { analysis: string, recommendations: [{ category, scenario, content }] }
    Refer to these scripts if applicable: ${JSON.stringify(SALES_SCRIPTS.slice(0, 3))}`;
    
    try {
        const responseText = await callGeminiApi([{ role: 'user', parts }], systemPrompt, true);
        return JSON.parse(responseText);
    } catch (e) {
        console.error("Script match failed", e);
        return { analysis: "Analysis failed", recommendations: [] };
    }
};
