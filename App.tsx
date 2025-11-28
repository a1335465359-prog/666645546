import React, { useState, useEffect, useMemo } from 'react';
import { Todo, Priority } from './types';
import TaskInput from './components/TaskInput';
import TodoItem from './components/TodoItem';
import ImageEditor from './components/ImageEditor';
import ScriptMatcher from './components/ScriptMatcher';
import AiAssistant from './components/AiAssistant';
import { 
  Inbox, 
  CheckCircle2, 
  Layout, 
  Zap,
  Search,
  Quote,
  Palette,
  ShoppingBag,
  MessageSquare,
  ExternalLink,
  Bot
} from 'lucide-react';

const FASHION_QUOTES = [
  "“时尚永不眠，但现在你可以休息一下。”",
  "“爆款在路上，好运也在路上。”",
  "“审版要仔细，生活要随意。”",
  "“每一个爆款ID背后，都是你独到的眼光。”",
  "“今天只做P0的事，剩下的交给时间。”",
  "“清空的是库存，填满的是快乐。”",
  "“不要为了追赶潮流而迷失方向，你自己就是风向标。”",
  "“即使是最忙碌的买手，也要给自己留一杯咖啡的时间。”",
  "“优雅不是被注意，而是被记住。工作也是。”",
  "“与其在此刻纠结，不如在下一季惊艳。”"
];

