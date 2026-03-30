'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, CheckCircle2, Loader2, X, Sparkles, CheckSquare, Square, LayoutList, Image as ImageIcon, Brain, Zap, ChevronLeft, ChevronRight, Search } from 'lucide-react';


import { useProjectStore, Question } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { cropImageByBox, compressImage } from '@/lib/documentProcessor';

interface Rect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type?: 'question' | 'answer' | 'analysis' | 'diagram';
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
  const [rects, setRects] = useState<Rect[]>([]);
  const [drawingRect, setDrawingRect] = useState<Partial<Rect> | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [activePageIdx, setActivePageIdx] = useState(initialPageIndex);
  const [activeDrawMode, setActiveDrawMode] = useState<'question' | 'answer' | 'diagram' | null>(null);
  const [progressLabel, setProgressLabel] = useState("");
  const [errorLogs, setErrorLogs] = useState<{ id: string; msg: string; type: 'error' | 'warn' }[]>([]);
  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const [zoom, setZoom] = useState(1); 
  const [selectedPageIndices, setSelectedPageIndices] = useState<Set<number>>(new Set());
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDeepThinking, setIsDeepThinking] = useState(false);
  
  // [NEW] 失败项面板数据
  const [parsingFailures, setParsingFailures] = useState<{ id: string; label: string; error: string }[]>([]);

  const { 
    questions, 
    addQuestion, 
    addQuestions, 
    setQuestions, 
    isProcessing, 
    setProcessing, 
    setView, 
    setExamPages, 
    resetUpload, 
    fileType,
    examPages 
  } = useProjectStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // [NEW] 处理侧边栏加页
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

  // === 自动计算紫色分析区 ===
  const autoAnalysisRects = useMemo(() => {
    const qRects = rects.filter(r => r.type === 'question' || r.type === undefined);
    const aRects = rects.filter(r => r.type === 'answer');
    const result: { id: string; x: number; y: number; width: number; height: number; parentLabel: string }[] = [];

    qRects.sort((a, b) => a.y - b.y).forEach((qRect, qIdx) => {
      const childAns = aRects.filter(ar => {
        const cx = ar.x + ar.width / 2;
        const cy = ar.y + ar.height / 2;
        return cx >= qRect.x && cx <= qRect.x + qRect.width && cy >= qRect.y - 10 && cy <= qRect.y + qRect.height + 20;
      });
      if (childAns.length === 0) return;

      const ansBottom = Math.max(...childAns.map(a => a.y + a.height));
      const qBottom = qRect.y + qRect.height;
      const analysisHeight = qBottom - ansBottom;
      if (analysisHeight > 10) {
        result.push({
          id: `auto-analysis-${qRect.id}`,
          x: qRect.x,
          y: ansBottom,
          width: qRect.width,
          height: analysisHeight,
          parentLabel: `#${qIdx + 1} 分析`,
        });
      }
    });
    return result;
  }, [rects]);

  const interactionRef = useRef<'none' | 'drawing' | 'moving' | 'resizing' | 'resizing-sidebar'>('none');
  const startPosRef = useRef({ x: 0, y: 0 });
  const initialRectRef = useRef<Rect | null>(null);
  const drawingRectRef = useRef<Partial<Rect> | null>(null);

  // === 模拟分析进度条 ===
  const lastProgressRef = useRef(0);
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing) {
      setProgress(currentItemIdx > 0 ? (currentItemIdx / totalItems) * 100 : 2);
      interval = setInterval(() => {
        setProgress(prev => {
          const currentBase = totalItems > 0 ? (currentItemIdx / totalItems) * 100 : 0;
          const nextCap = totalItems > 0 ? ((currentItemIdx + 0.9) / totalItems) * 100 : 99;
          
          let next = prev;
          if (prev < nextCap) {
            const step = (nextCap - currentBase) / 20; 
            next = prev + Math.random() * step;
          } else {
            next = nextCap;
          }
          
          return Math.max(next, lastProgressRef.current, currentBase);
        });
      }, 600);
    } else {
      setProgress(0);
      lastProgressRef.current = 0;
      setProgressLabel("");
      setCurrentItemIdx(0);
      setTotalItems(0);
    }
    return () => clearInterval(interval);
  }, [isProcessing, currentItemIdx, totalItems]);

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

  const [hasInitializedRects, setHasInitializedRects] = useState(false);
  
  useEffect(() => {
    if (initialNormalizedRects && initialNormalizedRects.length > 0 && !hasInitializedRects && imagesLoaded >= pages.length) {
      const offsets = getPageOffsets();
      if (offsets.length === pages.length) {
        const newRects: Rect[] = initialNormalizedRects.map(nr => {
          const offset = offsets[nr.pageIdx];
          const [ymin, xmin, ymax, xmax] = nr.box;
          return {
            id: (Date.now().toString(36) + Math.random().toString(36).substring(2)),
            y: offset.top + (ymin / 1000) * offset.height,
            x: (xmin / 1000) * offset.imgWidth,
            height: ((ymax - ymin) / 1000) * offset.height,
            width: ((xmax - xmin) / 1000) * offset.imgWidth
          };
        });
        setRects(newRects);
        setHasInitializedRects(true);
      }
    }
  }, [initialNormalizedRects, imagesLoaded, pages.length, getPageOffsets, hasInitializedRects]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const handleScroll = () => {
      const offsets = getPageOffsets();
      if (offsets.length === 0) return;
      const scrollTop = scrollEl.scrollTop;
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

  const handleDeleteSelected = () => {
    if (selectedPageIndices.size === 0 || isProcessing) return;
    const count = selectedPageIndices.size;
    if (!window.confirm(`确定要删除选中的 ${count} 张图片及其上面的所有框选吗？\n删除后不可撤销。`)) return;

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
          if (dIdx < pageIdx) {
            deletedAboveHeight += offsets[dIdx].height;
          }
        }
        return deletedAboveHeight > 0 ? { ...r, y: r.y - deletedAboveHeight } : r;
      });

    const newPages = pages.filter((_, i) => !selectedPageIndices.has(i));
    setRects(updatedRects);
    setExamPages(newPages);
    setSelectedPageIndices(new Set());
    if (newPages.length === 0) {
      resetUpload();
    } else {
      setImagesLoaded(newPages.length);
    }
  };

  const startDrawing = (e: React.PointerEvent) => {
    if (!containerRef.current || isProcessing) return;
    if (!activeDrawMode) return;
    const cr = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - cr.left) / zoom;
    const y = (e.clientY - cr.top) / zoom;

    setSelectedId(null);
    setDrawingRect({ id: (Date.now().toString(36) + Math.random().toString(36).substring(2)), x, y, width: 0, height: 0, type: activeDrawMode });
    setIsDrawing(true);
    interactionRef.current = 'drawing';
  };

  const startMoving = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    if (isProcessing) return;
    const rect = rects.find(r => r.id === id);
    if (!rect) return;
    setSelectedId(id);
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
          if (!current || typeof current.x !== 'number' || typeof current.y !== 'number') return current;
          
          // Use solid number types for calculations to avoid TS undefined warnings
          const startX: number = current.x;
          const startY: number = current.y;
          
          const updated = { 
            ...current, 
            width: boundedX - startX, 
            height: boundedY - startY 
          };
          
          drawingRectRef.current = updated;
          return updated;
        });

        if (scrollRef.current) {
          const sr = scrollRef.current.getBoundingClientRect();
          const edge = 60;
          const speed = 15;
          if (e.clientY < sr.top + edge) scrollRef.current.scrollTop -= speed;
          else if (e.clientY > sr.bottom - edge) scrollRef.current.scrollTop += speed;
        }
      }
      else if (interactionRef.current === 'moving' && initialRectRef.current) {
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
      else if (interactionRef.current === 'resizing-sidebar') {
        const newWidth = e.clientX;
        setSidebarWidth(Math.max(200, Math.min(newWidth, window.innerWidth * 0.5, 800)));
      }
    };

    const handleMouseUp = () => {
      if (interactionRef.current === 'drawing') {
        const currentRect = drawingRectRef.current;
        if (currentRect && Math.abs(currentRect.width || 0) > 10 && Math.abs(currentRect.height || 0) > 10) {
          const normalized: Rect = {
            id: (Date.now().toString(36) + Math.random().toString(36).substring(2)),
            x: currentRect.width! > 0 ? currentRect.x! : currentRect.x! + currentRect.width!,
            y: currentRect.height! > 0 ? currentRect.y! : currentRect.y! + currentRect.height!,
            width: Math.abs(currentRect.width!),
            height: Math.abs(currentRect.height!),
            type: currentRect.type as 'question' | 'answer' | 'diagram',
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
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
    return () => {
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
    };
  }, [selectedId, resizeHandle, zoom]);

  interface ImageSlice {
    base64: string;
    yOffset: number; 
    height: number;  
  }

  const cropRect = async (rect: Rect, offsets: PageOffset[]): Promise<ImageSlice> => {
    if (offsets.length === 0) throw new Error('No page offsets');
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
    if (overlapping.length === 0) throw new Error('Rect does not overlap any page');

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

    const segments: { img: HTMLImageElement; sx: number; sy: number; sw: number; sh: number }[] = [];
    let fullH = 0;
    let outputW = 0;

    for (let i = 0; i < overlapping.length; i++) {
      const { cropTop: cTop, cropHeight: cH, offset } = overlapping[i];
      const img = loaded[i];
      const sx = (rect.x / offset.imgWidth) * img.naturalWidth;
      const sy = (cTop / offset.height) * img.naturalHeight;
      const sw = (rect.width / offset.imgWidth) * img.naturalWidth;
      const sh = (cH / offset.height) * img.naturalHeight;
      segments.push({ img, sx, sy, sw, sh });
      fullH += sh;
      if (i === 0) outputW = sw;
    }

    const fullCanvas = document.createElement('canvas');
    const fullCtx = fullCanvas.getContext('2d');
    if (!fullCtx) throw new Error('Canvas ctx failed');
    fullCanvas.width = outputW;
    fullCanvas.height = fullH;

    let currY = 0;
    for (const seg of segments) {
      fullCtx.drawImage(seg.img, seg.sx, seg.sy, seg.sw, seg.sh, 0, currY, outputW, seg.sh);
      currY += seg.sh;
    }

    const MAX_WIDTH = 2500;
    const MAX_HEIGHT = 5000;
    let finalScale = 1;
    if (outputW > MAX_WIDTH) finalScale = MAX_WIDTH / outputW;
    if (fullH * finalScale > MAX_HEIGHT) finalScale = MAX_HEIGHT / fullH;
    
    const finalCanvas = document.createElement('canvas');
    const fCtx = finalCanvas.getContext('2d');
    if (!fCtx) throw new Error('Final canvas ctx failed');
    finalCanvas.width = Math.round(outputW * finalScale);
    finalCanvas.height = Math.round(fullH * finalScale);
    fCtx.drawImage(fullCanvas, 0, 0, outputW, fullH, 0, 0, finalCanvas.width, finalCanvas.height);
    
    return {
      base64: finalCanvas.toDataURL('image/jpeg', 0.98),
      yOffset: 0,
      height: finalCanvas.height
    };
  };

  const handleConfirm = async () => {
    // === 辅助函数：处理 AI 返回的 diagrams 坐标并裁切为图片 ===
    const processAIDiagrams = async (aiDiagrams: any[], sourceImage: string): Promise<string[]> => {
      if (!aiDiagrams || !Array.isArray(aiDiagrams)) return [];
      const diagramImages: string[] = [];
      for (const d of aiDiagrams) {
        // 兼容多种可能的坐标字段名
        const box = d.box_2d || d.box || d.box2d || (Array.isArray(d) ? d : null);
        if (!box || !Array.isArray(box) || box.length < 4) continue;
        
        // 增加 5% 的溢出保护
        const boxH = box[2] - box[0];
        const boxW = box[3] - box[1];
        const expandedBox: [number, number, number, number] = [
          Math.max(0, box[0] - Math.round(boxH * 0.05)),
          Math.max(0, box[1] - Math.round(boxW * 0.05)),
          Math.min(1000, box[2] + Math.round(boxH * 0.05)),
          Math.min(1000, box[3] + Math.round(boxW * 0.05)),
        ];
        
        const dCrop = await cropImageByBox(sourceImage, expandedBox);
        if (dCrop) diagramImages.push(dCrop);
      }
      return diagramImages;
    };

    const qRects = rects.filter(r => r.type === 'question' || !r.type).sort((a, b) => a.y - b.y);
    const aRects = rects.filter(r => r.type === 'answer');
    const dRects = rects.filter(r => r.type === 'diagram');

    // === 全自动分页识别模式 ===
    if (qRects.length === 0) {
      if (selectedPageIndices.size === 0) {
        alert('请先在左侧侧边栏勾选至少一页需要解析的页面。');
        return;
      }
      const targetIndices = Array.from(selectedPageIndices).sort((a, b) => a - b);
      const confirmed = window.confirm(`是否开始对选中的 ${targetIndices.length} 页试卷进行“全自动智能识别”？\n\n系统将智能提取题目、答案并补全解析。`);
      if (!confirmed) return;

      setProcessing(true);
      setParsingFailures([]); 
      const allResults: any[] = [];

      try {
        setTotalItems(targetIndices.length);
        for (let idx = 0; idx < targetIndices.length; idx++) {
          const i = targetIndices[idx];
          setCurrentItemIdx(idx);
          lastProgressRef.current = Math.round((idx / targetIndices.length) * 100);
          
          try {
            const compressedPage = await compressImage(pages[i], 2000);
            const res = await fetch('/api/ai-parse', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                action: 'parseQuestion', 
                imageData: compressedPage,
                isDeepThinking 
              })
            });
            if (!res.body) throw new Error('ReadableStream not supported');
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let pageData: any = null;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const payload = JSON.parse(line.slice(6));
                    if (payload.type === 'status') {
                      setProgressLabel(`第 ${idx + 1}/${targetIndices.length} 页: ${payload.msg}`);
                    } else if (payload.type === 'data') {
                      pageData = payload.data;
                    } else if (payload.type === 'error') {
                      const failureId = (Date.now().toString(36) + Math.random().toString(36).substring(2));
                      setParsingFailures(prev => [...prev, { id: failureId, label: `第 ${idx + 1} 页`, error: payload.error || '解析服务异常' }]);
                      break; 
                    }
                  } catch (e) {}
                }
              }
            }

            if (pageData) {
              const pageResults = await Promise.all(pageData.map(async (q: any) => {
                const box = q.content_box || q.contentBox;
                let croppedImage = pages[i];
                if (box && Math.abs(box[2] - box[0]) > 0) {
                  const crop = await cropImageByBox(pages[i], box);
                  if (crop) croppedImage = crop;
                }
                
                // 处理附图：优先使用模型返回的 diagrams 坐标
                const diagramImages = await processAIDiagrams(q.diagrams || q.diagram_boxes, pages[i]);
                
                return { ...q, image: pages[i], contentImage: croppedImage, diagrams: diagramImages };
              }));
              allResults.push(...pageResults);
            }
          } catch (pageErr: any) {
            const failureId = (Date.now().toString(36) + Math.random().toString(36).substring(2));
            setParsingFailures(prev => [...prev, { id: failureId, label: `第 ${idx + 1} 页`, error: pageErr.message || '网络异常' }]);
          }
        }

        if (allResults.length > 0) {
          const newQuestions = allResults.map((q: any, idx: number) => ({ ...q, id: (Date.now().toString(36) + Math.random().toString(36).substring(2)), order: questions.length + idx + 1, type: q.type || 'essay' }));
          addQuestions(newQuestions);
          setView('editor');
          onComplete();
        } else {
          if (parsingFailures.length === 0) alert('AI 未能识别出有效题目。');
        }
      } catch (err: any) {
        console.error(err);
      } finally {
        setProcessing(false);
      }
      return;
    }

    // === 手动选区解析模式 ===
    setProcessing(true);
    setParsingFailures([]); 
    try {
      const offsets = getPageOffsets();
      setTotalItems(qRects.length);
      let cumulativeOffset = 0;
      for (let i = 0; i < qRects.length; i++) {
        const qRect = qRects[i];
        setCurrentItemIdx(i);
        lastProgressRef.current = Math.round((i / qRects.length) * 100);
        const slice = await cropRect(qRect, offsets);
        const childAnsRects = aRects.filter(ar => {
          const cx = ar.x + ar.width / 2;
          const cy = ar.y + ar.height / 2;
          return cx >= qRect.x && cx <= qRect.x + qRect.width && cy >= qRect.y - 10 && cy <= qRect.y + qRect.height + 20;
        });
        const getManualBox = (target: Rect | undefined) => {
          if (!target) return undefined;
          return [Math.max(0, Math.round((target.y - qRect.y) / qRect.height * 10000)), Math.max(0, Math.round((target.x - qRect.x) / qRect.width * 10000)), Math.min(10000, Math.round((target.y + target.height - qRect.y) / qRect.height * 10000)), Math.min(10000, Math.round((target.x + target.width - qRect.x) / qRect.width * 10000))] as [number, number, number, number];
        };
        const manualAnswerBox = getManualBox(childAnsRects[0]);
        const autoAnalysis = autoAnalysisRects.find(ar => ar.id === `auto-analysis-${qRect.id}`);
        const manualAnalysisBox = getManualBox(autoAnalysis);
        const childDiagrams: string[] = [];
        const diagramRects = dRects.filter(dr => {
          const cx = dr.x + dr.width / 2;
          const cy = dr.y + dr.height / 2;
          return (cx >= qRect.x - 100 && cx <= qRect.x + qRect.width + 100 && cy >= qRect.y - 50 && cy <= qRect.y + qRect.height + 200);
        });
        for (const dr of diagramRects) {
          const dSlice = await cropRect(dr as Rect, offsets);
          if (dSlice) childDiagrams.push(dSlice.base64);
        }

        const res = await fetch('/api/ai-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'parseQuestion', 
            imageData: slice.base64, 
            hasManualAnswer: !!manualAnswerBox, 
            hasManualAnalysis: !!manualAnalysisBox,
            isDeepThinking 
          })
        });

        if (!res.body) throw new Error('ReadableStream not supported');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let parsedQuestions: any = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const payload = JSON.parse(line.slice(6));
                if (payload.type === 'status') {
                  setProgressLabel(`第 ${i + 1}/${qRects.length} 项: ${payload.msg}`);
                } else if (payload.type === 'data') {
                  parsedQuestions = payload.data;
                } else if (payload.type === 'error') {
                  const failureId = (Date.now().toString(36) + Math.random().toString(36).substring(2));
                  setParsingFailures(prev => [...prev, { id: failureId, label: `项 ${i + 1}`, error: payload.error || '解析异常' }]);
                  break;
                }
              } catch (e) {}
            }
          }
        }

        if (parsedQuestions && parsedQuestions.length > 0) {
          const processedQuestions = await Promise.all(parsedQuestions.map(async (q: any, subIdx: number) => {
            // 处理插图逻辑：
            // 1. 如果手动框选了 diagramRects，使用手动裁切的结果
            // 2. 否则，如果 AI 返回了 diagrams 坐标，进行全自动裁切
            let diagrams = childDiagrams;
            if (diagrams.length === 0 && (q.diagrams || q.diagram_boxes)) {
              diagrams = await processAIDiagrams(q.diagrams || q.diagram_boxes, slice.base64);
            }

            return {
              ...q,
              id: (Date.now().toString(36) + Math.random().toString(36).substring(2)),
              image: slice.base64,
              contentImage: slice.base64,
              order: questions.length + cumulativeOffset + subIdx + 1,
              type: q.type || 'essay',
              answer_box: manualAnswerBox || q.answer_box,
              analysis_box: manualAnalysisBox,
              diagrams: diagrams,
            };
          }));
          addQuestions(processedQuestions);
          cumulativeOffset += processedQuestions.length;
        }
      }
      setView('editor');
      onComplete();
    } catch (error: any) {
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  const getPageRectCount = (pageIdx: number): number => {
    const offsets = getPageOffsets();
    const o = offsets[pageIdx];
    if (!o) return 0;
    const pTop = o.top;
    const pBottom = pTop + o.height;
    return rects.filter(r => (r.type === 'question' || r.type === undefined) && r.y < pBottom && r.y + r.height > pTop).length;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden relative">
      {isProcessing && (
        <>
          <div className="absolute top-0 left-0 right-0 h-1.5 z-[100] overflow-hidden bg-gray-100/50 backdrop-blur-sm">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ ease: "linear", duration: 0.5 }}
            />
          </div>
          <div className="absolute top-4 left-0 right-0 flex justify-center z-[100] pointer-events-none">
            <AnimatePresence mode="wait">
              {progressLabel && (
                <motion.div
                  key={progressLabel}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="px-6 py-2 bg-white/70 backdrop-blur-md border border-white/40 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.1)] flex items-center gap-3"
                >
                  <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                  <span className="text-[13px] font-black text-red-600 tracking-wide uppercase">
                    {progressLabel}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      <div className="flex flex-col md:flex-row items-center justify-between px-2 md:px-6 py-3 md:py-4 bg-white border-b z-20 shadow-sm gap-2 md:gap-4 overflow-hidden">
        <div className="flex flex-nowrap items-center justify-start gap-3 md:gap-5 w-full overflow-x-auto scrollbar-hide pb-2 md:pb-0 px-2 md:px-0">
          {onClose && (
            <button
              onClick={onClose}
              className="px-2.5 py-2.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 active:scale-95 shrink-0 flex items-center justify-center transition-all hover:rotate-90"
            >
              <X className="w-4 h-4 md:w-5 md:h-5 stroke-[4px]" />
            </button>
          )}
          <h3 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight hidden lg:block shrink-0">内容预处理</h3>
          
          {/* 模式切换滑轨 */}
          <div className="flex bg-gray-100 p-1 rounded-full shrink-0">
            <button
              onClick={() => setActiveDrawMode(prev => prev === 'question' ? null : 'question')}
              className={cn(
                "px-5 py-2.5 rounded-full text-sm font-black transition-all flex items-center gap-2 whitespace-nowrap",
                activeDrawMode === 'question' 
                  ? "bg-brand-primary text-white shadow-md shadow-brand-primary/30" 
                  : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
              )}
            >
              <div className={cn("w-3.5 h-3.5 rounded border-2 transition-colors", activeDrawMode === 'question' ? "bg-white/20 border-white" : "bg-brand-primary/20 border-brand-primary")} />
              题目
            </button>
            <button
              onClick={() => setActiveDrawMode(prev => prev === 'answer' ? null : 'answer')}
              className={cn(
                "px-5 py-2.5 rounded-full text-sm font-black transition-all flex items-center gap-2 whitespace-nowrap",
                activeDrawMode === 'answer' 
                  ? "bg-red-500 text-white shadow-md shadow-red-500/30" 
                  : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
              )}
            >
              <div className={cn("w-3.5 h-3.5 rounded border-2 transition-colors", activeDrawMode === 'answer' ? "bg-white/20 border-white" : "bg-red-500/20 border-red-500")} />
              答案遮挡
            </button>
            <div
              className="px-5 py-2.5 rounded-full text-sm font-black flex items-center gap-2 text-purple-600/60 cursor-default whitespace-nowrap"
            >
              <div className="w-3.5 h-3.5 rounded bg-purple-500/10 border-2 border-purple-500/30" />
              分析 <span className="text-[10px] text-purple-400">自动</span>
            </div>
            <button
              onClick={() => setActiveDrawMode(prev => prev === 'diagram' ? null : 'diagram')}
              className={cn(
                "px-5 py-2.5 rounded-full text-sm font-black transition-all flex items-center gap-2 whitespace-nowrap",
                activeDrawMode === 'diagram' 
                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30" 
                  : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
              )}
            >
              <div className={cn("w-3.5 h-3.5 rounded border-2 transition-colors", activeDrawMode === 'diagram' ? "bg-white/20 border-white" : "bg-emerald-500/20 border-emerald-500")} />
              插图
            </button>
          </div>

          {/* 统计信息药丸 */}
          <div className="hidden md:flex items-center justify-center gap-4 bg-gray-100/80 px-5 py-2.5 rounded-full text-[11px] font-black text-gray-500 tracking-wide border border-gray-200 shadow-sm shrink-0 whitespace-nowrap">
            <span className="flex items-center gap-1.5 underline decoration-gray-300 decoration-2 underline-offset-4">
              {selectedPageIndices.size}/{pages.length} 页
            </span>
            <span className="w-px h-4 bg-gray-300" />
            <span className="text-brand-primary flex items-center gap-1.5">
               {rects.filter(r => r.type === 'question' || r.type === undefined).length} 题
            </span>
          </div>

          {/* 缩放选择器 */}
          <div className="flex items-center justify-center gap-3 px-5 py-2.5 bg-gray-100/80 rounded-full border border-gray-200 shadow-sm shrink-0">
            <span className="text-[11px] font-black text-gray-400 uppercase tracking-tighter">100%</span>
            <select 
              value={zoom} 
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="bg-transparent text-[13px] font-black text-gray-700 outline-none cursor-pointer"
            >
              <option value="0.5">50%</option>
              <option value="0.75">75%</option>
              <option value="1">100%</option>
              <option value="1.5">150%</option>
              <option value="2">200%</option>
            </select>
          </div>
        </div>

        <div className="hidden md:flex flex-nowrap items-center gap-4 w-auto ml-auto">
          {/* 深度思考 (Independent Channel 3.1 Pro) */}
          <button
            onClick={() => setIsDeepThinking(!isDeepThinking)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all active:scale-95 shadow-sm",
              isDeepThinking 
                ? "bg-purple-600 border-purple-700 text-white" 
                : "bg-white border-gray-200 text-gray-500 hover:border-brand-primary/30"
            )}
          >
            {isDeepThinking ? <Brain className="w-4 h-4 animate-pulse" /> : <Zap className="w-4 h-4" />}
            <span className="text-[12px] font-black uppercase tracking-tight">深度思考 (3.1 Pro)</span>
            <div className={cn(
              "w-8 h-4 rounded-full relative transition-colors ml-1",
              isDeepThinking ? "bg-white/20" : "bg-gray-200"
            )}>
              <div className={cn(
                "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all",
                isDeepThinking ? "left-[18px]" : "left-[2px]"
              )} />
            </div>
          </button>

          <button
            onClick={() => setView('editor')}
            className="flex-1 md:flex-none px-6 py-2.5 bg-orange-500 text-white text-[13px] font-black rounded-full border border-orange-600 shadow-lg active:scale-95 whitespace-nowrap"
          >
            跳过
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            className="flex-1 md:flex-none px-8 py-2.5 bg-brand-primary text-white text-sm font-black rounded-full shadow-xl hover:scale-105 active:scale-95 disabled:opacity-80 transition-all flex items-center gap-2 justify-center whitespace-nowrap min-w-[120px]"
          >
            {isProcessing ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{Math.floor(progress)}%</span>
              </div>
            ) : (
              <><CheckCircle2 className="w-5 h-5" /> 识别解析</>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div className={cn("flex bg-white flex-col shrink-0 overflow-hidden transition-transform duration-300", isMobileSidebarOpen ? "fixed inset-0 z-[100]" : "hidden md:relative md:flex")} style={{ width: isMobileSidebarOpen ? '100%' : `${sidebarWidth}px` }}>
          <div className="p-4 border-b bg-gray-50/50 flex items-center justify-between">
            <span className="text-sm font-black text-gray-800 flex items-center gap-2">
              <LayoutList className="w-5 h-5" /> 页面管理
            </span>
            <button onClick={() => setIsMobileSidebarOpen(false)} className="md:hidden p-2 bg-gray-100 rounded-full active:scale-95"><X className="w-5 h-5" /></button>
          </div>

          {/* 侧边栏宽度拉伸柄 */}
          <div 
            className="hidden md:block absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-brand-primary active:bg-brand-primary/80 transition-colors z-[50] pointer-events-auto"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              interactionRef.current = 'resizing-sidebar';
              document.body.style.cursor = 'col-resize';
            }}
          />
          <div className="absolute top-0 right-0 w-px h-full bg-gray-200 pointer-events-none z-40" />
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {pages.map((page, idx) => (
              <div key={idx} className={cn("relative rounded-xl overflow-hidden border-4 aspect-[3/4]", selectedPageIndices.has(idx) ? "border-brand-primary" : "border-gray-200")}>
                <img src={page} className="w-full h-full object-cover" />
                <div onClick={() => {
                  const next = new Set(selectedPageIndices);
                  if (next.has(idx)) next.delete(idx); else next.add(idx);
                  setSelectedPageIndices(next);
                }} className="absolute top-2 right-2 bg-white rounded-md p-1 shadow-md cursor-pointer">
                  {selectedPageIndices.has(idx) ? <CheckSquare className="text-brand-primary" /> : <Square className="text-gray-300" />}
                </div>
                <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-2 rounded">{idx + 1}</div>
              </div>
            ))}
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-[3/4] border-4 border-dashed border-gray-100 rounded-3xl flex flex-col items-center justify-center gap-3 text-gray-400 hover:border-brand-primary hover:text-brand-primary hover:bg-brand-primary/5 transition-all group shrink-0"
            >
              <div className="p-4 bg-gray-50 rounded-2xl group-hover:bg-brand-primary/10">
                <ImageIcon className="w-8 h-8" />
              </div>
              <span className="text-xs font-black uppercase tracking-widest">添加照片</span>
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-auto bg-gray-100/30 p-4">
          <div className="flex justify-center">
            <div ref={containerRef} className={cn("relative shadow-2xl bg-white flex flex-col origin-top", isProcessing ? "opacity-50 pointer-events-none" : "cursor-crosshair")} style={{ width: `${zoom * 100}%` }} onPointerDown={startDrawing}>
              {pages.map((page, idx) => (
                <img key={idx} ref={el => { imgRefs.current[idx] = el; }} src={page} className="block w-full select-none" onLoad={() => setImagesLoaded(prev => prev + 1)} />
              ))}
              {rects.map(rect => {
                const isSelected = selectedId === rect.id;
                return (
                  <div key={rect.id} onPointerDown={(e) => startMoving(e, rect.id)} className={cn("absolute border-2 z-20", isSelected ? "border-brand-secondary bg-brand-secondary/10" : "border-brand-primary bg-brand-primary/5")} style={{ left: rect.x * zoom, top: rect.y * zoom, width: rect.width * zoom, height: rect.height * zoom }}>
                    <div className="absolute -top-6 left-0 bg-brand-primary text-white text-[10px] px-2 py-0.5 rounded-t-md">#{rects.filter(r => r.type === 'question' || !r.type).findIndex(r => r.id === rect.id) + 1} 题目</div>
                    <button onClick={(e) => { e.stopPropagation(); setRects(prev => prev.filter(r => r.id !== rect.id)); }} className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 shadow-lg"><X size={12} /></button>
                  </div>
                )
              })}
              {drawingRect && (
                <div className="absolute border-2 border-dashed border-brand-primary bg-brand-primary/5 z-20 pointer-events-none" style={{ left: (drawingRect.width! > 0 ? drawingRect.x : (drawingRect.x! + drawingRect.width!))! * zoom, top: (drawingRect.height! > 0 ? drawingRect.y : (drawingRect.y! + drawingRect.height!))! * zoom, width: Math.abs(drawingRect.width!) * zoom, height: Math.abs(drawingRect.height!) * zoom }} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* === 移动端悬浮操作栏 (Fixed Bottom Bar) === */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-3 pb-safe bg-white/95 backdrop-blur-md border-t z-[80] shadow-[0_-10px_20px_rgba(0,0,0,0.05)] flex items-center justify-between gap-2.5">
        
        {/* 全局页面抽屉按钮 */}
        <button
          onClick={() => setIsMobileSidebarOpen(true)}
          className="flex flex-col items-center justify-center gap-1 w-[68px] h-[52px] bg-indigo-50 text-indigo-600 rounded-xl active:scale-95 transition-transform shrink-0"
        >
          <LayoutList className="w-5 h-5" /> 
          <span className="text-[10px] font-black leading-none">{selectedPageIndices.size}/{pages.length}页</span>
        </button>

        {/* 深度思考 (Mobile) */}
        <button
          onClick={() => setIsDeepThinking(!isDeepThinking)}
          className={cn(
            "flex flex-col items-center justify-center gap-1 w-[68px] h-[52px] rounded-xl active:scale-95 transition-all shrink-0 shadow-sm border",
            isDeepThinking ? "bg-purple-600 text-white border-purple-700" : "bg-gray-50 text-gray-400 border-gray-200"
          )}
        >
          {isDeepThinking ? <Brain className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
          <span className="text-[9px] font-black leading-none">深度思考</span>
        </button>

        <button
          onClick={() => setView('editor')}
          className="flex-1 h-[52px] bg-orange-500 text-white font-black text-[15px] rounded-xl shadow-[0_8px_20px_-6px_rgba(249,115,22,0.5)] active:scale-95 transition-all flex items-center justify-center shrink-0"
        >
          跳过
        </button>

        <button
          onClick={handleConfirm}
          disabled={isProcessing}
          className="flex-[1.5] h-[52px] bg-brand-primary text-white font-black text-[15px] rounded-xl shadow-[0_8px_20px_-6px_rgba(59,130,246,0.5)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-80 transition-all flex items-center justify-center gap-2 shrink-0 border-none"
        >
          {isProcessing ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> {Math.floor(progress)}%</>
          ) : (
            <><CheckCircle2 className="w-5 h-5" /> 识别解析</>
          )}
        </button>
      </div>

      <AnimatePresence>
        {!isProcessing && parsingFailures.length > 0 && (
          <motion.div initial={{ opacity: 0, x: 200 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="fixed top-24 right-6 w-80 bg-white border border-red-200 rounded-3xl shadow-2xl z-[150] overflow-hidden">
             <div className="p-5 bg-gradient-to-r from-red-500 to-rose-600 text-white flex items-center justify-between font-black">
                <span>解析任务诊断报告</span>
                <button onClick={() => setParsingFailures([])}><X size={16} /></button>
             </div>
             <div className="p-4 space-y-3 max-h-[50vh] overflow-y-auto">
                {parsingFailures.map((f, i) => (
                  <div key={f.id} className="p-3 bg-red-50 rounded-xl">
                    <div className="text-xs font-black flex justify-between"><span>{f.label}</span><span>#{i+1}</span></div>
                    <div className="text-[10px] text-red-600 mt-1">{f.error}</div>
                  </div>
                ))}
             </div>
             <div className="p-4 border-t bg-gray-50 flex flex-col gap-2">
                <p className="text-[10px] text-gray-500 text-center">系统已跳过失败项，您可以手动补录。</p>
                <button onClick={() => setParsingFailures([])} className="w-full py-2 bg-red-500 text-white font-black rounded-xl">确认并继续</button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
      <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleAddPage} />
    </div>
  );
};
