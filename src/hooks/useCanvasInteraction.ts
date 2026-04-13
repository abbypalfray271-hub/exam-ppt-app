'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ExtendedRect } from '@/types/ai';

// ============================================================
// useCanvasInteraction — 画布手势交互核心 Hook
// 从 ExtractionCanvas 中提取的绘图/拖拽/缩放/调整大小逻辑
// ============================================================

interface UseCanvasInteractionParams {
  /** 试卷画布容器 Ref */
  examContainerRef: React.RefObject<HTMLDivElement | null>;
  /** 参考页画布容器 Ref */
  refContainerRef: React.RefObject<HTMLDivElement | null>;
  /** 是否正在 AI 处理中（锁定交互） */
  isProcessing: boolean;
  /** 当前激活的绘图模式 */
  activeDrawMode: 'question' | 'answer' | 'diagram' | 'analysis' | null;
}

export interface UseCanvasInteractionReturn {
  // --- 状态 ---
  rects: ExtendedRect[];
  setRects: React.Dispatch<React.SetStateAction<ExtendedRect[]>>;
  drawingRect: (Partial<ExtendedRect> & { source: 'exam' | 'reference' }) | null;
  isDrawing: boolean;
  isInteracting: boolean;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  resizeHandle: string | null;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  activeQIdx: number;
  setActiveQIdx: React.Dispatch<React.SetStateAction<number>>;
  // --- Ref (JSX 中需要直接访问，如分栏拖拽) ---
  interactionRef: React.MutableRefObject<'none' | 'drawing' | 'moving' | 'resizing' | 'resizing-sidebar' | 'resizing-refpool'>;
  // --- 事件回调 ---
  startDrawing: (e: React.PointerEvent, source: 'exam' | 'reference') => void;
  startMoving: (e: React.PointerEvent, id: string, source: 'exam' | 'reference') => void;
  startResizing: (e: React.PointerEvent, id: string, handle: string, source: 'exam' | 'reference') => void;
}

