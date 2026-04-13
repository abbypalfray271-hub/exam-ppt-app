'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
  Sparkles,
  Monitor,
  MoreHorizontal,
  Maximize,
  Minimize
} from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { exportToPpt } from '@/lib/exportPpt';
import { exportProjectJSON, importProjectJSON } from '@/lib/projectIO';
import { useShortcuts } from '@/hooks/useShortcuts';
import { 
  buildSlides, 
  SlideData, 
  SlideFrame, 
  TitleSlide, 
  UnifiedSlide 
} from './SlidePreview';
import { ResizableHandle } from './ResizableHandle';

// ============================================================
// 缩略图内容缓存组件：避免每次父组件状态变更时全量重绘幻灯片内容
// 仅当 slide 类型或 questions 引用变化时才重新渲染
// ============================================================
const MemoizedThumbnailContent = React.memo(({ slide }: { slide: SlideData }) => {
  switch (slide.type) {
    case 'title':
      return <TitleSlide editable={false} />;
    case 'unified':
      return <UnifiedSlide questions={slide.questions} editable={false} forceMask={true} />;
  }
}, (prev, next) => {
  // 自定义浅比较：slide 类型相同且 questions 引用未变化时跳过重渲染
  if (prev.slide.type !== next.slide.type) return false;
  if (prev.slide.type === 'unified' && next.slide.type === 'unified') {
    return prev.slide.questions === next.slide.questions;
  }
  return true;
});
MemoizedThumbnailContent.displayName = 'MemoizedThumbnailContent';

// ============================================================
// 缩略图懒渲染容器：使用 IntersectionObserver 实现可视区域检测
// 离屏缩略图仅显示骨架占位，进入视口后才渲染完整组件树
// ============================================================
const LazyThumbnail = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { rootMargin: '200px' } // 提前 200px 开始渲染，减少滚动时的闪烁
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {isVisible ? children : (
        <div className="w-full aspect-[16/9] bg-gray-100 animate-pulse rounded-lg" />
      )}
    </div>
  );
};

