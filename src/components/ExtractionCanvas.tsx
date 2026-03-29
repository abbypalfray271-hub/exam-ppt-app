'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, CheckCircle2, Loader2, X, Sparkles, CheckSquare, Square, LayoutList, Image as ImageIcon } from 'lucide-react';


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
  // 矩形全局扁平数组（坐标基于 containerRef）
  const [rects, setRects] = useState<Rect[]>([]);
  const [drawingRect, setDrawingRect] = useState<Partial<Rect> | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [activePageIdx, setActivePageIdx] = useState(initialPageIndex);
  const [activeDrawMode, setActiveDrawMode] = useState<'question' | 'answer' | 'diagram'>('question');
  const [progressLabel, setProgressLabel] = useState("");
  const [errorLogs, setErrorLogs] = useState<{ id: string; msg: string; type: 'error' | 'warn' }[]>([]);
  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  // 图片加载完成计数，用于触发首次 scroll-to-page
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const [zoom, setZoom] = useState(1); // 缩放倍率，默认为 1.0 (100%)
  const [selectedPageIndices, setSelectedPageIndices] = useState<Set<number>>(new Set());
  const [sidebarWidth, setSidebarWidth] = useState(380);

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

  // === [NEW] 智能初始化：进入后默认全选所有页面，方便直接一键“解析” ===
  useEffect(() => {
    if (pages.length > 0 && selectedPageIndices.size === 0) {
      setSelectedPageIndices(new Set(pages.map((_, i) => i)));
    }
  }, [pages.length]); // 只有在页数变化或初始载入时检查

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
      
      // 并自动勾选新加入的页
      const nextSelected = new Set(selectedPageIndices);
      newBase64s.forEach((_, i) => nextSelected.add(pages.length + i));
      setSelectedPageIndices(nextSelected);

      // 如果有父组件的回调，在此同步（本系统中主要由 Store 驱动渲染）
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };




  // === 自动计算紫色分析区：题目区 - 答案遮挡区 ===
  const autoAnalysisRects = useMemo(() => {
    const qRects = rects.filter(r => r.type === 'question' || r.type === undefined);
    const aRects = rects.filter(r => r.type === 'answer');
    const result: { id: string; x: number; y: number; width: number; height: number; parentLabel: string }[] = [];

    qRects.sort((a, b) => a.y - b.y).forEach((qRect, qIdx) => {
      // 找到属于该题目框的答案框
      const childAns = aRects.filter(ar => {
        const cx = ar.x + ar.width / 2;
        const cy = ar.y + ar.height / 2;
        return cx >= qRect.x && cx <= qRect.x + qRect.width && cy >= qRect.y - 10 && cy <= qRect.y + qRect.height + 20;
      });
      if (childAns.length === 0) return; // 没有答案框则不生成分析区

      // 取答案框中最靠下的那个的底边作为分界线
      const ansBottom = Math.max(...childAns.map(a => a.y + a.height));
      // 分析区 = 答案遮挡区下方到题目区底部的部分
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
  // 镜像 drawingRect 的 ref，用于 handleMouseUp 中读取最新值，避免嵌套 setState 导致重复 key
  const drawingRectRef = useRef<Partial<Rect> | null>(null);

  // === 模拟分析进度条 (Fake Progress Engine) ===
  const lastProgressRef = useRef(0);
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing) {
      setProgress(currentItemIdx > 0 ? (currentItemIdx / totalItems) * 100 : 2);
      interval = setInterval(() => {
        setProgress(prev => {
          // 核心逻辑：当前进度的“天花板”是 (当前索引 + 0.9) / 总数
          // 这样进度条永远不会在第一页就冲到 99%，而是随着页码推进
          const currentBase = totalItems > 0 ? (currentItemIdx / totalItems) * 100 : 0;
          const nextCap = totalItems > 0 ? ((currentItemIdx + 0.9) / totalItems) * 100 : 99;
          
          let next = prev;
          if (prev < nextCap) {
            // 在当前区段内进行模拟增长
            const step = (nextCap - currentBase) / 20; // 这里的 20 是调节平滑度的参数
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

  // === 批量删除选中页面并同步更新 Rects 坐标 ===
  const handleDeleteSelected = () => {
    if (selectedPageIndices.size === 0 || isProcessing) return;
    
    const count = selectedPageIndices.size;
    if (!window.confirm(`确定要删除选中的 ${count} 张图片及其上面的所有框选吗？\n删除后不可撤销。`)) return;

    const offsets = getPageOffsets();
    const deletedIndices = Array.from(selectedPageIndices).sort((a, b) => a - b);
    
    // 1. 过滤并平移 Rects
    const updatedRects: Rect[] = rects


      .filter(r => {
        const midY = r.y + r.height / 2;
        const pageIdx = offsets.findIndex(o => midY >= o.top && midY < o.top + o.height);
        return !selectedPageIndices.has(pageIdx);
      })
      .map(r => {
        const midY = r.y + r.height / 2;
        const pageIdx = offsets.findIndex(o => midY >= o.top && midY < o.top + o.height);
        
        // 计算其上方被删除页面的总高度
        let deletedAboveHeight = 0;
        for (const dIdx of deletedIndices) {
          if (dIdx < pageIdx) {
            deletedAboveHeight += offsets[dIdx].height;
          }
        }
        
        return deletedAboveHeight > 0 ? { ...r, y: r.y - deletedAboveHeight } : r;
      });

    // 2. 更新图片列表
    const newPages = pages.filter((_, i) => !selectedPageIndices.has(i));
    
    // 3. 执行状态更新
    setRects(updatedRects);
    setExamPages(newPages);
    setSelectedPageIndices(new Set());
    
    // 如果全部删除了，回到上传页
    if (newPages.length === 0) {
      resetUpload();
    } else {

      // 保持 imagesLoaded 能反映新数组，防止因计数不足导致后续逻辑挂起
      setImagesLoaded(newPages.length);
    }
  };

  // === 鼠标事件：开始绘制 ===
  const startDrawing = (e: React.PointerEvent) => {
    if (!containerRef.current || isProcessing) return;
    // 拦截触摸等事件默认的滚动和双击放大行为
    if (e.pointerType === 'touch') {
      // 在 Safari/iOS 环境中，仅依靠 touch-none 可能不够
      // 我们通过 pointer down 不调用 preventDefault（以防影响焦点），但依靠 CSS touch-none 主导
    }

    const cr = containerRef.current.getBoundingClientRect();
    // 考虑缩放率：将真实的物理坐标转换为 1.0 倍率下的“基准尺寸”存储
    const x = (e.clientX - cr.left) / zoom;
    const y = (e.clientY - cr.top) / zoom;

    setSelectedId(null);
    setDrawingRect({ id: crypto.randomUUID(), x, y, width: 0, height: 0, type: activeDrawMode });
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

  // === 全局 pointermove / pointerup ===
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
      else if (interactionRef.current === 'resizing-sidebar') {
        const newWidth = e.clientX;
        // 限制侧边栏宽度在 200px 到 屏幕宽度的一半之间，且最大不超过 800px
        setSidebarWidth(Math.max(200, Math.min(newWidth, window.innerWidth * 0.5, 800)));
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
            type: currentRect.type as 'question' | 'answer' | 'diagram',
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
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
    return () => {
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
    };
  }, [selectedId, resizeHandle]);

  // =================================================================
  // 核心：跨页裁剪 —— 判断矩形覆盖哪些页，分别裁剪后纵向拼接
  // =================================================================
  // =================================================================
  // 核心：跨页裁剪 —— 判断矩形覆盖哪些页，分别裁剪后纵向拼接
  // 优化：增加图片分片处理，防止大图导致 AI 响应超时
  // =================================================================
  interface ImageSlice {
    base64: string;
    yOffset: number; // 该片段在题目框(qRect)中的纵向起始位(物理像素)
    height: number;  // 该片段的物理高度
  }

  const cropRect = async (rect: Rect, offsets: PageOffset[]): Promise<ImageSlice> => {
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

    // 拼接到 Full Canvas
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

    // 处理缩放映射后的最大尺寸优化 (清晰度强化版：支持超高清全页解析)
    // 5000px 可以确保 99% 的 12pt 字体试卷在缩放后依然保持极高的清晰度
    const MAX_WIDTH = 2500;
    const MAX_HEIGHT = 5000;
    let finalScale = 1;
    
    // 计算缩放比例，同时兼顾宽高限制
    if (outputW > MAX_WIDTH) {
      finalScale = MAX_WIDTH / outputW;
    }
    if (fullH * finalScale > MAX_HEIGHT) {
      finalScale = MAX_HEIGHT / fullH;
    }
    
    const finalCanvas = document.createElement('canvas');
    const fCtx = finalCanvas.getContext('2d');
    if (!fCtx) throw new Error('Final canvas ctx failed');
    
    finalCanvas.width = Math.round(outputW * finalScale);
    finalCanvas.height = Math.round(fullH * finalScale);
    fCtx.drawImage(fullCanvas, 0, 0, outputW, fullH, 0, 0, finalCanvas.width, finalCanvas.height);
    
    // 移除手动灰度逻辑，保留原始色彩以增强 AI 视觉识别的对比度细节

    return {
      base64: finalCanvas.toDataURL('image/jpeg', 0.98),
      yOffset: 0,
      height: finalCanvas.height
    };
  };

  // === 确认并解析 ===
  const handleConfirm = async () => {
    // 处理手动框选结果
    const qRects = rects.filter(r => r.type === 'question' || !r.type).sort((a, b) => a.y - b.y);
    const aRects = rects.filter(r => r.type === 'answer');
    const dRects = rects.filter(r => r.type === 'diagram');

    // --- 新增：无框选全自动补偿逻辑 (分页分治 + 定向选页优化) ---
    if (qRects.length === 0) {
      if (selectedPageIndices.size === 0) {
        alert('请先在左侧侧边栏勾选至少一页需要解析的页面。');
        return;
      }

      const targetIndices = Array.from(selectedPageIndices).sort((a, b) => a - b);
      const confirmed = window.confirm(`是否开始对选中的 ${targetIndices.length} 页试卷进行“全自动智能识别”？\n\n系统将智能提取题目、答案并补全解析。`);
      if (!confirmed) return;

      setProcessing(true);
      const allResults: any[] = [];

      try {
        console.log(`%c[AI定向解析] 启动分页识别模式 (选中 ${targetIndices.length}/${pages.length} 页)...`, 'color: #8b5cf6; font-weight: bold');
        setTotalItems(targetIndices.length);
        
        for (let idx = 0; idx < targetIndices.length; idx++) {
          const i = targetIndices[idx];
          setCurrentItemIdx(idx);
          setProgressLabel(`正在识别 第 ${idx + 1}/${targetIndices.length} 页...`);
          // 更新真实进度锚点，让模拟引擎追赶
          lastProgressRef.current = Math.round((idx / targetIndices.length) * 100);
          
          if (idx > 0) await new Promise(resolve => setTimeout(resolve, 500)); // 注入 500ms 节流
          
          try {
            // 前端二次压缩，防止 PDF 页 Base64 体积过大导致 API 500/413 报错
            const compressedPage = await compressImage(pages[i], 2000);
            
            const res = await fetch('/api/ai-parse', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                action: 'parseQuestion', 
                imageData: compressedPage,
                hasManualAnswer: false,
                hasManualAnalysis: false,
                isRetry: false
              })
            });
            
            if (!res.ok) {
              const errText = await res.text();
              throw new Error(`HTTP ${res.status}: ${errText.slice(0, 100)}`);
            }
            
            const data = await res.json();
            if (data.success && data.data) {
              // 为每道题注入物理图片引用 + 自动预览裁剪（实现与手动模式对齐）
              const pageResults = await Promise.all(data.data.map(async (q: any) => {
                const box = q.content_box || q.contentBox;
                let croppedImage = pages[i]; // 默认整页
                const diagramImages: string[] = [];

                if (box && Math.abs(box[2] - box[0]) > 0) {
                  try {
                    const crop = await cropImageByBox(pages[i], box);
                    if (crop) croppedImage = crop;
                  } catch (e) {
                    console.error('Auto crop failed:', e);
                  }
                }

                // --- 核心逻辑：全自动模式图样切割 ---
                const dBoxes = q.diagram_boxes || [];
                for (const dBox of dBoxes) {
                  try {
                    // 对图样框加大安全边距（上方+15%，下方+5%，左右+3%），防止截断
                    const boxH = dBox[2] - dBox[0];
                    const boxW = dBox[3] - dBox[1];
                    const expandedBox: [number, number, number, number] = [
                      Math.max(0, dBox[0] - Math.round(boxH * 0.50)),   // ymin 向上极大幅扩展 50%
                      Math.max(0, dBox[1] - Math.round(boxW * 0.08)),   // xmin 向左扩展 8%
                      Math.min(1000, dBox[2] + Math.round(boxH * 0.20)),// ymax 向下大幅扩展 20% (保证标签完整)
                      Math.min(1000, dBox[3] + Math.round(boxW * 0.20)),// xmax 向右大幅扩展 20%
                    ];
                    console.log(`[Diagram-Crop] AI Box: ${JSON.stringify(dBox)}, Expanded: ${JSON.stringify(expandedBox)}`);
                    const dCrop = await cropImageByBox(pages[i], expandedBox);
                    if (dCrop) diagramImages.push(dCrop);
                  } catch (e) {
                    console.error('Auto diagram crop failed:', e);
                  }
                }

                return {
                  ...q,
                  image: pages[i],          // 原图底图
                  contentImage: croppedImage, // 预览切图
                  diagrams: diagramImages,    // 自动发现的插图
                };
              }));
              allResults.push(...pageResults);
            } else {
              console.warn(`第 ${i + 1} 页解析出现警告: ${data.error || '内容为空'}`);
            }
          } catch (pageErr: any) {
            const errorMsg = `第 ${i + 1} 页识别失败: ${pageErr.message}`;
            console.error(`%c[AI分页解析] ${errorMsg}`, 'color: #ef4444');
            setErrorLogs(prev => [{ id: crypto.randomUUID(), msg: errorMsg, type: 'error' as const }, ...prev].slice(0, 5));
          }
        }

        if (allResults.length > 0) {
          setProgress(100);
          lastProgressRef.current = 100;
          setProgressLabel("解析完成，正在跳转...");
          await new Promise(r => setTimeout(r, 500));
          const newQuestions = allResults.map((q: any, idx: number) => ({
            ...q,
            id: crypto.randomUUID(),
            order: questions.length + idx + 1,
            type: q.type || 'essay'
          }));
          
          addQuestions(newQuestions);
          // 修正：先切换全局视图，再通知父组件关闭当前画布
          setView('editor');
          onComplete();
        } else {
          alert('AI 未能在选中的页面中识别出有效题目，请确认图片是否清晰，或尝试手动框选。');
        }
      } catch (err: any) {
        console.error('Page-by-page parse error:', err);
        alert(`识别过程中发生错误: ${err.message}`);
      } finally {
        setProcessing(false);
        setProgress(0);
      }
      return;
    }

    // --- 原有：手动选区解析逻辑 ---
    setProcessing(true);
    let processed = 0;

    try {
      console.log(`%c[AI解析] 开始解析 ${qRects.length} 道题目 (答案框: ${aRects.length}, 自动分析框: ${autoAnalysisRects.length})`, 'color: #3b82f6; font-weight: bold');

      const offsets = getPageOffsets();
      if (offsets.length === 0) throw new Error('无法获取页面结构，请稍后重试');

      // 改为顺序执行，以确保题号顺序递增且不覆盖
      setTotalItems(qRects.length);
      let cumulativeOffset = 0;
      for (let i = 0; i < qRects.length; i++) {
        const qRect = qRects[i];
        setCurrentItemIdx(i);
        setProgressLabel(`解析中 第 ${i + 1}/${qRects.length} 个区域...`);
        lastProgressRef.current = Math.round((i / qRects.length) * 100);
        
        // 1. 获取该题目区域的完整图像
        const slice = await cropRect(qRect, offsets);
        console.log(`%c[AI解析] 题目 ${i + 1}/${qRects.length} 图像生成完成 (${slice.height}px)`, 'color: #3b82f6');

        // 寻找所有属于这个题目框的答案框
        const childAnsRects = aRects.filter(ar => {
          const cx = ar.x + ar.width / 2;
          const cy = ar.y + ar.height / 2;
          return cx >= qRect.x && cx <= qRect.x + qRect.width && cy >= qRect.y - 10 && cy <= qRect.y + qRect.height + 20;
        });

        const getManualBox = (target: Rect | undefined) => {
          if (!target) return undefined;
          return [
            Math.max(0, Math.round((target.y - qRect.y) / qRect.height * 10000)),
            Math.max(0, Math.round((target.x - qRect.x) / qRect.width * 10000)),
            Math.min(10000, Math.round((target.y + target.height - qRect.y) / qRect.height * 10000)),
            Math.min(10000, Math.round((target.x + target.width - qRect.x) / qRect.width * 10000)),
          ] as [number, number, number, number];
        };

        const manualAnswerBox = getManualBox(childAnsRects[0]);
        const autoAnalysis = autoAnalysisRects.find(ar => ar.id === `auto-analysis-${qRect.id}`);
        const manualAnalysisBox = getManualBox(autoAnalysis);

        // --- 新增：图样裁剪逻辑 ---
        const childDiagrams: string[] = [];
        const diagramRects = dRects.filter(dr => {
          const cx = dr.x + dr.width / 2;
          const cy = dr.y + dr.height / 2;
          // 宽松匹配：中心点在题目框范围内（左右扩展100px，上下扩展150px）
          // 这样可以捕捉到位于题目右侧或紧随其后的“备用图”等插图
          return (
            cx >= qRect.x - 100 && 
            cx <= qRect.x + qRect.width + 100 && 
            cy >= qRect.y - 50 && 
            cy <= qRect.y + qRect.height + 200
          );
        });

        for (const dr of diagramRects) {
          const dSlice = await cropRect(dr as Rect, offsets);
          if (dSlice) childDiagrams.push(dSlice.base64);
        }

        // 2. 发起解析请求
        let retryCount = 0;
        const maxRetries = 1;

        const performParse = async (): Promise<any> => {
          const startTime = Date.now();
          try {
            const res = await fetch('/api/ai-parse', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                action: 'parseQuestion',
                imageData: slice.base64,
                hasManualAnswer: !!manualAnswerBox,
                hasManualAnalysis: !!manualAnalysisBox,
                isRetry: retryCount > 0
              })
            });

            if (!res.ok) {
              const errText = await res.text();
              throw new Error(`HTTP ${res.status}: ${errText.slice(0, 100)}`);
            }

            const data = await res.json();
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            if (!data.success) {
              const isTimeout = data.error?.includes('524') || data.error?.includes('超时');
              if (isTimeout && retryCount < maxRetries) {
                retryCount++;
                await new Promise(r => setTimeout(r, 2000));
                return performParse();
              }
              const errorMsg = `第 ${i + 1} 个区域解析失败: ${data.error}`;
              console.error(`%c[AI解析] ❌ ${errorMsg}`, 'color: #ef4444');
              setErrorLogs(prev => [{ id: crypto.randomUUID(), msg: errorMsg, type: 'error' as const }, ...prev].slice(0, 5));
              return null;
            }
            
            console.log(`%c[AI解析] ✅ 题目 ${i + 1} 成功 (${elapsed}s)`, 'color: #22c55e');
            return data.data || [];
          } catch (err: any) {
            if (retryCount < maxRetries) {
              retryCount++;
              await new Promise(r => setTimeout(r, 2000));
              return performParse();
            }
            const errorMsg = `第 ${i + 1} 个区域网络错误: ${err.message}`;
            setErrorLogs(prev => [{ id: crypto.randomUUID(), msg: errorMsg, type: 'error' as const }, ...prev].slice(0, 5));
            return null;
          }
        };

        const parsedQuestions = await performParse();
        if (parsedQuestions && parsedQuestions.length > 0) {
          // 3. 聚合结果并存储 (由于移除了分片，此处的 parsedQuestions 已经是最终针对该区域的结果)
          const finalizedQuestions: Question[] = parsedQuestions.map((q: any, subIdx: number) => ({
            ...q,
            id: crypto.randomUUID(),
            image: slice.base64,
            contentImage: slice.base64, // 针对单题框选，预览图直接使用全景图
            order: questions.length + cumulativeOffset + subIdx + 1,
            type: q.type || 'essay',
            answer_box: manualAnswerBox || q.answer_box,
            analysis_box: manualAnalysisBox,
            diagrams: childDiagrams.length > 0 ? childDiagrams : q.diagrams,
          }));
          
          addQuestions(finalizedQuestions);
          cumulativeOffset += finalizedQuestions.length;
        }

        processed++;
        const realPercent = Math.round((processed / qRects.length) * 100);
        lastProgressRef.current = realPercent;
        setProgress(realPercent);

        if (i < qRects.length - 1) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      setProgress(100);
      lastProgressRef.current = 100;
      setProgressLabel("解析完成，正在跳转...");
      await new Promise(r => setTimeout(r, 500));

      setView('editor');
      onComplete();
    } catch (error: any) {
      console.error(error);
      const isTimeout = error?.message?.includes('超时') || error?.message?.includes('524');
      alert(isTimeout ? '解析请求超时，请尝试减小框选范围后重试' : '解析失败，请检查网络后重试');
    } finally {
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
    // 仅统计题目框数量，不包含答案遮挡框和分析框
    return rects.filter(r => (r.type === 'question' || r.type === undefined) && r.y < pBottom && r.y + r.height > pTop).length;
  };

  // ===================== RENDER =====================
  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden relative">
      {/* === 全局置顶进度条 === */}
      {isProcessing && (
        <div className="absolute top-0 left-0 right-0 h-1.5 z-[100] overflow-hidden bg-gray-100/50 backdrop-blur-sm">
          <motion.div
            className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 shadow-[0_0_12px_rgba(59,130,246,0.6)]"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ ease: "linear", duration: 0.5 }}
          />
        </div>
      )}

      {/* === 顶部工具栏：适配移动端横向滑轨 === */}
      <div className="flex flex-col md:flex-row items-center justify-between px-2 md:px-6 py-3 md:py-4 bg-white border-b z-20 shadow-sm gap-2 md:gap-4 overflow-hidden">
        <div className="flex flex-nowrap items-center justify-start gap-3 md:gap-6 w-full overflow-x-auto scrollbar-hide pb-2 md:pb-0 px-2 md:px-0">
          <h3 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight hidden lg:block shrink-0">内容预处理</h3>
          
          {/* 模式切换滑轨 */}
          <div className="flex bg-gray-100 p-1 rounded-full shrink-0">
            <button
              onClick={() => setActiveDrawMode('question')}
              className={cn(
                "px-5 py-2.5 rounded-full text-sm font-black transition-all flex items-center gap-2 whitespace-nowrap",
                activeDrawMode === 'question' ? "bg-white text-brand-primary shadow-sm" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <div className="w-3.5 h-3.5 rounded bg-brand-primary/20 border-2 border-brand-primary" />
              题目
            </button>
            <button
              onClick={() => setActiveDrawMode('answer')}
              className={cn(
                "px-5 py-2.5 rounded-full text-sm font-black transition-all flex items-center gap-2 whitespace-nowrap",
                activeDrawMode === 'answer' ? "bg-white text-red-500 shadow-sm" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <div className="w-3.5 h-3.5 rounded bg-red-500/20 border-2 border-red-500" />
              答案掩码
            </button>
            <div
              className="px-5 py-2.5 rounded-full text-sm font-black flex items-center gap-2 text-purple-500 opacity-80 cursor-default whitespace-nowrap"
            >
              <div className="w-3.5 h-3.5 rounded bg-purple-500/20 border-2 border-purple-500" />
              分析 <span className="text-[10px] text-purple-400">自动</span>
            </div>
            <button
              onClick={() => setActiveDrawMode('diagram')}
              className={cn(
                "px-5 py-2.5 rounded-full text-sm font-black transition-all flex items-center gap-2 whitespace-nowrap",
                activeDrawMode === 'diagram' ? "bg-white text-emerald-500 shadow-sm" : "text-gray-400 hover:text-emerald-400"
              )}
            >
              <div className="w-3.5 h-3.5 rounded bg-emerald-500/20 border-2 border-emerald-500" />
              插图
            </button>
          </div>

          {/* 统计信息药丸 */}
          <div className="flex items-center justify-center gap-4 bg-gray-100/80 px-5 py-2.5 rounded-full text-[11px] font-black text-gray-500 tracking-wide border border-gray-200 shadow-sm shrink-0 whitespace-nowrap">
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
          
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-3 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 active:scale-95 shrink-0 flex items-center justify-center"
            >
              <X className="w-5 h-5 stroke-[4px]" />
            </button>
          )}
        </div>

        <div className="flex flex-nowrap items-center gap-3 w-full md:w-auto md:ml-auto">
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
              <><CheckCircle2 className="w-5 h-5" /> 解析</>
            )}
          </button>
        </div>
      </div>

      {/* === 主区域：左侧缩略图 + 右侧连续滚动画布 === */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧页面导航缩略图 - 保持常驻显示，适配多种屏幕 */}
        {pages.length >= 1 && (
          <div 
            className="flex bg-white flex-col shrink-0 overflow-hidden relative"
            style={{ width: `${sidebarWidth}px` }}
          >
            {/* 拖拽调整宽度的把手 */}
            <div 
              className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-brand-primary active:bg-brand-primary/80 transition-colors z-50 pointer-events-auto"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                interactionRef.current = 'resizing-sidebar';
                document.body.style.cursor = 'col-resize';
              }}
            />
            {/* 右侧边框线 - 单独一层以免跟背景冲突 */}
            <div className="absolute top-0 right-0 w-px h-full bg-gray-200 pointer-events-none z-40" />

            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              multiple 
              onChange={handleAddPage}
            />
            <div className="p-4 border-b bg-gray-50/50 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                  <LayoutList className="w-3.5 h-3.5" /> 页面导航
                </span>
                <button 
                  onClick={() => {
                    if (selectedPageIndices.size === pages.length) setSelectedPageIndices(new Set());
                    else setSelectedPageIndices(new Set(pages.map((_, i) => i)));
                  }}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[13px] font-black transition-all shadow-sm active:scale-95 flex items-center justify-center min-w-[80px]",
                    selectedPageIndices.size === pages.length 
                      ? "bg-gray-200 text-gray-600 hover:bg-gray-300" 
                      : "bg-brand-primary text-white hover:bg-brand-primary/90 shadow-brand-primary/10"
                  )}
                >
                  {selectedPageIndices.size === pages.length ? '取消全选' : '全选'}
                </button>
              </div>

              {/* 大尺寸醒目的删除按钮 - 仅在有选中时出现 */}
              <AnimatePresence>
                {selectedPageIndices.size > 0 && (
                  <motion.button
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={handleDeleteSelected}
                    className="w-1/2 mx-auto h-16 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-2xl shadow-xl shadow-red-200 flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.98] font-black text-sm"
                  >
                    <Trash2 className="w-5 h-5" />
                    删除已选 ({selectedPageIndices.size})
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {pages.map((page, idx) => {
                const rectCount = getPageRectCount(idx);
                return (

                  <button
                    key={idx}
                    ref={el => { thumbRefs.current[idx] = el; }}
                    onClick={() => scrollToPage(idx)}
                    className={cn(
                      "w-full relative rounded-xl overflow-hidden border-2 transition-all aspect-[3/4] bg-gray-50 group shrink-0",
                      activePageIdx === idx
                        ? "border-brand-primary shadow-lg ring-4 ring-brand-primary/10 scale-[1.02]"
                        : "border-transparent hover:border-gray-200",
                      !selectedPageIndices.has(idx) && "opacity-60 grayscale-[0.3]"
                    )}
                  >
                    <img src={page} alt="" className="w-full h-full object-cover" />
                    <div className={cn(
                      "absolute top-2 left-2 w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black shadow-md",
                      activePageIdx === idx ? "bg-brand-primary text-white" : "bg-white/90 text-gray-600"
                    )}>
                      {idx + 1}
                    </div>
                    {/* 勾选框 */}
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = new Set(selectedPageIndices);
                        if (next.has(idx)) next.delete(idx);
                        else next.add(idx);
                        setSelectedPageIndices(next);
                      }}
                      className={cn(
                        "absolute top-3 right-3 p-2 rounded-xl shadow-lg transition-all active:scale-90 z-10 border-2",
                        selectedPageIndices.has(idx) 
                          ? "bg-brand-primary text-white border-brand-primary" 
                          : "bg-white/90 text-gray-400 border-transparent hover:border-gray-200"
                      )}
                    >
                      {selectedPageIndices.has(idx) ? <CheckSquare className="w-5 h-5 stroke-[2.5px]" /> : <Square className="w-5 h-5 stroke-[2.5px]" />}
                    </div>
                  </button>
                );
              })}

              {/* [NEW] 侧边栏底部追加照片按钮 */}
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
        )}

        {/* 右侧：可滚动画布区域，所有页面纵向排列 */}
        {/* 右侧：可滚动画布区域，所有页面纵向排列 */}
        <div
          ref={scrollRef}
          className="relative flex-1 overflow-auto bg-gray-100/30"
        >
          <div className="flex justify-center py-8 px-2 md:px-8">
            <div
              ref={containerRef}
              className={cn(
                "relative shadow-2xl border border-gray-200 rounded-sm bg-white inline-flex flex-col transition-opacity duration-300 origin-top-center touch-none",
                !isProcessing ? "cursor-crosshair" : "opacity-50"
              )}
              style={{ width: `${zoom * 100}%`, maxWidth: 'none' }}
              onPointerDown={startDrawing}
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
                const isQuestion = rect.type === 'question' || rect.type === undefined;
                const isAnalysis = rect.type === 'analysis';
                const isDiagram = rect.type === 'diagram';
                const isSelected = selectedId === rect.id;
                const { x, y, width: w, height: h } = rect;
                
                // 预先分类并排序
                const qRects = rects.filter(r => r.type === 'question' || r.type === undefined).sort((a,b) => a.y - b.y);
                
                let label = '';
                if (isQuestion) {
                  label = `#${qRects.findIndex(r => r.id === rect.id) + 1} 题目`;
                } else {
                  // 判断子框落在哪个题目框内
                  const cx = x + w / 2;
                  const cy = y + h / 2;
                  const parentIdx = qRects.findIndex(r => cx >= r.x && cx <= r.x + r.width && cy >= r.y - 10 && cy <= r.y + r.height + 20);
                  const suffix = isAnalysis ? ' 分析' : isDiagram ? ' 图样' : ' 答案';
                  label = parentIdx >= 0 ? `#${parentIdx + 1}${suffix}` : `未绑定${suffix}`;
                }

                return (
                  <div
                    key={rect.id}
                    onPointerDown={(e) => startMoving(e, rect.id)}
                    className={cn(
                      "absolute border-2 transition-colors group",
                      isSelected
                        ? "border-brand-secondary bg-brand-secondary/10 z-30 shadow-[0_0_20px_rgba(var(--brand-secondary-rgb),0.3)]"
                        : isQuestion ? "border-brand-primary bg-brand-primary/10 z-20" 
                        : isDiagram ? "border-emerald-500 border-dashed bg-emerald-500/20 z-20"
                        : "border-red-500 border-dashed bg-red-500/20 z-20"
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
                      isQuestion ? "bg-brand-primary" : isDiagram ? "bg-emerald-500" : "bg-red-500"
                    )}>
                      {label}
                    </div>

                    {/* 选中态：8 个缩放手柄 */}
                    {isSelected && !isProcessing && (
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
                            onPointerDown={(e) => startResizing(e, rect.id, pos)}
                          />
                        ))}
                      </>
                    )}

                    {/* 删除按钮 */}
                    {!isProcessing && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRects(prev => prev.filter(r => r.id !== rect.id));
                          setSelectedId(null);
                        }}
                        className={cn(
                          "absolute -top-3 -right-3 text-white p-1.5 rounded-full shadow-lg z-50 transition-transform hover:scale-110 active:scale-90",
                          isSelected ? "block" : "hidden group-hover:block",
                          isQuestion ? "bg-red-500" : "bg-gray-800"
                        )}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* === 渲染自动计算的紫色分析区 === */}
              {autoAnalysisRects.map((ar) => (
                <div
                  key={ar.id}
                  className="absolute border-2 border-dashed border-purple-500 bg-purple-500/15 z-[25] pointer-events-none"
                  style={{
                    left: ar.x * zoom,
                    top: ar.y * zoom,
                    width: ar.width * zoom,
                    height: ar.height * zoom,
                  }}
                >
                  <div className="absolute -top-6 left-0 text-white text-[10px] font-black px-2 py-0.5 rounded-t-lg shadow-md whitespace-nowrap bg-purple-500">
                    {ar.parentLabel}
                  </div>
                </div>
              ))}

              {/* 绘制中的虚线矩形 */}
              {drawingRect && (
                <div
                  className={cn(
                    "absolute border-2 border-dashed shadow-inner z-20 pointer-events-none",
                    activeDrawMode === 'question' ? "border-brand-primary bg-brand-primary/5" : 
                    activeDrawMode === 'diagram' ? "border-emerald-500 bg-emerald-500/15" :
                    "border-red-500 bg-red-500/20"
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

      {/* === 悬浮错误日志面板 === */}
      {errorLogs.length > 0 && (
        <div className="absolute bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-[320px] w-full pointer-events-none">
          <AnimatePresence>
            {errorLogs.map((log) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: 50, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.9 }}
                className="bg-red-50 border border-red-200 p-3 rounded-xl shadow-xl flex items-start gap-2 pointer-events-auto group"
              >
                <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                  <X className="w-3 h-3 text-red-500" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-[11px] font-black text-red-900 leading-tight">解析发生错误</p>
                  <p className="text-[10px] text-red-600 mt-0.5 break-all line-clamp-2" title={log.msg}>{log.msg}</p>
                </div>
                <button
                  onClick={() => setErrorLogs(prev => prev.filter(l => l.id !== log.id))}
                  className="text-red-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