export function useCanvasInteraction({
  examContainerRef,
  refContainerRef,
  isProcessing,
  activeDrawMode,
}: UseCanvasInteractionParams): UseCanvasInteractionReturn {
  // === State ===
  const [rects, setRects] = useState<ExtendedRect[]>([]);
  const [drawingRect, setDrawingRect] = useState<(Partial<ExtendedRect> & { source: 'exam' | 'reference' }) | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [activeQIdx, setActiveQIdx] = useState(1);

  // === Refs ===
  const interactionRef = useRef<'none' | 'drawing' | 'moving' | 'resizing' | 'resizing-sidebar' | 'resizing-refpool'>('none');
  const startPosRef = useRef({ x: 0, y: 0 });
  const initialRectRef = useRef<ExtendedRect | null>(null);
  const drawingRectRef = useRef<(Partial<ExtendedRect> & { source: 'exam' | 'reference' }) | null>(null);
  const liveSelectedRectRef = useRef<ExtendedRect | null>(null);
  const lastPinchDistanceRef = useRef<number | null>(null);

  // Ref 同步：让 useEffect/useCallback 内部通过 Ref 读取最新值
  const rectsRef = useRef(rects);
  rectsRef.current = rects;
  const activeQIdxRef = useRef(activeQIdx);
  activeQIdxRef.current = activeQIdx;
  const isProcessingRef = useRef(isProcessing);
  isProcessingRef.current = isProcessing;

  // === 绘图开始 ===
  const startDrawing = useCallback((e: React.PointerEvent, source: 'exam' | 'reference') => {
    if (isProcessingRef.current || !activeDrawMode) return;
    const container = source === 'exam' ? examContainerRef.current : refContainerRef.current;
    if (!container) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
      // 阻止移动端默认行为（如下拉刷新、长按菜单）
      if (e.pointerType === 'touch') {
        (e.nativeEvent as any).preventDefault?.();
      }
    } catch (_) { /* ignore */ }

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
    setIsInteracting(true);
    interactionRef.current = 'drawing';
  }, [activeDrawMode, zoom, examContainerRef, refContainerRef]);

  // === 移动开始 ===
  const startMoving = useCallback((e: React.PointerEvent, id: string, source: 'exam' | 'reference') => {
    e.stopPropagation();
    if (isProcessingRef.current) return;
    const rect = rectsRef.current.find(r => r.id === id);
    if (!rect) return;

    const container = source === 'exam' ? examContainerRef.current : refContainerRef.current;
    try {
      if (container) container.setPointerCapture(e.pointerId);
      if (e.pointerType === 'touch') (e.nativeEvent as any).preventDefault?.();
    } catch (_) { /* ignore */ }

    setSelectedId(id);
    if (rect.qIdx) setActiveQIdx(rect.qIdx);
    interactionRef.current = 'moving';
    setIsInteracting(true);
    startPosRef.current = { x: e.clientX, y: e.clientY };
    initialRectRef.current = { ...rect, source };
  }, [examContainerRef, refContainerRef]);

  // === 调整大小开始 ===
  const startResizing = useCallback((e: React.PointerEvent, id: string, handle: string, source: 'exam' | 'reference') => {
    e.stopPropagation();
    if (isProcessingRef.current) return;
    const rect = rectsRef.current.find(r => r.id === id);
    if (!rect) return;

    const container = source === 'exam' ? examContainerRef.current : refContainerRef.current;
    try {
      if (container) container.setPointerCapture(e.pointerId);
      if (e.pointerType === 'touch') (e.nativeEvent as any).preventDefault?.();
    } catch (_) { /* ignore */ }

    setSelectedId(id);
    setResizeHandle(handle);
    interactionRef.current = 'resizing';
    setIsInteracting(true);
    startPosRef.current = { x: e.clientX, y: e.clientY };
    initialRectRef.current = { ...rect, source };
  }, [examContainerRef, refContainerRef]);

  // === 核心事件监听 useEffect ===
  useEffect(() => {
    const handleMouseMove = (e: PointerEvent) => {
      if (interactionRef.current === 'none') return;

      if (interactionRef.current === 'resizing-refpool') {
        // refPoolWidth 由外部管控，这里只是标记交互类型以阻止滚动
        // 实际 resize 由外部 onPointerDown 的后续事件处理
        return;
      }

      if (interactionRef.current === 'resizing-sidebar') {
        return;
      }

      const source = drawingRectRef.current?.source || initialRectRef.current?.source;
      const currentZoom = source === 'exam' ? zoom : 1;
      const container = source === 'exam' ? examContainerRef.current : refContainerRef.current;
      if (!container) return;
      const cr = container.getBoundingClientRect();
      const dx = (e.clientX - startPosRef.current.x) / currentZoom;
      const dy = (e.clientY - startPosRef.current.y) / currentZoom;

      if (interactionRef.current === 'drawing') {
        const x = (e.clientX - cr.left) / currentZoom;
        const y = (e.clientY - cr.top) / currentZoom;
        if (!drawingRectRef.current || drawingRectRef.current.x === undefined) return;

        const prev = drawingRectRef.current;
        const rawW = x - prev.x!;
        const rawH = y - prev.y!;

        drawingRectRef.current = { ...prev, width: rawW, height: rawH };

        // 高性能 DOM 直操：跳过 React 渲染周期
        const el = document.getElementById('drawing-preview');
        if (el) {
          el.style.left = `${(rawW > 0 ? prev.x! : prev.x! + rawW) * currentZoom}px`;
          el.style.top = `${(rawH > 0 ? prev.y! : prev.y! + rawH) * currentZoom}px`;
          el.style.width = `${Math.abs(rawW) * currentZoom}px`;
          el.style.height = `${Math.abs(rawH) * currentZoom}px`;
        }
      } else if (interactionRef.current === 'moving' && selectedId && initialRectRef.current) {
        const initial = initialRectRef.current;
        const newX = initial.x + dx;
        const newY = initial.y + dy;

        liveSelectedRectRef.current = { ...initial, x: newX, y: newY };

        const el = document.getElementById(`rect-${selectedId}`);
        if (el) {
          el.style.left = `${newX * currentZoom}px`;
          el.style.top = `${newY * currentZoom}px`;
        }
      } else if (interactionRef.current === 'resizing' && selectedId && initialRectRef.current && resizeHandle) {
        const initial = initialRectRef.current;
        let { x, y, width: w, height: h } = initial;
        if (resizeHandle.includes('e')) w += dx;
        if (resizeHandle.includes('w')) { x += dx; w -= dx; }
        if (resizeHandle.includes('s')) h += dy;
        if (resizeHandle.includes('n')) { y += dy; h -= dy; }

        liveSelectedRectRef.current = { ...initial, x, y, width: w, height: h };

        const el = document.getElementById(`rect-${selectedId}`);
        if (el) {
          el.style.left = `${x * currentZoom}px`;
          el.style.top = `${y * currentZoom}px`;
          el.style.width = `${Math.abs(w) * currentZoom}px`;
          el.style.height = `${Math.abs(h) * currentZoom}px`;
        }
      }
    };

    const handleMouseUp = () => {
      if (interactionRef.current === 'drawing' && drawingRectRef.current) {
        const r = drawingRectRef.current;
        if (Math.abs(r.width || 0) > 10 && Math.abs(r.height || 0) > 10) {
          let targetQIdx = activeQIdxRef.current;
          const isQuestion = r.type === 'question' || !r.type;
          if (isQuestion && rectsRef.current.some(exist => exist.qIdx === targetQIdx && (exist.type === 'question' || !exist.type))) {
            targetQIdx = targetQIdx + 1;
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
      } else if ((interactionRef.current === 'moving' || interactionRef.current === 'resizing') && liveSelectedRectRef.current) {
        const finalId = liveSelectedRectRef.current.id;
        const finalRect = liveSelectedRectRef.current;
        setRects(prev => prev.map(r => r.id === finalId ? { ...r, ...finalRect } : r));
      }

      interactionRef.current = 'none';
      setDrawingRect(null);
      drawingRectRef.current = null;
      liveSelectedRectRef.current = null;
      setIsDrawing(false);
      setIsInteracting(false);
      setResizeHandle(null);
    };

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);

    // 🏆 双重锁定：原生事件拦截「被动监听」，确保 e.preventDefault 生效
    const preventScroll = (e: TouchEvent) => {
      // 🦄 自研双指缩放核心算法
      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

        if (lastPinchDistanceRef.current === null) {
          lastPinchDistanceRef.current = dist;
        } else {
          const delta = dist - lastPinchDistanceRef.current;
          const sens = 0.005;
          setZoom(prev => Math.max(0.5, Math.min(prev + delta * sens, 2.5)));
          lastPinchDistanceRef.current = dist;
        }

        // 进入缩放行为后，强制中断正在产生的绘图/移动
        if (interactionRef.current !== 'none') {
          interactionRef.current = 'none';
          setDrawingRect(null);
          setIsDrawing(false);
          setIsInteracting(false);
        }

        if (e.cancelable) e.preventDefault();
        return;
      }

      // 单指逻辑重置缓存
      if (e.touches.length < 2) {
        lastPinchDistanceRef.current = null;

        // 🚀 核心优化：如果没有选中绘图工具且没有正在进行的拉伸/移动，放行单指滑动
        if (!activeDrawMode && interactionRef.current === 'none') {
          return;
        }
      }

      if (interactionRef.current !== 'none') {
        if (e.cancelable) e.preventDefault();
      }
    };

    const examContainer = examContainerRef.current;
    const refContainer = refContainerRef.current;

    if (examContainer) {
      examContainer.addEventListener('touchstart', preventScroll as any, { passive: false });
      examContainer.addEventListener('touchmove', preventScroll as any, { passive: false });
    }
    if (refContainer) {
      refContainer.addEventListener('touchstart', preventScroll as any, { passive: false });
      refContainer.addEventListener('touchmove', preventScroll as any, { passive: false });
    }

    return () => {
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
      if (examContainer) {
        examContainer.removeEventListener('touchstart', preventScroll as any);
        examContainer.removeEventListener('touchmove', preventScroll as any);
      }
      if (refContainer) {
        refContainer.removeEventListener('touchstart', preventScroll as any);
        refContainer.removeEventListener('touchmove', preventScroll as any);
      }
    };
    // 依赖项精简：rects/activeQIdx 通过 Ref 读取，initialRectRef 是稳定 Ref 对象
  }, [zoom, selectedId, resizeHandle, activeDrawMode, examContainerRef, refContainerRef]);

  return {
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
  };
}
