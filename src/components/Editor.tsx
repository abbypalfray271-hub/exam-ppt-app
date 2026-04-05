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
  FolderOpen,
  Trash2,
  Zap,
  Sparkles
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
  const { 
    projectName, questions, setView, removeQuestions, resetUpload, 
    setCanvasOpen, setQuestions, isMathOptimized, setMathOptimized 
  } = useProjectStore();
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  // 左侧缩略图栏宽度（可拖拽调整）
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);

  const handleLeftResize = useCallback((dx: number) => {
    setLeftPanelWidth(prev => Math.max(140, Math.min(600, prev + dx)));
  }, []);
  const thumbnailRefs = useRef<(HTMLDivElement | null)[]>([]);

  // --- 移动端手势响应：滑动隐藏左侧抽屉逻辑 ---
  const touchStartX = useRef<number | null>(null);
  
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    // 如果向左滑动超过 50px，且在手机屏幕下，则收起左侧浮动抽屉
    if (diff > 50 && window.innerWidth < 768) {
      setIsLeftPanelOpen(false);
    }
    touchStartX.current = null;
  };

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
  const renderSlideContent = (slide: SlideData, editable: boolean, forceMask: boolean = false) => {
    switch (slide.type) {
      case 'title':
        return <TitleSlide editable={editable} />;
      case 'unified':
        return <UnifiedSlide questions={slide.questions} editable={editable} forceMask={forceMask} />;
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
    <div className="flex flex-1 h-full w-full overflow-hidden bg-gray-50/50 p-2 md:p-4 gap-2 md:gap-3 relative">
      
      {/* ============================== */}
      {/* 左侧：幻灯片缩略图列表 */}
      {/* ============================== */}
      {isLeftPanelOpen && (
        <>
          <div 
            className="shrink-0 glass-panel rounded-2xl border border-white overflow-hidden flex flex-col absolute md:relative z-[60] md:z-auto top-4 bottom-4 left-4 md:top-auto md:bottom-auto md:left-auto shadow-2xl md:shadow-none" 
            style={{ width: leftPanelWidth }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="px-3 py-3 border-b bg-white/50 flex flex-col gap-2 group/sidebar-header">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  幻灯片 · {totalSlides}
                </h3>
                <button 
                  onClick={() => setIsLeftPanelOpen(false)}
                  className="p-1 hover:bg-red-600 rounded-lg shadow-sm text-white bg-red-500 transition-colors"
                  title="收起幻灯片列表"
                >
                  <ChevronLeft className="w-5 h-5" strokeWidth={3} />
                </button>
              </div>

              {/* 大尺寸醒目的一键删除按钮 */}
              <AnimatePresence>
                {totalSlides > 0 && (
                  <motion.button
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    onClick={() => {
                      if (window.confirm("确定要清空所有已提取的题目吗？该操作不可撤销。")) {
                        setQuestions([]);
                        setCurrentSlideIdx(0);
                      }
                    }}
                    className="w-full h-16 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-2xl shadow-md flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.98] font-black text-sm"
                    title="一键清除所有题目"
                  >
                    <Trash2 className="w-5 h-5" />
                    一键删除
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-hide">
              {slides.map((slide, idx) => (
                <div
                  key={idx}
                  ref={(el) => { thumbnailRefs.current[idx] = el; }}
                >
                  <SlideFrame
                    selected={idx === currentSlideIdx}
                    onClick={() => {
                      setCurrentSlideIdx(idx);
                      // 移动端选择后自动收起左侧悬浮抽屉
                      if (window.innerWidth < 768) {
                        setIsLeftPanelOpen(false);
                      }
                    }}
                    label={`${idx + 1}`}
                    className="w-full relative group/thumb"
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
                    {/* 缩略图中的几何深度推理指示器 */}
                    {slide.type === 'unified' && slide.questions.some(q => q.auxiliary_svg) && (
                      <div className="absolute bottom-1 right-1 p-1 bg-purple-500 rounded-lg shadow-lg z-20 scale-75 md:scale-90">
                        <Zap className="w-3 h-3 text-white fill-current" />
                      </div>
                    )}
                    {/* 缩略图强制打码：forceMask=true */}
                    <div className="pointer-events-none select-none">
                      {renderSlideContent(slide, false, true)}
                    </div>
                  </SlideFrame>
                </div>
              ))}
            </div>
          </div>
    
          {/* 左侧缩略图 ↔ 中间编辑区 可拖拽分隔条 (移动端隐藏，因为此时左侧是悬浮层) */}
          <div className="hidden md:block">
            <ResizableHandle onDrag={handleLeftResize} />
          </div>
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

      <div className="flex-1 flex flex-col items-center justify-center relative min-h-0 w-full overflow-hidden">
        {/* 顶部工具栏 - 高对比度药丸风格 */}
        <div className="w-full flex items-center justify-between px-4 mb-3">
          <div className="flex items-center gap-3">
            <div className="bg-[#1e293b] text-white px-4 py-1.5 rounded-2xl shadow-lg shadow-gray-200/50 flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-widest opacity-60">
                {currentSlide.type === 'title' ? 'PROJECT COVER' : 'QUESTION BLOCK'}
              </span>
              <div className="w-px h-3 bg-white/20 mx-1" />
              <span className="text-sm font-black tracking-tight">
                {currentSlide.type === 'title' ? '📋 封面页' : `📝 题组 (${currentSlide.questions.length} 题)`}
              </span>
            </div>
            <span className="text-xs font-bold text-gray-400 bg-white border border-gray-100 px-3 py-1.5 rounded-xl">
              SLIDE {currentSlideIdx + 1} / {totalSlides}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* 🦄 分式视觉美化按钮 [NEW MOVED] */}
            <button
              onClick={() => setMathOptimized(!isMathOptimized)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all duration-300",
                isMathOptimized 
                  ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/30 scale-105" 
                  : "bg-white/80 text-gray-500 hover:bg-white hover:text-brand-primary border border-gray-200"
              )}
              title={isMathOptimized ? "精修模式已开启：点击还原" : "点击开启公式精修 (将 a/b 转换为标准分式)"}
            >
              <Sparkles className={cn("w-3.5 h-3.5", isMathOptimized ? "animate-pulse" : "")} />
              <span>{isMathOptimized ? "精修中" : "优化显示"}</span>
            </button>
            <div className="hidden md:flex items-center gap-2 text-[10px] font-black text-[#1e293b]/30 uppercase tracking-[0.2em] bg-gray-100/50 px-4 py-1.5 rounded-full">
              Ready for Presentation · Use Arrow Keys
            </div>
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
              {/* 利用 md:aspect-video 确保在电脑端维持 PPT 比例，但在手机端 (竖屏) 则直接撑满全部剩余空间 */}
              <div className="w-full h-full md:max-h-full md:aspect-[16/9] rounded-2xl overflow-hidden flex flex-col shadow-2xl border border-gray-200 bg-white shadow-brand-primary/10">
                <div className="w-full flex-1 relative min-h-0">
                  {renderSlideContent(currentSlide, true, false)}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 底部导航栏：移动端采用竖向堆叠（翻页器上，按钮下），PC端采用水平分布 */}
        <div className="w-full flex flex-col md:flex-row items-center justify-between px-2 md:px-4 py-2 md:py-3 gap-3 md:gap-0 shrink-0">
          {/* 左侧留空，仅 PC 端保持居中平衡 */}
          <div className="hidden md:block md:w-[200px] shrink-0" />
          
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

          {/* 右侧操作按钮：移动端铺满，PC 端居右靠齐 */}
          <div className="flex flex-row flex-nowrap items-center gap-3 w-full md:w-[320px] justify-center md:justify-end shrink-0 pb-4 md:pb-0 pt-1">
            <button
              onClick={() => {
                setView('upload');
                setCanvasOpen(true);
              }}
              className="flex-1 min-w-0 h-12 md:h-12 bg-orange-500 text-white rounded-xl font-black text-sm tracking-wider flex items-center justify-center gap-2 shadow-[0_8px_20px_-6px_rgba(249,115,22,0.5)] hover:bg-orange-600 hover:scale-[1.02] transition-all active:scale-95 group"
            >
              <FileSearch className="w-5 h-5 shrink-0 group-hover:-translate-y-0.5 transition-transform" />
              <span className="truncate">返回</span>
            </button>

            <button
              onClick={() => exportProjectJSON()}
              className="flex-1 min-w-0 h-12 md:h-12 bg-gray-900 text-white rounded-xl font-black text-sm tracking-wider flex items-center justify-center gap-2 shadow-[0_8px_20px_-6px_rgba(17,24,39,0.5)] hover:bg-black hover:scale-[1.02] transition-all active:scale-95 group"
            >
              <Save className="w-5 h-5 shrink-0 group-hover:-translate-y-0.5 transition-transform" />
              <span className="truncate">存档</span>
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};
