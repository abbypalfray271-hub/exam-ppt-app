'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  CheckCircle2, 
  Loader2, 
  LayoutList, 
  Trash2, 
  CheckSquare, 
  Square,
  Image as ImageIcon,
  Zap,
  Brain,
  Info,
  ChevronDown,
  Plus,
  Presentation
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectStore, Question } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { compressImage, pdfToImages } from '@/lib/documentProcessor';
import { type CanvasRect as Rect, type PageOffset } from '@/lib/canvasCropper';
import { CanvasHeader } from './canvas/CanvasHeader';
import { SectionLabel, AddCard, Thumbnail } from './canvas/PageThumbnail';
import { RectsLayer, DrawingPreview } from './canvas/RectsOverlay';
import { ParsingFailurePanel } from '@/components/canvas/ParsingFailurePanel';
import { useAIExtraction } from '@/hooks/useAIExtraction';
import { useCanvasInteraction } from '@/hooks/useCanvasInteraction';
import { usePageManager } from '@/hooks/usePageManager';
import { ExtendedRect } from '@/types/ai';

interface ExtractionCanvasProps {
  examPages: string[];
  referencePages: string[];
  initialPageIndex?: number;
  initialNormalizedRects?: { pageIdx: number, box: [number, number, number, number] }[];
  onComplete: () => void;
  onClose?: () => void;
}