const App: React.FC = () => {
  const [todos, setTodos] = useState<Todo[]>(() => {
    const saved = localStorage.getItem('buyer_todos');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Navigation State
  const [currentView, setCurrentView] = useState<'todos' | 'image-editor' | 'indie-chi' | 'script-matcher' | 'bot'>('todos');
  const [filter, setFilter] = useState<'all' | 'p0' | 'completed'>('all');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [quote, setQuote] = useState('');

  // Initial Quote
  useEffect(() => {
    const randomQuote = FASHION_QUOTES[Math.floor(Math.random() * FASHION_QUOTES.length)];
    setQuote(randomQuote);
  }, []);

  // Persistence
  useEffect(() => {
    localStorage.setItem('buyer_todos', JSON.stringify(todos));
  }, [todos]);

  const handleAddTodos = (newTodos: Todo[]) => {
    setTodos(prev => [...newTodos, ...prev]);
  };

  const handleToggleTodo = (id: string) => {
    setTodos(prev => prev.map(t => 
      t.id === id ? { ...t, isCompleted: !t.isCompleted } : t
    ));
  };

  const handleDeleteTodo = (id: string) => {
    setTodos(prev => prev.filter(t => t.id !== id));
  };

  const handleUpdateTodo = (id: string, updates: Partial<Todo>) => {
    setTodos(prev => prev.map(t => 
        t.id === id ? { ...t, ...updates } : t
    ));
  };

  // Sorting Logic: P0 -> P4, then by Deadline
  const sortedTodos = useMemo(() => {
    const priorityOrder = { [Priority.P0]: 0, [Priority.P1]: 1, [Priority.P2]: 2, [Priority.P3]: 3, [Priority.P4]: 4 };
    
    // Fallback for old data string priorities like "HIGH"
    const getScore = (p: string) => {
        if (p === 'HIGH') return 0;
        if (p === 'MEDIUM') return 2;
        if (p === 'LOW') return 3;
        return priorityOrder[p as Priority] ?? 5;
    };

    return [...todos].sort((a, b) => {
        // 1. Completion status (Active first)
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        
        // 2. Priority
        const scoreA = getScore(a.priority);
        const scoreB = getScore(b.priority);
        if (scoreA !== scoreB) return scoreA - scoreB;

        // 3. Deadline (Earliest first)
        if (a.deadline && b.deadline) return a.deadline - b.deadline;
        if (a.deadline) return -1;
        if (b.deadline) return 1;

        return b.createdAt - a.createdAt;
    });
  }, [todos]);

  const filteredTodos = sortedTodos.filter(todo => {
    // Search logic
    if (searchQuery) {
       const query = searchQuery.toLowerCase();
       const matches = todo.title.toLowerCase().includes(query) || 
                       todo.shopId?.includes(query) ||
                       todo.description?.toLowerCase().includes(query);
       if (!matches) return false;
    }

    if (filter === 'completed') return todo.isCompleted;
    if (todo.isCompleted) return false;

    if (filter === 'p0') {
        return todo.priority === Priority.P0 || (todo.priority as string) === 'HIGH';
    }
    
    return true;
  });

  const activeCount = todos.filter(t => !t.isCompleted).length;
  const p0Count = todos.filter(t => !t.isCompleted && (t.priority === Priority.P0 || (t.priority as string) === 'HIGH')).length;

  const renderContent = () => {
    switch (currentView) {
      case 'image-editor':
        return <ImageEditor />;
      case 'script-matcher':
        return <ScriptMatcher />;
      case 'bot':
        return <AiAssistant />;
      case 'indie-chi':
        const url = 'https://indie-chi.vercel.app/';
        const title = 'Indie Chi 选款';
        return (
           <div className="h-full flex flex-col bg-white">
              <div className="h-12 border-b border-slate-200 flex items-center justify-between px-6 bg-slate-50/50 shrink-0">
                 <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span>
                    <h2 className="font-semibold text-slate-700 text-sm">{title}</h2>
                 </div>
                 <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-md transition-colors">
                    <ExternalLink size={12} /> 在新窗口打开
                 </a>
              </div>
              <iframe 
                src={url} 
                className="flex-1 w-full border-none bg-white" 
                title={title}
              />
           </div>
        );
      default: // todos
        return (
          <>
            {/* Top Bar */}
            <div className="h-16 border-b border-mac-border flex items-center justify-between px-8 bg-white/40 backdrop-blur-md sticky top-0 z-10 shrink-0">
              <div className="flex flex-col">
                  <h2 className="font-semibold text-slate-800 flex items-center gap-2 text-lg">
                  {filter === 'all' && '工作台'}
                  {filter === 'p0' && '紧急事项 (P0)'}
                  {filter === 'completed' && '历史归档'}
                  </h2>
                  <span className="text-[10px] text-slate-500 font-medium">
                      {new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </span>
              </div>
              
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="搜索..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-white/50 border border-slate-200/50 focus:bg-white focus:border-blue-400/50 rounded-lg text-sm outline-none transition-all w-48 focus:w-64 placeholder-slate-400 shadow-sm"
                />
              </div>
            </div>

            {/* Todo List (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 scroll-smooth">
              {filteredTodos.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <Layout className="w-16 h-16 mb-4 opacity-10" />
                    <p className="text-sm font-medium opacity-50">暂无任务，享受当下</p>
                </div>
              ) : (
                <div className="space-y-3 pb-24">
                  {filteredTodos.map(todo => (
                    <TodoItem 
                      key={todo.id} 
                      todo={todo} 
                      onToggle={handleToggleTodo} 
                      onDelete={handleDeleteTodo}
                      onUpdate={handleUpdateTodo}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Input Area */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-50/90 via-slate-50/80 to-transparent pt-12">
              <div className="max-w-3xl mx-auto">
                  <TaskInput onAddTodos={handleAddTodos} />
              </div>
            </div>
          </>
        );
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center p-4 sm:p-8">
      {/* Main Window Container */}
      <div className="w-full max-w-6xl h-full max-h-[900px] glass-panel rounded-2xl flex overflow-hidden shadow-2xl">
        
        {/* Sidebar */}
        <div className="w-64 bg-mac-sidebar border-r border-mac-border flex flex-col pt-6 pb-4 hidden md:flex shrink-0">
          <div className="px-6 mb-8">
            <h1 className="text-sm font-bold tracking-wider text-slate-500 uppercase">Buyer Mate</h1>
            <p className="text-[10px] text-slate-400 mt-1 font-mono">v2.3.0</p>
          </div>

          <nav className="flex-1 px-4 space-y-1">
            <SidebarItem 
              icon={<Inbox size={18} />} 
              label="全部待办" 
              count={activeCount}
              active={currentView === 'todos' && filter === 'all'} 
              onClick={() => { setCurrentView('todos'); setFilter('all'); }} 
            />
            <SidebarItem 
              icon={<Zap size={18} />} 
              label="紧急事项 (P0)" 
              active={currentView === 'todos' && filter === 'p0'} 
              count={p0Count}
              onClick={() => { setCurrentView('todos'); setFilter('p0'); }} 
            />
             <SidebarItem 
              icon={<CheckCircle2 size={18} />} 
              label="已归档" 
              active={currentView === 'todos' && filter === 'completed'} 
              onClick={() => { setCurrentView('todos'); setFilter('completed'); }} 
            />

            <div className="pt-6 mt-2">
               <p className="px-3 mb-3 text-[10px] font-bold text-slate-400/80 uppercase tracking-widest">工具箱</p>
               <SidebarItem 
                  icon={<Bot size={18} />} 
                  label="Temu 助理" 
                  active={currentView === 'bot'} 
                  onClick={() => setCurrentView('bot')} 
                />
               <SidebarItem 
                  icon={<Palette size={18} />} 
                  label="智能改图" 
                  active={currentView === 'image-editor'} 
                  onClick={() => setCurrentView('image-editor')} 
                />
               <SidebarItem 
                  icon={<MessageSquare size={18} />} 
                  label="话术推荐" 
                  active={currentView === 'script-matcher'} 
                  onClick={() => setCurrentView('script-matcher')} 
                />
               <SidebarItem 
                  icon={<ShoppingBag size={18} />} 
                  label="Indie Chi 选款" 
                  active={currentView === 'indie-chi'} 
                  onClick={() => setCurrentView('indie-chi')} 
                />
            </div>
          </nav>

          <div className="px-6 mt-auto mb-4">
             <div className="p-4 bg-white/40 rounded-xl border border-white/40 shadow-sm relative overflow-hidden group hover:bg-white/60 transition-colors">
                <Quote className="absolute -top-1 -left-1 text-slate-200 w-8 h-8 opacity-50" />
                <p className="text-[11px] text-slate-500 font-medium italic relative z-10 leading-relaxed">
                   {quote}
                </p>
             </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col bg-white/40 relative backdrop-blur-3xl min-w-0">
           {renderContent()}
        </div>
      </div>
    </div>
  );
};

// Sub-component for sidebar items - Updated style
const SidebarItem = ({ icon, label, count, active, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group ${
      active 
        ? 'bg-black/5 text-slate-900' 
        : 'text-slate-500 hover:bg-black/5 hover:text-slate-700'
    }`}
  >
    <div className={`flex items-center gap-3 ${active ? 'text-slate-900' : 'text-slate-500 group-hover:text-slate-700'}`}>
      {React.cloneElement(icon, { size: 18, strokeWidth: active ? 2.5 : 2, className: 'transition-all' })}
      <span>{label}</span>
    </div>
    {count !== undefined && count > 0 && (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-white shadow-sm text-slate-700' : 'bg-transparent text-slate-400 group-hover:bg-slate-200/50'}`}>
        {count}
      </span>
    )}
  </button>
);

export default App;