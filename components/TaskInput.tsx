import React, { useState, useRef, useEffect } from 'react';
import { Image as ImageIcon, ArrowUp, X, Loader2 } from 'lucide-react';
import { analyzeImageAndText } from '../services/geminiService';
import { Priority, Todo } from '../types';

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

interface TaskInputProps {
  onAddTodos: (todos: Todo[]) => void;
}

const TaskInput: React.FC<TaskInputProps> = ({ onAddTodos }) => {
  const [text, setText] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLInputElement) return;
      if (target instanceof HTMLTextAreaElement && target !== textAreaRef.current) return;

      if (e.clipboardData && e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        if (file.type.startsWith('image/')) {
          e.preventDefault();
          handleImageSelect(file);
          textAreaRef.current?.focus();
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleImageSelect = (file: File) => {
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleImageSelect(e.target.files[0]);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!text.trim() && !selectedImage) return;

    setIsLoading(true);

    try {
      // Manual simple entry optimization
      const isSimpleText = !selectedImage && text.length < 20 && !text.match(/\d{5,}/);

      if (isSimpleText) {
        onAddTodos([{
          id: generateId(),
          title: text,
          priority: Priority.P2, // Default to Medium/Normal
          isCompleted: false,
          createdAt: Date.now(),
        }]);
        setText('');
      } else {
        const aiResponse = await analyzeImageAndText(text, selectedImage || undefined);
        
        const newTodos: Todo[] = aiResponse.tasks.map(task => ({
          id: generateId(),
          title: task.title,
          description: task.description,
          priority: (task.priority as Priority) || Priority.P2,
          isCompleted: false,
          createdAt: Date.now(),
          deadline: task.estimatedMinutes ? Date.now() + (task.estimatedMinutes * 60 * 1000) : undefined,
          shopId: task.shopId,
          quantity: task.quantity,
          actionTime: task.actionTime
        }));

        onAddTodos(newTodos);
        setText('');
        clearImage();
      }
    } catch (error) {
      console.error(error);
      alert("AI识别遇到问题，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className={`
        relative w-full rounded-2xl border transition-all duration-300 bg-white/80 backdrop-blur-xl shadow-lg
        ${isFocused ? 'ring-2 ring-blue-500/20 border-blue-400/60 shadow-xl scale-[1.01]' : 'border-slate-200/60 hover:border-slate-300'}
      `}
    >
      {/* Image Preview Banner */}
      {imagePreview && (
        <div className="px-4 pt-4 pb-2 flex items-start gap-4 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
          <div className="relative group shrink-0">
             <img src={imagePreview} alt="Upload" className="h-16 w-auto rounded-md border border-slate-200 shadow-sm" />
             <button onClick={clearImage} className="absolute -top-2 -right-2 bg-slate-800 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={12} />
             </button>
          </div>
          <div className="text-xs text-slate-500 py-1">
             <p className="font-medium text-slate-700">已添加截图</p>
             <p>AI将自动提取截图中的店铺ID和任务信息。</p>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="flex items-end gap-2 p-3">
         <textarea
          ref={textAreaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="✨ 输入工作内容，或 Ctrl+V 粘贴截图/ID..."
          className="w-full bg-transparent border-none outline-none text-slate-700 placeholder:text-slate-400 resize-none max-h-32 py-2.5 px-2"
          rows={1}
          style={{ minHeight: '44px' }} 
        />
        
        <div className="flex items-center gap-2 shrink-0 pb-1.5 pr-1">
           <button 
             onClick={() => fileInputRef.current?.click()}
             className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-xl transition-colors"
             title="上传图片"
           >
             <ImageIcon size={20} />
           </button>
           
           <button
            onClick={handleSubmit}
            disabled={isLoading || (!text && !selectedImage)}
            className={`
              h-9 px-4 rounded-xl transition-all flex items-center justify-center font-medium text-sm
              ${isLoading || (!text && !selectedImage)
                ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                : 'bg-slate-900 text-white hover:bg-slate-800 hover:scale-105 shadow-md active:scale-95'
              }
            `}
           >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : '添加'}
           </button>
        </div>
      </div>
      
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileInputChange} 
        className="hidden" 
        accept="image/*"
      />
    </div>
  );
};

export default TaskInput;