import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Image as ImageIcon, X, History, Plus, MessageSquare, Trash2 } from 'lucide-react';
import { chatWithBuyerAI } from '../services/geminiService';

interface Message {
  role: 'user' | 'model';
  text: string;
  image?: string; // base64 string for display
}

interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: Message[];
}

const AiAssistant: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: '你好！我是 Temu 大码女装买手助理。不管是写 Listing、核算成本，还是怼商家，我都能帮你。今天我们推哪个款？' }
  ]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const savedSessions = localStorage.getItem('temu_chat_sessions');
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        setSessions(parsed);
      } catch (e) {
        console.error("Failed to load chat history", e);
      }
    }
  }, []);

  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('temu_chat_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, imagePreview]);

  const startNewChat = () => {
    const initialMsg: Message = { role: 'model', text: '你好！我是 Temu 大码女装买手助理。不管是写 Listing、核算成本，还是怼商家，我都能帮你。今天我们推哪个款？' };
    setMessages([initialMsg]);
    setCurrentSessionId(null);
    setShowHistory(false);
    setInput('');
    clearImage();
  };

  const loadSession = (session: ChatSession) => {
    setMessages(session.messages);
    setCurrentSessionId(session.id);
    setShowHistory(false);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== id);
    setSessions(newSessions);
    localStorage.setItem('temu_chat_sessions', JSON.stringify(newSessions));
    
    if (currentSessionId === id) {
      startNewChat();
    }
  };

  const handleImageSelect = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      const file = e.clipboardData.files[0];
      handleImageSelect(file);
      e.preventDefault();
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleImageSelect(e.target.files[0]);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const saveCurrentSession = (updatedMessages: Message[]) => {
    const timestamp = Date.now();
    let title = '新对话';
    const firstUserMsg = updatedMessages.find(m => m.role === 'user');
    if (firstUserMsg) {
      title = firstUserMsg.text.slice(0, 15) || '[图片]';
    }

    if (currentSessionId) {
      setSessions(prev => prev.map(s => 
        s.id === currentSessionId 
          ? { ...s, messages: updatedMessages, timestamp, title } 
          : s
      ));
    } else {
      const newId = Date.now().toString();
      const newSession: ChatSession = {
        id: newId,
        title,
        timestamp,
        messages: updatedMessages
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newId);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      text: input,
      image: imagePreview || undefined
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    saveCurrentSession(newMessages);

    setInput('');
    const currentImage = selectedImage;
    clearImage();
    setIsLoading(true);

    try {
      // Build history for the service.
      // We pass the raw parts to the service. The service handles the strict JSON conversion (snake_case).
      // Here we use camelCase 'inlineData' because we might be using it locally, 
      // but to be safe, we let the service helper convert it.
      // Actually, let's just construct simple objects and let service map them.
      const historyForApi = newMessages.map(msg => {
         const parts = [];
         if (msg.image) {
             // msg.image is "data:image/png;base64,..."
             const base64Data = msg.image.split(',')[1];
             // Pass object with explicit keys so service can find them
             // Using camelCase here to match the service's expected input for "legacy" checks or just standard js objects
             // The updated geminiService.ts handles `inlineData` OR `inline_data`.
             parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64Data } });
         }
         if (msg.text) {
             parts.push({ text: msg.text });
         }
         return {
             role: msg.role,
             parts: parts
         };
      });

      const responseText = await chatWithBuyerAI(historyForApi, userMessage.text, currentImage || undefined);
      
      const finalMessages = [...newMessages, { role: 'model', text: responseText } as Message];
      setMessages(finalMessages);
      saveCurrentSession(finalMessages);

    } catch (error) {
      console.error(error);
      const errorMessages = [...newMessages, { role: 'model', text: '抱歉，助理稍微开了个小差，请重试一下。' } as Message];
      setMessages(errorMessages);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full relative overflow-hidden">
       {/* Sidebar Overlay (History) */}
       <div 
         className={`
           absolute top-0 right-0 h-full w-72 bg-white shadow-2xl z-20 transition-transform duration-300 transform flex flex-col border-l border-slate-200
           ${showHistory ? 'translate-x-0' : 'translate-x-full'}
         `}
       >
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
             <h3 className="font-semibold text-slate-700 flex items-center gap-2">
               <History size={18} /> 历史对话
             </h3>
             <button 
               onClick={() => setShowHistory(false)}
               className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"
             >
               <X size={18} />
             </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
             {sessions.length === 0 ? (
               <div className="text-center py-10 text-slate-400 text-sm">
                 暂无历史记录
               </div>
             ) : (
               sessions.map(session => (
                 <div 
                   key={session.id}
                   onClick={() => loadSession(session)}
                   className={`
                     group flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all border
                     ${currentSessionId === session.id 
                        ? 'bg-indigo-50 border-indigo-100' 
                        : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-100'
                     }
                   `}
                 >
                    <div className="mt-1 text-indigo-500 shrink-0">
                       <MessageSquare size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                       <p className={`text-sm font-medium truncate ${currentSessionId === session.id ? 'text-indigo-900' : 'text-slate-700'}`}>
                         {session.title}
                       </p>
                       <p className="text-[10px] text-slate-400 mt-1">
                         {new Date(session.timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                       </p>
                    </div>
                    <button 
                       onClick={(e) => deleteSession(e, session.id)}
                       className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                    >
                       <Trash2 size={14} />
                    </button>
                 </div>
               ))
             )}
          </div>
       </div>

       {/* Main Chat Area */}
       <div className="flex-1 flex flex-col h-full bg-white/40 backdrop-blur-md min-w-0">
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/30 flex items-center justify-between bg-white/30 shrink-0">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white shadow-md">
                   <Bot size={24} />
                </div>
                <div>
                   <h2 className="font-bold text-slate-800">Temu 买手助理</h2>
                   <p className="text-xs text-slate-500">24小时在线 • 懂选品 • 懂运营</p>
                </div>
             </div>
             
             <div className="flex items-center gap-2">
                <button 
                  onClick={startNewChat}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/50 hover:bg-white text-slate-600 rounded-lg text-xs font-medium border border-white/50 transition-all shadow-sm"
                  title="新对话"
                >
                  <Plus size={14} />
                  <span className="hidden sm:inline">新对话</span>
                </button>
                <button 
                  onClick={() => setShowHistory(!showHistory)}
                  className={`
                    p-2 rounded-lg transition-all border
                    ${showHistory 
                      ? 'bg-indigo-100 text-indigo-600 border-indigo-200' 
                      : 'bg-white/50 hover:bg-white text-slate-600 border-white/50'
                    }
                  `}
                  title="历史记录"
                >
                  <History size={18} />
                </button>
             </div>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
             {messages.map((msg, idx) => (
                <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                   <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-slate-700 text-white' : 'bg-indigo-600 text-white'}`}>
                      {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                   </div>
                   
                   <div className={`flex flex-col gap-2 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      {msg.image && (
                         <img src={msg.image} alt="Sent content" className="max-w-[240px] rounded-lg border border-white/50 shadow-sm bg-white" />
                      )}
                      {msg.text && (
                          <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm whitespace-pre-wrap ${
                              msg.role === 'user' 
                                ? 'bg-slate-800 text-white rounded-tr-sm' 
                                : 'bg-white text-slate-800 rounded-tl-sm border border-white/50'
                          }`}>
                             {msg.text}
                          </div>
                      )}
                   </div>
                </div>
             ))}
             {isLoading && (
               <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                     <Bot size={16} className="text-white" />
                  </div>
                  <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm border border-white/50 flex items-center gap-2">
                     <Loader2 size={16} className="animate-spin text-indigo-600" />
                     <span className="text-xs text-slate-500 font-medium">思考中...</span>
                  </div>
               </div>
             )}
             <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white/60 border-t border-white/30 backdrop-blur-md shrink-0">
             <div className="relative bg-white border border-slate-200 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all overflow-hidden">
                
                {/* Image Preview */}
                {imagePreview && (
                  <div className="px-4 pt-3 pb-1 flex items-start gap-3 bg-slate-50 border-b border-slate-100">
                     <div className="relative group">
                        <img src={imagePreview} alt="Preview" className="h-16 rounded-md border border-slate-200" />
                        <button 
                          onClick={clearImage}
                          className="absolute -top-1.5 -right-1.5 bg-slate-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-red-500"
                        >
                           <X size={10} />
                        </button>
                     </div>
                     <div className="text-xs text-slate-400 pt-1">
                        已添加图片
                     </div>
                  </div>
                )}

                <div className="flex items-end gap-2 p-2">
                   <button 
                     onClick={() => fileInputRef.current?.click()}
                     className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors shrink-0"
                     title="上传图片"
                   >
                      <ImageIcon size={20} />
                   </button>
                   
                   <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onPaste={handlePaste}
                      onKeyDown={(e) => {
                         if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                         }
                      }}
                      placeholder="输入消息，支持 Ctrl+V 粘贴截图..."
                      className="flex-1 max-h-32 min-h-[40px] py-2 bg-transparent border-none outline-none text-sm text-slate-800 placeholder:text-slate-400 resize-none"
                      rows={1}
                   />

                   <button
                      onClick={handleSend}
                      disabled={isLoading || (!input.trim() && !selectedImage)}
                      className={`
                         p-2 rounded-xl transition-all shrink-0
                         ${isLoading || (!input.trim() && !selectedImage)
                            ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md active:scale-95'
                         }
                      `}
                   >
                      <Send size={18} />
                   </button>
                </div>
             </div>
             <input type="file" ref={fileInputRef} onChange={onFileInputChange} accept="image/*" className="hidden" />
          </div>
       </div>
    </div>
  );
};

export default AiAssistant;