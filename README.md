<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Buyermate - 大码女装买手助理

专为大码女装买手打造的智能工作台。支持截图识别待办、自动生成跟进任务、定向款排期、话术推荐、AI 改图与智能助理。

View your app in AI Studio: https://ai.studio/apps/drive/1BYBUNtQQ_hoo1EZ7CXYE5v2AQNsm6QmT

## Features

- **智能待办**: 截图识别任务，自动提取 ShopID 和优先级。
- **Temu 助理**: 专懂大码女装的 AI 助手，支持图片分析、多轮对话与**本地历史记录**。
- **智能改图**: AI 辅助修图，快速生成卖点图，支持**拖拽上传与历史回溯**。
- **话术推荐**: 针对商家抗拒点的专业话术库与 AI 实时分析。

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set the `API_KEY` in your environment variables to your Google Gemini API key.
3. Run the app:
   `npm run dev`

## Deploy to Vercel

1. **Import Project**: Import this repository to Vercel.
2. **Environment Variables**: In the Vercel project settings, add a new environment variable:
   - Name: `API_KEY`
   - Value: Your Google Gemini API Key (Must be a paid tier key for video/image generation features if used).
3. **Deploy**: Click Deploy.

**Troubleshooting**: If you see `ETARGET` or version errors for `@google/genai`, verify that `package.json` is using `"@google/genai": "latest"` and try redeploying with "Redeploy with Cache Cleared".
