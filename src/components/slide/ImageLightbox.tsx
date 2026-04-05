import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { createPortal } from 'react-dom';

export interface ImageLightboxProps {
  src: string;
  onClose: () => void;
}

/**
 * 交互式滚动缩放灯箱 (支持 React Portal 挂载)
 * 技术栈：Framer Motion (Spring Physics) + React Hooks
 */
export const ImageLightbox: React.FC<ImageLightboxProps> = ({ src, onClose }) => {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // 核心逻辑：平滑滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    // 灵敏度控制：向上滚放大，向下滚缩小
    const delta = e.deltaY < 0 ? 1.15 : 0.85; 
    const newScale = Math.min(Math.max(0.5, scale * delta), 12); // 最高支持 12 倍放大
    setScale(newScale);

    // 回弹重置：当缩放接近原始比例时，清空偏移量
    if (newScale <= 1.05) {
      setOffset({ x: 0, y: 0 });
    }
  };

  // 核心逻辑：拖拽平移 (仅在放大状态激活)
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || scale <= 1) return;
    setOffset(prev => ({
      x: prev.x + e.movementX,
      y: prev.y + e.movementY
    }));
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000] bg-black/95 backdrop-blur-3xl flex items-center justify-center overflow-hidden touch-none"
        onWheel={handleWheel}
        onClick={onClose}
        onPointerDown={(e) => {
          if (scale > 1) {
            setIsDragging(true);
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }
        }}
        onPointerUp={(e) => {
          setIsDragging(false);
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        }}
        onPointerMove={handlePointerMove}
      >
        {/* 右上角悬浮控制栏 */}
        <div className="absolute top-8 right-8 z-50 flex items-center gap-4">
          <div className="bg-white/10 px-5 py-2.5 rounded-2xl border border-white/20 backdrop-blur-xl text-white text-[10px] font-black tracking-[0.2em] uppercase flex items-center gap-3">
             <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                <span>Zoomed {Math.round(scale * 100)}%</span>
             </div>
             <div className="w-px h-3 bg-white/20" />
             <span className="opacity-60">Interactive Mode</span>
          </div>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-14 h-14 bg-white text-black rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(0,0,0,0.5)] hover:scale-110 active:scale-90 transition-all text-2xl font-black border-4 border-black/10 z-50"
          >
            ✕
          </button>
        </div>

        {/* 动态渲染容器 */}
        <motion.div
          animate={{ 
            scale: scale,
            x: offset.x,
            y: offset.y,
            rotate: isDragging ? 0.2 : 0 // 增加微小的物理扭曲感
          }}
          transition={{ 
            type: 'spring', 
            damping: 30, 
            stiffness: 250, 
            mass: 0.8
          }}
          className={cn(
            "relative flex items-center justify-center p-4 transition-all duration-300",
            scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={src}
            alt="Large preview"
            className="max-w-[70vw] max-h-[70vh] md:max-w-[85vw] md:max-h-[85vh] object-contain rounded-2xl shadow-[0_0_120px_rgba(0,0,0,0.8)] border-4 border-white/30 select-none pointer-events-none"
            draggable={false}
          />
        </motion.div>
        
        {/* 底部操作反馈 */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 opacity-30 group pointer-events-none">
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center gap-1">
               <div className="w-8 h-8 rounded-lg border border-white/40 flex items-center justify-center mb-1">
                 <div className="w-1 h-3 bg-white/60 rounded-full" />
               </div>
               <span className="text-[9px] font-black text-white uppercase tracking-tighter">Scroll Zoom</span>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="flex flex-col items-center gap-1">
               <div className="w-8 h-8 rounded-lg border border-white/40 flex items-center justify-center mb-1">
                 <div className="w-3 h-3 border-2 border-white/60 rounded-sm" />
               </div>
               <span className="text-[9px] font-black text-white uppercase tracking-tighter">Drag Pan</span>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
