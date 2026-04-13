import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Question, useProjectStore } from '@/store/useProjectStore';
import { AnswerMasks } from './AnswerMasks';

export interface MaterialViewerProps {
  firstQ: Question;
  questions: Question[];
  onClose: () => void;
}

export const MaterialViewer: React.FC<MaterialViewerProps> = ({ firstQ, questions, onClose }) => {
  const { updateQuestion } = useProjectStore();

  const [zoomState, setZoomState] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMaskDrawMode, setIsMaskDrawMode] = useState(false);
  const [drawingMask, setDrawingMask] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-start justify-center p-0 bg-black/90 backdrop-blur-md overflow-y-auto custom-scrollbar"
      onClick={() => {
        onClose();
        setZoomState({ scale: 1, x: 0, y: 0 });
        setIsMaskDrawMode(false);
        setDrawingMask(null);
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative w-full min-h-screen flex flex-col items-center py-12"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="fixed top-4 right-6 p-3 bg-black/50 hover:bg-red-500 text-white rounded-full transition-colors z-50 backdrop-blur-sm shadow-xl"
          title="关闭全屏"
        >
          <X className="w-6 h-6" />
        </button>

        <div 
          className={cn("relative group inline-block w-[80vw]", isMaskDrawMode ? "cursor-crosshair" : (zoomState.scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : ""))}
          style={{
            transform: `translate(${zoomState.x}px, ${zoomState.y}px) scale(${zoomState.scale})`,
            transformOrigin: 'center top',
            transition: (isDragging || isMaskDrawMode) ? 'none' : 'transform 0.2s ease-out'
          }}
          onPointerDown={(e) => {
            if (isMaskDrawMode) {
              e.stopPropagation();
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              const rect = e.currentTarget.getBoundingClientRect();
              const pctX = (e.clientX - rect.left) / rect.width;
              const pctY = (e.clientY - rect.top) / rect.height;
              setDrawingMask({ startX: pctX, startY: pctY, currentX: pctX, currentY: pctY });
            } else if (zoomState.scale > 1) {
              e.currentTarget.setPointerCapture(e.pointerId);
              setIsDragging(true);
              setDragStart({ x: e.clientX - zoomState.x, y: e.clientY - zoomState.y });
            }
          }}
          onPointerMove={(e) => {
            if (isMaskDrawMode && drawingMask) {
              const rect = e.currentTarget.getBoundingClientRect();
              let pctX = (e.clientX - rect.left) / rect.width;
              let pctY = (e.clientY - rect.top) / rect.height;
              pctX = Math.max(0, Math.min(1, pctX));
              pctY = Math.max(0, Math.min(1, pctY));
              setDrawingMask(prev => prev ? { ...prev, currentX: pctX, currentY: pctY } : null);
            } else if (isDragging && zoomState.scale > 1) {
              setZoomState(prev => ({
                ...prev,
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
              }));
            }
          }}
          onPointerUp={(e) => {
            if (isMaskDrawMode && drawingMask) {
              e.currentTarget.releasePointerCapture(e.pointerId);
              const minX = Math.min(drawingMask.startX, drawingMask.currentX);
              const maxX = Math.max(drawingMask.startX, drawingMask.currentX);
              const minY = Math.min(drawingMask.startY, drawingMask.currentY);
              const maxY = Math.max(drawingMask.startY, drawingMask.currentY);
              
              if (maxX - minX > 0.01 && maxY - minY > 0.01) {
                  const answer_box: [number, number, number, number] = [
                    Math.round(minY * 10000),
                    Math.round(minX * 10000),
                    Math.round(maxY * 10000),
                    Math.round(maxX * 10000)
                  ];
                  updateQuestion(firstQ.id, { answer_box });
              }
              
              setDrawingMask(null);
              setIsMaskDrawMode(false);
            } else {
              setIsDragging(false);
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onPointerCancel={() => {
              setIsDragging(false);
              setDrawingMask(null);
          }}
          onWheel={(e) => {
            if (isMaskDrawMode) return;
            e.preventDefault();
            setZoomState(prev => {
              const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
              const newScale = Math.min(Math.max(1, prev.scale * zoomFactor), 5.0);
              if (newScale === 1) return { scale: 1, x: 0, y: 0 };
              return { ...prev, scale: newScale };
            });
          }}
        >
          {firstQ.materialImage ? (
            <img 
              src={firstQ.materialImage} 
              alt="全屏缩略素材" 
              className="w-full h-auto object-contain shadow-2xl bg-white block select-none pointer-events-none"
              draggable={false}
            />
          ) : (
            <div className="flex flex-col w-full bg-white shadow-2xl overflow-hidden rounded-md border border-gray-100">
              {(firstQ.images && firstQ.images.length > 0 ? firstQ.images : [firstQ.image]).map((imgSrc: string | undefined, idx: number) => {
                if (!imgSrc) return null;
                return (
                  <div key={idx} className="relative w-full">
                    {idx > 0 && <div className="w-full h-0 border-t-4 border-dashed border-brand-primary/30 opacity-70 flex items-center justify-center my-1"><span className="bg-brand-primary/10 text-brand-primary font-black text-[10px] px-2 py-0.5 rounded-full absolute -translate-y-1/2">✂️ 跨页缝合线</span></div>}
                    <img 
                      src={imgSrc} 
                      alt={`全屏原文切片片段 ${idx}`} 
                      className="w-full h-auto object-contain block select-none pointer-events-none"
                      draggable={false}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <AnswerMasks questions={questions} isDrawMode={isMaskDrawMode} />

          {drawingMask && (
            <div 
              className="absolute z-50 border-2 border-brand-primary bg-brand-primary/20 shadow-lg"
              style={{
                  left: `${Math.min(drawingMask.startX, drawingMask.currentX) * 100}%`,
                  top: `${Math.min(drawingMask.startY, drawingMask.currentY) * 100}%`,
                  width: `${Math.abs(drawingMask.currentX - drawingMask.startX) * 100}%`,
                  height: `${Math.abs(drawingMask.currentY - drawingMask.startY) * 100}%`
              }}
            />
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 px-6 py-2 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
          <p className="text-white text-sm font-bold tracking-widest uppercase">
            原文切片预览
          </p>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isMaskDrawMode) {
                setZoomState({ scale: 1, x: 0, y: 0 }); 
              } else {
                setDrawingMask(null);
              }
              setIsMaskDrawMode(!isMaskDrawMode);
            }}
            className={cn(
              "px-4 py-1.5 rounded-full flex items-center gap-2 transition-all shadow-md active:scale-95",
              isMaskDrawMode 
                ? "bg-red-500 hover:bg-red-600 text-white" 
                : "bg-white/20 hover:bg-brand-primary text-white"
            )}
          >
            <EyeOff className="w-4 h-4" />
            <span className="text-sm font-bold tracking-widest">
              {isMaskDrawMode ? '在此处拖拽鼠标画框 (点击取消)' : '手动框选隐藏区'}
            </span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
