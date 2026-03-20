'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, CheckCircle2, Loader2, X, Sparkles } from 'lucide-react';
// import { parseQuestionAction } from '@/app/actions/ai';
import { useProjectStore } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';

interface Rect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type?: 'question' | 'answer';
}

// 每页图片在纵向容器中的偏移信息
interface PageOffset {
  top: number;         // 图片顶部在 container 中的 offsetTop
  height: number;      // 图片显示高度
  imgWidth: number;    // 图片显示宽度
  naturalWidth: number;
  naturalHeight: number;
}

export interface NormalizedRect {
  pageIdx: number;
  box: [number, number, number, number];
}

interface ExtractionCanvasProps {
  pages: string[];
  initialPageIndex?: number;
  initialNormalizedRects?: NormalizedRect[];
  onComplete: () => void;
  onClose?: () => void;
}

export const ExtractionCanvas = ({ pages, initialPageIndex = 0, initialNormalizedRects, onComplete, onClose }: ExtractionCanvasProps) => {
  // === Refs ===
  const containerRef = useRef<HTMLDivElement>(null);     // 包裹所有页面的坐标系根容器
  const scrollRef = useRef<HTMLDivElement>(null);        // 外层可滚动容器
  const imgRefs = useRef<(HTMLImageElement | null)[]>([]); // 每页一个 img ref
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // === State ===
  // 矩形全局扁平数组（坐标基于 containerRef）
  const [rects, setRects] = useState<Rect[]>([]);
  const [drawingRect, setDrawingRect] = useState<Partial<Rect> | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [activePageIdx, setActivePageIdx] = useState(initialPageIndex);
  const [activeDrawMode, setActiveDrawMode] = useState<'question' | 'answer'>('question');
  // 图片加载完成计数，用于触发首次 scroll-to-page
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const [zoom, setZoom] = useState(1); // 缩放倍率，默认为 1.0 (100%)

  const { addQuestion, setProcessing, setView } = useProjectStore();

  const interactionRef = useRef<'none' | 'drawing' | 'moving' | 'resizing'>('none');
  const startPosRef = useRef({ x: 0, y: 0 });
  const initialRectRef = useRef<Rect | null>(null);
  // 镜像 drawingRect 的 ref，用于 handleMouseUp 中读取最新值，避免嵌套 setState 导致重复 key
  const drawingRectRef = useRef<Partial<Rect> | null>(null);



  // === 首次挂载：滚动到 initialPageIndex ===
  useEffect(() => {
    if (initialPageIndex > 0 && imagesLoaded >= pages.length) {
      const img = imgRefs.current[initialPageIndex];
      if (img && scrollRef.current) {
        img.scrollIntoView({ block: 'start' });
      }
    }
  }, [initialPageIndex, imagesLoaded, pages.length]);

  // === 计算每页图片在 container 中的偏移量 ===
  const getPageOffsets = useCallback((): PageOffset[] => {
    if (!containerRef.current) return [];
    // 关键：将当前缩放后的尺寸除以 zoom，回归到 1.0 倍率下的“基准尺寸”存储
    // 这样后续的 cropRect (基于基准像素) 才能正确对应物理像素
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

  // === 注入初始 NormalizedRects ===
  const [hasInitializedRects, setHasInitializedRects] = useState(false);
  
  useEffect(() => {
    if (initialNormalizedRects && initialNormalizedRects.length > 0 && !hasInitializedRects && imagesLoaded >= pages.length) {
      const offsets = getPageOffsets();
      if (offsets.length === pages.length) {
        const newRects: Rect[] = initialNormalizedRects.map(nr => {
          const offset = offsets[nr.pageIdx];
          const [ymin, xmin, ymax, xmax] = nr.box;
          return {
            id: crypto.randomUUID(),
            y: offset.top + (ymin / 10000) * offset.height,
            x: (xmin / 10000) * offset.imgWidth,
            height: ((ymax - ymin) / 10000) * offset.height,
            width: ((xmax - xmin) / 10000) * offset.imgWidth
          };
        });
        setRects(newRects);
        setHasInitializedRects(true);
      }
    }
  }, [initialNormalizedRects, imagesLoaded, pages.length, getPageOffsets, hasInitializedRects]);

  // === 滚动监听：高亮当前可见页的缩略图 ===
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const handleScroll = () => {
      const offsets = getPageOffsets();
      if (offsets.length === 0) return;

      // 以滚动区域 1/3 处作为锚点判断当前页
      const scrollTop = scrollEl.scrollTop;
      // 锚点判断也要经过缩放转换，否则在 200% 时锚点会偏移
      const anchor = (scrollTop + scrollEl.clientHeight / 3) / zoom;

      let active = 0;
      for (let i = 0; i < offsets.length; i++) {
        if (offsets[i].top <= anchor) active = i;
      }
      setActivePageIdx(active);
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [getPageOffsets, zoom]);

  // === 点击缩略图 → 平滑滚动到目标页 ===
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

  // === 鼠标事件：开始绘制 ===
  const startDrawing = (e: React.MouseEvent) => {
    if (!containerRef.current || isAnalyzing) return;
    e.preventDefault();

    const cr = containerRef.current.getBoundingClientRect();
    // 考虑缩放率：将真实的物理坐标转换为 1.0 倍率下的基础像素坐标
    const x = (e.clientX - cr.left) / zoom;
    const y = (e.clientY - cr.top) / zoom;

    setSelectedId(null);
    setDrawingRect({ id: crypto.randomUUID(), x, y, width: 0, height: 0, type: activeDrawMode });
    setIsDrawing(true);
    interactionRef.current = 'drawing';
  };

  const startMoving = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (isAnalyzing) return;
    const rect = rects.find(r => r.id === id);
    if (!rect) return;
    setSelectedId(id);
    interactionRef.current = 'moving';
    startPosRef.current = { x: e.clientX, y: e.clientY };
    initialRectRef.current = { ...rect };
  };

  const startResizing = (e: React.MouseEvent, id: string, handle: string) => {
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

  // === 全局 mousemove / mouseup ===
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || interactionRef.current === 'none') return;

      const cr = containerRef.current.getBoundingClientRect();

      if (interactionRef.current === 'drawing') {
        const x = (e.clientX - cr.left) / zoom;
        const y = (e.clientY - cr.top) / zoom;
        const boundedX = Math.max(0, Math.min(x, cr.width / zoom));
        const boundedY = Math.max(0, Math.min(y, cr.height / zoom));

        setDrawingRect((current) => {
          if (!current || current.x === undefined || current.y === undefined) return current;
          const updated = { 
            ...current, 
            width: boundedX - current.x, 
            height: boundedY - current.y 
          };
          drawingRectRef.current = updated; // 同步更新 ref
          return updated;
        });

        // 绘制时自动滚动（鼠标靠近滚动容器边缘时）
        if (scrollRef.current) {
          const sr = scrollRef.current.getBoundingClientRect();
          const edge = 60;
          const speed = 15;
          if (e.clientY < sr.top + edge) {
            scrollRef.current.scrollTop -= speed;
          } else if (e.clientY > sr.bottom - edge) {
            scrollRef.current.scrollTop += speed;
          }
        }
      }
      else if (interactionRef.current === 'moving' && initialRectRef.current) {
        // 移动量也要经过缩放转换
        const dx = (e.clientX - startPosRef.current.x) / zoom;
        const dy = (e.clientY - startPosRef.current.y) / zoom;

        setRects(prev => prev.map(r => {
          if (r.id === selectedId && initialRectRef.current) {
            let nextX = initialRectRef.current.x + dx;
            let nextY = initialRectRef.current.y + dy;
            // 边界判断也要基于缩放后的虚拟高度
            nextX = Math.max(0, Math.min(nextX, (cr.width / zoom) - initialRectRef.current.width));
            nextY = Math.max(0, Math.min(nextY, (cr.height / zoom) - initialRectRef.current.height));
            return { ...r, x: nextX, y: nextY };
          }
          return r;
        }));
      }
      else if (interactionRef.current === 'resizing' && initialRectRef.current && resizeHandle) {
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
        // 从 ref 读取最新值，避免嵌套 setState 导致 React 中间渲染帧出现重复 key
        const currentRect = drawingRectRef.current;
        if (currentRect && Math.abs(currentRect.width || 0) > 10 && Math.abs(currentRect.height || 0) > 10) {
          const normalized: Rect = {
            id: crypto.randomUUID(), // 使用全新 ID，与 drawingRect 的 ID 彻底分离
            x: currentRect.width! > 0 ? currentRect.x! : currentRect.x! + currentRect.width!,
            y: currentRect.height! > 0 ? currentRect.y! : currentRect.y! + currentRect.height!,
            width: Math.abs(currentRect.width!),
            height: Math.abs(currentRect.height!),
            type: currentRect.type as 'question' | 'answer' | undefined,
          };
          setRects(prev => [...prev, normalized]);
          setSelectedId(normalized.id);
        }
        // 同级调用，React 18 自动批处理，不会出现中间状态
        setDrawingRect(null);
        drawingRectRef.current = null;
      }
      interactionRef.current = 'none';
      setResizeHandle(null);
      initialRectRef.current = null;
      setIsDrawing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [selectedId, resizeHandle]);

  // =================================================================
  // 核心：跨页裁剪 —— 判断矩形覆盖哪些页，分别裁剪后纵向拼接
  // =================================================================
  const cropRect = async (rect: Rect, offsets: PageOffset[]): Promise<string> => {
    if (offsets.length === 0) throw new Error('No page offsets - container or refs missing');

    const rectTop = rect.y;
    const rectBottom = rect.y + rect.height;

    // 找出所有与矩形重叠的页
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
    if (overlapping.length === 0) throw new Error('Rect does not overlap any page');

    // 并行加载所有涉及的页面原图
    const loaded = await Promise.all(
      overlapping.map(({ pageIdx }) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.src = pages[pageIdx];
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Page ${pageIdx} load failed`));
        })
      )
    );

    // 计算每段裁剪参数（物理像素级别）
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
      if (i === 0) outputW = sw; // 以第一段的宽度为准
    }

    // 拼接到同一张 Canvas
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

  // === 确认并解析 ===
  const handleConfirm = async () => {
    if (rects.length === 0) return;
    setIsAnalyzing(true);
    setProcessing(true);
    let processed = 0;

    try {
      // 分离题目框和答案框
      const qRects = rects.filter(r => r.type !== 'answer').sort((a, b) => a.y - b.y);
      const aRects = rects.filter(r => r.type === 'answer');

      const offsets = getPageOffsets();
      if (offsets.length === 0) throw new Error('无法获取页面结构，请稍后重试');

      for (let i = 0; i < qRects.length; i++) {
        const qRect = qRects[i];
        
        // 寻找所有属于这个题目框的答案框（中心点在题目框内属于该题目）
        const childAnsRects = aRects.filter(ar => {
           const cx = ar.x + ar.width / 2;
           const cy = ar.y + ar.height / 2;
           // 稍微放宽一点边界，以防答案在紧挨着的下边缘
           return cx >= qRect.x && cx <= qRect.x + qRect.width && cy >= qRect.y - 10 && cy <= qRect.y + qRect.height + 20;
        });

        // 取出第一个答案框计算比例坐标 0-10000
        let manualAnswerBox: [number, number, number, number] | undefined = undefined;
        if (childAnsRects.length > 0) {
           const ar = childAnsRects[0];
           manualAnswerBox = [
             Math.max(0, Math.round((ar.y - qRect.y) / qRect.height * 10000)),
             Math.max(0, Math.round((ar.x - qRect.x) / qRect.width * 10000)),
             Math.min(10000, Math.round((ar.y + ar.height - qRect.y) / qRect.height * 10000)),
             Math.min(10000, Math.round((ar.x + ar.width - qRect.x) / qRect.width * 10000)),
           ];
        }

        const base64 = await cropRect(qRect, offsets);
        // 使用 API Route 代替 Server Action
        const response = await fetch('/api/ai-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'parseQuestion', imageData: base64 })
        });
        const result = await response.json();

        if (result.success && result.data) {
          result.data.forEach((q: any, subIdx: number) => {
            addQuestion({
              ...q,
              id: crypto.randomUUID(),
              image: base64,
              contentImage: base64,
              order: i * 10 + subIdx,
              type: q.type || 'essay',
              answer_box: manualAnswerBox || q.answer_box || q.answerBox, // 优先使用手动标定的框
            });
          });
        }
        processed++;
        setProgress(Math.round((processed / qRects.length) * 100));
      }
      setView('editor');
      onComplete();
    } catch (error) {
      console.error(error);
      alert('解析失败，请重试');
    } finally {
      setIsAnalyzing(false);
      setProcessing(false);
    }
  };

  // 统计每页被框选数量（用于侧边栏 badge）
  const getPageRectCount = (pageIdx: number): number => {
    const offsets = getPageOffsets();
    const o = offsets[pageIdx];
    if (!o) return 0;
    const pTop = o.top;
    const pBottom = pTop + o.height;
    // 仅统计题目框数量，不包含答案遮挡框
    return rects.filter(r => r.type !== 'answer' && r.y < pBottom && r.y + r.height > pTop).length;
  };

  // ===================== RENDER =====================
  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden relative">
      {/* AI 解析动态遮罩 - 科幻高定版 */}
      <AnimatePresence>
        {isAnalyzing && (
          <motion.div
            key="analyzing-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-slate-900/90 backdrop-blur-2xl flex flex-col items-center justify-center p-12 text-center overflow-hidden"
          >
            {/* 1. 背景深邃光晕 */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center">
              <motion.div 
                animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }} 
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] bg-brand-primary rounded-full blur-[120px]"
              />
            </div>

            {/* 2. 中心赛博化文档扫描核心 */}
            <div className="relative w-48 h-64 mb-10 flex items-center justify-center z-10 mt-8">
              {/* 外围量子能量环 1: 正转 */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="absolute inset-[-15%] rounded-[2rem] border-2 border-slate-700/50 border-t-brand-primary shadow-[0_0_30px_rgba(var(--brand-primary-rgb),0.2)]"
              />
              {/* 外围量子能量环 2: 逆转 */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                className="absolute inset-[-5%] rounded-[2.5rem] border border-slate-600/30 border-b-brand-secondary border-r-brand-secondary"
              />

              {/* 3. 文档本体骨架 */}
              <div className="relative w-full h-full bg-slate-800/80 rounded-2xl border border-slate-600/50 shadow-2xl overflow-hidden flex flex-col p-5 gap-3">
                {/* 模拟文本段落 */}
                <div className="w-3/4 h-2.5 bg-slate-600/50 rounded-full" />
                <div className="w-full h-2 bg-slate-700/50 rounded-full" />
                <div className="w-5/6 h-2 bg-slate-700/50 rounded-full" />
                
                {/* 模拟试卷配图识别 */}
                <div className="mt-4 w-full h-20 bg-slate-700/40 rounded-xl border border-slate-600/30 flex items-center justify-center relative overflow-hidden">
                  <motion.div 
                    animate={{ opacity: [0.2, 0.5, 0.2], scale: [0.9, 1.1, 0.9] }} 
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-12 h-12 rounded-full bg-brand-primary/20 blur-md"
                  />
                </div>
                
                <div className="w-2/3 h-2 bg-slate-700/50 rounded-full mt-3" />
                <div className="w-1/2 h-2 bg-slate-700/50 rounded-full" />

                {/* 科幻随动发光扫描线 */}
                <motion.div
                  animate={{ top: ["-20%", "120%"] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                  className="absolute left-0 right-0 h-1 bg-brand-secondary shadow-[0_0_20px_rgba(var(--brand-secondary-rgb),1)] z-20"
                >
                  <div className="absolute bottom-full left-0 right-0 h-24 bg-gradient-to-t from-brand-secondary/30 to-transparent" />
                </motion.div>

                {/* 屏幕正中心百分比进度跟随 */}
                <div className="absolute inset-0 flex items-center justify-center z-30">
                  <div className="bg-slate-900/60 backdrop-blur-md px-5 py-3 rounded-2xl border border-slate-500/30 shadow-2xl flex items-baseline">
                    <span className="text-4xl font-black text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.8)] tabular-nums tracking-tighter">
                      {progress}
                    </span>
                    <span className="text-xl font-black text-brand-primary ml-1">%</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 4. 底层炫光文案与请求状态播报 */}
            <h3 className="text-3xl font-black text-white mb-5 tracking-wide drop-shadow-xl z-10 flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-brand-primary animate-pulse" />
              AI 视觉引擎全息重构中
            </h3>
            <p className="text-slate-400 max-w-lg mt-8 text-sm leading-relaxed z-10 font-bold">
              正在剥离冗余像素，深度切割 <span className="text-white bg-white/10 px-2 py-0.5 rounded mx-1">{rects.filter(r => r.type !== 'answer').length}</span> 道题图与 {rects.filter(r => r.type === 'answer').length} 处语义伪装区...
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* === 顶部工具栏 === */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b z-20 shadow-sm">
        <div className="flex items-center gap-6">
          <h3 className="text-2xl font-black text-gray-900 tracking-tight">内容预处理</h3>
          
          <div className="flex bg-gray-100 p-1 rounded-full mx-4">
            <button
              onClick={() => setActiveDrawMode('question')}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-black transition-all flex items-center gap-2",
                activeDrawMode === 'question' ? "bg-white text-brand-primary shadow-sm" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <div className="w-3 h-3 rounded bg-brand-primary/20 border-2 border-brand-primary" />
              框选题目区
            </button>
            <button
              onClick={() => setActiveDrawMode('answer')}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-black transition-all flex items-center gap-2",
                activeDrawMode === 'answer' ? "bg-white text-red-500 shadow-sm" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <div className="w-3 h-3 rounded bg-red-500/20 border-2 border-red-500" />
              框选答案遮挡区
            </button>
          </div>

          <div className="flex items-center justify-center gap-4 bg-gray-100/80 px-4 py-2 rounded-full text-[11px] font-black text-gray-500 tracking-wide border border-gray-200 w-64 shadow-sm">
            <span className="flex items-center gap-1.5 underline decoration-gray-300 decoration-2 underline-offset-4 shrink-0">{pages.length} 页</span>
            <span className="w-px h-4 bg-gray-300 shrink-0" />
            <span className="text-brand-primary flex items-center gap-1.5 shrink-0">
               <span className="w-2 h-2 rounded-full bg-brand-primary" />
               {rects.filter(r => r.type !== 'answer').length} 题
            </span>
            <span className="text-red-500 flex items-center gap-1.5 shrink-0">
               <span className="w-2 h-2 rounded-full bg-red-500" />
               {rects.filter(r => r.type === 'answer').length} 遮挡
            </span>
          </div>

          {/* 缩放选择器 */}
          <div className="flex items-center justify-center gap-3 px-4 py-2 bg-gray-100/80 rounded-full border border-gray-200 w-64 shadow-sm group/zoom">
            <span className="text-[11px] font-black text-gray-400 uppercase tracking-tighter shrink-0">页面缩放</span>
            <select 
              value={zoom} 
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="bg-transparent text-[13px] font-black text-gray-700 outline-none cursor-pointer hover:text-brand-primary transition-colors"
            >
              <option value="0.5">50%</option>
              <option value="0.75">75%</option>
              <option value="1">100%</option>
              <option value="1.25">125%</option>
              <option value="1.5">150%</option>
              <option value="2">200%</option>
            </select>
          </div>
          
          {/* 中间插入关闭模式按钮，放置在箭头指示的位置 */}
          {onClose && (
            <button
              onClick={onClose}
              className="px-2.5 py-2.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-all active:scale-95 border-2 border-white ml-2 flex items-center justify-center shrink-0"
              title="放弃预处理，返回上传"
            >
              <X className="w-5 h-5 stroke-[4px]" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-4 group">
          <button
            onClick={() => setView('editor')}
            className="px-6 py-2.5 bg-orange-500 text-white text-[13px] font-black rounded-full border border-orange-600 hover:bg-orange-600 transition-all flex items-center gap-2 shadow-lg shadow-orange-500/20 active:scale-95"
            title="跳过预处理，直接进入编辑器"
          >
            跳过并进入编辑器
          </button>
          <button
            onClick={handleConfirm}
            disabled={rects.filter(r => r.type !== 'answer').length === 0 || isAnalyzing}
            className="px-8 py-3 bg-brand-primary text-white text-sm font-black rounded-full shadow-xl shadow-brand-primary/20 hover:scale-105 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" /> 确认并开始解析
          </button>
        </div>
      </div>

      {/* === 主区域：左侧缩略图 + 右侧连续滚动画布 === */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧页面导航缩略图 */}
        {pages.length > 1 && (
          <div className="w-48 bg-white border-r flex flex-col shrink-0">
            <div className="p-3 border-b bg-gray-50/50">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">页面导航</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-hide">
              {pages.map((page, idx) => {
                const rectCount = getPageRectCount(idx);
                return (
                  <button
                    key={idx}
                    ref={el => { thumbRefs.current[idx] = el; }}
                    onClick={() => scrollToPage(idx)}
                    className={cn(
                      "w-full relative rounded-xl overflow-hidden border-2 transition-all aspect-[3/4] bg-gray-50 group",
                      activePageIdx === idx
                        ? "border-brand-primary shadow-lg ring-4 ring-brand-primary/10 scale-[1.02]"
                        : "border-transparent hover:border-gray-200"
                    )}
                  >
                    <img src={page} alt="" className="w-full h-full object-cover" />
                    <div className={cn(
                      "absolute top-2 left-2 w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black shadow-md",
                      activePageIdx === idx ? "bg-brand-primary text-white" : "bg-white/90 text-gray-600"
                    )}>
                      {idx + 1}
                    </div>
                    {rectCount > 0 && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-brand-secondary text-white rounded-full flex items-center justify-center text-[10px] font-black shadow-lg">
                        {rectCount}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 右侧：可滚动画布区域，所有页面纵向排列 */}
        <div
          ref={scrollRef}
          className="relative flex-1 overflow-auto bg-gray-100/30"
        >
          <div className="flex justify-center py-8 px-8">
            <div
              ref={containerRef}
              className={cn(
                "relative shadow-2xl border border-gray-200 rounded-sm bg-white inline-flex flex-col transition-opacity duration-300 origin-top-center",
                !isAnalyzing ? "cursor-crosshair" : "opacity-50"
              )}
              style={{ width: `${zoom * 100}%`, maxWidth: 'none' }}
              onMouseDown={startDrawing}
            >
              {/* === 纵向排列所有页面图片 === */}
              {pages.map((page, idx) => (
                <React.Fragment key={idx}>
                  {/* 分页线指示器 */}
                  {idx > 0 && (
                    <div className="w-full h-1 bg-red-400/30 relative z-10 flex items-center justify-center shrink-0">
                      <span className="absolute bg-red-400/80 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap">
                        第{idx}页 ↕ 第{idx + 1}页
                      </span>
                    </div>
                  )}
                  <img
                    ref={el => { imgRefs.current[idx] = el; }}
                    src={page}
                    alt={`Page ${idx + 1}`}
                    className="block w-full select-none pointer-events-none shrink-0"
                    draggable={false}
                    onLoad={() => setImagesLoaded(prev => prev + 1)}
                  />
                </React.Fragment>
              ))}

              {/* === 渲染所有矩形框 === */}
              {rects.map((rect) => {
                const isQuestion = rect.type !== 'answer';
                const isSelected = selectedId === rect.id;
                const { x, y, width: w, height: h } = rect;
                
                // 预先分类并排序（也可提到外部计算，但由于数量小，性能无碍）
                const qRects = rects.filter(r => r.type !== 'answer').sort((a,b) => a.y - b.y);
                
                let label = '';
                if (isQuestion) {
                  label = `#${qRects.findIndex(r => r.id === rect.id) + 1}`;
                } else {
                  // 判断这块红框落在哪个蓝框中心，以便同号显示
                  const cx = x + w / 2;
                  const cy = y + h / 2;
                  const parentIdx = qRects.findIndex(r => cx >= r.x && cx <= r.x + r.width && cy >= r.y - 10 && cy <= r.y + r.height + 20);
                  label = parentIdx >= 0 ? `#${parentIdx + 1} 答案` : '未绑定';
                }

                return (
                  <div
                    key={rect.id}
                    onMouseDown={(e) => startMoving(e, rect.id)}
                    className={cn(
                      "absolute border-2 transition-colors group",
                      isSelected
                        ? "border-brand-secondary bg-brand-secondary/10 z-30 shadow-[0_0_20px_rgba(var(--brand-secondary-rgb),0.3)]"
                        : isQuestion ? "border-brand-primary bg-brand-primary/10 z-20" : "border-red-500 border-dashed bg-red-500/20 z-20"
                    )}
                    style={{ 
                      left: rect.x * zoom, 
                      top: rect.y * zoom, 
                      width: rect.width * zoom, 
                      height: rect.height * zoom 
                    }}
                  >
                    {/* 序号标签 */}
                    <div className={cn(
                      "absolute -top-6 left-0 text-white text-[10px] font-black px-2 py-0.5 rounded-t-lg shadow-md whitespace-nowrap",
                      isQuestion ? "bg-brand-primary" : "bg-red-500"
                    )}>
                      {label}
                    </div>

                    {/* 选中态：8 个缩放手柄 */}
                    {isSelected && !isAnalyzing && (
                      <>
                        {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(pos => (
                          <div
                            key={pos}
                            className={cn(
                              "absolute w-3 h-3 bg-white border-2 rounded-full z-40 shadow-sm",
                              isQuestion ? "border-brand-secondary" : "border-red-500",
                              pos === 'nw' && "-left-1.5 -top-1.5 cursor-nw-resize",
                              pos === 'n' && "left-1/2 -ml-1.5 -top-1.5 cursor-n-resize",
                              pos === 'ne' && "-right-1.5 -top-1.5 cursor-ne-resize",
                              pos === 'e' && "-right-1.5 top-1/2 -mt-1.5 cursor-e-resize",
                              pos === 'se' && "-right-1.5 -bottom-1.5 cursor-se-resize",
                              pos === 's' && "left-1/2 -ml-1.5 -bottom-1.5 cursor-s-resize",
                              pos === 'sw' && "-left-1.5 -bottom-1.5 cursor-sw-resize",
                              pos === 'w' && "-left-1.5 top-1/2 -mt-1.5 cursor-w-resize"
                            )}
                            onMouseDown={(e) => startResizing(e, rect.id, pos)}
                          />
                        ))}
                      </>
                    )}

                    {/* 删除按钮 */}
                    {!isAnalyzing && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRects(prev => prev.filter(r => r.id !== rect.id));
                          setSelectedId(null);
                        }}
                        className={cn(
                          "absolute -top-3 -right-3 text-white p-1.5 rounded-full shadow-lg hidden group-hover:block z-50 transition-transform hover:scale-110 active:scale-90",
                          isQuestion ? "bg-red-500" : "bg-gray-800"
                        )}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* 绘制中的虚线矩形 */}
              {drawingRect && (
                <div
                  className={cn(
                    "absolute border-2 border-dashed shadow-inner z-20 pointer-events-none",
                    activeDrawMode === 'question' ? "border-brand-primary bg-brand-primary/5" : "border-red-500 bg-red-500/20"
                  )}
                  style={{
                    left: (drawingRect.width! > 0 ? drawingRect.x : (drawingRect.x! + drawingRect.width!))! * zoom,
                    top: (drawingRect.height! > 0 ? drawingRect.y : (drawingRect.y! + drawingRect.height!))! * zoom,
                    width: Math.abs(drawingRect.width!) * zoom,
                    height: Math.abs(drawingRect.height!) * zoom,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
