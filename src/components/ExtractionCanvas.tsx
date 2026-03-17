'use client';

import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, CheckCircle2, RotateCcw, Loader2 } from 'lucide-react';
import { parseQuestionAction, parseFullDocumentAction } from '@/app/actions/ai';
import { useProjectStore } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';

interface Rect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ExtractionCanvasProps {
  imageUrl: string;
  onComplete: () => void;
}

export const ExtractionCanvas = ({ imageUrl, onComplete }: ExtractionCanvasProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [drawingRect, setDrawingRect] = useState<Partial<Rect> | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // 编辑器增强状态
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<'none' | 'drawing' | 'moving' | 'resizing'>('none');
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);

  const { addQuestion, setProcessing } = useProjectStore();

  const isDrawingRef = React.useRef(false); 
  const interactionRef = React.useRef<'none' | 'drawing' | 'moving' | 'resizing'>('none');
  const startPosRef = React.useRef({ x: 0, y: 0 });
  const initialRectRef = React.useRef<Rect | null>(null);

  const startDrawing = (e: React.MouseEvent) => {
    if (!containerRef.current || isAnalyzing) return;
    
    // 如果点在已有矩形上，逻辑会被这些矩形的 onMouseDown 拦截，
    // 到这里说明是在背景点击，开启新框绘制
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setSelectedId(null);
    setDrawingRect({ id: crypto.randomUUID(), x, y, width: 0, height: 0 });
    setIsDrawing(true);
    isDrawingRef.current = true;
    interactionRef.current = 'drawing';
    setInteractionMode('drawing');
  };

  const startMoving = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (isAnalyzing) return;
    
    const rect = rects.find(r => r.id === id);
    if (!rect) return;

    setSelectedId(id);
    setInteractionMode('moving');
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
    setInteractionMode('resizing');
    setResizeHandle(handle);
    interactionRef.current = 'resizing';
    startPosRef.current = { x: e.clientX, y: e.clientY };
    initialRectRef.current = { ...rect };
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || interactionRef.current === 'none') return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const currentX = e.clientX;
      const currentY = e.clientY;

      if (interactionRef.current === 'drawing') {
        const x = currentX - containerRect.left;
        const y = currentY - containerRect.top;
        const boundedX = Math.max(0, Math.min(x, containerRect.width));
        const boundedY = Math.max(0, Math.min(y, containerRect.height));

        setDrawingRect((current) => {
          if (!current || typeof current.x === 'undefined' || typeof current.y === 'undefined') return current;
          return { ...current, width: boundedX - current.x, height: boundedY - current.y };
        });
      } 
      else if (interactionRef.current === 'moving' && initialRectRef.current) {
        const dx = currentX - startPosRef.current.x;
        const dy = currentY - startPosRef.current.y;
        
        setRects(prev => prev.map(r => {
          if (r.id === selectedId && initialRectRef.current) {
            let nextX = initialRectRef.current.x + dx;
            let nextY = initialRectRef.current.y + dy;
            
            // 边界约束
            nextX = Math.max(0, Math.min(nextX, containerRect.width - initialRectRef.current.width));
            nextY = Math.max(0, Math.min(nextY, containerRect.height - initialRectRef.current.height));

            return { ...r, x: nextX, y: nextY };
          }
          return r;
        }));
      }
      else if (interactionRef.current === 'resizing' && initialRectRef.current && resizeHandle) {
        const dx = currentX - startPosRef.current.x;
        const dy = currentY - startPosRef.current.y;
        
        setRects(prev => prev.map(r => {
          if (r.id === selectedId && initialRectRef.current) {
            let { x, y, width: w, height: h } = initialRectRef.current;
            
            if (resizeHandle.includes('e')) w += dx;
            if (resizeHandle.includes('w')) { x += dx; w -= dx; }
            if (resizeHandle.includes('s')) h += dy;
            if (resizeHandle.includes('n')) { y += dy; h -= dy; }

            // 最小尺寸限制
            if (Math.abs(w) < 20) return r;
            if (Math.abs(h) < 20) return r;

            return { ...r, x, y, width: w, height: h };
          }
          return r;
        }));
      }
    };

    const handleMouseUp = () => {
      if (interactionRef.current === 'drawing') {
        isDrawingRef.current = false;
        setIsDrawing(false);
        setDrawingRect((currentRect) => {
          if (currentRect && Math.abs(currentRect.width || 0) > 20 && Math.abs(currentRect.height || 0) > 20) {
            // 归一化坐标，确保 width/height 为正
            const normalized: Rect = {
              id: currentRect.id || crypto.randomUUID(),
              x: currentRect.width! > 0 ? currentRect.x! : currentRect.x! + currentRect.width!,
              y: currentRect.height! > 0 ? currentRect.y! : currentRect.y! + currentRect.height!,
              width: Math.abs(currentRect.width!),
              height: Math.abs(currentRect.height!),
            };
            setRects([normalized]);
            setSelectedId(normalized.id);
          }
          return null;
        });
      }
      
      interactionRef.current = 'none';
      setInteractionMode('none');
      setResizeHandle(null);
      initialRectRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [selectedId, resizeHandle]); 

  const cropImage = async (rect: Rect): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = imgRef.current;
      if (!img) return reject(new Error('图片引用丢失'));

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('无法创建 Canvas 上下文'));

      // 计算缩放比例
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;

      const x = (rect.width > 0 ? rect.x : rect.x + rect.width) * scaleX;
      const y = (rect.height > 0 ? rect.y : rect.y + rect.height) * scaleY;
      const w = Math.abs(rect.width) * scaleX;
      const h = Math.abs(rect.height) * scaleY;

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    });
  };

  const handleConfirm = async () => {
    if (rects.length === 0) return;
    setIsAnalyzing(true);
    setProcessing(true);
    
    try {
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        // 第一次剪裁：用户手动框选的整个区域（大图 Base64）
        const croppedBase64 = await cropImage(rect);
        
        // 调用 AI 解析（注意：AI 拿到的也是上面的大图，它的坐标会是相对于这张大图的）
        const result = await parseQuestionAction(croppedBase64);
        
        if (result.success && result.data) {
          const questionsArray = result.data;
          
          for (let subIdx = 0; subIdx < questionsArray.length; subIdx++) {
            const q = questionsArray[subIdx];
            let specificContentImage = croppedBase64; // 默认为大图
            
            // 如果 AI 返回了万分位坐标，进行二次精确切割
            if (q.content_box && Array.isArray(q.content_box) && q.content_box.length === 4) {
              const [ymin, xmin, ymax, xmax] = q.content_box;
              // 将万分位转为百分比宽高比例
              const y = ymin / 10000;
              const x = xmin / 10000;
              const height = (ymax - ymin) / 10000;
              const width = (xmax - xmin) / 10000;
              
              // 创建离线 Canvas 进行二次剪裁
              const img = new Image();
              img.src = croppedBase64;
              await new Promise((res) => { img.onload = res; });
              
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              if (ctx) {
                // 原坐标计算
                const originalSx = img.width * x;
                const originalSy = img.height * y;
                const originalSw = img.width * width;
                const originalSh = img.height * height;
                
                // 给切片增加安全外扩边距 (Padding)
                // 比如宽度加两边各 1.5%，高度加两边各 1.5%
                const paddingX = img.width * 0.015;
                const paddingY = img.height * 0.015;
                
                // 确保扩展后不超出原图物理边界
                const sx = Math.max(0, originalSx - paddingX);
                const sy = Math.max(0, originalSy - paddingY);
                // 算新的边界坐标再求宽，不能用 originalSw + ...
                const ex = Math.min(img.width, originalSx + originalSw + paddingX);
                const ey = Math.min(img.height, originalSy + originalSh + paddingY);
                
                const sw = ex - sx;
                const sh = ey - sy;
                
                canvas.width = sw;
                canvas.height = sh;
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
                specificContentImage = canvas.toDataURL('image/jpeg', 0.8);
              }
            }
            
            addQuestion({
              id: `${rect.id}-${subIdx}`,
              image: croppedBase64, // 底图始终保留整块
              contentImage: specificContentImage, // 二次切割后的精准小图
              material: q.material || '',
              title: q.title || `题目 ${i + 1}-${subIdx + 1}`,
              content: q.content || '',
              type: 'essay',
              order: i * 100 + subIdx,
            });
          }
        } else {
          throw new Error(result.error || 'AI 解析未返回成功状态');
        }
        setProgress(((i + 1) / rects.length) * 100);
      }
      onComplete();
    } catch (error: any) {
      console.error('Extraction failed:', error);
      alert(`解析失败: ${error.message || '未知错误'}`);
    } finally {
      setIsAnalyzing(false);
      setProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-3xl overflow-hidden relative">
      <AnimatePresence>
        {isAnalyzing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center"
          >
            <div className="relative w-24 h-24 mb-6">
              <Loader2 className="w-24 h-24 text-brand-primary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center font-bold text-sm text-brand-primary">
                {Math.round(progress)}%
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">AI 正在深度解析...</h3>
            <p className="text-gray-500">正在识别题目并生成教学 PPT 的讲解内容</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 工具栏 */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b z-20">
        <div className="flex items-center gap-4">
          <h3 className="font-bold text-gray-900">请框选题目区域</h3>
        </div>
        <div className="flex items-center gap-2">
          {!isAnalyzing && (
            <>
              <button 
                onClick={() => setRects([])}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
              >
                <RotateCcw className="w-4 h-4" /> 重置
              </button>
              <button 
                onClick={handleConfirm}
                disabled={rects.length === 0}
                className="flex items-center gap-2 px-6 py-2 bg-brand-primary text-white text-sm font-bold rounded-full shadow-lg shadow-brand-primary/20 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all font-sans"
              >
                <CheckCircle2 className="w-4 h-4" /> 确认并开始解析
              </button>
            </>
          )}
        </div>
      </div>

      {/* 画布区域 */}
      <div className="relative flex-1 p-6 flex justify-center items-center overflow-hidden bg-gray-100/50">
        <div 
          ref={containerRef}
          className={cn(
            "relative shadow-xl border border-gray-200 rounded-sm bg-white inline-block",
            !isAnalyzing && "cursor-crosshair"
          )}
          onMouseDown={startDrawing}
        >
          <img 
            ref={imgRef}
            src={imageUrl} 
            alt="To Extract" 
            className="block max-h-[calc(70vh-100px)] max-w-full w-auto select-none pointer-events-none"
            draggable={false}
          />

          {rects.map((rect) => {
            const isSelected = selectedId === rect.id;
            const x = rect.width > 0 ? rect.x : rect.x + rect.width;
            const y = rect.height > 0 ? rect.y : rect.y + rect.height;
            const w = Math.abs(rect.width);
            const h = Math.abs(rect.height);

            return (
              <div
                key={rect.id}
                onMouseDown={(e) => startMoving(e, rect.id)}
                className={cn(
                  "absolute border-2 transition-colors group",
                  isSelected ? "border-brand-secondary bg-brand-secondary/10 z-30" : "border-brand-primary bg-brand-primary/5 z-20 hover:bg-brand-primary/10",
                  !isAnalyzing && "cursor-move"
                )}
                style={{ left: x, top: y, width: w, height: h }}
              >
                {/* 缩放手柄 (仅选中时显示) */}
                {isSelected && !isAnalyzing && (
                  <>
                    {[
                      { h: 'nw', c: '-left-1.5 -top-1.5 cursor-nw-resize' },
                      { h: 'n',  c: 'left-1/2 -ml-1.5 -top-1.5 cursor-n-resize' },
                      { h: 'ne', c: '-right-1.5 -top-1.5 cursor-ne-resize' },
                      { h: 'e',  c: '-right-1.5 top-1/2 -mt-1.5 cursor-e-resize' },
                      { h: 'se', c: '-right-1.5 -bottom-1.5 cursor-se-resize' },
                      { h: 's',  c: 'left-1/2 -ml-1.5 -bottom-1.5 cursor-s-resize' },
                      { h: 'sw', c: '-left-1.5 -bottom-1.5 cursor-sw-resize' },
                      { h: 'w',  c: '-left-1.5 top-1/2 -mt-1.5 cursor-w-resize' },
                    ].map(handle => (
                      <div
                        key={handle.h}
                        className={cn("absolute w-3 h-3 bg-white border-2 border-brand-secondary rounded-full shadow-sm z-40", handle.c)}
                        onMouseDown={(e) => startResizing(e, rect.id, handle.h)}
                      />
                    ))}
                  </>
                )}

                {!isAnalyzing && (
                  <div className={cn(
                    "absolute -top-3 -right-3 z-50",
                    isSelected ? "flex" : "hidden group-hover:flex"
                  )}>
                    <button 
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setRects(prev => prev.filter(r => r.id !== rect.id)); setSelectedId(null); }}
                      className="bg-red-500 text-white p-1.5 rounded-full shadow-lg hover:bg-red-600 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {drawingRect && (
            <div
              className="absolute border-2 border-brand-primary border-dashed bg-brand-primary/10"
              style={{
                left: drawingRect.width! > 0 ? drawingRect.x : drawingRect.x! + drawingRect.width!,
                top: drawingRect.height! > 0 ? drawingRect.y : drawingRect.y! + drawingRect.height!,
                width: Math.abs(drawingRect.width!),
                height: Math.abs(drawingRect.height!),
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
