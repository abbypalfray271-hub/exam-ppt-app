'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, CheckCircle2, Loader2, X, Sparkles } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';

interface Rect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type?: 'question' | 'answer' | 'solution';
}

interface PageOffset {
  top: number;
  height: number;
  imgWidth: number;
  naturalWidth: number;
  naturalHeight: number;
}

export interface NormalizedRect {
  pageIdx: number;
  box: [number, number, number, number];
  type?: 'question' | 'answer' | 'solution';
}

interface ExtractionCanvasProps {
  pages: string[];
  initialPageIndex?: number;
  onComplete: () => void;
  onClose?: () => void;
}

export const ExtractionCanvas = ({ pages, initialPageIndex = 0, onComplete, onClose }: ExtractionCanvasProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [rects, setRects] = useState<Rect[]>([]);
  const [drawingRect, setDrawingRect] = useState<Partial<Rect> | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [activePageIdx, setActivePageIdx] = useState(initialPageIndex);
  const [activeDrawMode, setActiveDrawMode] = useState<'question' | 'answer' | 'solution'>('question');
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const [zoom, setZoom] = useState(1);

  const { addQuestion, setProcessing, setView, autoDetectedRects, setAutoDetectedRects } = useProjectStore();

  const interactionRef = useRef<'none' | 'drawing' | 'moving' | 'resizing'>('none');
  const startPosRef = useRef({ x: 0, y: 0 });
  const initialRectRef = useRef<Rect | null>(null);
  const drawingRectRef = useRef<Partial<Rect> | null>(null);

  const [hasInitializedRects, setHasInitializedRects] = useState(false);
  useEffect(() => {
    if (imagesLoaded >= pages.length && !hasInitializedRects && autoDetectedRects.length > 0) {
      const offsets = getPageOffsets();
      if (offsets.length === pages.length) {
        const restored: Rect[] = autoDetectedRects.map((nr, i) => {
          const off = offsets[nr.pageIdx];
          const [y1, x1, y2, x2] = nr.box;
          return {
            id: `restored-${i}-${Date.now()}`,
            x: (x1 / 10000) * off.imgWidth,
            y: off.top + (y1 / 10000) * off.height,
            width: ((x2 - x1) / 10000) * off.imgWidth,
            height: ((y2 - y1) / 10000) * off.height,
            type: nr.type || 'question'
          };
        });
        setRects(restored);
        setHasInitializedRects(true);
      }
    }
  }, [imagesLoaded, pages.length, hasInitializedRects, autoDetectedRects]);

  useEffect(() => {
    if (initialPageIndex > 0 && imagesLoaded >= pages.length) {
      const img = imgRefs.current[initialPageIndex];
      if (img && scrollRef.current) {
        img.scrollIntoView({ block: 'start' });
      }
    }
  }, [initialPageIndex, imagesLoaded, pages.length]);

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

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const handleScroll = () => {
      const offsets = getPageOffsets();
      if (offsets.length === 0) return;
      const anchor = (scrollEl.scrollTop + scrollEl.clientHeight / 3) / zoom;
      let active = 0;
      for (let i = 0; i < offsets.length; i++) {
        if (offsets[i].top <= anchor) active = i;
      }
      setActivePageIdx(active);
    };
    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [getPageOffsets, zoom]);

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

  const startMoving = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    if (isAnalyzing) return;
    const rect = rects.find(r => r.id === id);
    if (!rect) return;
    setSelectedId(id);
    interactionRef.current = 'moving';
    startPosRef.current = { x: e.clientX, y: e.clientY };
    initialRectRef.current = { ...rect };
  };

  const startResizing = (e: React.PointerEvent, id: string, handle: string) => {
    e.stopPropagation();
    if (isAnalyzing) return;
    const rect = rects.find(r => r.id === id);
    if (!rect) return;
    setSelectedId(id);
    setResizeHandle(handle);
    interactionRef.current = 'resizing';
    startPosRef.current = { x: e.clientX, y: e.clientY };
    initialRectRef.current = { ...rect };
  };

  const startDrawing = (e: React.PointerEvent) => {
    if (!containerRef.current || isAnalyzing) return;
    const cr = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - cr.left) / zoom;
    const y = (e.clientY - cr.top) / zoom;
    setSelectedId(null);
    const id = crypto.randomUUID();
    const newRect = { id, x, y, width: 0, height: 0, type: activeDrawMode };
    setDrawingRect(newRect);
    drawingRectRef.current = newRect;
    setIsDrawing(true);
    interactionRef.current = 'drawing';
  };

  useEffect(() => {
    const handleMouseMove = (e: PointerEvent) => {
      if (!containerRef.current || interactionRef.current === 'none') return;
      const cr = containerRef.current.getBoundingClientRect();
      if (interactionRef.current === 'drawing') {
        const x = (e.clientX - cr.left) / zoom;
        const y = (e.clientY - cr.top) / zoom;
        const boundedX = Math.max(0, Math.min(x, cr.width / zoom));
        const boundedY = Math.max(0, Math.min(y, cr.height / zoom));
        setDrawingRect((current) => {
          if (!current || current.x === undefined || current.y === undefined) return current;
          const updated = { ...current, width: boundedX - current.x, height: boundedY - current.y };
          drawingRectRef.current = updated;
          return updated;
        });
      } else if (interactionRef.current === 'moving' && initialRectRef.current) {
        const dx = (e.clientX - startPosRef.current.x) / zoom;
        const dy = (e.clientY - startPosRef.current.y) / zoom;
        setRects(prev => prev.map(r => {
          if (r.id === selectedId && initialRectRef.current) {
            let nextX = initialRectRef.current.x + dx;
            let nextY = initialRectRef.current.y + dy;
            nextX = Math.max(0, Math.min(nextX, (cr.width / zoom) - initialRectRef.current.width));
            nextY = Math.max(0, Math.min(nextY, (cr.height / zoom) - initialRectRef.current.height));
            return { ...r, x: nextX, y: nextY };
          }
          return r;
        }));
      } else if (interactionRef.current === 'resizing' && initialRectRef.current && resizeHandle) {
        const dx = (e.clientX - startPosRef.current.x) / zoom;
        const dy = (e.clientY - startPosRef.current.y) / zoom;
        setRects(prev => prev.map(r => {
          if (r.id === selectedId && initialRectRef.current) {
            let { x, y, width: w, height: h } = initialRectRef.current;
            if (resizeHandle.includes('e')) w += dx;
            if (resizeHandle.includes('w')) { x += dx; w -= dx; }
            if (resizeHandle.includes('s')) h += dy;
            if (resizeHandle.includes('n')) { y += dy; h -= dy; }
            if (Math.abs(w) < 10 || Math.abs(h) < 10) return r;
            return { ...r, x, y, width: w, height: h };
          }
          return r;
        }));
      }
    };

    const handleMouseUp = () => {
      if (interactionRef.current === 'drawing') {
        const currentRect = drawingRectRef.current;
        if (currentRect && Math.abs(currentRect.width || 0) > 10 && Math.abs(currentRect.height || 0) > 10) {
          const normalized: Rect = {
            id: currentRect.id || crypto.randomUUID(),
            x: currentRect.width! > 0 ? currentRect.x! : currentRect.x! + currentRect.width!,
            y: currentRect.height! > 0 ? currentRect.y! : currentRect.y! + currentRect.height!,
            width: Math.abs(currentRect.width!),
            height: Math.abs(currentRect.height!),
            type: currentRect.type,
          };
          setRects(prev => [...prev, normalized]);
          setSelectedId(normalized.id);
        }
        setDrawingRect(null);
        drawingRectRef.current = null;
      }
      interactionRef.current = 'none';
      setResizeHandle(null);
      initialRectRef.current = null;
      setIsDrawing(false);
    };

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
    return () => {
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
    };
  }, [selectedId, resizeHandle, zoom]);

  const cropRect = async (rect: Rect, offsets: PageOffset[]): Promise<string> => {
    const rectTop = rect.y;
    const rectBottom = rect.y + rect.height;
    const overlapping: { pageIdx: number; cropTop: number; cropHeight: number; offset: PageOffset }[] = [];
    for (let i = 0; i < offsets.length; i++) {
      const pTop = offsets[i].top;
      const pBottom = pTop + offsets[i].height;
      if (rectTop < pBottom && rectBottom > pTop) {
        const cTop = Math.max(0, rectTop - pTop);
        const cBottom = Math.min(offsets[i].height, rectBottom - pTop);
        overlapping.push({ pageIdx: i, cropTop: cTop, cropHeight: cBottom - cTop, offset: offsets[i] });
      }
    }
    if (overlapping.length === 0) throw new Error('Overlap failed');

    const loaded = await Promise.all(overlapping.map(({ pageIdx }) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.src = pages[pageIdx];
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Page load failed'));
      })
    ));

    const segments: { img: HTMLImageElement; sx: number; sy: number; sw: number; sh: number }[] = [];
    let totalH = 0;
    let outputW = 0;

    for (let i = 0; i < overlapping.length; i++) {
      const { cropTop: cTop, cropHeight: cH, offset } = overlapping[i];
      const img = loaded[i];
      const sx = (rect.x / offset.imgWidth) * img.naturalWidth;
      const sy = (cTop / offset.height) * img.naturalHeight;
      const sw = (rect.width / offset.imgWidth) * img.naturalWidth;
      const sh = (cH / offset.height) * img.naturalHeight;
      segments.push({ img, sx, sy, sw, sh });
      totalH += sh;
      if (i === 0) outputW = sw;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas ctx failed');
    canvas.width = outputW;
    canvas.height = totalH;
    let yOff = 0;
    for (const seg of segments) {
      ctx.drawImage(seg.img, seg.sx, seg.sy, seg.sw, seg.sh, 0, yOff, outputW, seg.sh);
      yOff += seg.sh;
    }
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const handleConfirm = async () => {
    if (rects.length === 0 || isAnalyzing) return;
    if (imagesLoaded < pages.length) {
      alert('图片加载中，请稍候...');
      return;
    }

    // -- 新增：解析前先存一份当前的物理框到 Store，确保持久化 --
    const offsets = getPageOffsets();
    const normalizedToSave: NormalizedRect[] = rects.map(r => {
      let pageIdx = 0;
      for (let i = 0; i < offsets.length; i++) {
        if (r.y >= offsets[i].top - 5 && r.y < offsets[i].top + offsets[i].height) {
          pageIdx = i;
          break;
        }
      }
      const off = offsets[pageIdx];
      return {
        pageIdx,
        type: r.type,
        box: [
          Math.round(((r.y - off.top) / off.height) * 10000),
          Math.round((r.x / off.imgWidth) * 10000),
          Math.round(((r.y + r.height - off.top) / off.height) * 10000),
          Math.round(((r.x + r.width) / off.imgWidth) * 10000)
        ]
      } as NormalizedRect;
    });
    setAutoDetectedRects(normalizedToSave);

    setIsAnalyzing(true);
    setProcessing(true);
    let processedCount = 0;
    const qRects = rects.filter(r => r.type !== 'answer' && r.type !== 'solution').sort((a, b) => a.y - b.y);
    const aRects = rects.filter(r => r.type === 'answer');
    const sRects = rects.filter(r => r.type === 'solution');

    let succeeded = false;
    try {
      const store = useProjectStore.getState();
      store.setQuestions([]); // 清空旧数据，准备接收新识别结果

      for (let i = 0; i < qRects.length; i++) {
        const qRect = qRects[i];
        setStatusText(`正在识别第 ${i + 1} / ${qRects.length} 题...`);
        setProgress((i / qRects.length) * 100);

        const childAns = aRects.filter(ar => {
          const cx = ar.x + ar.width / 2;
          const cy = ar.y + ar.height / 2;
          return cx >= qRect.x - 20 && cx <= qRect.x + qRect.width + 20 && cy >= qRect.y - 120 && cy <= qRect.y + qRect.height + 250;
        });
        const childSol = sRects.filter(sr => {
          const cx = sr.x + sr.width / 2;
          const cy = sr.y + sr.height / 2;
          return cx >= qRect.x - 20 && cx <= qRect.x + qRect.width + 20 && cy >= qRect.y - 120 && cy <= qRect.y + qRect.height + 250;
        });

        let manualAnswerBox: [number, number, number, number] | undefined;
        if (childAns.length > 0) {
          const ar = childAns[0];
          manualAnswerBox = [
            Math.max(0, Math.round((ar.y - qRect.y) / qRect.height * 10000)),
            Math.max(0, Math.round((ar.x - qRect.x) / qRect.width * 10000)),
            Math.min(10000, Math.round((ar.y + ar.height - qRect.y) / qRect.height * 10000)),
            Math.min(10000, Math.round((ar.x + ar.width - qRect.x) / qRect.width * 10000))
          ];
        }

        let manualAnalysisBox: [number, number, number, number] | undefined;
        if (childSol.length > 0) {
          const sr = childSol[0];
          manualAnalysisBox = [
            Math.max(0, Math.round((sr.y - qRect.y) / qRect.height * 10000)),
            Math.max(0, Math.round((sr.x - qRect.x) / qRect.width * 10000)),
            Math.min(10000, Math.round((sr.y + sr.height - qRect.y) / qRect.height * 10000)),
            Math.min(10000, Math.round((sr.x + sr.width - qRect.x) / qRect.width * 10000))
          ];
        }

        const base64 = await cropRect(qRect, offsets);
        let solImage: string | undefined;
        if (childSol.length > 0) solImage = await cropRect(childSol[0], offsets);

        const res = await fetch('/api/ai-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'parseQuestion', imageData: base64 })
        });
        const result = await res.json();

        if (result.success && result.data) {
          result.data.forEach((q: any, idx: number) => {
            store.addQuestion({
              ...q,
              id: crypto.randomUUID(),
              image: base64,
              contentImage: base64,
              solutionImage: solImage,
              answer_box: manualAnswerBox || q.answer_box || q.answerBox,
              analysis_box: manualAnalysisBox,
              analysis: q.analysis || '',
              order: i * 10 + idx
            });
          });
        }
        processedCount++;
        setProgress((processedCount / qRects.length) * 100);
      }
      setProgress(100);
      setStatusText('识别完成，正在进入编辑器...');
      await new Promise(r => setTimeout(r, 600));
      succeeded = true;
    } catch (err) {
      console.error(err);
      alert('解析过程中发生错误');
    } finally {
      setIsAnalyzing(false);
      setProcessing(false);
      setStatusText('');
    }

    if (succeeded) {
      setView('editor');
      onComplete();
    }
  };

  const getPageRectCount = (pageIdx: number): number => {
    const offsets = getPageOffsets();
    const o = offsets[pageIdx];
    if (!o) return 0;
    return rects.filter(r => r.type !== 'answer' && r.type !== 'solution' && r.y < o.top + o.height && r.y + r.height > o.top).length;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden relative">
      <AnimatePresence>
        {isAnalyzing && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[999] bg-white/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="relative w-32 h-32 mb-8"
            >
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-100" />
                <circle 
                  cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" 
                  className="text-blue-600 transition-all duration-500 ease-out"
                  strokeDasharray={364.4}
                  strokeDashoffset={364.4 * (1 - progress / 100)}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-black text-blue-600">{Math.floor(progress)}%</span>
              </div>
            </motion.div>
            
            <h3 className="text-3xl font-black text-gray-900 mb-4 tracking-tight flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-blue-500 animate-pulse" />
              AI 智能分析中
            </h3>
            
            <p className="text-lg font-bold text-gray-500 max-w-md h-8">
              {statusText || "正在为您提取题目、选项与解析..."}
            </p>

            <div className="mt-12 flex gap-2">
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
                  transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                  className="w-3 h-3 bg-blue-600 rounded-full"
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between px-6 py-4 bg-white border-b z-20 shadow-sm">
        <div className="flex items-center gap-6">
          <h3 className="text-2xl font-black text-gray-900">内容预处理</h3>
          <div className="flex bg-gray-100 p-1 rounded-full">
            <button onClick={() => setActiveDrawMode('question')} className={cn("px-4 py-1.5 rounded-full text-sm font-black transition-all flex items-center gap-2", activeDrawMode === 'question' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400")}>
              <div className="w-3 h-3 rounded bg-blue-100 border-2 border-blue-600" />题目
            </button>
            <button onClick={() => setActiveDrawMode('answer')} className={cn("px-4 py-1.5 rounded-full text-sm font-black transition-all flex items-center gap-2", activeDrawMode === 'answer' ? "bg-white text-red-500 shadow-sm" : "text-gray-400")}>
              <div className="w-3 h-3 rounded bg-red-100 border-2 border-red-500" />答案
            </button>
            <button onClick={() => setActiveDrawMode('solution')} className={cn("px-4 py-1.5 rounded-full text-sm font-black transition-all flex items-center gap-2", activeDrawMode === 'solution' ? "bg-white text-emerald-600 shadow-sm" : "text-gray-400")}>
              <div className="w-3 h-3 rounded bg-emerald-100 border-2 border-emerald-500" />解析
            </button>
          </div>
          <select value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="bg-gray-100 px-3 py-1.5 rounded-full text-sm font-black">
            <option value="0.75">75%</option>
            <option value="1">100%</option>
            <option value="1.25">125%</option>
            <option value="1.5">150%</option>
          </select>
          {onClose && (
            <button onClick={onClose} className="p-2 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setView('editor')} className="px-5 py-2 text-gray-500 text-sm font-bold">跳过</button>
          <button onClick={handleConfirm} disabled={rects.length === 0 || isAnalyzing} className="px-8 py-2 bg-blue-600 text-white text-sm font-black rounded-full shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-2">
            {isAnalyzing ? <><Loader2 className="w-4 h-4 animate-spin" />解析中</> : <><CheckCircle2 className="w-4 h-4" />解析</>}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-48 bg-white border-r flex-col hidden lg:flex">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {pages.map((p, i) => (
              <button key={i} onClick={() => scrollToPage(i)} className={cn("w-full aspect-[3/4] rounded-lg overflow-hidden border-2 relative", activePageIdx === i ? "border-blue-600" : "border-transparent")}>
                <img src={p} className="w-full h-full object-cover" />
                <div className="absolute top-1 left-1 bg-white/90 text-[10px] font-black px-1.5 rounded">{i+1}</div>
                {getPageRectCount(i) > 0 && <div className="absolute top-1 right-1 bg-blue-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">{getPageRectCount(i)}</div>}
              </button>
            ))}
          </div>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-auto bg-gray-200/20 p-8">
          <div ref={containerRef} onPointerDown={startDrawing} className="relative bg-white shadow-2xl mx-auto flex flex-col pointer-events-auto touch-none" style={{ width: `${zoom * 100}%` }}>
            {pages.map((p, i) => (
              <img key={i} ref={el => { imgRefs.current[i] = el; }} src={p} className="w-full block select-none" onLoad={() => setImagesLoaded(v => v + 1)} />
            ))}
            {(() => {
              const qs = rects.filter(r => r.type !== 'answer' && r.type !== 'solution').sort((a, b) => a.y - b.y);
              return rects.map(r => {
                const isSelected = selectedId === r.id;
                let qIdx = -1;
                if (r.type !== 'answer' && r.type !== 'solution') {
                  qIdx = qs.findIndex(q => q.id === r.id) + 1;
                } else {
                  // Find parent question by proximity (same logic as handleConfirm)
                  const cx = r.x + r.width / 2;
                  const cy = r.y + r.height / 2;
                  const parent = qs.find(q => 
                    cx >= q.x - 20 && cx <= q.x + q.width + 20 && cy >= q.y - 120 && cy <= q.y + q.height + 250
                  );
                  if (parent) qIdx = qs.indexOf(parent) + 1;
                }

                return (
                  <div 
                    key={r.id} 
                    onPointerDown={(e) => startMoving(e, r.id)}
                    className={cn(
                      "absolute border-2 shadow-sm group select-none touch-none", 
                      r.type === 'answer' ? "border-red-500 bg-red-500/10" : r.type === 'solution' ? "border-emerald-500 bg-emerald-500/10" : "border-blue-600 bg-blue-600/5",
                      isSelected ? "ring-2 ring-blue-500 ring-offset-2 z-30" : "z-20 hover:border-blue-400"
                    )} 
                    style={{ left: r.x * zoom, top: r.y * zoom, width: r.width * zoom, height: r.height * zoom }}
                  >
                    {/* Label & Actions */}
                    <div className="absolute -top-7 left-0 flex items-center gap-1 whitespace-nowrap">
                      <span 
                        onClick={(e) => {
                          e.stopPropagation();
                          const types: ('question' | 'answer' | 'solution')[] = ['question', 'answer', 'solution'];
                          const nextType = types[(types.indexOf(r.type || 'question') + 1) % types.length];
                          setRects(prev => prev.map(x => x.id === r.id ? { ...x, type: nextType } : x));
                        }}
                        className={cn("px-2 py-0.5 text-[10px] text-white font-black rounded cursor-pointer shadow-sm", r.type === 'answer' ? "bg-red-500" : r.type === 'solution' ? "bg-emerald-500" : "bg-blue-600")}
                      >
                        {r.type === 'answer' ? '答案' : r.type === 'solution' ? '解析' : '题目'}
                        {qIdx > 0 && ` #${qIdx}`}
                      </span>
                      <button 
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setRects(prev => prev.filter(x => x.id !== r.id));
                        }}
                        className="bg-white text-gray-400 p-0.5 rounded shadow-sm border border-gray-100 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Resize Handles - Always show when selected, show on hover */}
                    {!isAnalyzing && (
                      <>
                        <div onPointerDown={(e) => startResizing(e, r.id, 'n')} className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize" />
                        <div onPointerDown={(e) => startResizing(e, r.id, 's')} className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize" />
                        <div onPointerDown={(e) => startResizing(e, r.id, 'w')} className="absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize" />
                        <div onPointerDown={(e) => startResizing(e, r.id, 'e')} className="absolute top-0 bottom-0 right-0 w-1.5 cursor-ew-resize" />
                        
                        {[
                          { h: 'nw', c: '-top-1.5 -left-1.5' },
                          { h: 'ne', c: '-top-1.5 -right-1.5' },
                          { h: 'sw', c: '-bottom-1.5 -left-1.5' },
                          { h: 'se', c: '-bottom-1.5 -right-1.5' }
                        ].map(handle => (
                          <div 
                            key={handle.h}
                            onPointerDown={(e) => startResizing(e, r.id, handle.h)} 
                            className={cn(
                              "absolute w-3 h-3 bg-white border-2 border-blue-600 rounded-full z-40 transition-opacity",
                              handle.c,
                              isSelected ? "opacity-100 scale-110" : "opacity-0 group-hover:opacity-100"
                            )}
                          />
                        ))}
                      </>
                    )}
                  </div>
                );
              });
            })()}
            {drawingRect && (
              <div className={cn("absolute border-2 border-dashed", drawingRect.type === 'answer' ? "border-red-400" : drawingRect.type === 'solution' ? "border-emerald-400" : "border-blue-400")} style={{ 
                left: (drawingRect.width! > 0 ? drawingRect.x! : drawingRect.x! + drawingRect.width!) * zoom,
                top: (drawingRect.height! > 0 ? drawingRect.y! : drawingRect.y! + drawingRect.height!) * zoom,
                width: Math.abs(drawingRect.width!) * zoom,
                height: Math.abs(drawingRect.height!) * zoom
              }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
