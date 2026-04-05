import React from 'react';
import { X, Presentation, Brain, Zap, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';


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
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b z-20 shadow-sm">
      <div className="flex items-center gap-4">
        {onClose && (
          <button onClick={onClose} className="p-2 bg-red-50 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all">
            <X className="w-5 h-5 stroke-[3px]" />
          </button>
        )}
        <div className="h-8 w-px bg-gray-200 mx-2" />
        <div className="flex bg-gray-100 p-1 rounded-xl">
          {(['question', 'answer', 'analysis', 'diagram'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setActiveDrawMode(p => p === mode ? null : mode)}
              className={cn(
                "px-5 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2",
                activeDrawMode === mode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <div className={cn("w-2 h-2 rounded-full", {
                'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]': mode === 'question',
                'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]': mode === 'answer',
                'bg-fuchsia-500 shadow-[0_0_8px_rgba(217,70,239,0.5)]': mode === 'analysis',
                'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]': mode === 'diagram'
              })} />
              {mode === 'question' ? '题目' : mode === 'answer' ? '答案' : mode === 'analysis' ? '分析' : '插图'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
          <button 
            onClick={onComplete}
            className="flex items-center gap-2 px-5 py-2 rounded-full border-2 border-gray-100 bg-white text-gray-500 hover:border-blue-200 hover:text-blue-600 transition-all group"
          >
            <Presentation className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-widest">演示页</span>
          </button>
          <button
            onClick={() => setIsDeepThinking(!isDeepThinking)}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-full border-2 transition-all",
              isDeepThinking ? "bg-indigo-600 border-indigo-600 text-white shadow-lg" : "bg-white border-gray-200 text-gray-500"
            )}
          >
            {isDeepThinking ? <Brain className="w-4 h-4 animate-pulse" /> : <Zap className="w-4 h-4" />}
            <span className="text-[10px] font-black uppercase tracking-widest">深度思考</span>
          </button>
          <button 
            onClick={onConfirm} 
            disabled={isProcessing} 
            className="px-10 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white text-sm font-black rounded-full shadow-xl hover:scale-105 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            识别并解析
          </button>
      </div>
    </div>
  );
};