export const ExtractionCanvas = ({ examPages, referencePages, initialPageIndex = 0, initialNormalizedRects, onComplete, onClose }: ExtractionCanvasProps) => {
  // === Refs ===
  const examContainerRef = useRef<HTMLDivElement>(null);
  const examScrollRef = useRef<HTMLDivElement>(null);
  const examImgRefs = useRef<(HTMLImageElement | null)[]>([]);

  const refContainerRef = useRef<HTMLDivElement>(null);
  const refScrollRef = useRef<HTMLDivElement>(null);
  const refImgRefs = useRef<(HTMLImageElement | null)[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // === 交互逻辑 Hook (绘图/拖拽/缩放/调整大小) ===
  const [activeDrawMode, setActiveDrawMode] = useState<'question' | 'answer' | 'diagram' | 'analysis' | null>(null);

  const {
    rects, setRects,
    drawingRect,
    isDrawing,
    isInteracting,
    selectedId, setSelectedId,
    resizeHandle,
    zoom, setZoom,
    activeQIdx, setActiveQIdx,
    interactionRef,
    startDrawing,
    startMoving,
    startResizing,
  } = useCanvasInteraction({
    examContainerRef,
    refContainerRef,
    // isProcessing 通过 Hook 内部的 Ref 同步，初始 false 不影响运行时行为
    // 实际值在 useAIExtraction 返回后通过 Ref 更新传递
    isProcessing: false,
    activeDrawMode,
  });

  // === 页面管理 Hook (选中/删除/添加) ===
  const {
    selectedPageIndices,
    selectedRefPageIndices,
    activeExamPageIdx, setActiveExamPageIdx,
    togglePageSelection,
    handleToggleAll,
    handleDeleteSelected,
    toggleRefPageSelection,
    handleToggleAllRef,
    handleDeleteSelectedRef,
    handlePageDelete,
    handleAddFiles,
  } = usePageManager({ examPages, referencePages, initialPageIndex });

  // === 其他 State ===
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  // SSR 安全：先使用默认值，客户端挂载后再同步为实际视口宽度
  const [refPoolWidth, setRefPoolWidth] = useState(400);
  const [isDeepThinking, setIsDeepThinking] = useState(false);
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isRightOpen, setIsRightOpen] = useState(true);
  const [mobileTab, setMobileTab] = useState<'exam' | 'canvas' | 'ref'>('canvas');
  const [isMobile, setIsMobile] = useState(false);

  // 视口监听：判断是否为移动端
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setIsLeftOpen(false);
        setIsRightOpen(false);
      } else {
        setIsLeftOpen(true);
        setIsRightOpen(true);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 客户端挂载后同步真实视口宽度
  useEffect(() => {
    setRefPoolWidth(window.innerWidth / 3);
  }, []);

  // 监听侧边栏拖拽调整大小
  useEffect(() => {
    if (isMobile) return;
    
    const handlePointerMove = (e: PointerEvent) => {
      // 捕获拖拽事件实时更新宽度状态
      if (interactionRef.current === 'resizing-sidebar') {
        setSidebarWidth(Math.max(200, Math.min(e.clientX, 600)));
      } else if (interactionRef.current === 'resizing-refpool') {
        const newWidth = window.innerWidth - e.clientX;
        setRefPoolWidth(Math.max(300, Math.min(newWidth, 800)));
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, [isMobile, interactionRef]);

  // === Hooks ===
  // AI 提取 Hook：我们将两站页面的合集传给它
  const allPages = useMemo(() => [...examPages, ...referencePages], [examPages, referencePages]);
  
  const { 
    startExtraction,
    progressLabel,
    parsingFailures,
    isProcessing,
  } = useAIExtraction({
    pages: allPages,
    rects, // 虽然 Hook 期望 Rect[]，但 ExtendedRect 是兼容的
    onComplete
  });

  const { 
    setExamPages, 
    setReferencePages,
    resetUpload 
  } = useProjectStore();

  // === Logic: Page Offsets ===
  // 我们需要两组 Offset，用于计算不同容器内的 pageIdx
  const getPageOffsets = useCallback((source: 'exam' | 'reference'): PageOffset[] => {
    const container = source === 'exam' ? examContainerRef.current : refContainerRef.current;
    const imgRefs = source === 'exam' ? examImgRefs.current : refImgRefs.current;
    if (!container) return [];
    
    const currentZoom = source === 'exam' ? zoom : 1;

    return imgRefs.map((img) => {
      if (!img) return { top: 0, height: 0, imgWidth: 0, naturalWidth: 1, naturalHeight: 1 };
      
      // 对于参考页，img 被包裹在一个 relative 的 div 中，
      // 导致 img.offsetTop 为 0，必须加上父元素的 offsetTop 才能得到相对于 container 的绝对偏移。
      let absoluteTop = img.offsetTop;
      if (source === 'reference' && img.offsetParent && img.offsetParent !== container) {
        absoluteTop = (img.offsetParent as HTMLElement).offsetTop + img.offsetTop;
      }

      return {
        top: absoluteTop / currentZoom,
        height: img.clientHeight / currentZoom,
        imgWidth: img.clientWidth / currentZoom,
        naturalWidth: img.naturalWidth || 1,
        naturalHeight: img.naturalHeight || 1,
      };
    });
  }, [zoom]);

  // === 页面管理逻辑已提取至 usePageManager Hook ===

  // handleConfirm 保留在组件内：它是 AI 提取的桥接逻辑，依赖 getPageOffsets/rects/startExtraction
  const handleConfirm = (action: 'parseQuestion' | 'generateMindMap' = 'parseQuestion') => {
    const examOffsets = getPageOffsets('exam');
    const refOffsets = getPageOffsets('reference');
    const examTotalHeight = examOffsets.reduce((acc, o) => acc + o.height, 0);

    const correctedRefOffsets = refOffsets.map(o => ({ ...o, top: o.top + examTotalHeight }));
    const combinedOffsets = [...examOffsets, ...correctedRefOffsets];

    const correctedRects = rects.map(r => {
      if (r.source === 'exam') return r;
      return { ...r, y: r.y + examTotalHeight };
    });

    startExtraction(
      combinedOffsets, 
      selectedPageIndices, 
      isDeepThinking, 
      correctedRects,
      action
    );
  };

  // === 交互逻辑已提取至 useCanvasInteraction Hook ===



  return (
    <div className="flex flex-col h-full bg-[#f8f9fc] overflow-hidden relative">
      {/* 顶部进度条 */}
      {isProcessing && (
        <div className="absolute inset-x-0 top-0 z-[100] h-1.5 bg-gray-100 overflow-hidden">
          <motion.div initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 30, ease: 'linear' }} className="h-full bg-blue-600" />
        </div>
      )}

      {/* Header */}
      <CanvasHeader 
        onClose={onClose} 
        activeDrawMode={activeDrawMode} 
        setActiveDrawMode={setActiveDrawMode}
        isDeepThinking={isDeepThinking}
        setIsDeepThinking={setIsDeepThinking}
        isProcessing={isProcessing}
        statusMessage={progressLabel}
        onConfirm={handleConfirm}
        onComplete={onComplete}
      />

      {/* 移动端专属 Tab 切换器 */}
      {isMobile && (
        <div className="flex bg-white border-b px-2 py-1.5 gap-1 shrink-0 z-[100] shadow-md overflow-x-auto scrollbar-hide sticky top-0">
          <button 
            onClick={() => { setMobileTab('exam'); setIsLeftOpen(true); setIsRightOpen(false); }}
            className={cn(
              "flex-1 min-w-[80px] py-2.5 rounded-xl flex flex-col items-center gap-1 transition-all active:scale-95 touch-manipulation",
              mobileTab === 'exam' ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <LayoutList className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-tight">试卷清单</span>
          </button>
          <button 
            onClick={() => { setMobileTab('canvas'); setIsLeftOpen(false); setIsRightOpen(false); }}
            className={cn(
              "flex-1 min-w-[80px] py-2.5 rounded-xl flex flex-col items-center gap-1 transition-all active:scale-95 touch-manipulation",
              mobileTab === 'canvas' ? "bg-slate-900 text-white shadow-lg shadow-slate-200" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <Presentation className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-tight">画板选区</span>
          </button>
          <button 
            onClick={() => { setMobileTab('ref'); setIsLeftOpen(false); setIsRightOpen(true); }}
            className={cn(
              "flex-1 min-w-[80px] py-2.5 rounded-xl flex flex-col items-center gap-1 transition-all active:scale-95 touch-manipulation",
              mobileTab === 'ref' ? "bg-rose-500 text-white shadow-lg shadow-rose-200" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <ImageIcon className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-tight">答案参考</span>
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div 
          className={cn(
            "bg-white flex flex-col relative shrink-0 transition-all duration-300 ease-in-out z-[90]", 
            isMobile ? "fixed inset-y-0 left-0 shadow-2xl" : "relative",
            isMobile && !isLeftOpen && "pointer-events-none"
          )} 
          style={{ width: isLeftOpen ? (isMobile ? '85%' : sidebarWidth) : 0 }}
        >
          {/* 抽出把手悬浮按钮 (手机端隐藏，改用 Tab 切换) */}
          {!isMobile && (
            <button 
              onClick={() => setIsLeftOpen(!isLeftOpen)}
              className="absolute top-1/2 -right-4 -translate-y-1/2 w-5 h-24 bg-slate-900 shadow-[0_8px_30px_rgba(0,0,0,0.3)] flex items-center justify-center rounded-r-xl z-[60] text-white cursor-pointer hover:bg-black hover:w-6 transition-all group"
            >
              {isLeftOpen ? <ChevronLeft strokeWidth={4} className="w-4 h-4" /> : <ChevronRight strokeWidth={4} className="w-4 h-4" />}
            </button>
          )}

          {/* 移动端点击遮罩 */}
          {isMobile && isLeftOpen && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[-1]" onClick={() => { setIsLeftOpen(false); setMobileTab('canvas'); }} />
          )}

          {/* 真实可见内容区域容器 */}
          <div className={cn("w-full h-full border-r overflow-hidden flex flex-col transition-opacity duration-300", !isLeftOpen && "opacity-0")} style={{ width: isLeftOpen ? '100%' : sidebarWidth }}>
          <div className="p-4 border-b flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">页面概览</h4>
                <div className="text-sm font-black text-blue-600 mt-1">已选 {selectedPageIndices.size} / {examPages.length}</div>
              </div>
              <div className="flex items-center gap-2">
                 <button 
                  onClick={handleDeleteSelected}
                  disabled={selectedPageIndices.size === 0}
                  className="w-8 h-8 rounded-lg bg-rose-500 text-white flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 disabled:grayscale disabled:opacity-30 transition-all"
                  title="删除选中"
                 >
                   <Trash2 className="w-4 h-4" />
                 </button>
                 <button 
                  onClick={handleToggleAll}
                  className={cn(
                    "h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all active:scale-95 shadow-md",
                    selectedPageIndices.size === examPages.length
                      ? "bg-slate-900 text-white"
                      : "bg-blue-600 text-white"
                  )}
                 >
                   {selectedPageIndices.size === examPages.length ? <Square className="w-3 h-3" /> : <CheckSquare className="w-3 h-3" />}
                   {selectedPageIndices.size === examPages.length ? "取消" : "全选"}
                 </button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
             {/* 仅保留试卷主素材 */}
             <SectionLabel label="试卷主素材" count={examPages.length} />
             {examPages.map((p, i) => (
                <Thumbnail 
                  key={`exam-${i}`} 
                  src={p} 
                  index={i+1} 
                  active={activeExamPageIdx === i} 
                  selected={selectedPageIndices.has(i)}
                  onSelectToggle={() => togglePageSelection(i)}
                  onDelete={() => handlePageDelete(i, 'exam')}
                  onClick={() => {
                    setActiveExamPageIdx(i);
                    const img = examImgRefs.current[i];
                    if (img) img.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }} 
                />
             ))}
             <AddCard label="试题页面" onAdd={(files) => handleAddFiles(files, 'exam')} />
          </div>
          </div>
          
          {/* Sidebar Resizer (移动端隐藏) */}
          {!isMobile && isLeftOpen && (
            <div 
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 transition-colors z-[60]"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                interactionRef.current = 'resizing-sidebar';
              }}
            />
          )}
        </div>

        {/* 中间：试卷主画布 */}
        <div ref={examScrollRef} className="flex-1 bg-gray-100/30 p-8 scroll-smooth relative overflow-auto">
           <div className="mx-auto" style={{ width: `${zoom * 100}%` }}>
              <div 
                ref={examContainerRef} 
                className={cn("relative shadow-2xl bg-white flex flex-col origin-top overflow-hidden rounded-sm touch-pinch-zoom no-callout", isProcessing ? "opacity-40" : "cursor-crosshair")} 
                onPointerDown={(e) => startDrawing(e, 'exam')}
              >
                {examPages.map((page, idx) => (
                  <img 
                    key={`img-exam-${idx}`} 
                    ref={el => { examImgRefs.current[idx] = el; }} 
                    src={page} 
                    className="block w-full select-none pointer-events-none touch-none no-callout" 
                    draggable={false}
                    onLoad={() => setImagesLoaded(prev => prev + 1)} 
                  />
                ))}
                <RectsLayer rects={rects.filter(r => r.source === 'exam')} zoom={zoom} selectedId={selectedId} activeHandle={resizeHandle} startMoving={(e, id) => startMoving(e, id, 'exam')} startResizing={(e, id, h) => startResizing(e, id, h, 'exam')} onRemove={(id: string) => setRects(p => p.filter(x => x.id !== id))} />
                {isDrawing && drawingRect?.source === 'exam' && <DrawingPreview rect={drawingRect} zoom={zoom} />}
              </div>
           </div>
        </div>

        {/* 右侧：答案池/参考库 (含可折叠侧边栏外壳) */}
        <div 
          className={cn(
            "flex flex-col relative shrink-0 transition-all duration-300 ease-in-out z-[90]",
            isMobile ? "fixed inset-y-0 right-0 shadow-2xl" : "relative",
            isMobile && !isRightOpen && "pointer-events-none"
          )} 
          style={{ width: isRightOpen ? (isMobile ? '85%' : refPoolWidth) : 0 }}
        >
          {/* 抽入把手悬浮按钮 (手机端隐藏) */}
          {!isMobile && (
            <button 
              onClick={() => setIsRightOpen(!isRightOpen)}
              className="absolute top-1/2 -left-4 -translate-y-1/2 w-5 h-24 bg-slate-900 shadow-[0_8px_30px_rgba(0,0,0,0.3)] flex items-center justify-center rounded-l-xl z-[60] text-white cursor-pointer hover:bg-black hover:-left-5 hover:w-6 transition-all group"
            >
              {isRightOpen ? <ChevronRight strokeWidth={4} className="w-4 h-4" /> : <ChevronLeft strokeWidth={4} className="w-4 h-4" />}
            </button>
          )}

          {/* 移动端点击遮罩 */}
          {isMobile && isRightOpen && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[-1]" onClick={() => { setIsRightOpen(false); setMobileTab('canvas'); }} />
          )}

          {/* 真实可见内容容器 */}
          <div className={cn("w-full h-full bg-white border-l shadow-[-10px_0_30px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col transition-opacity duration-300", !isRightOpen && "opacity-0")} style={{ width: isRightOpen ? '100%' : refPoolWidth }}>
           <div className="px-4 py-4 bg-gray-50/50 border-b flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">答案参考池</h4>
                </div>
                <div className="text-sm font-black text-rose-500">已选 {selectedRefPageIndices.size} 页</div>
              </div>
              
              <div className="flex items-center gap-2 justify-end">
                  <button 
                    onClick={handleDeleteSelectedRef}
                    className="w-8 h-8 rounded-lg bg-rose-500 text-white flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 disabled:grayscale disabled:opacity-30 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={handleToggleAllRef}
                    className={cn(
                      "h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all active:scale-95 shadow-md",
                      selectedRefPageIndices.size === referencePages.length ? "bg-slate-900 text-white" : "bg-blue-600 text-white"
                    )}
                  >
                    {selectedRefPageIndices.size === referencePages.length ? <Square className="w-3 h-3" /> : <CheckSquare className="w-3 h-3" />}
                    全选
                  </button>
              </div>
           </div>
           <div ref={refScrollRef} className="flex-1 overflow-auto bg-gray-100 p-4 relative scroll-smooth">
              <div className="mx-auto" style={{ width: '95%' }}>
                 <div 
                  ref={refContainerRef} 
                  className={cn("relative shadow-xl bg-white flex flex-col overflow-hidden", isProcessing ? "opacity-30" : "cursor-crosshair")} 
                  onPointerDown={(e) => startDrawing(e, 'reference')}
                >
                  {referencePages.map((page, idx) => (
                    <div key={`img-ref-${idx}`} className="group/ref-item scroll-mt-4 relative flex flex-col">
                      {/* [NEW] 独立页眉工具栏 */}
                      <div className="w-full flex items-center justify-between px-3 py-1.5 bg-[#f8fafc] border-b border-gray-200/60 sticky top-0 z-40">
                        <span className="text-[10px] font-black tracking-widest text-slate-400">PAGE {idx + 1}</span>
                        <div className="flex items-center gap-2">
                          <button 
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); handlePageDelete(idx, 'reference'); }}
                            className="p-1.5 rounded-lg bg-red-100/50 hover:bg-red-500 text-red-500 hover:text-white transition-all active:scale-95 flex items-center gap-1"
                            title="删除此页"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onPointerDown={(e) => e.stopPropagation()} /* 阻止触发框选画笔 */
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRefPageSelection(idx);
                            }}
                            className={cn(
                              "flex items-center gap-1.5 px-2 py-1 rounded border transition-all text-xs active:scale-95",
                              selectedRefPageIndices.has(idx) 
                                ? "bg-blue-600 border-blue-600 text-white shadow-sm" 
                                : "bg-white border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300"
                            )}
                          >
                             {selectedRefPageIndices.has(idx) ? <CheckSquare className="w-3.5 h-3.5 fill-current" /> : <Square className="w-3.5 h-3.5" />}
                             <span className="text-[10px] font-bold">{selectedRefPageIndices.has(idx) ? '已选' : '选择'}</span>
                          </button>
                        </div>
                      </div>
                      <img 
                        ref={el => { refImgRefs.current[idx] = el; }} 
                        src={page} 
                        className={cn(
                          "block w-full select-none mb-4 border-b last:border-0 pointer-events-none touch-none no-callout", 
                          selectedRefPageIndices.has(idx) && "opacity-80 mix-blend-multiply border-blue-500 border-2"
                        )} 
                        draggable={false}
                      />
                    </div>
                  ))}
                  <RectsLayer 
                    rects={rects.filter(r => r.source === 'reference')} 
                    zoom={1} 
                    selectedId={selectedId}
                    activeHandle={resizeHandle}
                    startMoving={(e, id) => startMoving(e, id, 'reference')} 
                    startResizing={(e, id, h) => startResizing(e, id, h, 'reference')} 
                    onRemove={(id: string) => setRects(p => p.filter(x => x.id !== id))} 
                  />
                  {isDrawing && drawingRect?.source === 'reference' && <DrawingPreview rect={drawingRect} zoom={1} />}
                </div>
                {/* 答案页面追加 */}
                <div className="mt-8 mb-20 max-w-[200px] mx-auto">
                   <AddCard label="答案页面" onAdd={(files) => handleAddFiles(files, 'reference')} />
                </div>
              </div>
           </div>
          </div>

          {/* 右侧：分栏调节条 (移动端隐藏) */}
          {!isMobile && isRightOpen && (
            <div 
              className="absolute left-0 top-0 bottom-0 w-1.5 bg-gray-200 hover:bg-blue-500 cursor-col-resize transition-colors z-[60] shadow-[0_0_10px_rgba(0,0,0,0.05)]"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                interactionRef.current = 'resizing-refpool';
              }}
            />
          )}
        </div>
      </div>

      {/* 故障面板 */}
      {parsingFailures.length > 0 && <ParsingFailurePanel failures={parsingFailures} isProcessing={isProcessing} onDismiss={() => {}} />}
    </div>
  );
};


