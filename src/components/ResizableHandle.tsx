'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface ResizableHandleProps {
  /** 拖拽时的回调，dx 表示水平移动距离（像素） */
  onDrag: (dx: number) => void;
  /** 拖拽结束时的回调 */
  onDragEnd?: () => void;
  /** 额外的 className */
  className?: string;
}

/**
 * 可拖拽的垂直分隔条组件
 * 放置在两个水平排列的面板之间，允许用户通过拖拽来调整面板宽度
 */
export const ResizableHandle: React.FC<ResizableHandleProps> = ({ onDrag, onDragEnd, className }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startXRef.current = e.clientX;
    setIsDragging(true);
  }, []);

  // 全局 pointer 事件监听（仅在拖拽中激活）
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      const dx = e.clientX - startXRef.current;
      startXRef.current = e.clientX;
      onDrag(dx);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      onDragEnd?.();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, onDrag, onDragEnd]);

  return (
    <div
      onPointerDown={handlePointerDown}
      className={cn(
        "relative w-1.5 shrink-0 cursor-col-resize group select-none touch-none z-10",
        "flex items-center justify-center",
        isDragging ? "bg-brand-primary/20" : "hover:bg-gray-200/80",
        "transition-colors duration-150",
        className
      )}
    >
      {/* 中间的拖拽指示器小圆点 */}
      <div className={cn(
        "w-1 h-8 rounded-full transition-all duration-200",
        isDragging
          ? "bg-brand-primary scale-y-125"
          : "bg-gray-300 group-hover:bg-gray-400 group-hover:scale-y-110"
      )} />
    </div>
  );
};
