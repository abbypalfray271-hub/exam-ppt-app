'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, CheckCircle2, Loader2, X, Sparkles, CheckSquare, Square, LayoutList } from 'lucide-react';
// import { parseQuestionAction } from '@/app/actions/ai';
import { useProjectStore, Question } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { cropImageByBox, compressImage } from '@/lib/documentProcessor';

interface Rect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type?: 'question' | 'answer' | 'analysis';
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
  const [activeDrawMode, setActiveDrawMode] = useState<'question' | 'answer'>('question');
  // 图片加载完成计数，用于触发首次 scroll-to-page
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const [zoom, setZoom] = useState(1); // 缩放倍率，默认为 1.0 (100%)
  const [selectedPageIndices, setSelectedPageIndices] = useState<Set<number>>(new Set(pages.map((_, i) => i)));

  const { questions, addQuestion, addQuestions, setQuestions, isProcessing, setProcessing, setView } = useProjectStore();

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

  const interactionRef = useRef<'none' | 'drawing' | 'moving' | 'resizing'>('none');
  const startPosRef = useRef({ x: 0, y: 0 });
  const initialRectRef = useRef<Rect | null>(null);
  // 镜像 drawingRect 的 ref，用于 handleMouseUp 中读取最新值，避免嵌套 setState 导致重复 key
  const drawingRectRef = useRef<Partial<Rect> | null>(null);

  // === 模拟分析进度条 (Fake Progress Engine) ===
  const lastProgressRef = useRef(0);
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing) {
      setProgress(2); // 瞬间起步
      lastProgressRef.current = 2;
      interval = setInterval(() => {
        setProgress(prev => {
          let next = prev;
          if (prev < 60) next = prev + Math.floor(Math.random() * 5) + 5;
          else if (prev < 88) next = prev + Math.floor(Math.random() * 2) + 1;
          else if (prev < 99) next = prev + 0.5;
          else next = 99;
          
          // 如果 real progress 领先了，就跳到 real progress
          return Math.max(next, lastProgressRef.current);
        });
      }, 400);
    } else {
      setProgress(0);
      lastProgressRef.current = 0;
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

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
  const startDrawing = (e: React.PointerEvent) => {
    if (!containerRef.current || isProcessing) return;
    // 拦截触摸等事件默认的滚动和双击放大行为
    if (e.pointerType === 'touch') {
      // 在 Safari/iOS 环境中，仅依靠 touch-none 可能不够
      // 我们通过 pointer down 不调用 preventDefault（以防影响焦点），但依靠 CSS touch-none 主导
    }

    const cr = containerRef.current.getBoundingClientRect();
    // 考虑缩放率：将真实的物理坐标转换为 1.0 倍率下的基础像素坐标
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

  const cropRect = async (rect: Rect, offsets: PageOffset[]): Promise<ImageSlice[]> => {
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

    // --- 分片逻辑 ---
    const MAX_SLICE_H = 1800; // 单片最大高度锚点
    const OVERLAP_H = 200;    // 重叠区高度
    const slices: ImageSlice[] = [];

    // 处理缩放映射后的最大宽度优化
    const MAX_WIDTH = 1600;
    const finalScale = outputW > MAX_WIDTH ? MAX_WIDTH / outputW : 1;
    
    const createSliceData = (sy: number, sh: number): string => {
      const sliceCanvas = document.createElement('canvas');
      const sCtx = sliceCanvas.getContext('2d');
      if (!sCtx) return '';
      
      sliceCanvas.width = Math.round(outputW * finalScale);
      sliceCanvas.height = Math.round(sh * finalScale);
      
      sCtx.drawImage(fullCanvas, 0, sy, outputW, sh, 0, 0, sliceCanvas.width, sliceCanvas.height);
      
      // 灰度 & 降噪优化 (Base64 瘦身)
      const imageData = sCtx.getImageData(0, 0, sliceCanvas.width, sliceCanvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        data[i] = data[i+1] = data[i+2] = avg;
      }
      sCtx.putImageData(imageData, 0, 0);
      return sliceCanvas.toDataURL('image/jpeg', 0.85);
    };

    if (fullH <= MAX_SLICE_H + OVERLAP_H) {
      // 不需要分片
      slices.push({
        base64: createSliceData(0, fullH),
        yOffset: 0,
        height: fullH
      });
    } else {
      // 循环切片
      let startY = 0;
      while (startY < fullH) {
        let endY = Math.min(startY + MAX_SLICE_H, fullH);
        // 如果剩下的太短了（小于重叠区的 1.5 倍），就直接并入当前片
        if (fullH - endY < OVERLAP_H * 1.5) {
          endY = fullH;
        }
        
        const h = endY - startY;
        slices.push({
          base64: createSliceData(startY, h),
          yOffset: startY,
          height: h
        });

        if (endY === fullH) break;
        startY = endY - OVERLAP_H; // 关键：回退重叠区
      }
    }

    return slices;
  };

  // === 确认并解析 ===
  const handleConfirm = async () => {
    // 分离题目框、答案框（分析框由 autoAnalysisRects 自动计算）
    const qRects = rects.filter(r => r.type === 'question' || r.type === undefined).sort((a, b) => a.y - b.y);
    const aRects = rects.filter(r => r.type === 'answer');

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
        
        for (let idx = 0; idx < targetIndices.length; idx++) {
          const i = targetIndices[idx];
          const currentProgress = Math.round(((idx) / targetIndices.length) * 100);
          setProgress(currentProgress);
          
          if (idx > 0) await new Promise(resolve => setTimeout(resolve, 500)); // 注入 500ms 节流
          
          try {
            // 前端二次压缩，防止 PDF 页 Base64 体积过大导致 API 500/413 报错
            const compressedPage = await compressImage(pages[i], 2000);
            
            const res = await fetch('/api/ai-parse', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                action: 'parseFullDocument', 
                images: [compressedPage] 
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
                if (box && Math.abs(box[2] - box[0]) > 0) {
                  try {
                    const crop = await cropImageByBox(pages[i], box);
                    if (crop) croppedImage = crop;
                  } catch (e) {
                    console.error('Auto crop failed:', e);
                  }
                }
                return {
                  ...q,
                  image: pages[i],          // 原图底图
                  contentImage: croppedImage, // 预览切图
                };
              }));
              allResults.push(...pageResults);
            } else {
              console.warn(`第 ${i + 1} 页解析出现警告: ${data.error || '内容为空'}`);
            }
          } catch (pageErr: any) {
            console.error(`%c[AI分页解析] 第 ${i + 1} 页识别失败: ${pageErr.message}`, 'color: #ef4444');
          }
        }

        if (allResults.length > 0) {
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
      let cumulativeOffset = 0;
      for (let i = 0; i < qRects.length; i++) {
        const qRect = qRects[i];
        
        // 1. 获取该题目框的分片
        const slices = await cropRect(qRect, offsets);
        console.log(`%c[AI解析] 题目 ${i + 1}/${qRects.length} 生成了 ${slices.length} 个分片`, 'color: #3b82f6');

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

        // 用于保存该题目框下所有分片的解析结果
        const allParsedSubQuestions: any[] = [];

        // 2. 依次解析每个分片
        for (let sIdx = 0; sIdx < slices.length; sIdx++) {
          const slice = slices[sIdx];
          let retryCount = 0;
          const maxRetries = 1;

          const performSliceParse = async (): Promise<any> => {
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
                  isRetry: sIdx > 0 
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
                  return performSliceParse();
                }
                console.error(`%c[AI解析] ❌ 题目 ${i + 1} 分片 ${sIdx + 1} 失败: ${data.error}`, 'color: #ef4444');
                return null;
              }
              
              console.log(`%c[AI解析] ✅ 题目 ${i + 1} 分片 ${sIdx + 1}/${slices.length} 成功 (${elapsed}s)`, 'color: #22c55e');
              return data.data || [];
            } catch (err) {
              if (retryCount < maxRetries) {
                retryCount++;
                await new Promise(r => setTimeout(r, 2000));
                return performSliceParse();
              }
              return null;
            }
          };

          const sliceResults = await performSliceParse();
          if (sliceResults) {
            // 3. 坐标映射还原：分片坐标 -> 题目框坐标
            const mappedResults = sliceResults.map((sq: any) => {
              const box = sq.content_box || sq.contentBox;
              if (!box) return sq;

              // 分片内高度比例 -> 分片内物理像素 -> 题目框内物理像素 -> 题目框内高度比例
              const [sYmin, sXmin, sYmax, sXmax] = box;
              const qYmin = Math.round(((sYmin / 10000 * slice.height + slice.yOffset) / (slices[slices.length-1].yOffset + slices[slices.length-1].height)) * 10000);
              const qYmax = Math.round(((sYmax / 10000 * slice.height + slice.yOffset) / (slices[slices.length-1].yOffset + slices[slices.length-1].height)) * 10000);
              
              return {
                ...sq,
                content_box: [qYmin, sXmin, qYmax, sXmax] // X轴不需要变，因为分片宽度等于题目框宽度
              };
            });

            // 4. 去重逻辑 (针对重叠区)
            mappedResults.forEach((newSq: any) => {
              const NS = newSq.content_box;
              const isDuplicate = allParsedSubQuestions.some(prevSq => {
                const PS = prevSq.content_box;
                if (!NS || !PS) return false;
                // 计算重叠度 (IoU 简化版：中心点距离 + 面积重合度)
                const overlapY = Math.max(0, Math.min(NS[2], PS[2]) - Math.max(NS[0], PS[0]));
                const overlapX = Math.max(0, Math.min(NS[3], PS[3]) - Math.max(NS[1], PS[1]));
                const overlapArea = overlapY * overlapX;
                const areaN = (NS[2] - NS[0]) * (NS[3] - NS[1]);
                return overlapArea / areaN > 0.7; // 超过 70% 面积重合视为同一题
              });

              if (!isDuplicate) {
                allParsedSubQuestions.push(newSq);
              }
            });
          }

          if (sIdx < slices.length - 1) {
            await new Promise(r => setTimeout(r, 1000)); // 分片间稍作喘息
          }
        }

        // 5. 聚合结果并存储
        const finalizedQuestions: Question[] = [];
        allParsedSubQuestions.forEach((q, subIdx) => {
          finalizedQuestions.push({
            ...q,
            id: crypto.randomUUID(),
            image: slices[0].base64,
            contentImage: slices[0].base64,
            order: questions.length + cumulativeOffset + subIdx + 1,
            type: q.type || 'essay',
            answer_box: manualAnswerBox || q.answer_box,
            analysis_box: manualAnalysisBox,
          });
        });
        
        addQuestions(finalizedQuestions);
        cumulativeOffset += finalizedQuestions.length;

        processed++;
        const realPercent = Math.round((processed / qRects.length) * 100);
        lastProgressRef.current = realPercent;
        setProgress(realPercent);

        if (i < qRects.length - 1) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }

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
      {/* 极简解析遮罩 */}

      {/* === 顶部工具栏 === */}
      <div className="flex flex-col md:flex-row items-center justify-between px-4 md:px-6 py-4 bg-white border-b z-20 shadow-sm gap-4">
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 md:gap-6 w-full md:w-auto">
          <h3 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight hidden md:block">内容预处理</h3>
          
          <div className="flex bg-gray-100 p-1 rounded-full mx-0 md:mx-4 shrink-0">
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
            {/* 紫色分析区为自动计算，仅显示状态指示 */}
            <div
              className="px-4 py-1.5 rounded-full text-sm font-black flex items-center gap-2 text-purple-500 opacity-80 cursor-default"
              title="分析区 = 题目区 − 答案遮挡区（自动计算）"
            >
              <div className="w-3 h-3 rounded bg-purple-500/20 border-2 border-purple-500" />
              分析区 <span className="text-[10px] text-purple-400">自动</span>
            </div>
          </div>

          <div className="hidden md:flex items-center justify-center gap-4 bg-gray-100/80 px-4 py-2 rounded-full text-[11px] font-black text-gray-500 tracking-wide border border-gray-200 shadow-sm shrink-0">
            <span className="flex items-center gap-1.5 underline decoration-gray-300 decoration-2 underline-offset-4 shrink-0">
              已选 {selectedPageIndices.size}/{pages.length} 页
            </span>
            <span className="w-px h-4 bg-gray-300 shrink-0" />
            <span className="text-brand-primary flex items-center gap-1.5 shrink-0">
               <span className="w-2 h-2 rounded-full bg-brand-primary" />
               {rects.filter(r => r.type === 'question' || r.type === undefined).length} 题
            </span>
            <span className="text-red-500 flex items-center gap-1.5 shrink-0">
               <span className="w-2 h-2 rounded-full bg-red-500" />
               {rects.filter(r => r.type === 'answer').length} 遮挡
            </span>
            <span className="text-purple-600 flex items-center gap-1.5 shrink-0">
               <span className="w-2 h-2 rounded-full bg-purple-500" />
               {autoAnalysisRects.length} 分析
            </span>
          </div>

          {/* 缩放选择器 */}
          <div className="hidden md:flex items-center justify-center gap-3 px-4 py-2 bg-gray-100/80 rounded-full border border-gray-200 shadow-sm shrink-0">
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
              className="px-2.5 py-2.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-all active:scale-95 border-2 border-white md:ml-2 flex items-center justify-center shrink-0"
              title="放弃预处理，返回上传"
            >
              <X className="w-5 h-5 stroke-[4px]" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap justify-center items-center gap-2 md:gap-4 w-full md:w-auto">
          <button
            onClick={() => setView('editor')}
            className="px-4 py-2 bg-orange-500 text-white text-[12px] md:text-[13px] font-black rounded-full border border-orange-600 hover:bg-orange-600 transition-all shadow-lg active:scale-95 shrink-0"
            title="跳过预处理，直接进入编辑器"
          >
            跳过
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            className="px-6 py-2 bg-brand-primary text-white text-sm font-black rounded-full shadow-xl shadow-brand-primary/20 hover:scale-105 active:scale-95 disabled:opacity-80 disabled:cursor-not-allowed transition-all flex items-center gap-2 shrink-0 min-w-[100px] justify-center"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{Math.floor(progress)}%</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" /> 解析
              </>
            )}
          </button>
        </div>
      </div>

      {/* === 主区域：左侧缩略图 + 右侧连续滚动画布 === */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧页面导航缩略图 - 移动端（含横屏）彻底隐藏以释放空间 */}
        {pages.length > 1 && (
          <div className="hidden lg:flex w-48 bg-white border-r flex-col shrink-0">
            <div className="p-3 border-b bg-gray-50/50 flex items-center justify-between">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                <LayoutList className="w-3 h-3" /> 页面导航
              </span>
              <button 
                onClick={() => {
                  if (selectedPageIndices.size === pages.length) setSelectedPageIndices(new Set());
                  else setSelectedPageIndices(new Set(pages.map((_, i) => i)));
                }}
                className="text-[10px] font-black text-brand-primary hover:underline"
              >
                {selectedPageIndices.size === pages.length ? '取消全选' : '全选'}
              </button>
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
                        "absolute top-2 right-2 p-1 rounded-md shadow-md transition-all active:scale-90 z-10",
                        selectedPageIndices.has(idx) ? "bg-brand-primary text-white" : "bg-white/80 text-gray-400"
                      )}
                    >
                      {selectedPageIndices.has(idx) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </div>
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
                const isAnswer = rect.type === 'answer';
                const isAnalysis = rect.type === 'analysis';
                const isSelected = selectedId === rect.id;
                const { x, y, width: w, height: h } = rect;
                
                // 预先分类并排序
                const qRects = rects.filter(r => r.type === 'question' || r.type === undefined).sort((a,b) => a.y - b.y);
                
                let label = '';
                if (isQuestion) {
                  label = `#${qRects.findIndex(r => r.id === rect.id) + 1}`;
                } else {
                  // 判断遮挡/分析框落在哪个题目框内
                  const cx = x + w / 2;
                  const cy = y + h / 2;
                  const parentIdx = qRects.findIndex(r => cx >= r.x && cx <= r.x + r.width && cy >= r.y - 10 && cy <= r.y + r.height + 20);
                  const suffix = isAnalysis ? ' 分析' : ' 答案';
                  label = parentIdx >= 0 ? `#${parentIdx + 1}${suffix}` : '未绑定';
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
                        : isAnalysis ? "border-purple-500 border-dashed bg-purple-500/20 z-20"
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
                      isQuestion ? "bg-brand-primary" : isAnalysis ? "bg-purple-500" : "bg-red-500"
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
