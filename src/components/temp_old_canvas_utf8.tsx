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
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectStore, Question } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { compressImage } from '@/lib/documentProcessor';
import { type CanvasRect as Rect, type PageOffset } from '@/lib/canvasCropper';
import { ParsingFailurePanel } from '@/components/canvas/ParsingFailurePanel';
import { useAIExtraction } from '@/hooks/useAIExtraction';

interface ExtractionCanvasProps {
  examPages: string[];
  referencePages: string[];
  initialPageIndex?: number;
  initialNormalizedRects?: { pageIdx: number, box: [number, number, number, number] }[];
  onComplete: () => void;
  onClose?: () => void;
}

// 鎵╁睍 Rect 绫诲瀷锛屾敮鎸佹潵婧愯拷韪?interface ExtendedRect extends Rect {
  source: 'exam' | 'reference';
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
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [refPoolWidth, setRefPoolWidth] = useState(window.innerWidth / 3); // 榛樿 1/3 瀹藉害
  const [isDeepThinking, setIsDeepThinking] = useState(false);
  const [activeQIdx, setActiveQIdx] = useState(1);

  // === Hooks ===
  // AI 鎻愬彇 Hook锛氭垜浠皢涓ょ珯椤甸潰鐨勫悎闆嗕紶缁欏畠
  const allPages = useMemo(() => [...examPages, ...referencePages], [examPages, referencePages]);
  
  const { 
    startExtraction,
    progress,
    progressLabel,
    parsingFailures,
    isProcessing,
  } = useAIExtraction({
    pages: allPages,
    rects, // 铏界劧 Hook 鏈熸湜 Rect[]锛屼絾 ExtendedRect 鏄吋瀹圭殑
    onComplete
  });

  const { 
    setProcessing,
    setExamPages, 
    setReferencePages,
    resetUpload 
  } = useProjectStore();

  // === Logic: Page Offsets ===
  // 鎴戜滑闇€瑕佷袱缁?Offset锛岀敤浜庤绠椾笉鍚屽鍣ㄥ唴鐨?pageIdx
  const getPageOffsets = useCallback((source: 'exam' | 'reference'): PageOffset[] => {
    const container = source === 'exam' ? examContainerRef.current : refContainerRef.current;
    const imgRefs = source === 'exam' ? examImgRefs.current : refImgRefs.current;
    if (!container) return [];
    
    return imgRefs.map((img) => {
      if (!img) return { top: 0, height: 0, imgWidth: 0, naturalWidth: 1, naturalHeight: 1 };
      return {
        top: img.offsetTop / zoom,
        height: img.clientHeight / zoom,
        imgWidth: img.clientWidth / zoom,
        naturalWidth: img.naturalWidth || 1,
        naturalHeight: img.naturalHeight || 1,
      };
    });
  }, [zoom]);

  const handleConfirm = () => {
    // 鍏抽敭鐐癸細鎴戜滑鍦ㄨ皟鐢?startExtraction 鍓嶏紝闇€瑕佸皢 rect 鏄犲皠鍒?allPages 鐨勭粷瀵圭储寮?    const examOffsets = getPageOffsets('exam');
    const refOffsets = getPageOffsets('reference');
    const examTotalHeight = examOffsets.reduce((acc, o) => acc + o.height, 0);

    // 瀹為檯涓婏紝Hook 鏈熸湜鐨勬槸涓€涓崟涓€椤垫睜銆傛垜浠渶瑕佹瀯閫犱竴涓櫄鎷熺殑鈥滈暱鍋忕Щ閲忔暟缁勨€濈粰 Hook
    // 淇锛歳efOffsets 鐨?top 蹇呴』鍔犱笂 examTotalHeight 鎵嶈兘鍦ㄩ暱鏉′腑瀵归綈
    const correctedRefOffsets = refOffsets.map(o => ({ ...o, top: o.top + examTotalHeight }));
    const combinedOffsets = [...examOffsets, ...correctedRefOffsets];

    // 閲嶆柊淇 rects 鐨?Y 鍧愭爣锛屼娇鍏剁鍚?combinedOffsets 鐨勫ぇ闀挎潯甯冨眬
    const correctedRects = rects.map(r => {
      if (r.source === 'exam') return r;
      return { ...r, y: r.y + examTotalHeight };
    });

    startExtraction(combinedOffsets, selectedPageIndices, isDeepThinking, correctedRects);
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
    const x = (e.clientX - cr.left) / zoom;
    const y = (e.clientY - cr.top) / zoom;
    
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

  const handleDeleteSelectedImages = () => {
    if (selectedPageIndices.size === 0) return;
    if (!confirm(`纭畾鍒犻櫎閫変腑鐨?${selectedPageIndices.size} 涓〉闈㈠悧锛焋)) return;
    // 閫昏緫锛氱洰鍓嶄粎鏀寔浠?Exam 闆嗛噷鍒犮€傜畝鍖栬捣瑙佹殏鏃朵笉瀵?Reference 闆嗗仛鎵归噺鍒犻櫎閫昏緫
    const newExamPages = examPages.filter((_, i) => !selectedPageIndices.has(i));
    setExamPages(newExamPages);
    setSelectedPageIndices(new Set());
  };

  return (
    <div className="flex flex-col h-full bg-[#f8f9fc] overflow-hidden relative">
      {/* 椤堕儴杩涘害鏉?*/}
      {isProcessing && (
        <div className="absolute inset-x-0 top-0 z-[100] h-1.5 bg-gray-100 overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} className="h-full bg-blue-600" />
        </div>
      )}

      {/* Header */}
      <Header 
        onClose={onClose} 
        activeDrawMode={activeDrawMode} 
        setActiveDrawMode={setActiveDrawMode}
        isDeepThinking={isDeepThinking}
        setIsDeepThinking={setIsDeepThinking}
        isProcessing={isProcessing}
        onConfirm={handleConfirm}
        zoom={zoom}
        setZoom={setZoom}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* 宸︿晶锛氶〉闈㈡瑙?*/}
        <div className="bg-white border-r flex flex-col relative group" style={{ width: sidebarWidth }}>
          <div className="p-4 border-b flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-widest text-gray-400">椤甸潰姒傝</h4>
            <LayoutList className="w-4 h-4 text-gray-300" />
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
             <SectionLabel label="璇曞嵎涓荤礌鏉? count={examPages.length} />
             {examPages.map((p, i) => (
                <Thumbnail key={`exam-${i}`} src={p} index={i+1} active={activeExamPageIdx === i} onClick={() => {
                   setActiveExamPageIdx(i);
                   const img = examImgRefs.current[i];
                   if (img) img.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }} />
             ))}
             {referencePages.length > 0 && (
               <>
                 <SectionLabel label="瑙ｆ瀽/鍙傝€冨簱" count={referencePages.length} />
                 {referencePages.map((p, i) => (
                    <Thumbnail key={`ref-${i}`} src={p} index={i+1} isRef onClick={() => {
                       const img = refImgRefs.current[i];
                       if (img) img.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }} />
                 ))}
               </>
             )}
          </div>
          {/* Sidebar Resizer */}
          <div 
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 transition-colors z-50"
            onPointerDown={() => interactionRef.current = 'resizing-sidebar'}
          />
        </div>

        {/* 涓棿锛氳瘯鍗蜂富鐢诲竷 */}
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

        {/* 鍙充晶锛氬垎鏍忚皟鑺傛潯 */}
        <div 
          className="w-1.5 bg-gray-200 hover:bg-blue-500 cursor-col-resize transition-colors z-[60] shadow-[0_0_10px_rgba(0,0,0,0.05)]"
          onPointerDown={() => interactionRef.current = 'resizing-refpool'}
        />

        {/* 鍙充晶锛氱瓟妗堟睜/鍙傝€冨簱 */}
        <div className="bg-white border-l flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.02)]" style={{ width: refPoolWidth }}>
           <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                 <div className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-black rounded uppercase">Ref Pool</div>
                 <h4 className="text-sm font-black text-gray-800">绛旀鍙傝€冩睜</h4>
              </div>
              <Info className="w-4 h-4 text-gray-300" />
           </div>
           <div ref={refScrollRef} className="flex-1 overflow-auto bg-gray-100 p-4 relative scroll-smooth">
              <div className="mx-auto" style={{ width: '95%' }}>
                 <div 
                  ref={refContainerRef} 
                  className={cn("relative shadow-xl bg-white flex flex-col overflow-hidden", isProcessing ? "opacity-30" : "cursor-crosshair")} 
                  onPointerDown={(e) => startDrawing(e, 'reference')}
                >
                  {referencePages.map((page, idx) => (
                    <img key={`img-ref-${idx}`} ref={el => { refImgRefs.current[idx] = el; }} src={page} className="block w-full select-none mb-4 border-b last:border-0" />
                  ))}
                  <RectsLayer rects={rects.filter(r => r.source === 'reference')} zoom={1} selectedId={selectedId} startMoving={startMoving} startResizing={startResizing} onRemove={(id: string) => setRects(p => p.filter(x => x.id !== id))} />
                  {isDrawing && drawingRect?.source === 'reference' && <DrawingPreview rect={drawingRect} zoom={1} />}
                </div>
              </div>
           </div>
        </div>
      </div>

      {/* 鏁呴殰闈㈡澘 */}
      {parsingFailures.length > 0 && <ParsingFailurePanel failures={parsingFailures} isProcessing={isProcessing} onDismiss={() => {}} />}
    </div>
  );
};

// --- Sub components to keep code clean ---

const Header = ({ onClose, activeDrawMode, setActiveDrawMode, isDeepThinking, setIsDeepThinking, isProcessing, onConfirm, zoom, setZoom }: any) => {
  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b z-20 shadow-sm">
      <div className="flex items-center gap-4">
        {onClose && (
          <button onClick={onClose} className="p-2 bg-red-50 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all">
            <X className="w-5 h-5 stroke-[3px]" />
          </button>
        )}
        <div className="h-8 w-px bg-gray-200 mx-2" />
        <div className="flex bg-gray-100 p-1 rounded-xl">
          {(['question', 'answer', 'analysis', 'diagram'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setActiveDrawMode((p: any) => p === mode ? null : mode)}
              className={cn(
                "px-5 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2",
                activeDrawMode === mode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <div className={cn("w-2 h-2 rounded-full", {
                'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]': mode === 'question',
                'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]': mode === 'answer',
                'bg-fuchsia-500 shadow-[0_0_8px_rgba(217,70,239,0.5)]': mode === 'analysis',
                'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]': mode === 'diagram'
              })} />
              {mode === 'question' ? '棰樼洰' : mode === 'answer' ? '绛旀' : mode === 'analysis' ? '鍒嗘瀽' : '鎻掑浘'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
         <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
            {[0.5, 1, 1.5].map(z => (
              <button key={z} onClick={() => setZoom(z)} className={cn("px-3 py-1 rounded-md text-[10px] font-black", zoom === z ? "bg-white shadow-sm" : "text-gray-400")}>
                {z*100}%
              </button>
            ))}
         </div>
         <button
            onClick={() => setIsDeepThinking(!isDeepThinking)}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-full border-2 transition-all",
              isDeepThinking ? "bg-indigo-600 border-indigo-600 text-white shadow-lg" : "bg-white border-gray-200 text-gray-500"
            )}
          >
            {isDeepThinking ? <Brain className="w-4 h-4 animate-pulse" /> : <Zap className="w-4 h-4" />}
            <span className="text-[10px] font-black uppercase tracking-widest">娣卞害鎬濊€?/span>
          </button>
          <button 
            onClick={onConfirm} 
            disabled={isProcessing} 
            className="px-10 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white text-sm font-black rounded-full shadow-xl hover:scale-105 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            璇嗗埆骞惰В鏋?          </button>
      </div>
    </div>
  );
};

const SectionLabel = ({ label, count }: any) => (
  <div className="pt-2 pb-1 flex items-center justify-between border-b border-gray-50 mb-2">
    <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">{label}</span>
    <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">{count}</span>
  </div>
);

const Thumbnail = ({ src, index, active, onClick, isRef }: any) => (
  <div 
    onClick={onClick}
    className={cn(
      "relative rounded-xl overflow-hidden border-2 aspect-[3/4] cursor-pointer transition-all hover:shadow-md", 
      active ? "border-blue-500 scale-[1.05] z-10 shadow-lg" : isRef ? "border-purple-200 opacity-80" : "border-gray-100"
    )}
  >
    <img src={src} className="w-full h-full object-cover" />
    <div className={cn("absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-black text-white", isRef ? "bg-purple-500" : "bg-blue-500")}>
       {isRef ? "R" : "P"}{index}
    </div>
  </div>
);

const RectsLayer = ({ rects, zoom, selectedId, startMoving, startResizing, onRemove }: any) => (
  <>
    {rects.map((r: any) => (
      <div
        key={r.id}
        onPointerDown={(e: any) => startMoving(e, r.id)}
        style={{ left: r.x * zoom, top: r.y * zoom, width: r.width * zoom, height: r.height * zoom }}
        className={cn("absolute border-2 shadow-lg group transition-colors", {
          'border-blue-500 bg-blue-500/10': r.type === 'question' || !r.type,
          'border-rose-500 bg-rose-500/10': r.type === 'answer',
          'border-fuchsia-500 bg-fuchsia-500/10': r.type === 'analysis',
          'border-emerald-500 bg-emerald-500/10': r.type === 'diagram',
          'ring-4 ring-yellow-400 z-50': selectedId === r.id
        })}
      >
        <div className="absolute -top-7 left-0 px-2 py-1 bg-black/80 text-white text-[9px] font-black rounded backdrop-blur-md flex items-center gap-2 whitespace-nowrap">
           #{r.qIdx} {r.type === 'question' ? '棰樼洰' : r.type === 'answer' ? '绛旀' : r.type === 'analysis' ? '鍒嗘瀽' : '鎻掑浘'}
           <button onClick={(e) => { e.stopPropagation(); onRemove(r.id); }} className="hover:text-rose-400 p-0.5"><Trash2 className="w-3 h-3" /></button>
        </div>
        {selectedId === r.id && ['nw','ne','sw','se','n','s','e','w'].map(h => (
          <div 
            key={h} 
            className={cn("absolute w-3 h-3 bg-white border-2 rounded-full z-[100] shadow-md border-blue-500", {
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
  </>
);

const DrawingPreview = ({ rect, zoom }: any) => (
  <div 
    className={cn("absolute border-2 border-dashed border-black/40 bg-black/5", {
      'border-blue-500 bg-blue-500/10': rect.type === 'question',
      'border-rose-500 bg-rose-500/10': rect.type === 'answer',
      'border-fuchsia-500 bg-fuchsia-500/10': rect.type === 'analysis',
      'border-emerald-500 bg-emerald-500/10': rect.type === 'diagram'
    })}
    style={{ 
      left: (rect.width! > 0 ? rect.x! : rect.x! + rect.width!) * zoom,
      top: (rect.height! > 0 ? rect.y! : rect.y! + rect.height!) * zoom,
      width: Math.abs(rect.width!) * zoom,
      height: Math.abs(rect.height!) * zoom
    }}
  />
);
