import React from 'react';
import { X, Presentation, Brain, Zap, Loader2, CheckCircle2, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { importProjectJSON } from '@/lib/projectIO';


export type DrawMode = 'question' | 'answer' | 'analysis' | 'diagram' | null;

export interface CanvasHeaderProps {
  onClose?: () => void;
  activeDrawMode: DrawMode;
  setActiveDrawMode: React.Dispatch<React.SetStateAction<DrawMode>>;
  isDeepThinking: boolean;
  setIsDeepThinking: React.Dispatch<React.SetStateAction<boolean>>;
  isProcessing: boolean;
  onConfirm: () => void;
  onComplete: () => void;
}

export const CanvasHeader: React.FC<CanvasHeaderProps> = ({ 
  onClose, 
  activeDrawMode, 
  setActiveDrawMode, 
  isDeepThinking, 
  setIsDeepThinking, 
  isProcessing, 
  onConfirm, 
  onComplete 
}) => {
  return (
    <div className="flex items-center !overflow-x-auto scrollbar-hide px-4 md:px-6 py-4 bg-white border-b z-20 shadow-sm flex-nowrap min-w-0">
      <div className="flex items-center gap-3 md:gap-4 shrink-0 flex-nowrap">
        {onClose && (
          <button 
            onClick={onClose} 
            className="w-10 h-10 shrink-0 flex items-center justify-center bg-red-500 text-white rounded-xl shadow-[0_8px_20px_-6px_rgba(239,68,68,0.5)] hover:bg-red-600 hover:scale-105 active:scale-95 transition-all"
            title="关闭"
          >
            <X className="w-6 h-6 stroke-[3px]" />
          </button>
        )}
        <div className="h-8 w-px bg-gray-200 mx-1 md:mx-2 shrink-0" />
        <div className="flex bg-gray-100/80 p-1.5 rounded-2xl gap-1 shrink-0 flex-nowrap">
          {(['question', 'answer', 'analysis', 'diagram'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setActiveDrawMode(p => p === mode ? null : mode)}
              className={cn(
                "h-10 px-5 shrink-0 rounded-xl text-sm font-black uppercase tracking-widest transition-all duration-200 flex items-center gap-2.5 active:scale-95 shadow-none flex-nowrap whitespace-nowrap",
                activeDrawMode === mode 
                  ? {
                    "bg-blue-600 text-white shadow-[0_4px_12px_-2px_rgba(37,99,235,0.4)]": mode === 'question',
                    "bg-rose-500 text-white shadow-[0_4px_12px_-2px_rgba(244,63,94,0.4)]": mode === 'answer',
                    "bg-fuchsia-500 text-white shadow-[0_4px_12px_-2px_rgba(217,70,239,0.4)]": mode === 'analysis',
                    "bg-emerald-500 text-white shadow-[0_4px_12px_-2px_rgba(16,185,129,0.4)]": mode === 'diagram',
                  }
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-200"
              )}
            >
              <div className={cn("w-2.5 h-2.5 rounded-full border border-white/20", {
                'bg-white': activeDrawMode === mode,
                'bg-blue-500': activeDrawMode !== mode && mode === 'question',
                'bg-rose-500': activeDrawMode !== mode && mode === 'answer',
                'bg-fuchsia-500': activeDrawMode !== mode && mode === 'analysis',
                'bg-emerald-500': activeDrawMode !== mode && mode === 'diagram'
              })} />
              {mode === 'question' ? '题目' : mode === 'answer' ? '答案' : mode === 'analysis' ? '分析' : '插图'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 md:gap-4 shrink-0 flex-nowrap ml-auto pl-6 pr-2">
          <button 
            onClick={() => importProjectJSON()}
            className="flex items-center gap-2 h-11 px-5 shrink-0 rounded-xl bg-orange-500 text-white font-black text-sm uppercase tracking-wider shadow-md hover:scale-[1.02] hover:bg-orange-600 transition-all active:scale-95 group flex-nowrap whitespace-nowrap"
          >
            <FolderOpen className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
            <span>读入演稿</span>
          </button>
          
          <button 
            onClick={onComplete}
            className="flex items-center gap-2 h-11 px-5 shrink-0 rounded-xl bg-slate-900 text-white font-black text-sm uppercase tracking-wider shadow-md hover:scale-[1.02] hover:bg-black transition-all active:scale-95 group flex-nowrap whitespace-nowrap"
          >
            <Presentation className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
            <span>演示页</span>
          </button>

          <button
            onClick={() => setIsDeepThinking(!isDeepThinking)}
            className={cn(
              "flex items-center gap-2 h-11 px-5 shrink-0 rounded-xl font-black text-sm uppercase tracking-wider transition-all active:scale-95 group shadow-[0_8px_20px_-6px_rgba(15,23,42,0.5)] flex-nowrap whitespace-nowrap",
              isDeepThinking ? "bg-slate-900 ring-4 ring-indigo-500/30 text-white" : "bg-slate-900 text-gray-300 hover:text-white"
            )}
          >
            {isDeepThinking ? <Brain className="w-4 h-4 animate-pulse text-indigo-400" /> : <Zap className="w-4 h-4" />}
            <span>深度思考</span>
          </button>

          <button 
            onClick={onConfirm} 
            disabled={isProcessing} 
            className="h-11 px-8 shrink-0 bg-blue-600 text-white font-black text-sm uppercase tracking-wider rounded-xl shadow-[0_8px_20px_-6px_rgba(37,99,235,0.5)] hover:scale-[1.02] hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2 mx-1 md:mx-2 whitespace-nowrap"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            识别并解析
          </button>
      </div>
    </div>
  );
};
