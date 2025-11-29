import React, { useState, useRef } from "react";
import {
  MessageSquare,
  Image as ImageIcon,
  Copy,
  Check,
  Sparkles,
  Loader2,
  X,
  Send,
} from "lucide-react";
import { matchScript } from "../services/geminiService";
import { ScriptItem } from "../data/scriptLibrary";

const ScriptMatcher: React.FC = () => {
  const [inputText, setInputText] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    analysis: string;
    recommendations: ScriptItem[];
  } | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (file: File) => {
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!inputText.trim() && !selectedImage) {
      alert("请先输入商家对话，或者上传一张截图再分析～");
      return;
    }

    try {
      setIsLoading(true);
      setResult(null);

      const data = await matchScript(inputText, selectedImage ?? undefined);
      setResult(data);
    } catch (error) {
      console.error(error);
      alert("分析失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-6">
      {/* 左侧：输入区 */}
      <div className="flex-1 flex flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-semibold text-slate-900 flex items-center gap-2">
              <MessageSquare size={20} />
              商家对话分析
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              粘贴聊天记录或截图，AI 帮你生成高商南商回复。
            </p>
          </div>
        </div>

        <div className="bg-white/80 rounded-2xl shadow-sm border border-slate-100 p-4 flex-1 flex flex-col">
          <textarea
            className="flex-1 w-full resize-none bg-transparent outline-none text-[15px] text-slate-900 placeholder:text-slate-400 leading-relaxed"
            placeholder="在此输入或粘贴商家发来的消息（支持直接粘贴截图图）…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />

          {/* 图片预览 */}
          {imagePreview && (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-200">
                  <img
                    src={imagePreview}
                    alt="预览"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="text-sm text-slate-600">
                  已选择截图，用于辅助理解对话内容
                </div>
              </div>
              <button
                onClick={handleRemoveImage}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* 底部操作条 */}
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={handleImageUploadClick}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors"
              >
                <ImageIcon size={16} />
                上传截图
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageSelect(file);
                }}
              />
              <span className="text-xs text-slate-400">
                支持：商家聊天截图、坑位截图等
              </span>
            </div>

            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  分析中…
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  生成回复
                  <Send size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 右侧：AI 建议 */}
      <div className="flex-1 flex flex-col">
        <div className="mb-4">
          <h3 className="text-[16px] font-semibold text-slate-900 flex items-center gap-2">
            <Sparkles size={18} />
            AI 建议
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            包含商家心理分析 + 话术推荐，可一键复制发送。
          </p>
        </div>

        <div className="flex-1 bg-white/80 rounded-2xl shadow-sm border border-slate-100 p-4 overflow-hidden flex flex-col">
          {!result && !isLoading && (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              等待输入…
            </div>
          )}

          {isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
              <Loader2 className="animate-spin" size={20} />
              正在为你分析商家话术…
            </div>
          )}

          {result && !isLoading && (
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2">
              {/* 分析结果 */}
              <div className="rounded-xl bg-slate-50/80 border border-slate-100 p-3">
                <div className="flex items-center gap-2 mb-2 text-slate-700 text-sm font-medium">
                  <MessageSquare size={16} />
                  商家心理 & 核心诉求
                </div>
                <p className="text-[14px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                  {result.analysis}
                </p>
              </div>

              {/* 推荐话术 */}
              <div className="space-y-3">
                {result.recommendations.map((script, index) => (
                  <div
                    key={index}
                    className="group rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-100/80 transition-colors p-3"
                  >
             <div className="flex items-center justify-between mb-2 gap-2">
  <div className="flex flex-col">
    <span className="text-xs font-semibold text-slate-500">
      {script.category || "推荐话术"}
    </span>

    {script.scenario && (
      <span className="text-sm font-medium text-slate-800 mt-0.5">
        {script.scenario}
      </span>
    )}
  </div>

  <button
    onClick={() => handleCopy(script.content, index)}
    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-[11px] text-slate-600"
  >
    {copiedIndex === index ? (
      <>
        <Check size={12} />
        已复制
      </>
    ) : (
      <>
        <Copy size={12} />
        复制
      </>
    )}
  </button>
</div>

                    <p className="text-[14px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                      {script.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScriptMatcher;
