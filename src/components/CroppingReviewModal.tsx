'use client';

import React, { useState, useRef, useEffect, MouseEvent as ReactMouseEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Maximize, Scissors, Loader2, MousePointer2 } from 'lucide-react';
import { Question } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { cropImageByBox } from '@/lib/documentProcessor';

interface CroppingReviewModalProps {
  questions: Question[];
  pages: string[]; // 试卷原图序列 (Base64)
  onConfirm: (questions: Question[]) => void;
  onCancel: () => void;
}

type BoxType = 'material' | 'content';
type DragState = 'idle' | 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';

interface ActiveSelection {
  questionId: string;
  boxType: BoxType;
}

export const CroppingReviewModal: React.FC<CroppingReviewModalProps> = ({
  questions: initialQuestions,
  pages,
  onConfirm,
  onCancel
}) => {
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [currentPage, setCurrentPage] = useState(0);
  const [activeSelection, setActiveSelection] = useState<ActiveSelection | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- 拖拽交互状态 ---
  const [dragState, setDragState] = useState<DragState>('idle');
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [initialBox, setInitialBox] = useState<[number, number, number, number] | null>(null); // [ymin, xmin, ymax, xmax]

  // 工具：将 0-1000 万分位坐标转换为 DOM 像素
  const getPixelBox = (box: [number, number, number, number]) => {
    if (!imgRef.current) return { left: 0, top: 0, width: 0, height: 0 };
    const { width, height } = imgRef.current.getBoundingClientRect();
    const [ymin, xmin, ymax, xmax] = box;
    return {
      top: (ymin / 1000) * height,
      left: (xmin / 1000) * width,
      height: ((ymax - ymin) / 1000) * height,
      width: ((xmax - xmin) / 1000) * width,
    };
  };

  const handlePointerDown = (
    e: ReactMouseEvent | MouseEvent,
    qId: string,
    bType: BoxType,
    handleType: DragState
  ) => {
    e.stopPropagation();
    e.preventDefault();
    
    // 如果没有框，给个默认框
    let q = questions.find(q => q.id === qId)!;
    let box = bType === 'material' ? q.materialBox : q.contentBox;
    if (!box || (box[0] === 0 && box[1] === 0 && box[2] === 0 && box[3] === 0)) {
      box = [400, 400, 500, 600]; // 默认居中一小块
      updateQuestionBox(qId, bType, box);
    }

    setActiveSelection({ questionId: qId, boxType: bType });
    setDragState(handleType);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setInitialBox([...box] as [number, number, number, number]);
  };

  useEffect(() => {
    const handlePointerMove = (e: MouseEvent) => {
      if (dragState === 'idle' || !activeSelection || !initialBox || !imgRef.current) return;

      const { width, height } = imgRef.current.getBoundingClientRect();
      const dx = ((e.clientX - dragStartPos.x) / width) * 1000;
      const dy = ((e.clientY - dragStartPos.y) / height) * 1000;

      let [ymin, xmin, ymax, xmax] = initialBox;

      if (dragState === 'move') {
        ymin += dy; ymax += dy;
        xmin += dx; xmax += dx;
      } else {
        if (dragState.includes('n')) ymin += dy;
        if (dragState.includes('s')) ymax += dy;
        if (dragState.includes('w')) xmin += dx;
        if (dragState.includes('e')) xmax += dx;
      }

      // 边界约束
      xmin = Math.max(0, Math.min(xmin, xmax - 10));
      ymin = Math.max(0, Math.min(ymin, ymax - 10));
      xmax = Math.min(1000, Math.max(xmax, xmin + 10));
      ymax = Math.min(1000, Math.max(ymax, ymin + 10));

      updateQuestionBox(activeSelection.questionId, activeSelection.boxType, [ymin, xmin, ymax, xmax]);
    };

    const handlePointerUp = () => {
      if (dragState !== 'idle') {
        setDragState('idle');
      }
    };

    if (dragState !== 'idle') {
      window.addEventListener('mousemove', handlePointerMove);
      window.addEventListener('mouseup', handlePointerUp);
    }
    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };
  }, [dragState, activeSelection, initialBox, dragStartPos]);

  const updateQuestionBox = (id: string, type: BoxType, newBox: [number, number, number, number]) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === id) {
        return type === 'material' ? { ...q, materialBox: newBox } : { ...q, contentBox: newBox };
      }
      return q;
    }));
  };

  const currentQuestions = questions.filter(q => (q.pageIndex || 0) === currentPage);

  // 确认并开始真实裁剪
  const handleConfirmAction = async () => {
    setIsProcessing(true);
    try {
      const updatedQuestions = [...questions];
      
      // 串行裁剪防止爆内存
      for (let i = 0; i < updatedQuestions.length; i++) {
        const q = updatedQuestions[i];
        const pageIdx = q.pageIndex || 0;
        const base64Img = pages[pageIdx];
        if (!base64Img) continue;

        if (q.materialBox) {
          q.materialImage = await cropImageByBox(base64Img, q.materialBox) || undefined;
        }
        if (q.contentBox) {
          q.contentImage = await cropImageByBox(base64Img, q.contentBox) || undefined;
        }
      }
      
      onConfirm(updatedQuestions);
    } catch (e) {
      console.error(e);
      alert('图处裁剪时出错');
      setIsProcessing(false);
    }
  };

  // --- 边界句柄组件 ---
  const renderHandles = (qId: string, bType: BoxType) => (
    <>
      <div className="absolute top-0 left-0 w-3 h-3 -mt-1.5 -ml-1.5 bg-white border-2 border-brand-primary rounded-full cursor-nwse-resize z-10" onMouseDown={e => handlePointerDown(e, qId, bType, 'nw')} />
      <div className="absolute top-0 right-0 w-3 h-3 -mt-1.5 -mr-1.5 bg-white border-2 border-brand-primary rounded-full cursor-nesw-resize z-10" onMouseDown={e => handlePointerDown(e, qId, bType, 'ne')} />
      <div className="absolute bottom-0 left-0 w-3 h-3 -mb-1.5 -ml-1.5 bg-white border-2 border-brand-primary rounded-full cursor-nesw-resize z-10" onMouseDown={e => handlePointerDown(e, qId, bType, 'sw')} />
      <div className="absolute bottom-0 right-0 w-3 h-3 -mb-1.5 -mr-1.5 bg-white border-2 border-brand-primary rounded-full cursor-nwse-resize z-10" onMouseDown={e => handlePointerDown(e, qId, bType, 'se')} />
      <div className="absolute top-0 left-1/2 w-3 h-3 -mt-1.5 -ml-1.5 bg-white border-2 border-brand-primary rounded-full cursor-ns-resize z-10" onMouseDown={e => handlePointerDown(e, qId, bType, 'n')} />
      <div className="absolute bottom-0 left-1/2 w-3 h-3 -mb-1.5 -ml-1.5 bg-white border-2 border-brand-primary rounded-full cursor-ns-resize z-10" onMouseDown={e => handlePointerDown(e, qId, bType, 's')} />
      <div className="absolute top-1/2 left-0 w-3 h-3 -mt-1.5 -ml-1.5 bg-white border-2 border-brand-primary rounded-full cursor-ew-resize z-10" onMouseDown={e => handlePointerDown(e, qId, bType, 'w')} />
      <div className="absolute top-1/2 right-0 w-3 h-3 -mt-1.5 -mr-1.5 bg-white border-2 border-brand-primary rounded-full cursor-ew-resize z-10" onMouseDown={e => handlePointerDown(e, qId, bType, 'e')} />
    </>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-7xl h-full max-h-[90vh] bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-primary/10 rounded-xl">
              <Scissors className="w-5 h-5 text-brand-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 leading-none">AI 切割边缘微调</h2>
              <span className="text-xs text-brand-primary font-bold">如果 AI 识别的边界不准，请拖拽边框进行手缝修补</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={isProcessing}
              className="px-6 py-2 rounded-full font-bold text-gray-500 hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirmAction}
              disabled={isProcessing}
              className="px-6 py-2 bg-gray-900 text-white rounded-full font-bold shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {isProcessing ? '正在物理裁切...' : '确认切割并生成 PPT'}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧大图操作区 */}
          <div className="flex-1 bg-gray-100 flex items-center justify-center p-6 overflow-hidden relative" ref={containerRef}>
            <div className="relative shadow-2xl" style={{ maxHeight: '100%', maxWidth: '100%' }}>
              <img
                ref={imgRef}
                src={pages[currentPage]}
                alt="Exam Page"
                className="max-h-full max-w-full object-contain select-none pointer-events-none"
                draggable={false}
              />
              
              {/* 渲染本页所有的框选 */}
              {currentQuestions.map((q, idx) => {
                const isActiveMat = activeSelection?.questionId === q.id && activeSelection?.boxType === 'material';
                const isActiveCon = activeSelection?.questionId === q.id && activeSelection?.boxType === 'content';

                const matBoxPx = q.materialBox ? getPixelBox(q.materialBox) : null;
                const conBoxPx = q.contentBox ? getPixelBox(q.contentBox) : null;

                const hasValidBox = (box?: [number,number,number,number]) => box && box[2] > box[0] && box[3] > box[1];

                return (
                  <React.Fragment key={q.id}>
                    {/* 素材框 (红色系) */}
                    {hasValidBox(q.materialBox) && matBoxPx && (
                      <div
                        className={cn(
                          "absolute border-[3px] transition-colors rounded-sm cursor-move",
                          isActiveMat ? "border-red-500 bg-red-500/10 z-20" : "border-red-400 bg-red-400/5 hover:bg-red-400/20 z-10 hover:z-20"
                        )}
                        style={matBoxPx}
                        onMouseDown={e => handlePointerDown(e, q.id, 'material', 'move')}
                      >
                        <div className="absolute -top-6 left-0 bg-red-500 text-white text-[10px] uppercase font-black px-2 py-0.5 rounded-t-sm whitespace-nowrap">
                          📙 Q{q.order || idx + 1} - 素材
                        </div>
                        {isActiveMat && renderHandles(q.id, 'material')}
                      </div>
                    )}

                    {/* 题目框 (蓝色系) */}
                    {hasValidBox(q.contentBox) && conBoxPx && (
                      <div
                        className={cn(
                          "absolute border-[3px] transition-colors rounded-sm cursor-move",
                          isActiveCon ? "border-blue-500 bg-blue-500/10 z-20" : "border-blue-400 bg-blue-400/5 hover:bg-blue-400/20 z-10 hover:z-20"
                        )}
                        style={conBoxPx}
                        onMouseDown={e => handlePointerDown(e, q.id, 'content', 'move')}
                      >
                        <div className="absolute -top-6 left-0 bg-blue-500 text-white text-[10px] uppercase font-black px-2 py-0.5 rounded-t-sm whitespace-nowrap">
                          📝 Q{q.order || idx + 1} - 考题
                        </div>
                        {isActiveCon && renderHandles(q.id, 'content')}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* 右侧列表面板 */}
          <div className="w-80 border-l bg-white flex flex-col">
            <div className="p-4 border-b text-sm font-bold text-gray-500 flex items-center justify-between">
              题目列表
              <span className="text-[10px] bg-gray-100 px-2 py-1 rounded-full">{questions.length} 题</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {questions.map((q, idx) => (
                <div 
                  key={q.id}
                  className={cn(
                    "p-3 rounded-xl border-2 transition-all group cursor-pointer",
                    activeSelection?.questionId === q.id ? "border-brand-primary bg-brand-primary/5" : "border-gray-100 hover:border-gray-300"
                  )}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-black text-brand-primary">Q{idx + 1}</span>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => handlePointerDown({ clientX:0, clientY:0, preventDefault:()=>{}, stopPropagation:()=>{} } as any, q.id, 'material', 'idle')}
                        className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold hover:bg-red-200"
                        title="定位素材框"
                      >
                        素材框
                      </button>
                      <button 
                        onClick={() => handlePointerDown({ clientX:0, clientY:0, preventDefault:()=>{}, stopPropagation:()=>{} } as any, q.id, 'content', 'idle')}
                        className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold hover:bg-blue-200"
                        title="定位题目框"
                      >
                        题目框
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-700 font-bold mb-1 truncate">{q.title}</p>
                  <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">{q.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
