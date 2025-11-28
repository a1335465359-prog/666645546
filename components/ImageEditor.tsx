import React, { useState, useRef, useEffect } from 'react';
import { Upload, Wand2, Download, Image as ImageIcon, Loader2, RefreshCw, History, X, Trash2, Clock } from 'lucide-react';
import { editImage } from '../services/geminiService';

interface HistoryItem {
  id: string;
  timestamp: number;
  prompt: string;
  resultUrl: string; // Base64
}

const ImageEditor: React.FC = () => {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('image_editor_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  const saveToHistory = (item: HistoryItem) => {
    try {
      // Keep last 5 items to prevent localStorage quota issues (images are large)
      const newHistory = [item, ...history].slice(0, 5);
      setHistory(newHistory);
      localStorage.setItem('image_editor_history', JSON.stringify(newHistory));
    } catch (error) {
      console.error("Storage full, cannot save history", error);
      // Optional: alert user
    }
  };

  const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newHistory = history.filter(h => h.id !== id);
    setHistory(newHistory);
    localStorage.setItem('image_editor_history', JSON.stringify(newHistory));
  };

  const restoreFromHistory = (item: HistoryItem) => {
      setResultUrl(item.resultUrl);
      setPrompt(item.prompt);
      // Note: We cannot restore the 'original' File object easily for a new edit 
      // without storing the original base64 as well, which doubles storage usage.
      // For now, we just allow viewing/downloading the result.
      setShowHistory(false);
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
        alert("请上传图片文件 (JPG, PNG)");
        return;
    }
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target?.result as string);
    reader.readAsDataURL(file);
    setResultUrl(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      const file = e.clipboardData.files[0];
      if (file.type.startsWith('image/')) {
        e.preventDefault();
        processFile(file);
      }
    }
  };

  const handleGenerate = async () => {
    if (!selectedImage || !prompt.trim()) return;
    setIsLoading(true);
    try {
      const result = await editImage(selectedImage, prompt);
      setResultUrl(result);
      
      // Save to history on success
      saveToHistory({
        id: Date.now().toString(),
        timestamp: Date.now(),
        prompt: prompt,
        resultUrl: result
      });

    } catch (error) {
      alert("生成失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = (url?: string) => {
    const targetUrl = url || resultUrl;
    if (!targetUrl) return;
    const link = document.createElement('a');
    link.href = targetUrl;
    link.download = `buyermate-edited-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="h-full relative overflow-hidden flex" onPaste={handlePaste}>
      
      {/* History Sidebar */}
      <div 
         className={`
           absolute top-0 right-0 h-full w-80 bg-white shadow-2xl z-20 transition-transform duration-300 transform flex flex-col border-l border-slate-200
           ${showHistory ? 'translate-x-0' : 'translate-x-full'}
         `}
       >
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-purple-50/50">
             <h3 className="font-semibold text-purple-900 flex items-center gap-2">
               <History size={18} /> 生成历史
             </h3>
             <button 
               onClick={() => setShowHistory(false)}
               className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"
             >
               <X size={18} />
             </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
             {history.length === 0 ? (
               <div className="text-center py-10 text-slate-400 text-sm">
                 暂无生成记录
               </div>
             ) : (
               history.map(item => (
                 <div 
                   key={item.id}
                   onClick={() => restoreFromHistory(item)}
                   className="group bg-white border border-slate-200 hover:border-purple-300 rounded-xl p-2 cursor-pointer transition-all shadow-sm hover:shadow-md flex gap-3"
                 >
                    <div className="w-20 h-20 shrink-0 bg-slate-100 rounded-lg overflow-hidden border border-slate-100">
                       <img src={item.resultUrl} alt="History thumbnail" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 flex flex-col min-w-0 py-0.5">
                       <p className="text-xs font-medium text-slate-800 line-clamp-2 mb-auto" title={item.prompt}>
                         {item.prompt}
                       </p>
                       <div className="flex items-center justify-between mt-2">
                         <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Clock size={10} />
                            {new Date(item.timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                         </span>
                         <button 
                           onClick={(e) => deleteHistoryItem(e, item.id)}
                           className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                         >
                           <Trash2 size={12} />
                         </button>
                       </div>
                    </div>
                 </div>
               ))
             )}
          </div>
       </div>

      <div className="flex-1 flex flex-col p-6 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 shrink-0">
          <div>
            <h2 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
              <Wand2 className="text-purple-600" />
              AI 改图助手
            </h2>
            <p className="text-sm text-slate-500 mt-1">上传商家图，告诉 AI 怎么改（如：换个简约背景、加个复古滤镜）</p>
          </div>
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-xl transition-all border text-sm font-medium
              ${showHistory 
                ? 'bg-purple-100 text-purple-700 border-purple-200' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }
            `}
          >
            <History size={18} />
            <span className="hidden sm:inline">生成历史</span>
          </button>
        </div>

        {/* Main Workspace */}
        <div className="flex-1 flex gap-6 min-h-0">
          
          {/* Left: Input */}
          <div className="flex-1 flex flex-col gap-4">
            {/* Image Uploader */}
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                flex-1 relative rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center overflow-hidden group
                ${isDragging ? 'border-purple-500 bg-purple-50 scale-[0.99]' : ''}
                ${!isDragging && previewUrl ? 'border-transparent bg-slate-100' : ''}
                ${!isDragging && !previewUrl ? 'border-slate-300 hover:border-purple-400 bg-white/50 hover:bg-white/80' : ''}
              `}
            >
              {previewUrl ? (
                <>
                  <img src={previewUrl} alt="Original" className="w-full h-full object-contain p-4" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                     <p className="text-white font-medium flex items-center gap-2">
                       <RefreshCw size={16} /> 更换图片
                     </p>
                  </div>
                </>
              ) : (
                <div className="text-center p-6 pointer-events-none">
                  <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    {isDragging ? <Download size={24} className="animate-bounce" /> : <Upload size={20} />}
                  </div>
                  <p className="text-sm font-medium text-slate-700">
                      {isDragging ? '松开鼠标上传' : '点击上传 或 拖拽图片到这里'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">支持 JPG, PNG (也可 Ctrl+V 粘贴)</p>
                </div>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                className="hidden" 
                accept="image/*" 
              />
            </div>

            {/* Prompt Input */}
            <div className="shrink-0 bg-white/60 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-white/50">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">修改要求</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onPaste={handlePaste} 
                  placeholder="例如：去掉背景杂物、把衣服换成红色..."
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                />
                <button
                  onClick={handleGenerate}
                  disabled={isLoading || !selectedImage || !prompt}
                  className={`
                    px-6 rounded-xl font-medium text-sm flex items-center gap-2 transition-all
                    ${isLoading || !selectedImage || !prompt 
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                      : 'bg-purple-600 text-white hover:bg-purple-700 shadow-md shadow-purple-200 hover:scale-105 active:scale-95'
                    }
                  `}
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />}
                  {isLoading ? '生成中...' : '生成'}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Result */}
          <div className="flex-1 bg-white/40 backdrop-blur-sm rounded-2xl border border-white/40 p-1 flex flex-col relative shadow-inner">
             {resultUrl ? (
               <div className="relative w-full h-full rounded-xl overflow-hidden bg-[url('https://bg-patterns.netlify.app/bg-patterns/transparent.png')] bg-repeat">
                  <img src={resultUrl} alt="Result" className="w-full h-full object-contain" />
                  <button 
                    onClick={() => handleDownload()}
                    className="absolute bottom-4 right-4 bg-white text-slate-900 px-4 py-2 rounded-full font-medium text-sm shadow-lg hover:scale-105 active:scale-95 transition-transform flex items-center gap-2"
                  >
                    <Download size={16} /> 下载图片
                  </button>
               </div>
             ) : (
               <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                 <div className="w-16 h-16 rounded-2xl bg-slate-100/50 flex items-center justify-center mb-3">
                   <ImageIcon size={32} className="opacity-20" />
                 </div>
                 <p className="text-sm">效果图将在这里显示</p>
               </div>
             )}
             
             {isLoading && (
               <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-2xl">
                 <div className="flex flex-col items-center gap-3">
                   <Loader2 size={32} className="text-purple-600 animate-spin" />
                   <span className="text-sm font-medium text-slate-600">正在施展魔法...</span>
                 </div>
               </div>
             )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default ImageEditor;