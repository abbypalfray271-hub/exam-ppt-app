'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft,
  ChevronRight,
  Download,
  Presentation,
  FileSearch,
  Save,
  FolderOpen
} from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { exportToPpt } from '@/lib/exportPpt';
import { exportProjectJSON, importProjectJSON } from '@/lib/projectIO';
import { 
  buildSlides, 
  SlideData, 
  SlideFrame, 
  TitleSlide, 
  UnifiedSlide 
} from './SlidePreview';
import { ResizableHandle } from './ResizableHandle';

export const Editor = () => {
  const { projectName, questions, setView, removeQuestions, resetUpload, setCanvasOpen } = useProjectStore();
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  // 左侧缩略图栏宽度（可拖拽调整）
  const [leftPanelWidth, setLeftPanelWidth] = useState(144);

  const handleLeftResize = useCallback((dx: number) => {
    setLeftPanelWidth(prev => Math.max(80, Math.min(300, prev + dx)));
  }, []);
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
      return `题组 (${slide.questions.length}题)`;
    }
    return `题目`;
  };



  return (
    <div className="flex h-[calc(100vh-80px)] w-full overflow-hidden bg-gray-50/50 p-4 gap-3 relative">
      
      {/* ============================== */}
      {/* 左侧：幻灯片缩略图列表 */}
      {/* ============================== */}
      {isLeftPanelOpen && (
        <>
          <div className="shrink-0 glass-panel rounded-2xl border border-white overflow-hidden flex flex-col" style={{ width: leftPanelWidth }}>
            <div className="px-3 py-3 border-b bg-white/50 flex items-center justify-between">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                幻灯片 · {totalSlides}
              </h3>
              <button 
                onClick={() => setIsLeftPanelOpen(false)}
                className="p-1 hover:bg-red-600 rounded shadow-md text-white bg-red-500 transition-colors"
                title="收起幻灯片列表"
              >
                <ChevronLeft className="w-6 h-6" strokeWidth={3} />
              </button>
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
                    onDelete={slide.type === 'unified' ? () => {
                      if (confirm('确定要删除这一整页及包含的题目吗？')) {
                        const qIds = slide.questions.map(q => q.id);
                        removeQuestions(qIds);
                        // 如果删除了当前页或之前的页，调整索引防止溢出
                        if (idx <= currentSlideIdx) {
                          setCurrentSlideIdx(prev => Math.max(0, prev - 1));
                        }
                      }
                    } : undefined}
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
    
          {/* 左侧缩略图 ↔ 中间编辑区 可拖拽分隔条 */}
          <ResizableHandle onDrag={handleLeftResize} />
        </>
      )}

      {/* 收起时的悬浮展开按钮 */}
      {!isLeftPanelOpen && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 z-50 flex items-center justify-start h-32 w-10 group">
          <button
            onClick={() => setIsLeftPanelOpen(true)}
            className="p-2 bg-red-500 border border-red-600 border-l-0 shadow-2xl rounded-r-2xl text-white hover:bg-red-600 group-hover:pl-3 group-hover:w-10 w-8 transition-all"
            title="展开幻灯片列表"
          >
            <ChevronRight className="w-6 h-6" strokeWidth={3} />
          </button>
        </div>
      )}

      {/* ============================== */}
      {/* 中间：当前幻灯片放大编辑区 */}
      {/* ============================== */}
      <div className="flex-1 flex flex-col items-center justify-center relative">
        {/* 顶部工具栏 */}
        <div className="w-full flex items-center justify-between px-4 mb-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-black text-gray-500 uppercase tracking-widest">
            {currentSlide.type === 'title' ? '📋 封面页' 
                : `📝 题目组 (${currentSlide.questions.length} 道题目)`}
            </span>
            <span className="text-xs font-black text-white bg-brand-primary px-3 py-1 rounded-lg shadow-lg shadow-brand-primary/20">
              {currentSlideIdx + 1} / {totalSlides}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs font-black text-red-500 uppercase tracking-[0.2em]">
            点击文字可编辑 · 方向键翻页
          </div>
        </div>

        {/* 主幻灯片显示区：完全占满剩余空间 */}
        <div className="flex-1 w-full flex items-center justify-center px-4 overflow-hidden relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlideIdx}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="w-full h-full flex items-center justify-center"
            >
              {/* 利用 max-h-full 和 max-w-full 以及 aspect-video 确保在不溢出的情况下放到最大 */}
              <div className="w-full max-h-full aspect-[16/9] rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white shadow-brand-primary/10">
                <div className="w-full h-full relative">
                  {renderSlideContent(currentSlide, true)}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 底部导航栏 */}
        <div className="w-full flex items-center justify-between px-4 py-3">
          {/* 左侧留空，保持居中平衡 */}
          <div className="w-[200px]" />
          
          {/* 居中翻页器 */}
          <div className="flex items-center gap-4">
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

          {/* 右侧操作按钮 */}
          <div className="flex items-center gap-4 w-[320px] justify-end">
            <button
              onClick={() => {
                setView('upload');
                setCanvasOpen(true);
              }}
              className="w-[140px] h-12 bg-orange-500 text-white rounded-2xl font-black text-xs tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-orange-500/20 hover:bg-orange-600 hover:scale-105 transition-all active:scale-95 group"
            >
              <FileSearch className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
              返回解析
            </button>

            <button
              onClick={() => exportProjectJSON()}
              className="w-[140px] h-12 bg-gray-900 text-white rounded-2xl font-black text-xs tracking-widest flex items-center justify-center gap-2 shadow-xl hover:bg-gray-800 hover:scale-105 transition-all active:scale-95 group"
            >
              <Save className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
              存档
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};
