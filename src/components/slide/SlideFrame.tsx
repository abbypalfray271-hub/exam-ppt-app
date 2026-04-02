'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

// ============================================================
// 单张幻灯片容器（16:9 固定比例 + 页码标签 + 可删除）
// 从 SlidePreview.tsx 提取
// ============================================================

interface SlideFrameProps {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  label?: string;
  onDelete?: () => void;
}

export const SlideFrame: React.FC<SlideFrameProps> = ({ children, selected, onClick, className, label, onDelete }) => {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "relative cursor-pointer group transition-all duration-200",
        className
      )}
    >
      {/* 16:9 比例容器 */}
      <div className={cn(
        "relative w-full aspect-[16/9] rounded-xl overflow-hidden shadow-md border-2 transition-all duration-200",
        selected 
          ? "border-brand-primary shadow-lg shadow-brand-primary/20 ring-2 ring-brand-primary/30"
          : "border-transparent hover:border-gray-300 hover:shadow-lg"
      )}>
        {children}
      </div>
      {/* 页码标签 */}
      {label && (
        <div className={cn(
          "absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-black px-2 py-0.5 rounded-full transition-colors",
          selected 
            ? "bg-brand-primary text-white"  
            : "bg-gray-200 text-gray-500 group-hover:bg-gray-300"
        )}>
          {label}
        </div>
      )}
      
      {/* 鼠标悬浮显示的删除按钮 */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-1 -right-1 p-1 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:scale-110 active:scale-90 z-20"
          title="删除此页"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
