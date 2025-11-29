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
    <div className="h-full flex flex-col lg:flex-row gap-6 p-2 lg:p-0 overflow-hidden">
      {/* 左侧：输入区 */}
      <div className="flex-1 flex flex-col min-h-0 bg-white/60 backdrop-blur-md rounded-2xl border border-white/50 shadow-sm">
        <div className="px-6 py-4 border-b border-white/30">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <MessageSquare size={20} className="text-indigo-600" />
            商家对话分析
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            粘贴聊天记录或截图，AI 帮你生成高商南商回复。
          </p>
        </div>

        <div className="flex-1 flex flex-col p-4 min-h-0">
          <div className="flex-1 relative rounded-xl bg-white border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-100 transition-shadow">
            <textarea
              className="w-full h-full p-4 resize-none outline-none text-[15px] text-slate-800 placeholder:text-slate-400 leading-relaxed bg-transparent"
              placeholder="在此输入或粘贴商家发来的消息（支持直接粘贴截图）..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onPaste={(e) => {
                 if (e.clipboardData.files.length > 0) {
                     const file = e.clipboardData.files[0];
                     if (file.type.startsWith('image/')) {
                         e.preventDefault();
                         handleImageSelect(file);
                     }
                 }
              }}
            />
            
            {/* Image Preview Overlay */}
            {imagePreview && (
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 p-2 shadow-sm">
                 <div className="flex items-center gap-3">
                    <img src={imagePreview} alt="Preview" className="w-10 h-10 object-cover rounded-md border border-slate-200" />
                    <div className="flex flex-col">
                       <span className="text-xs font-medium text-slate-700">已添加图片</span>
                       <span className="text-[10px] text-slate-400">AI 将同时分析文字和图片</span>
                    </div>
                 </div>
                 <button 
                   onClick={handleRemoveImage}
                   className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-red-500 transition-colors"
                 >
                    <X size={16} />
                 </button>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={handleImageUploadClick}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-500 hover:bg-white hover:text-indigo-600 hover:shadow-sm transition-all text-sm font-medium"
            >
              <ImageIcon size={18} />
              <span className="hidden sm:inline">上传截图</span>
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

            <button
              onClick={handleSubmit}
              disabled={isLoading || (!inputText.trim() && !selectedImage)}
              className={`
                 flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm shadow-md transition-all
                 ${isLoading || (!inputText.trim() && !selectedImage)
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
                 }
              `}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  分析中...
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
      <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            AI 建议
          </h3>
          <div className="flex items-center gap-2 mt-1">
             <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
             <p className="text-xs text-slate-500">
               包含商家心理分析 + 话术推荐
             </p>
          </div>
        </div>

        <div className="flex-1 flex flex-col p-5 overflow-y-auto bg-slate-50/30">
          {!result && !isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                 <MessageSquare size={24} className="opacity-20" />
              </div>
              <p className="text-sm">等待输入...</p>
            </div>
          )}

          {isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500">
              <Loader2 className="animate-spin text-indigo-600" size={32} />
              <p className="text-sm font-medium">正在深度分析商家意图...</p>
            </div>
          )}

          {result && !isLoading && (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* 分析结果卡片 */}
              <div className="rounded-xl bg-blue-50/50 border border-blue-100 p-4">
                <div className="flex items-center gap-2 mb-3 text-indigo-900 text-sm font-bold">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                  潜台词分析
                </div>
                <p className="text-sm leading-relaxed text-slate-700 text-justify">
                  {result.analysis || "暂无分析内容"}
                </p>
              </div>

              {/* 推荐话术列表 */}
              <div className="space-y-4">
                {result.recommendations && result.recommendations.length > 0 ? (
                  result.recommendations.map((script, index) => (
                    <div
                      key={index}
                      className="group bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all relative"
                    >
                      <div className="mb-3">
                         <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200">
                           {script.scenario || script.category || "参考话术"}
                         </span>
                      </div>

                      <p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap select-text cursor-text">
                        {script.content}
                      </p>
                      
                      {/* Action Bar */}
                      <div className="mt-3 pt-3 border-t border-slate-50 flex justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleCopy(script.content, index)}
                          className={`
                            flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                            ${copiedIndex === index 
                              ? 'bg-green-50 text-green-700' 
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
                            }
                          `}
                        >
                          {copiedIndex === index ? (
                            <>
                              <Check size={14} /> 已复制
                            </>
                          ) : (
                            <>
                              <Copy size={14} /> 复制
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-slate-400 text-sm py-8 border-2 border-dashed border-slate-200 rounded-xl">
                    未生成具体话术建议，请尝试提供更多信息
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScriptMatcher;