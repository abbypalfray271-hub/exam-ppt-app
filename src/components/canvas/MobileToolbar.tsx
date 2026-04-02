'use client';

import React from 'react';
import { LayoutList, Brain, Zap, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================
// 移动端底部悬浮操作栏
// 从 ExtractionCanvas.tsx 提取
// ============================================================

interface MobileToolbarProps {
  selectedPageCount: number;
  totalPageCount: number;
  isDeepThinking: boolean;
  isProcessing: boolean;
  progress: number;
  onOpenSidebar: () => void;
  onToggleDeepThinking: () => void;
  onSkip: () => void;
  onConfirm: () => void;
}

export const MobileToolbar: React.FC<MobileToolbarProps> = ({
  selectedPageCount,
  totalPageCount,
  isDeepThinking,
  isProcessing,
  progress,
  onOpenSidebar,
  onToggleDeepThinking,
  onSkip,
  onConfirm,
}) => {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 p-3 pb-safe bg-white/95 backdrop-blur-md border-t z-[80] shadow-[0_-10px_20px_rgba(0,0,0,0.05)] flex items-center justify-between gap-2.5">
      {/* 全局页面抽屉按钮 */}
      <button
        onClick={onOpenSidebar}
        className="flex flex-col items-center justify-center gap-1 w-[68px] h-[52px] bg-indigo-50 text-indigo-600 rounded-xl active:scale-95 transition-transform shrink-0"
      >
        <LayoutList className="w-5 h-5" />
        <span className="text-[10px] font-black leading-none">{selectedPageCount}/{totalPageCount}页</span>
      </button>

      {/* 深度思考 (Mobile) */}
      <button
        onClick={onToggleDeepThinking}
        className={cn(
          "flex flex-col items-center justify-center gap-1 w-[68px] h-[52px] rounded-xl active:scale-95 transition-all shrink-0 shadow-sm border",
          isDeepThinking ? "bg-purple-600 text-white border-purple-700" : "bg-gray-50 text-gray-400 border-gray-200"
        )}
      >
        {isDeepThinking ? <Brain className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
        <span className="text-[9px] font-black leading-none">深度思考</span>
      </button>

      <button
        onClick={onSkip}
        className="flex-1 h-[52px] bg-orange-500 text-white font-black text-[15px] rounded-xl shadow-[0_8px_20px_-6px_rgba(249,115,22,0.5)] active:scale-95 transition-all flex items-center justify-center shrink-0"
      >
        跳过
      </button>

      <button
        onClick={onConfirm}
        disabled={isProcessing}
        className="flex-[1.5] h-[52px] bg-brand-primary text-white font-black text-[15px] rounded-xl shadow-[0_8px_20px_-6px_rgba(59,130,246,0.5)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-80 transition-all flex items-center justify-center gap-2 shrink-0 border-none"
      >
        {isProcessing ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> {Math.floor(progress)}%</>
        ) : (
          <><CheckCircle2 className="w-5 h-5" /> 识别解析</>
        )}
      </button>
    </div>
  );
};
