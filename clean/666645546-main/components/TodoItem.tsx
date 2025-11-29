import React, { useState, useEffect, useRef } from 'react';
import { Todo, Priority } from '../types';
import { AlertCircle, Copy, Check, MoreHorizontal, Calendar, Clock, Edit3, X } from 'lucide-react';

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Todo>) => void;
}

const PRIORITY_CONFIG = {
  [Priority.P0]: { label: 'P0', color: 'bg-rose-500 text-white border-rose-600', desc: '紧急' },
  [Priority.P1]: { label: 'P1', color: 'bg-orange-500 text-white border-orange-600', desc: '重要' },
  [Priority.P2]: { label: 'P2', color: 'bg-blue-500 text-white border-blue-600', desc: '正常' },
  [Priority.P3]: { label: 'P3', color: 'bg-emerald-500 text-white border-emerald-600', desc: '稍缓' },
  [Priority.P4]: { label: 'P4', color: 'bg-slate-400 text-white border-slate-500', desc: '待定' },
};

const TodoItem: React.FC<TodoItemProps> = ({ todo, onToggle, onDelete, onUpdate }) => {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [isOverdue, setIsOverdue] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(todo.title);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  
  const titleInputRef = useRef<HTMLInputElement>(null);
  const priorityMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (priorityMenuRef.current && !priorityMenuRef.current.contains(event.target as Node)) {
        setShowPriorityMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (!todo.deadline || todo.isCompleted) {
      setTimeLeft(null);
      setIsOverdue(false);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const diff = todo.deadline! - now;

      if (diff <= 0) {
        setTimeLeft("已截止");
        setIsOverdue(true);
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (days > 0) {
            setTimeLeft(`${days}天 ${hours}小时`);
        } else if (hours > 0) {
             setTimeLeft(`${hours}h ${minutes}m`);
        } else {
             setTimeLeft(`${minutes}m`);
        }
        setIsOverdue(false);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000); // Update every minute is enough
    return () => clearInterval(interval);
  }, [todo.deadline, todo.isCompleted]);

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (todo.shopId) {
        const cleanId = todo.shopId.replace(/[【】\[\]]/g, '');
        navigator.clipboard.writeText(cleanId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleTitleSave = () => {
    if (editTitleValue.trim() !== todo.title) {
        onUpdate(todo.id, { title: editTitleValue });
    }
    setIsEditingTitle(false);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
        const date = new Date(e.target.value).getTime();
        onUpdate(todo.id, { deadline: date });
    }
  };

  // Safe fallback for priority if old data exists
  const currentPriority = PRIORITY_CONFIG[todo.priority] ? todo.priority : Priority.P2;
  const pConfig = PRIORITY_CONFIG[currentPriority];

  return (
    <div className={`
        group relative flex items-start gap-3 p-3.5 rounded-xl transition-all duration-300 border
        ${todo.isCompleted 
            ? 'bg-transparent border-transparent opacity-50 grayscale-[0.5]' 
            : 'bg-white/60 hover:bg-white/90 border-transparent hover:border-white shadow-sm hover:shadow-md backdrop-blur-sm'
        }
    `}>
      {/* Priority Badge & Menu */}
      <div className="relative shrink-0 mt-0.5" ref={priorityMenuRef}>
          <button 
             onClick={() => !todo.isCompleted && setShowPriorityMenu(!showPriorityMenu)}
             className={`
                flex flex-col items-center justify-center w-9 h-9 rounded-lg border text-[10px] font-bold shadow-sm transition-transform active:scale-95
                ${pConfig.color}
                ${todo.isCompleted ? 'cursor-default' : 'cursor-pointer'}
             `}
          >
             <span>{pConfig.label}</span>
          </button>
          
          {showPriorityMenu && (
             <div className="absolute top-10 left-0 z-20 w-32 bg-white/90 backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl p-1 animate-in fade-in zoom-in-95 duration-100 ring-1 ring-black/5">
                {(Object.keys(PRIORITY_CONFIG) as Priority[]).map((p) => (
                   <button
                     key={p}
                     onClick={() => {
                        onUpdate(todo.id, { priority: p });
                        setShowPriorityMenu(false);
                     }}
                     className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 hover:bg-black/5 ${p === currentPriority ? 'bg-black/5' : ''}`}
                   >
                     <span className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[p].color.split(' ')[0]}`}></span>
                     <span className="text-slate-700">{p} - {PRIORITY_CONFIG[p].desc}</span>
                   </button>
                ))}
             </div>
          )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
         <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col flex-1 min-w-0">
               {isEditingTitle ? (
                 <div className="flex items-center gap-2">
                    <input 
                      ref={titleInputRef}
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      onBlur={handleTitleSave}
                      onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
                      className="w-full bg-white/50 border border-blue-400/50 rounded px-2 py-0.5 text-[15px] font-medium text-slate-900 outline-none"
                    />
                 </div>
               ) : (
                 <span 
                    onClick={(e) => {
                        if(e.detail === 2 && !todo.isCompleted) {
                            setIsEditingTitle(true);
                        }
                    }}
                    className={`
                        text-[15px] font-medium leading-tight cursor-text truncate pr-2 py-0.5 rounded transition-colors
                        ${todo.isCompleted ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-800 hover:bg-slate-900/5'}
                    `}
                    title="双击编辑标题"
                 >
                   {todo.title}
                 </span>
               )}
               
               {/* Metadata Row */}
               <div className="flex flex-wrap items-center gap-2 mt-2">
                  <div className="flex items-center gap-2">
                    <button 
                        onClick={() => onToggle(todo.id)}
                        className={`
                            flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all border
                            ${todo.isCompleted 
                                ? 'bg-slate-100 text-slate-500 border-slate-200' 
                                : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400 hover:text-blue-600'
                            }
                        `}
                    >
                        <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${todo.isCompleted ? 'bg-slate-400 border-slate-400 text-white' : 'border-slate-400'}`}>
                            {todo.isCompleted && <Check size={8} strokeWidth={4} />}
                        </div>
                        {todo.isCompleted ? '已完成' : '待办'}
                    </button>
                  </div>

                  {todo.shopId && (
                    <button 
                      onClick={handleCopyId}
                      className={`
                        inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium border border-slate-100 transition-colors
                        ${copied ? 'bg-green-50 text-green-600 border-green-200' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700'}
                      `}
                    >
                      {copied ? <Check size={10} /> : <Copy size={10} />}
                      <span className="font-mono tracking-tight">{todo.shopId.replace(/[【】]/g, '')}</span>
                    </button>
                  )}

                  {todo.quantity && (
                     <span className="px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">
                        {todo.quantity}
                     </span>
                  )}
               </div>
            </div>

            {/* Right Side: DDL / Actions */}
            <div className="flex flex-col items-end gap-1.5">
               
               {/* Date Picker Trigger */}
               <div className="relative group/date">
                   <div className={`
                       flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md transition-colors border
                       ${isOverdue && !todo.isCompleted ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-blue-200'}
                   `}>
                       <Clock size={12} className={isOverdue ? "text-red-500" : "text-slate-400"} />
                       <span>{timeLeft || (todo.actionTime ? todo.actionTime : "设置DDL")}</span>
                       
                       {/* Invisible Date Input covering the button */}
                       {!todo.isCompleted && (
                           <input 
                            type="datetime-local"
                            onChange={handleDateChange}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            title="修改截止时间"
                           />
                       )}
                   </div>
               </div>
               
               {/* Quick Actions on Hover */}
               <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                        onClick={() => setIsEditingTitle(!isEditingTitle)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="编辑标题"
                    >
                        <Edit3 size={12} />
                    </button>
                    <button 
                        onClick={() => onDelete(todo.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="删除"
                    >
                        <X size={12} />
                    </button>
               </div>

            </div>
         </div>
      </div>
    </div>
  );
};

export default TodoItem;