export const Editor = () => {
  const { 
    projectName, questions, setView, removeQuestions, resetUpload, 
    setCanvasOpen, setQuestions, isMathOptimized, setMathOptimized 
  } = useProjectStore();
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  // 左侧缩略图栏宽度（可拖拽调整）
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  
  // 伪全屏状态 (应用内的 CSS 放大与遮罩，为了兼容 iOS)
  const [isCSSFullscreen, setIsCSSFullscreen] = useState(false);
  
  // 监听浏览器原生全屏状态
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(e => console.error(e));
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

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

  // ============================================================
  // 全局快捷键调度
  // ============================================================
  useShortcuts(useMemo(() => ({
    'ArrowLeft': () => setCurrentSlideIdx(prev => Math.max(0, prev - 1)),
    'ArrowRight': () => setCurrentSlideIdx(prev => Math.min(totalSlides - 1, prev + 1)),
    ' ': (e) => {
      // 在全屏模式下，空格键等于下一页
      if (document.fullscreenElement) {
        e.preventDefault(); // 阻止页面默认滚动
        setCurrentSlideIdx(prev => Math.min(totalSlides - 1, prev + 1));
      }
    },
    'f': (e) => {
      e.preventDefault();
      toggleFullscreen();
    },
    'Escape': () => {
      // 各种退出逻辑聚合，虽然浏览器自带全屏 Esc 退出，但这兜个底
      if (isMoreMenuOpen) setIsMoreMenuOpen(false);
    }
  }), [totalSlides, isMoreMenuOpen]), true);

  // --- 移动端手单滑动切页逻辑 ---
  const handleSwipe = (direction: number) => {
    if (direction > 0) {
      setCurrentSlideIdx(prev => Math.max(0, prev - 1));
    } else {
      setCurrentSlideIdx(prev => Math.min(totalSlides - 1, prev + 1));
    }
  };

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
    <div className="flex flex-1 h-full w-full overflow-hidden bg-gray-50/50 p-2 md:p-4 pb-safe gap-2 md:gap-3 relative">
      
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
            <div className="px-4 py-4 border-b bg-white/50 flex flex-col gap-3 group/sidebar-header">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">
                  幻灯片清单 · {totalSlides}
                </h3>
                <button 
                  onClick={() => setIsLeftPanelOpen(false)}
                  className="w-8 h-8 flex items-center justify-center bg-red-500 text-white rounded-lg shadow-lg hover:bg-red-600 transition-all active:scale-90"
                  title="收起列表"
                >
                  <ChevronLeft className="w-5 h-5" strokeWidth={4} />
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
                    {/* 缩略图强制打码：使用 React.memo 缓存 + LazyThumbnail 懒渲染 */}
                    <LazyThumbnail>
                      <div className="pointer-events-none select-none">
                        <MemoizedThumbnailContent slide={slide} />
                      </div>
                    </LazyThumbnail>
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
            className="w-6 h-28 bg-slate-900 shadow-2xl rounded-r-2xl text-white hover:bg-black flex items-center justify-center transition-all group-hover:w-8"
            title="展开列表"
          >
            <ChevronRight className="w-5 h-5" strokeWidth={4} />
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center relative min-h-0 w-full overflow-hidden">
        <div className="w-full flex items-center justify-between px-2 md:px-4 mb-2 md:mb-3">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="bg-[#1e293b] text-white px-3 md:px-4 py-1.5 md:py-2 rounded-xl shadow-xl flex items-center gap-2 md:gap-3">
              <span className="hidden xs:block text-[10px] font-black uppercase tracking-widest opacity-50 bg-white/10 px-1.5 py-0.5 rounded">
                MODE
              </span>
              <span className="text-[10px] md:text-sm font-black tracking-widest uppercase truncate max-w-[80px] md:max-w-none">
                {currentSlide.type === 'title' ? '📋 封面' : `📝 题目${currentSlideIdx}`}
              </span>
            </div>
            <div className="bg-white border-2 border-slate-100 px-3 md:px-4 py-1.5 md:py-2 rounded-xl shadow-sm text-[10px] md:text-sm font-black text-slate-800">
               {currentSlideIdx + 1} / {totalSlides}
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3 relative">
            {/* PC 端直接显示的功能按钮 */}
            <div className="hidden md:flex items-center gap-3">
              
              {/* 大尺寸、高对比度的全屏演示按钮 */}
              <button 
                onClick={toggleFullscreen}
                className="hidden lg:flex h-11 px-6 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-black text-sm uppercase tracking-widest shadow-[0_8px_20px_-6px_rgba(20,184,166,0.5)] hover:scale-105 transition-all active:scale-95 group items-center gap-2 ring-1 ring-white/20"
              >
                {isFullscreen ? (
                  <Minimize className="w-5 h-5 group-hover:scale-110 transition-transform" />
                ) : (
                  <Maximize className="w-5 h-5 group-hover:scale-110 transition-transform" />
                )}
                <span>{isFullscreen ? '退出全屏' : '全屏演示'}</span>
              </button>

              <button 
                onClick={() => importProjectJSON()}
                className="h-11 px-5 rounded-xl bg-orange-500 text-white font-black text-sm uppercase tracking-wider shadow-[0_8px_20px_-6px_rgba(249,115,22,0.5)] hover:scale-105 transition-all active:scale-95 group flex items-center gap-2"
              >
                <FolderOpen className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
                <span>读入演稿</span>
              </button>
              
              <button
                onClick={() => setMathOptimized(!isMathOptimized)}
                className={cn(
                  "hidden lg:flex h-11 px-5 rounded-xl font-black text-sm uppercase tracking-wider transition-all duration-300 active:scale-95 items-center gap-2 shadow-lg",
                  isMathOptimized ? "bg-blue-600 text-white shadow-blue-500/30" : "bg-slate-900 text-white"
                )}
              >
                <Sparkles className={cn("w-4 h-4", isMathOptimized ? "animate-pulse text-yellow-300" : "text-blue-400")} />
                <span>优化解析</span>
              </button>
            </div>

            {/* 移动端收纳菜单 */}
            <div className="md:hidden">
              <button 
                onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                className="w-10 h-10 flex items-center justify-center bg-white border-2 border-slate-100 rounded-xl text-slate-600 active:scale-90 transition-all"
              >
                <MoreHorizontal className="w-6 h-6" />
              </button>
              
              <AnimatePresence>
                {isMoreMenuOpen && (
                  <>
                    <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm"
                      onClick={() => setIsMoreMenuOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 10 }}
                      className="absolute right-0 top-12 z-[101] w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 space-y-1"
                    >
                      <button 
                        onClick={() => { setIsCSSFullscreen(true); setIsMoreMenuOpen(false); }}
                        className="w-full px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-black text-teal-700 hover:bg-teal-50 active:bg-teal-100 border-b border-slate-100"
                      >
                        <Maximize className="w-4 h-4 text-teal-500" />
                        沉浸演示模式
                      </button>
                      <button 
                        onClick={() => { importProjectJSON(); setIsMoreMenuOpen(false); }}
                        className="w-full px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-bold text-slate-700 hover:bg-slate-50 active:bg-slate-100"
                      >
                        <FolderOpen className="w-4 h-4 text-orange-500" />
                        读入演稿
                      </button>
                      <button 
                        onClick={() => { setMathOptimized(!isMathOptimized); setIsMoreMenuOpen(false); }}
                        className="w-full px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-bold text-slate-700 hover:bg-slate-50 active:bg-slate-100"
                      >
                        <Sparkles className={cn("w-4 h-4", isMathOptimized ? "text-blue-500" : "text-slate-400")} />
                        {isMathOptimized ? "还原显示" : "优化解析"}
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="hidden lg:flex items-center gap-3 text-xs font-black text-slate-400 bg-slate-900/5 px-4 py-2 rounded-xl border border-slate-100 uppercase tracking-widest">
              <Monitor className="w-4 h-4" />
              <span>Ready for Presentation</span>
            </div>
          </div>
        </div>

        {/* 主幻灯片显示区：完全占满剩余空间 (含 CSS 应用级全屏覆写逻辑) */}
        <div className={cn(
          isCSSFullscreen
            ? "fixed inset-0 z-[99999] bg-slate-950 p-3 pt-[env(safe-area-inset-top,40px)] pb-24 flex items-center justify-center transition-all"
            : "flex-1 w-full flex items-center justify-center px-4 overflow-hidden relative"
        )}>
          {isCSSFullscreen && (
            <button 
              onClick={() => setIsCSSFullscreen(false)} 
              className="absolute top-[env(safe-area-inset-top,16px)] right-4 z-[100000] w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white backdrop-blur-md transition-all active:scale-90"
            >
              <Minimize className="w-5 h-5" />
            </button>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlideIdx}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.15}
              onDragEnd={(_, info) => {
                if (info.offset.x > 80) handleSwipe(1);
                else if (info.offset.x < -80) handleSwipe(-1);
              }}
              className="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
            >
              {/* 利用 md:aspect-video 确保在电脑端维持 PPT 比例，但在手机端 (竖屏) 则直接撑满全部剩余空间 */}
              <div className="w-full h-full md:max-h-full md:aspect-[16/9] rounded-2xl overflow-hidden flex flex-col shadow-2xl border border-gray-200 bg-white shadow-brand-primary/10">
                <div className="w-full flex-1 relative min-h-0">
                  {renderSlideContent(currentSlide, true, false)}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* 全屏模式下的纯净底部导航 */}
          {isCSSFullscreen && (
            <div className="absolute bottom-[env(safe-area-inset-bottom,24px)] left-1/2 -translate-x-1/2 flex items-center gap-8 bg-white/10 backdrop-blur-2xl px-8 py-3 rounded-3xl border border-white/20 shadow-[0_10px_40px_rgba(0,0,0,0.5)] z-[100000]">
               <button
                 onClick={() => setCurrentSlideIdx(prev => Math.max(0, prev - 1))}
                 disabled={currentSlideIdx === 0}
                 className="text-white disabled:opacity-20 active:scale-75 transition-all p-2 bg-white/5 rounded-full"
               >
                 <ChevronLeft className="w-6 h-6" />
               </button>
               <span className="text-white/90 font-black text-sm tracking-widest min-w-[3rem] text-center">{currentSlideIdx + 1} / {totalSlides}</span>
               <button
                 onClick={() => setCurrentSlideIdx(prev => Math.min(totalSlides - 1, prev + 1))}
                 disabled={currentSlideIdx >= totalSlides - 1}
                 className="text-white disabled:opacity-20 active:scale-75 transition-all p-2 bg-white/5 rounded-full"
               >
                 <ChevronRight className="w-6 h-6" />
               </button>
            </div>
          )}
        </div>

        {/* 原生常规模式下的底部导航栏 */}
        <div className="w-full flex flex-col md:flex-row items-center justify-between px-2 md:px-4 py-2 md:py-3 gap-2 md:gap-0 shrink-0 mb-safe">
          <div className="hidden md:block md:w-[200px] shrink-0" />
          
          <div className="flex items-center gap-6">
            <button
              onClick={() => setCurrentSlideIdx(prev => Math.max(0, prev - 1))}
              disabled={currentSlideIdx === 0}
              className="p-3 bg-white rounded-full shadow-lg border-2 border-slate-100 hover:bg-slate-50 disabled:opacity-20 disabled:grayscale transition-all active:scale-75"
            >
              <ChevronLeft className="w-6 h-6 text-slate-600" />
            </button>
            
            <div className="flex items-center gap-2 max-w-[200px] md:max-w-md overflow-x-auto scrollbar-hide px-4 py-2 bg-slate-100/50 rounded-full">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlideIdx(idx)}
                  className={cn(
                    "shrink-0 rounded-full transition-all duration-300",
                    idx === currentSlideIdx 
                      ? "w-8 h-3 bg-blue-600 shadow-md shadow-blue-500/30" 
                      : "w-3 h-3 bg-slate-300 hover:bg-slate-400"
                  )}
                />
              ))}
            </div>
            
            <button
              onClick={() => setCurrentSlideIdx(prev => Math.min(totalSlides - 1, prev + 1))}
              disabled={currentSlideIdx >= totalSlides - 1}
              className="p-3 bg-white rounded-full shadow-lg border-2 border-slate-100 hover:bg-slate-50 disabled:opacity-20 disabled:grayscale transition-all active:scale-75"
            >
              <ChevronRight className="w-6 h-6 text-slate-600" />
            </button>
          </div>

          <div className="flex flex-row items-center gap-3 w-full md:w-[320px] justify-center md:justify-end pb-2 md:pb-0">
            <button
              onClick={() => { setView('upload'); setCanvasOpen(true); }}
              className="flex-1 h-12 bg-orange-500 text-white rounded-2xl font-black text-sm tracking-wider flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
            >
              <FileSearch className="w-5 h-5 shrink-0" />
              <span>返回</span>
            </button>

            <button
              onClick={() => exportProjectJSON()}
              className="flex-1 h-12 bg-slate-900 text-white rounded-2xl font-black text-sm tracking-wider flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
            >
              <Save className="w-5 h-5 shrink-0" />
              <span>存档</span>
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};
