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

  // === State ===
  const [rects, setRects] = useState<ExtendedRect[]>([]);
  const [drawingRect, setDrawingRect] = useState<(Partial<ExtendedRect> & { source: 'exam' | 'reference' }) | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  
  const [activeExamPageIdx, setActiveExamPageIdx] = useState(initialPageIndex);
  const [activeDrawMode, setActiveDrawMode] = useState<'question' | 'answer' | 'diagram' | 'analysis' | null>(null);
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const [zoom, setZoom] = useState(1); 
  const [selectedPageIndices, setSelectedPageIndices] = useState<Set<number>>(new Set());
  const [selectedRefPageIndices, setSelectedRefPageIndices] = useState<Set<number>>(new Set());
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [refPoolWidth, setRefPoolWidth] = useState(window.innerWidth / 3); // 默认 1/3 宽度
  const [isDeepThinking, setIsDeepThinking] = useState(false);
  const [activeQIdx, setActiveQIdx] = useState(1);

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
    setProcessing,
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
      return {
        top: img.offsetTop / currentZoom,
        height: img.clientHeight / currentZoom,
        imgWidth: img.clientWidth / currentZoom,
        naturalWidth: img.naturalWidth || 1,
        naturalHeight: img.naturalHeight || 1,
      };
    });
  }, [zoom]);

  const togglePageSelection = (idx: number) => {
    setSelectedPageIndices(prev => {
       const next = new Set(prev);
       if (next.has(idx)) next.delete(idx);
       else next.add(idx);
       return next;
    });
  };

  const handlePageDelete = (idx: number, source: 'exam' | 'reference') => {
    if (!confirm(`确定删除该 ${source === 'exam' ? '试卷' : '参考'} 页面吗？`)) return;
    
    if (source === 'exam') {
      const newPages = examPages.filter((_, i) => i !== idx);
      setExamPages(newPages);
    } else {
      const newPages = referencePages.filter((_, i) => i !== idx);
      setReferencePages(newPages);
    }
    // 重置选中状态以防越界
    setSelectedPageIndices(new Set());
  };

  const handleToggleAll = () => {
    if (selectedPageIndices.size === examPages.length) {
      setSelectedPageIndices(new Set());
    } else {
      const all = new Set<number>();
      examPages.forEach((_, i) => all.add(i));
      setSelectedPageIndices(all);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedPageIndices.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedPageIndices.size} 个页面吗？`)) return;
    
    const newPages = examPages.filter((_, i) => !selectedPageIndices.has(i));
    setExamPages(newPages);
    setSelectedPageIndices(new Set());
    // 如果当前选中的页被删了，重置 activeIdx 到第一页
    setActiveExamPageIdx(0);
  };

  const handleToggleAllRef = () => {
    if (selectedRefPageIndices.size === referencePages.length) {
      setSelectedRefPageIndices(new Set());
    } else {
      setSelectedRefPageIndices(new Set(referencePages.map((_, i) => i)));
    }
  };

  const handleDeleteSelectedRef = () => {
    if (selectedRefPageIndices.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedRefPageIndices.size} 个答案页吗？`)) return;
    const newPages = referencePages.filter((_, i) => !selectedRefPageIndices.has(i));
    setReferencePages(newPages);
    setSelectedRefPageIndices(new Set());
  };

  const toggleRefPageSelection = (idx: number) => {
    const next = new Set(selectedRefPageIndices);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelectedRefPageIndices(next);
  };

  const handleConfirm = () => {
    // 关键点：我们在调用 startExtraction 前，需要将 rect 映射到 allPages 的绝对索引
    const examOffsets = getPageOffsets('exam');
    const refOffsets = getPageOffsets('reference');
    const examTotalHeight = examOffsets.reduce((acc, o) => acc + o.height, 0);

    // 实际上，Hook 期望的是一个单一页池。我们需要构造一个虚拟的“长偏移量数组”给 Hook
    // 修正：refOffsets 的 top 必须加上 examTotalHeight 才能在长条中对齐
    const correctedRefOffsets = refOffsets.map(o => ({ ...o, top: o.top + examTotalHeight }));
    const combinedOffsets = [...examOffsets, ...correctedRefOffsets];

    // 重新修正 rects 的 Y 坐标，使其符合 combinedOffsets 的大长条布局
    const correctedRects = rects.map(r => {
      if (r.source === 'exam') return r;
      return { ...r, y: r.y + examTotalHeight };
    });

    startExtraction(combinedOffsets, selectedPageIndices, isDeepThinking, correctedRects);
  };

  const handleAddFiles = async (files: FileList, source: 'exam' | 'reference') => {
    if (isProcessing) return;
    setProcessing(true);
    try {
      const newPages: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type === 'application/pdf') {
          const imgs = await pdfToImages(file);
          newPages.push(...imgs);
        } else {
          const reader = new FileReader();
          const base64 = await new Promise<string>((res) => {
            reader.onload = (e) => res(e.target?.result as string);
            reader.readAsDataURL(file);
          });
          const compressed = await compressImage(base64);
          newPages.push(compressed);
        }
      }
      if (source === 'exam') setExamPages([...examPages, ...newPages]);
      else setReferencePages([...referencePages, ...newPages]);
    } catch (error) {
      console.error('Failed to add pages:', error);
      alert('添加页面失败。');
    } finally {
      setProcessing(false);
    }
  };

  // === Interaction Logic ===
  const interactionRef = useRef<'none' | 'drawing' | 'moving' | 'resizing' | 'resizing-sidebar' | 'resizing-refpool'>('none');
  const startPosRef = useRef({ x: 0, y: 0 });
  const initialRectRef = useRef<ExtendedRect | null>(null);
  const drawingRectRef = useRef<(Partial<ExtendedRect> & { source: 'exam' | 'reference' }) | null>(null);

  const startDrawing = (e: React.PointerEvent, source: 'exam' | 'reference') => {
    if (isProcessing || !activeDrawMode) return;
    const container = source === 'exam' ? examContainerRef.current : refContainerRef.current;
    if (!container) return;

    try { e.currentTarget.setPointerCapture(e.pointerId); } catch(e) {}
    
    const cr = container.getBoundingClientRect();
    const currentZoom = source === 'exam' ? zoom : 1;
    const x = (e.clientX - cr.left) / currentZoom;
    const y = (e.clientY - cr.top) / currentZoom;
    
    setSelectedId(null);
    const newRect: Partial<ExtendedRect> & { source: 'exam' | 'reference' } = { 
      id: Math.random().toString(36).substring(7), 
      x, y, width: 0, height: 0, type: activeDrawMode, source 
    };
    setDrawingRect(newRect);
    drawingRectRef.current = newRect;
    setIsDrawing(true);
    interactionRef.current = 'drawing';
  };

  useEffect(() => {
    const handleMouseMove = (e: PointerEvent) => {
      if (interactionRef.current === 'none') return;

      if (interactionRef.current === 'resizing-refpool') {
        const newWidth = window.innerWidth - e.clientX;
        setRefPoolWidth(Math.max(200, Math.min(newWidth, window.innerWidth * 0.6)));
        return;
      }

      if (interactionRef.current === 'resizing-sidebar') {
        setSidebarWidth(Math.max(150, Math.min(e.clientX, 400)));
        return;
      }

      const source = drawingRectRef.current?.source || initialRectRef.current?.source;
      const container = source === 'exam' ? examContainerRef.current : refContainerRef.current;
      if (!container) return;
      const cr = container.getBoundingClientRect();
      const dx = (e.clientX - startPosRef.current.x) / zoom;
      const dy = (e.clientY - startPosRef.current.y) / zoom;

      if (interactionRef.current === 'drawing') {
        const x = (e.clientX - cr.left) / zoom;
        const y = (e.clientY - cr.top) / zoom;
        setDrawingRect(prev => {
          if (!prev || prev.x === undefined || prev.y === undefined) return prev;
          const updated = { ...prev, width: x - prev.x, height: y - prev.y };
          drawingRectRef.current = updated;
          return updated;
        });
      } else if (interactionRef.current === 'moving' && selectedId && initialRectRef.current) {
        const initial = initialRectRef.current;
        setRects(prev => prev.map(r => r.id === selectedId ? { ...r, x: initial.x + dx, y: initial.y + dy } : r));
      } else if (interactionRef.current === 'resizing' && selectedId && initialRectRef.current && resizeHandle) {
        const initial = initialRectRef.current;
        setRects(prev => prev.map(r => {
          if (r.id !== selectedId) return r;
          let { x, y, width: w, height: h } = initial;
          if (resizeHandle.includes('e')) w += dx;
          if (resizeHandle.includes('w')) { x += dx; w -= dx; }
          if (resizeHandle.includes('s')) h += dy;
          if (resizeHandle.includes('n')) { y += dy; h -= dy; }
          return { ...r, x, y, width: w, height: h };
        }));
      }
    };

    const handleMouseUp = () => {
      if (interactionRef.current === 'drawing' && drawingRectRef.current) {
        const r = drawingRectRef.current;
        if (Math.abs(r.width || 0) > 10 && Math.abs(r.height || 0) > 10) {
          let targetQIdx = activeQIdx;
          const isQuestion = r.type === 'question' || !r.type;
          if (isQuestion && rects.some(exist => exist.qIdx === activeQIdx && (exist.type === 'question' || !exist.type))) {
             targetQIdx = activeQIdx + 1;
             setActiveQIdx(targetQIdx);
          }
          const finalRect: ExtendedRect = {
            id: r.id!,
            x: r.width! > 0 ? r.x! : r.x! + r.width!,
            y: r.height! > 0 ? r.y! : r.y! + r.height!,
            width: Math.abs(r.width!),
            height: Math.abs(r.height!),
            type: r.type as any,
            qIdx: targetQIdx,
            source: r.source
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
        onConfirm={handleConfirm}
        onComplete={onComplete}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：页面概览 */}
        <div className="bg-white border-r flex flex-col relative group" style={{ width: sidebarWidth }}>
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex flex-col">
              <h4 className="text-xs font-black uppercase tracking-widest text-gray-400">页面概览</h4>
              {examPages.length > 0 && (
                <span className="text-[9px] font-bold text-blue-500 mt-1 uppercase tracking-tighter">
                  已选 {selectedPageIndices.size} / {examPages.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {examPages.length > 0 && (
                <>
                  <button 
                    disabled={selectedPageIndices.size === 0}
                    onClick={handleDeleteSelected}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase transition-all",
                      selectedPageIndices.size > 0 ? "bg-red-50 text-red-500 hover:bg-red-500 hover:text-white" : "text-gray-200 cursor-not-allowed"
                    )}
                    title="删除选中页面"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={handleToggleAll}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase transition-all",
                      selectedPageIndices.size === examPages.length ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                    )}
                  >
                    {selectedPageIndices.size === examPages.length ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                    <span>全选</span>
                  </button>
                </>
              )}
              <LayoutList className="w-4 h-4 text-gray-300" />
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
          {/* Sidebar Resizer */}
          <div 
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 transition-colors z-50"
            onPointerDown={() => interactionRef.current = 'resizing-sidebar'}
          />
        </div>

        {/* 中间：试卷主画布 */}
        <div ref={examScrollRef} className="flex-1 overflow-auto bg-gray-100/30 p-8 scroll-smooth relative">
           <div className="mx-auto" style={{ width: `${zoom * 100}%` }}>
              <div 
                ref={examContainerRef} 
                className={cn("relative shadow-2xl bg-white flex flex-col origin-top overflow-hidden rounded-sm", isProcessing ? "opacity-40" : "cursor-crosshair")} 
                onPointerDown={(e) => startDrawing(e, 'exam')}
              >
                {examPages.map((page, idx) => (
                  <img key={`img-exam-${idx}`} ref={el => { examImgRefs.current[idx] = el; }} src={page} className="block w-full select-none" onLoad={() => setImagesLoaded(prev => prev + 1)} />
                ))}
                <RectsLayer rects={rects.filter(r => r.source === 'exam')} zoom={zoom} selectedId={selectedId} startMoving={startMoving} startResizing={startResizing} onRemove={(id: string) => setRects(p => p.filter(x => x.id !== id))} />
                {isDrawing && drawingRect?.source === 'exam' && <DrawingPreview rect={drawingRect} zoom={zoom} />}
              </div>
           </div>
        </div>

        {/* 右侧：分栏调节条 */}
        <div 
          className="w-1.5 bg-gray-200 hover:bg-blue-500 cursor-col-resize transition-colors z-[60] shadow-[0_0_10px_rgba(0,0,0,0.05)]"
          onPointerDown={() => interactionRef.current = 'resizing-refpool'}
        />

        {/* 右侧：答案池/参考库 */}
        <div className="bg-white border-l flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.02)]" style={{ width: refPoolWidth }}>
           <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                 <div className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-black rounded uppercase">Ref Pool</div>
                 <h4 className="text-sm font-black text-gray-800">答案参考池</h4>
                 {referencePages.length > 0 && (
                   <span className="text-[9px] font-bold text-blue-500 uppercase tracking-tighter ml-1">
                     已选 {selectedRefPageIndices.size}/{referencePages.length}
                   </span>
                 )}
              </div>
              <div className="flex items-center gap-2">
                 {referencePages.length > 0 && (
                  <>
                    <button 
                      disabled={selectedRefPageIndices.size === 0}
                      onClick={handleDeleteSelectedRef}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase transition-all",
                        selectedRefPageIndices.size > 0 ? "bg-red-50 text-red-500 hover:bg-red-500 hover:text-white" : "text-gray-200 cursor-not-allowed"
                      )}
                      title="删除选中页面"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <button 
                      onClick={handleToggleAllRef}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase transition-all",
                        selectedRefPageIndices.size === referencePages.length ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                      )}
                    >
                      {selectedRefPageIndices.size === referencePages.length ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                      <span>全选</span>
                    </button>
                  </>
                )}
                <Info className="w-4 h-4 text-gray-300" />
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
                    <div key={`img-ref-${idx}`} className="group/ref-item scroll-mt-4 relative">
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); toggleRefPageSelection(idx); }}
                        className={cn(
                           "absolute top-4 left-4 p-1 rounded z-30 transition-all shadow-lg",
                           selectedRefPageIndices.has(idx) ? "bg-blue-500 text-white" : "bg-white/80 text-gray-400 hover:bg-gray-200 opacity-0 group-hover/ref-item:opacity-100"
                        )}
                      >
                         {selectedRefPageIndices.has(idx) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                      </button>
                      <img ref={el => { refImgRefs.current[idx] = el; }} src={page} className={cn("block w-full select-none mb-4 border-b last:border-0", selectedRefPageIndices.has(idx) && "opacity-80 mix-blend-multiply border-blue-500 border-2")} />
                      <button 
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); handlePageDelete(idx, 'reference'); }}
                        className="absolute top-4 right-4 p-2 rounded-xl bg-red-500 text-white shadow-2xl opacity-0 group-hover/ref-item:opacity-100 transition-all hover:scale-110 active:scale-90 flex items-center gap-2 z-30"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="text-xs font-black">删除此页</span>
                      </button>
                    </div>
                  ))}
                  <RectsLayer rects={rects.filter(r => r.source === 'reference')} zoom={1} selectedId={selectedId} startMoving={startMoving} startResizing={startResizing} onRemove={(id: string) => setRects(p => p.filter(x => x.id !== id))} />
                  {isDrawing && drawingRect?.source === 'reference' && <DrawingPreview rect={drawingRect} zoom={1} />}
                </div>
                {/* 答案页面追加 */}
                <div className="mt-8 mb-20 max-w-[200px] mx-auto">
                   <AddCard label="答案页面" onAdd={(files) => handleAddFiles(files, 'reference')} />
                </div>
              </div>
           </div>
        </div>
      </div>

      {/* 故障面板 */}
      {parsingFailures.length > 0 && <ParsingFailurePanel failures={parsingFailures} isProcessing={isProcessing} onDismiss={() => {}} />}
    </div>
  );
};


