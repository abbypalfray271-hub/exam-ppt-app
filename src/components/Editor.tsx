'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft,
  ChevronRight,
  Download,
  Presentation
} from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { exportToPpt } from '@/lib/exportPpt';
import { 
  buildSlides, 
  SlideData, 
  SlideFrame, 
  TitleSlide, 
  UnifiedSlide 
} from './SlidePreview';

export const Editor = () => {
  const { projectName, questions } = useProjectStore();
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const thumbnailRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 根据题目数据构建幻灯片序列 (原子分割后自动按素材分组)
  const slides = buildSlides(questions);
  const totalSlides = slides.length;
  const currentSlide = slides[currentSlideIdx] || slides[0];

  // 切换幻灯片时自动滚动缩略图到可视区域
  useEffect(() => {
    thumbnailRefs.current[currentSlideIdx]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [currentSlideIdx]);

  // 快捷键：左右箭头切换幻灯片
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果焦点在 input/textarea 中则不拦截
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') setCurrentSlideIdx(prev => Math.max(0, prev - 1));
      if (e.key === 'ArrowRight') setCurrentSlideIdx(prev => Math.min(totalSlides - 1, prev + 1));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalSlides]);

  /** 渲染一张幻灯片内容（不含外框） */
  const renderSlideContent = (slide: SlideData, editable: boolean) => {
    switch (slide.type) {
      case 'title':
        return <TitleSlide editable={editable} />;
      case 'unified':
        return <UnifiedSlide questions={slide.questions} editable={editable} />;
    }
  };

  /** 获取幻灯片标签文字 */
  const getSlideLabel = (slide: SlideData, idx: number) => {
    if (slide.type === 'title') return '封面';
    // 如果是一组题，显示 Q 范围
    if (slide.questions.length > 1) {
      return `Q组 (${slide.questions.length}题)`;
    }
    return `Q题`;
  };



  return (
    <div className="flex h-[calc(100vh-80px)] w-full overflow-hidden bg-gray-50/50 p-4 gap-3">
      
      {/* ============================== */}
      {/* 左侧：幻灯片缩略图列表 */}
      {/* ============================== */}
      <div className="w-48 shrink-0 glass-panel rounded-2xl border border-white overflow-hidden flex flex-col">
        <div className="px-3 py-3 border-b bg-white/50">
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            幻灯片 · {totalSlides}
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-hide">
          {slides.map((slide, idx) => (
            <div
              key={idx}
              ref={(el) => { thumbnailRefs.current[idx] = el; }}
            >
              <SlideFrame
                selected={idx === currentSlideIdx}
                onClick={() => setCurrentSlideIdx(idx)}
                label={`${idx + 1}`}
                className="w-full"
              >
                {/* 缩略图使用 pointer-events-none 防止交互 */}
                <div className="pointer-events-none select-none">
                  {renderSlideContent(slide, false)}
                </div>
              </SlideFrame>
            </div>
          ))}
        </div>
      </div>

      {/* ============================== */}
      {/* 中间：当前幻灯片放大编辑区 */}
      {/* ============================== */}
      <div className="flex-1 flex flex-col items-center justify-center relative">
        {/* 顶部工具栏 */}
        <div className="w-full flex items-center justify-between px-4 mb-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-500">
            {currentSlide.type === 'title' ? '📋 封面页' 
                : `📝 题目组 (${currentSlide.questions.length} 道题目)`}
            </span>
            <span className="text-[10px] font-black text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-full">
              {currentSlideIdx + 1} / {totalSlides}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            点击文字可编辑 · 方向键翻页
          </div>
        </div>

        {/* 主幻灯片显示区 */}
        <div className="flex-1 w-full flex items-center justify-center px-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlideIdx}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-4xl"
            >
              <div className="w-full aspect-[16/9] rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white">
                {renderSlideContent(currentSlide, true)}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 底部导航栏 */}
        <div className="w-full flex items-center justify-center gap-4 py-3">
          <button
            onClick={() => setCurrentSlideIdx(prev => Math.max(0, prev - 1))}
            disabled={currentSlideIdx === 0}
            className="p-2.5 bg-white rounded-full shadow-md border hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-white transition-all active:scale-95"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          
          {/* 快速跳转圆点 */}
          <div className="flex items-center gap-1.5 max-w-md overflow-x-auto scrollbar-hide px-2">
            {slides.map((slide, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentSlideIdx(idx)}
                className={cn(
                  "shrink-0 rounded-full transition-all duration-200",
                  idx === currentSlideIdx 
                    ? "w-6 h-2.5 bg-brand-primary" 
                    : "w-2.5 h-2.5 bg-gray-300 hover:bg-gray-400"
                )}
                title={getSlideLabel(slide, idx)}
              />
            ))}
          </div>
          
          <button
            onClick={() => setCurrentSlideIdx(prev => Math.min(totalSlides - 1, prev + 1))}
            disabled={currentSlideIdx >= totalSlides - 1}
            className="p-2.5 bg-white rounded-full shadow-md border hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-white transition-all active:scale-95"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* ============================== */}
      {/* 右侧：题目快速索引 + 导出 */}
      {/* ============================== */}
      <div className="w-56 shrink-0 flex flex-col gap-3">
        <div className="flex-1" />
        {/* 导出按钮 */}
        <button
          onClick={() => exportToPpt(questions, projectName)}
          className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-xs tracking-widest flex items-center justify-center gap-2 shadow-xl hover:bg-gray-800 transition-all active:scale-95 group"
        >
          <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
          导出 PPT
        </button>
      </div>
    </div>
  );
};
