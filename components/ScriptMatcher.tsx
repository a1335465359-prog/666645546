import React, { useState, useRef } from 'react';
import { MessageSquareText, Image as ImageIcon, Copy, Check, Sparkles, Loader2, X, Send } from 'lucide-react';
import { matchScript } from '../services/geminiService';
import { ScriptItem } from '../data/scriptLibrary';

const ScriptMatcher: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ analysis: string; recommendations: ScriptItem[] } | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (file: File) => {
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleImageSelect(e.target.files[0]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      const file = e.clipboardData.files[0];
      if (file.type.startsWith('image/')) {
        e.preventDefault();
        handleImageSelect(file);
      }
    }
  };

  const handleClearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAnalyze = async () => {
    if (!inputText && !selectedImage) return;
    setIsLoading(true);
    setResult(null);
    try {
      const res = await matchScript(inputText, selectedImage || undefined);
      setResult(res);
    } catch (error) {
      console.error(error);
      alert("分析失败，请重试");
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
    <div className="h-full flex flex-col md:flex-row overflow-hidden bg-white/40">
      {/* Left Panel: Input */}
      <div className="w-full md:w-[45%] flex flex-col border-r border-white/30 bg-white/30 backdrop-blur-md">
        <div className="p-6 pb-4 border-b border-white/20">
           <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
             <MessageSquareText size={20} className="text-slate-700" />
             商家对话分析
           </h2>
           <p className="text-xs text-slate-500 mt-1">粘贴聊天记录或截图，AI 帮你生成高情商回复。</p>
        </div>

        <div className="flex-1 flex flex-col p-6 gap-4 overflow-y-auto">
           {/* Text Input Area */}
           <div className="flex-1 min-h-[200px] bg-white/60 hover:bg-white/80 transition-colors rounded-xl border border-white/50 shadow-sm p-4 flex flex-col group focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:bg-white">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onPaste={handlePaste}
                placeholder="在此输入或粘贴商家发来的消息（支持直接粘贴截图）..."
                className="w-full h-full bg-transparent border-none outline-none resize-none text-slate-700 placeholder:text-slate-400 text-sm leading-relaxed"
              />
              
              {/* Image Preview inside input area */}
              {imagePreview && (
                <div className="relative mt-4 shrink-0 self-start group/image">
                  <img src={imagePreview} alt="Chat Screenshot" className="h-24 rounded-lg border border-slate-200 shadow-sm" />
                  <button 
                    onClick={handleClearImage}
                    className="absolute -top-2 -right-2 bg-slate-500 text-white rounded-full p-1 shadow-md hover:bg-slate-700 opacity-0 group-hover/image:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </div>
              )}
           </div>

           {/* Toolbar */}
           <div className="flex items-center justify-between mt-auto">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-slate-500 hover:text-slate-700 hover:bg-white/60 rounded-lg transition-colors"
                  title="上传截图"
                >
                  <ImageIcon size={18} />
                </button>
                <div className="h-4 w-[1px] bg-slate-300 mx-1"></div>
                <div className="flex gap-2">
                   {['觉得贵', '说忙', '怕压货'].map(tag => (
                     <button 
                        key={tag}
                        onClick={() => setInputText(prev => prev ? prev + ' ' + tag : tag)}
                        className="px-2 py-1 bg-white/40 border border-white/60 rounded-md text-[10px] text-slate-500 hover:bg-white hover:text-slate-700 transition-all"
                     >
                       {tag}
                     </button>
                   ))}
                </div>
              </div>

              <button
                onClick={handleAnalyze}
                disabled={isLoading || (!inputText && !selectedImage)}
                className={`
                   px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-sm
                   ${isLoading || (!inputText && !selectedImage)
                     ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                     : 'bg-slate-900 text-white hover:bg-black hover:shadow-md active:scale-95'
                   }
                `}
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                <span>生成回复</span>
              </button>
           </div>
        </div>
        
        <input type="file" ref={fileInputRef} onChange={onFileInputChange} accept="image/*" className="hidden" />
      </div>

      {/* Right Panel: Results */}
      <div className="flex-1 bg-white/20 backdrop-blur-sm p-6 overflow-y-auto flex flex-col">
         <div className="mb-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">AI 建议</h3>
         </div>

         {!result && !isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 opacity-60">
               <div className="w-16 h-16 bg-white/40 rounded-full flex items-center justify-center mb-4">
                  <Sparkles size={24} className="text-slate-300" />
               </div>
               <p className="text-sm font-medium">等待输入...</p>
            </div>
         )}

         {isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
               <Loader2 size={32} className="text-slate-800 animate-spin opacity-20" />
               <p className="text-sm text-slate-500 font-medium">正在分析对话逻辑...</p>
            </div>
         )}

         {result && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
               {/* Analysis Bubble */}
               <div className="bg-blue-50/50 border border-blue-100/60 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                     <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                     <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">潜台词分析</span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {result.analysis}
                  </p>
               </div>

               {/* Cards */}
               <div className="grid gap-4">
                  {result.recommendations.map((script, idx) => (
                     <div 
                        key={idx} 
                        className="group relative bg-white/80 hover:bg-white border border-white/60 hover:border-white rounded-xl p-5 shadow-sm hover:shadow-lg transition-all duration-300"
                     >
                        <div className="flex justify-between items-start mb-3">
                           <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100/80 text-slate-500 text-[10px] font-medium border border-slate-200/50">
                              {script.scenario}
                           </span>
                           <button 
                             onClick={() => handleCopy(script.content, idx)}
                             className={`
                               flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all
                               ${copiedIndex === idx 
                                  ? 'bg-green-500 text-white shadow-sm' 
                                  : 'bg-slate-50 text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-slate-900 hover:text-white'
                               }
                             `}
                           >
                             {copiedIndex === idx ? <Check size={12} /> : <Copy size={12} />}
                             {copiedIndex === idx ? '已复制' : '复制'}
                           </button>
                        </div>
                        <p className="text-slate-800 text-[15px] leading-relaxed whitespace-pre-wrap select-text font-medium">
                          {script.content}
                        </p>
                     </div>
                  ))}
               </div>
            </div>
         )}
      </div>
    </div>
  );
};

export default ScriptMatcher;