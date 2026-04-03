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
  Brain
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectStore, Question } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { compressImage } from '@/lib/documentProcessor';
import { type CanvasRect as Rect, type PageOffset } from '@/lib/canvasCropper';
import { MobileToolbar } from '@/components/canvas/MobileToolbar';
import { ParsingFailurePanel } from '@/components/canvas/ParsingFailurePanel';
import { useAIExtraction } from '@/hooks/useAIExtraction';

interface ExtractionCanvasProps {
  pages: string[];
  initialPageIndex?: number;
  initialNormalizedRects?: { pageIdx: number, box: [number, number, number, number] }[];
  onComplete: () => void;
  onClose?: () => void;
}

export const ExtractionCanvas = ({ pages, initialPageIndex = 0, initialNormalizedRects, onComplete, onClose }: ExtractionCanvasProps) => {
  // === Refs ===
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // === State ===
  const [rects, setRects] = useState<Rect[]>([]);
  const [drawingRect, setDrawingRect] = useState<Partial<Rect> | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [activePageIdx, setActivePageIdx] = useState(initialPageIndex);
  const [activeDrawMode, setActiveDrawMode] = useState<'question' | 'answer' | 'diagram' | 'analysis' | null>(null);
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const [zoom, setZoom] = useState(1); 
  const [selectedPageIndices, setSelectedPageIndices] = useState<Set<number>>(new Set());
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDeepThinking, setIsDeepThinking] = useState(false);
  const [activeQIdx, setActiveQIdx] = useState(1);
  const [hasInitializedRects, setHasInitializedRects] = useState(false);

  // === Hooks ===
  const { 
    startExtraction,
    progress,
    progressLabel,
    parsingFailures,
    isProcessing,
  } = useAIExtraction({
    pages,
    rects,
    onComplete
  });

  const { 
    questions, 
    addQuestions, 
    setProcessing,
    setView, 
    setExamPages, 
    resetUpload 
  } = useProjectStore();

  // === Logic ===
  
  const startMoving = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    if (isProcessing) return;
    const rect = rects.find(r => r.id === id);
    if (!rect) return;
    setSelectedId(id);
    if (rect.qIdx) setActiveQIdx(rect.qIdx);
    interactionRef.current = 'moving';
    startPosRef.current = { x: e.clientX, y: e.clientY };
    initialRectRef.current = { ...rect };
  };

  const startResizing = (e: React.PointerEvent, id: string, handle: string) => {
    e.stopPropagation();
    if (isProcessing) return;
    const rect = rects.find(r => r.id === id);
    if (!rect) return;
    setSelectedId(id);
    setResizeHandle(handle);
    interactionRef.current = 'resizing';
    startPosRef.current = { x: e.clientX, y: e.clientY };
    initialRectRef.current = { ...rect };
  };

  const getPageOffsets = useCallback((): PageOffset[] => {
    if (!containerRef.current) return [];
    const zoomFactor = zoom;
    return imgRefs.current.map((img) => {
      if (!img) return { top: 0, height: 0, imgWidth: 0, naturalWidth: 1, naturalHeight: 1 };
      return {
        top: img.offsetTop / zoomFactor,
        height: img.clientHeight / zoomFactor,
        imgWidth: img.clientWidth / zoomFactor,
        naturalWidth: img.naturalWidth || 1,
        naturalHeight: img.naturalHeight || 1,
      };
    });
  }, [zoom]);

  const handleConfirm = () => {
    startExtraction(getPageOffsets(), selectedPageIndices, isDeepThinking);
  };

  const handleAddPage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setProcessing(true);
    try {
      const newBase64s: string[] = [];
      for (const file of Array.from(files)) {
        const rawBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error('失败'));
          reader.readAsDataURL(file);
        });
        const compressed = await compressImage(rawBase64, 1600);
        newBase64s.push(compressed);
      }
      const updatedPages = [...pages, ...newBase64s];
      setExamPages(updatedPages);
      const nextSelected = new Set(selectedPageIndices);
      newBase64s.forEach((_, i) => nextSelected.add(pages.length + i));
      setSelectedPageIndices(nextSelected);
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedPageIndices.size === 0 || isProcessing) return;
    if (!window.confirm(`确定要删除选中的 ${selectedPageIndices.size} 张图片及其上面的所有框选吗？`)) return;

    const offsets = getPageOffsets();
    const deletedIndices = Array.from(selectedPageIndices).sort((a, b) => a - b);
    
    const updatedRects: Rect[] = rects
      .filter(r => {
        const midY = r.y + r.height / 2;
        const pageIdx = offsets.findIndex(o => midY >= o.top && midY < o.top + o.height);
        return !selectedPageIndices.has(pageIdx);
      })
      .map(r => {
        const midY = r.y + r.height / 2;
        const pageIdx = offsets.findIndex(o => midY >= o.top && midY < o.top + o.height);
        let deletedAboveHeight = 0;
        for (const dIdx of deletedIndices) {
          if (dIdx < pageIdx) deletedAboveHeight += offsets[dIdx].height;
        }
        return { ...r, y: r.y - deletedAboveHeight };
      });

    const newPages = pages.filter((_, i) => !selectedPageIndices.has(i));
    setRects(updatedRects);
    setExamPages(newPages);
    setSelectedPageIndices(new Set());
    if (newPages.length === 0) resetUpload();
    else setImagesLoaded(newPages.length);
  };

  const scrollToPage = (idx: number) => {
    const img = imgRefs.current[idx];
    if (img && scrollRef.current) {
      const containerTop = containerRef.current?.getBoundingClientRect().top ?? 0;
      const imgTop = img.getBoundingClientRect().top;
      const offsetInContainer = imgTop - containerTop;
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollTop + offsetInContainer - 16,
        behavior: 'smooth',
      });
    }
  };

  // === Drawing/Moving/Resizing Interaction ===
  const interactionRef = useRef<'none' | 'drawing' | 'moving' | 'resizing' | 'resizing-sidebar'>('none');
  const startPosRef = useRef({ x: 0, y: 0 });
  const initialRectRef = useRef<Rect | null>(null);
  const drawingRectRef = useRef<Partial<Rect> | null>(null);

  const startDrawing = (e: React.PointerEvent) => {
    if (!containerRef.current || isProcessing || !activeDrawMode) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch(e) {}
    const cr = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - cr.left) / zoom;
    const y = (e.clientY - cr.top) / zoom;
    setSelectedId(null);
    const newRect = { id: Math.random().toString(36).substring(7), x, y, width: 0, height: 0, type: activeDrawMode };
    setDrawingRect(newRect);
    drawingRectRef.current = newRect;
    setIsDrawing(true);
    interactionRef.current = 'drawing';
  };

  useEffect(() => {
    const handleMouseMove = (e: PointerEvent) => {
      if (!containerRef.current || interactionRef.current === 'none') return;
      const cr = containerRef.current.getBoundingClientRect();
      const dx = (e.clientX - startPosRef.current.x) / zoom;
      const dy = (e.clientY - startPosRef.current.y) / zoom;

      if (interactionRef.current === 'drawing') {
        const x = (e.clientX - cr.left) / zoom;
        const y = (e.clientY - cr.top) / zoom;
        setDrawingRect(prev => {
          if (!prev) return prev;
          const updated = { ...prev, width: x - prev.x!, height: y - prev.y! };
          drawingRectRef.current = updated;
          return updated;
        });
      } else if (interactionRef.current === 'moving' && selectedId && initialRectRef.current) {
        setRects(prev => prev.map(r => r.id === selectedId ? { ...r, x: initialRectRef.current!.x + dx, y: initialRectRef.current!.y + dy } : r));
      } else if (interactionRef.current === 'resizing' && selectedId && initialRectRef.current && resizeHandle) {
        setRects(prev => prev.map(r => {
          if (r.id !== selectedId) return r;
          let { x, y, width: w, height: h } = initialRectRef.current!;
          if (resizeHandle.includes('e')) w += dx;
          if (resizeHandle.includes('w')) { x += dx; w -= dx; }
          if (resizeHandle.includes('s')) h += dy;
          if (resizeHandle.includes('n')) { y += dy; h -= dy; }
          return { ...r, x, y, width: w, height: h };
        }));
      } else if (interactionRef.current === 'resizing-sidebar') {
        setSidebarWidth(Math.max(200, Math.min(e.clientX, window.innerWidth * 0.5, 800)));
      }
    };

    const handleMouseUp = () => {
      if (interactionRef.current === 'drawing' && drawingRectRef.current) {
        const r = drawingRectRef.current;
        if (Math.abs(r.width || 0) > 10 && Math.abs(r.height || 0) > 10) {
          let targetQIdx = activeQIdx;
          if ((r.type === 'question' || !r.type) && rects.some(exist => exist.qIdx === activeQIdx && (exist.type === 'question' || !exist.type))) {
             targetQIdx = activeQIdx + 1;
             setActiveQIdx(targetQIdx);
          }
          const finalRect: Rect = {
            id: Math.random().toString(36).substring(7),
            x: r.width! > 0 ? r.x! : r.x! + r.width!,
            y: r.height! > 0 ? r.y! : r.y! + r.height!,
            width: Math.abs(r.width!),
            height: Math.abs(r.height!),
            type: r.type as any,
            qIdx: targetQIdx
          };
          setRects(prev => [...prev, finalRect]);
          setSelectedId(finalRect.id);
        }
      }
      interactionRef.current = 'none';
      setDrawingRect(null);
      drawingRectRef.current = null;
      setIsDrawing(false);
      setResizeHandle(null);
    };

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
    return () => {
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
    };
  }, [zoom, selectedId, initialRectRef, resizeHandle, activeQIdx, rects]);

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden relative">
      {isProcessing && (
        <div className="absolute inset-x-0 top-0 z-[100]">
           <div className="h-1.5 bg-gray-100/50 backdrop-blur-sm overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
              />
           </div>
           <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
              <AnimatePresence mode="wait">
                {progressLabel && (
                  <motion.div
                    key={progressLabel}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="px-6 py-2 bg-white/70 backdrop-blur-md border border-white/40 rounded-full shadow-lg flex items-center gap-3"
                  >
                    <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
                    <span className="text-[13px] font-black text-brand-primary uppercase">{progressLabel}</span>
                  </motion.div>
                )}
              </AnimatePresence>
           </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row items-center justify-between px-6 py-4 bg-white border-b z-20 shadow-sm gap-4">
        <div className="flex items-center gap-5 overflow-x-auto scrollbar-hide w-full md:w-auto">
          {onClose && (
            <button onClick={onClose} className="p-2.5 bg-red-500 text-white rounded-full hover:bg-red-600 active:scale-95 transition-all">
              <X className="w-5 h-5 stroke-[3px]" />
            </button>
          )}
          <h3 className="text-2xl font-black text-gray-900 hidden lg:block">内容预处理</h3>
          
          <div className="flex bg-gray-100 p-1 rounded-full shrink-0">
            {(['question', 'answer', 'analysis', 'diagram'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setActiveDrawMode(prev => prev === mode ? null : mode)}
                className={cn(
                  "px-5 py-2.5 rounded-full text-sm font-black transition-all flex items-center gap-2",
                  activeDrawMode === mode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                <div className={cn("w-3 h-3 rounded-full", {
                  'bg-brand-primary': mode === 'question',
                  'bg-red-500': mode === 'answer',
                  'bg-purple-500': mode === 'analysis',
                  'bg-emerald-500': mode === 'diagram'
                })} />
                {mode === 'question' ? '题目' : mode === 'answer' ? '答案' : mode === 'analysis' ? '分析' : '插图'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsDeepThinking(!isDeepThinking)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all",
              isDeepThinking ? "bg-purple-600 border-purple-700 text-white" : "bg-white border-gray-200 text-gray-500"
            )}
          >
            {isDeepThinking ? <Brain className="w-4 h-4 animate-pulse" /> : <Zap className="w-4 h-4" />}
            <span className="text-[12px] font-black uppercase">深度思考</span>
          </button>
          <button onClick={handleConfirm} disabled={isProcessing} className="px-8 py-2.5 bg-brand-primary text-white text-sm font-black rounded-full shadow-xl hover:scale-105 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2">
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            识别解析
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="bg-white border-r flex flex-col" style={{ width: sidebarWidth }}>
          <div className="p-4 border-b flex flex-col gap-3">
             <div className="flex items-center justify-between">
                <span className="text-sm font-black text-gray-800 flex items-center gap-2"><LayoutList className="w-5 h-5" /> 页面管理</span>
             </div>
             <div className="flex gap-2">
                <button 
                  onClick={() => setSelectedPageIndices(selectedPageIndices.size === pages.length ? new Set() : new Set(pages.map((_, i) => i)))}
                  className="flex-1 h-10 rounded-xl font-black text-[11px] border-2 flex items-center justify-center gap-2"
                >
                  <CheckSquare className="w-4 h-4" /> {selectedPageIndices.size === pages.length ? "取消" : "全选"}
                </button>
                <button onClick={handleDeleteSelected} disabled={selectedPageIndices.size === 0} className="flex-1 h-10 rounded-xl font-black text-[11px] bg-red-500 text-white flex items-center justify-center gap-2">
                  <Trash2 className="w-4 h-4" /> 删除 ({selectedPageIndices.size})
                </button>
             </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {pages.map((page, idx) => (
              <div 
                key={idx} 
                onClick={() => scrollToPage(idx)}
                className={cn("relative rounded-xl overflow-hidden border-4 aspect-[3/4] cursor-pointer transition-all", selectedPageIndices.has(idx) ? "border-brand-primary scale-[1.02]" : "border-gray-100")}
              >
                <img src={page} className="w-full h-full object-cover" />
                <div onClick={(e) => { e.stopPropagation(); const n=new Set(selectedPageIndices); if(n.has(idx)) n.delete(idx); else n.add(idx); setSelectedPageIndices(n); }} className="absolute top-2 right-2 bg-white rounded-md p-1 shadow-md">
                   {selectedPageIndices.has(idx) ? <CheckSquare className="text-brand-primary" /> : <Square className="text-gray-300" />}
                </div>
                <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-2 rounded-full">{idx + 1}</div>
              </div>
            ))}
            <input type="file" ref={fileInputRef} onChange={handleAddPage} className="hidden" multiple accept="image/*" />
            <button onClick={() => fileInputRef.current?.click()} className="w-full aspect-[3/4] border-4 border-dashed border-gray-100 rounded-3xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-brand-primary hover:text-brand-primary transition-all">
               <ImageIcon className="w-8 h-8" />
               <span className="text-[10px] font-black uppercase">添加页面</span>
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <div ref={scrollRef} className="flex-1 overflow-auto bg-gray-100/50 p-8 scroll-smooth">
          <div className="flex justify-center">
            <div 
              ref={containerRef} 
              className={cn("relative shadow-2xl bg-white flex flex-col origin-top", isProcessing ? "opacity-40" : "cursor-crosshair")} 
              style={{ width: `${zoom * 100}%` }}
              onPointerDown={startDrawing}
            >
              {pages.map((page, idx) => (
                <img key={idx} ref={el => { imgRefs.current[idx] = el; }} src={page} className="block w-full select-none pointer-events-none" onLoad={() => setImagesLoaded(prev => prev + 1)} />
              ))}

              {/* Rects Rendering Layer */}
              {rects.map(r => (
                <div
                  key={r.id}
                  onPointerDown={(e) => startMoving(e, r.id)}
                  style={{ left: r.x * zoom, top: r.y * zoom, width: r.width * zoom, height: r.height * zoom }}
                  className={cn("absolute border-2 shadow-lg group transition-colors", {
                    'border-brand-primary bg-brand-primary/10': r.type === 'question' || !r.type,
                    'border-red-500 bg-red-500/10': r.type === 'answer',
                    'border-purple-500 bg-purple-500/10': r.type === 'analysis',
                    'border-emerald-500 bg-emerald-500/10': r.type === 'diagram',
                    'ring-4 ring-yellow-400': selectedId === r.id
                  })}
                >
                  <div className="absolute -top-6 left-0 px-2 py-0.5 bg-black/80 text-white text-[10px] font-bold rounded flex items-center gap-2">
                     #{r.qIdx} {r.type === 'question' ? '题目' : r.type === 'answer' ? '答案' : r.type === 'analysis' ? '分析' : '插图'}
                     <button onClick={(e) => { e.stopPropagation(); setRects(prev => prev.filter(x => x.id !== r.id)); }} className="hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                  </div>
                  {/* Resizers */}
                  {selectedId === r.id && ['nw','ne','sw','se','n','s','e','w'].map(h => (
                    <div 
                      key={h} 
                      className={cn("absolute w-3 h-3 bg-white border-2 border-brand-primary rounded-full z-30 shadow-md", {
                        '-top-1.5 -left-1.5 cursor-nw-resize': h === 'nw',
                        '-top-1.5 -right-1.5 cursor-ne-resize': h === 'ne',
                        '-bottom-1.5 -left-1.5 cursor-sw-resize': h === 'sw',
                        '-bottom-1.5 -right-1.5 cursor-se-resize': h === 'se',
                        '-top-1.5 left-1/2 -translate-x-1/2 cursor-n-resize': h === 'n',
                        '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-s-resize': h === 's',
                        'top-1/2 -right-1.5 -translate-y-1/2 cursor-e-resize': h === 'e',
                        'top-1/2 -left-1.5 -translate-y-1/2 cursor-w-resize': h === 'w',
                      })}
                      onPointerDown={(e) => startResizing(e, r.id, h)}
                    />
                  ))}
                </div>
              ))}

              {/* Drawing UI */}
              {isDrawing && drawingRect && (
                <div 
                  className={cn("absolute border-2 border-dashed border-black/40 bg-black/5", {
                    'border-brand-primary bg-brand-primary/10': drawingRect.type === 'question',
                    'border-red-500 bg-red-500/10': drawingRect.type === 'answer',
                    'border-purple-500 bg-purple-500/10': drawingRect.type === 'analysis',
                    'border-emerald-500 bg-emerald-500/10': drawingRect.type === 'diagram'
                  })}
                  style={{ 
                    left: (drawingRect.width! > 0 ? drawingRect.x! : drawingRect.x! + drawingRect.width!) * zoom,
                    top: (drawingRect.height! > 0 ? drawingRect.y! : drawingRect.y! + drawingRect.height!) * zoom,
                    width: Math.abs(drawingRect.width!) * zoom,
                    height: Math.abs(drawingRect.height!) * zoom
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {parsingFailures.length > 0 && (
         <ParsingFailurePanel 
           failures={parsingFailures} 
           isProcessing={isProcessing}
           onDismiss={() => {
              // 处理关闭逻辑，例如清除失败记录（如果需要）
           }} 
         />
      )}
    </div>
  );
};
