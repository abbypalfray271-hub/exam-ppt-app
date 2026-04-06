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
  statusMessage?: string;
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
  statusMessage,
  onConfirm, 
  onComplete 
}) => {
  return (
    <div className="flex items-center !overflow-x-auto scrollbar-hide px-4 md:px-6 py-4 bg-white border-b z-20 shadow-sm flex-nowrap min-w-0">
      <div className="flex items-center gap-3 md:gap-4 shrink-0 flex-nowrap">
        {onClose && (
          <button 
            onClick={onClose} 
            className="flex flex-col items-center justify-center h-[52px] w-12 md:w-16 md:h-11 shrink-0 bg-red-500 text-white rounded-xl shadow-[0_8px_20px_-6px_rgba(239,68,68,0.5)] hover:bg-red-600 hover:scale-105 active:scale-95 transition-all"
            title="关闭"
          >
            <X className="w-5 h-5 md:w-6 md:h-6 stroke-[3px]" />
            <span className="text-[9px] md:hidden">关闭</span>
          </button>
        )}
        <div className="h-8 w-px bg-gray-200 mx-1 md:mx-2 shrink-0" />
        <div className="flex bg-gray-100/80 p-1 md:p-1.5 rounded-2xl gap-0.5 md:gap-1 shrink-0 flex-nowrap">
          {(['question', 'answer', 'analysis', 'diagram'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setActiveDrawMode(p => p === mode ? null : mode)}
              className={cn(
                "h-9 md:h-10 px-3 md:px-5 shrink-0 rounded-xl text-[10px] md:text-sm font-black uppercase tracking-widest transition-all duration-200 flex items-center gap-1.5 md:gap-2.5 active:scale-95 shadow-none flex-nowrap whitespace-nowrap",
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
              <div className={cn("w-2 md:w-2.5 h-2 md:h-2.5 rounded-full border border-white/20", {
                'bg-white': activeDrawMode === mode,
                'bg-blue-500': activeDrawMode !== mode && mode === 'question',
                'bg-rose-500': activeDrawMode !== mode && mode === 'answer',
                'bg-fuchsia-500': activeDrawMode !== mode && mode === 'analysis',
                'bg-emerald-500': activeDrawMode !== mode && mode === 'diagram'
              })} />
              <span className="whitespace-nowrap">{mode === 'question' ? '题目' : mode === 'answer' ? '答案' : mode === 'analysis' ? '分析' : '插图'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 中间状态栏 — 解析过程动态提示 */}
      <div className="flex-1 flex items-center justify-center px-3 min-w-0 overflow-hidden">
        {isProcessing && statusMessage ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 max-w-[240px] md:max-w-xs">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
            <span className="text-[11px] md:text-xs font-semibold text-blue-700 truncate">{statusMessage}</span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 md:gap-4 shrink-0 flex-nowrap pl-2 md:pl-4 pr-1 md:pr-2">
          <button 
            onClick={() => importProjectJSON()}
            className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 h-[52px] md:h-11 px-3 md:px-5 shrink-0 rounded-xl bg-orange-500 text-white font-black uppercase tracking-wider shadow-md hover:scale-[1.02] hover:bg-orange-600 transition-all active:scale-95 group flex-nowrap whitespace-nowrap"
            title="读入演稿"
          >
            <FolderOpen className="w-4 h-4 md:w-4 md:h-4" />
            <span className="text-[9px] md:text-sm md:inline">读入演稿</span>
          </button>
          
          <button 
            onClick={onComplete}
            className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 h-[52px] md:h-11 px-3 md:px-5 shrink-0 rounded-xl bg-slate-900 text-white font-black uppercase tracking-wider shadow-md hover:scale-[1.02] hover:bg-black transition-all active:scale-95 group flex-nowrap whitespace-nowrap"
            title="演示页"
          >
            <Presentation className="w-4 h-4 md:w-4 md:h-4" />
            <span className="text-[9px] md:text-sm md:inline">演示页</span>
          </button>

          <button
            onClick={() => setIsDeepThinking(!isDeepThinking)}
            className={cn(
              "flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 h-[52px] md:h-11 px-3 md:px-5 shrink-0 rounded-xl font-black uppercase tracking-wider transition-all active:scale-95 flex-nowrap whitespace-nowrap",
              isDeepThinking 
                ? "bg-indigo-600 text-white ring-4 ring-indigo-400/40 shadow-[0_6px_20px_-4px_rgba(99,102,241,0.6)]" 
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 border border-slate-200"
            )}
          >
            {isDeepThinking ? <Brain className="w-4 h-4 animate-pulse" /> : <Zap className="w-4 h-4" />}
            <span className="text-[9px] md:text-sm md:inline">深度思考</span>
          </button>

          <button 
            onClick={onConfirm} 
            disabled={isProcessing} 
            className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 h-[52px] md:h-11 px-4 md:px-8 shrink-0 bg-blue-600 text-white font-black uppercase tracking-wider rounded-xl shadow-[0_8px_20px_-6px_rgba(37,99,235,0.5)] hover:scale-[1.02] hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition-all mx-1 md:mx-2 whitespace-nowrap"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" />}
            <span className="text-[9px] md:text-sm md:inline">识别并解析</span>
          </button>
      </div>
    </div>
  );
};
