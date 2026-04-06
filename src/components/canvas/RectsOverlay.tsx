import React from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExtendedRect } from '@/types/ai';

export interface RectsLayerProps {
  rects: ExtendedRect[];
  zoom: number;
  selectedId: string | null;
  activeHandle: string | null;
  startMoving: (e: React.PointerEvent, id: string, source: 'exam' | 'reference') => void;
  startResizing: (e: React.PointerEvent, id: string, handle: string, source: 'exam' | 'reference') => void;
  onRemove: (id: string) => void;
}

export const RectsLayer: React.FC<RectsLayerProps> = ({ 
  rects, zoom, selectedId, activeHandle, startMoving, startResizing, onRemove 
}) => (
  <>
    {rects.map((r) => (
      <div
        key={r.id}
        id={`rect-${r.id}`}
        onPointerDown={(e) => startMoving(e, r.id, r.source as any)}
        style={{ left: r.x * zoom, top: r.y * zoom, width: r.width * zoom, height: r.height * zoom }}
        className={cn("absolute border-2 shadow-lg group transition-all duration-200", {
          'border-blue-500 bg-blue-500/10': r.type === 'question' || !r.type,
          'border-rose-500 bg-rose-500/10': r.type === 'answer',
          'border-fuchsia-500 bg-fuchsia-500/10': r.type === 'analysis',
          'border-emerald-500 bg-emerald-500/10': r.type === 'diagram',
          'ring-4 ring-yellow-400 z-50': selectedId === r.id,
          // 正在拉伸时的视觉反馈：对应边框加粗并高亮 (解决手指遮挡问题)
          'border-t-[6px] border-t-white shadow-[0_-8px_16px_rgba(255,255,255,1)]': selectedId === r.id && activeHandle?.includes('n'),
          'border-b-[6px] border-b-white shadow-[0_8px_16px_rgba(255,255,255,1)]': selectedId === r.id && activeHandle?.includes('s'),
          'border-l-[6px] border-l-white shadow-[-8px_0_16px_rgba(255,255,255,1)]': selectedId === r.id && activeHandle?.includes('w'),
          'border-r-[6px] border-r-white shadow-[8px_0_16px_rgba(255,255,255,1)]': selectedId === r.id && activeHandle?.includes('e'),
        })}
      >
        <div className="absolute -top-7 left-0 px-2 py-1 bg-black/80 text-white text-[9px] font-black rounded backdrop-blur-md flex items-center gap-2 whitespace-nowrap">
           #{r.qIdx} {r.type === 'question' ? '题目' : r.type === 'answer' ? '答案' : r.type === 'analysis' ? '分析' : '插图'}
           <button 
            onPointerDown={e => e.stopPropagation()} 
            onClick={(e) => { e.stopPropagation(); onRemove(r.id); }} 
            className="hover:text-rose-400 p-0.5"
           >
            <Trash2 className="w-3 h-3" />
           </button>
        </div>

        {/* 选框控制层：全边框感应 + 四角增强 (移动端友好) */}
        {selectedId === r.id && (
          <div className="absolute inset-0 pointer-events-none z-[100]">
            {/* 1. 四个对角感应区 (Corner Zones - 32x32px) */}
            {['nw', 'ne', 'sw', 'se'].map(h => (
              <div 
                key={h}
                className={cn("absolute w-10 h-10 pointer-events-auto cursor-pointer no-callout touch-none -translate-x-1/2 -translate-y-1/2 flex items-center justify-center", {
                  'top-0 left-0 cursor-nw-resize': h === 'nw',
                  'top-0 left-full cursor-ne-resize': h === 'ne',
                  'top-full left-0 cursor-sw-resize': h === 'sw',
                  'top-full left-full cursor-se-resize': h === 'se',
                })}
                onPointerDown={(e) => {
                  if (e.pointerType === 'touch') (e.nativeEvent as any).preventDefault?.();
                  startResizing(e, r.id, h, r.source as any);
                }}
              >
                 <div className="w-3 h-3 bg-white border-2 border-blue-600 rounded-full shadow-sm" />
              </div>
            ))}

            {/* 2. 四条边感应带 (Edge Zones - 24px 厚度，覆盖更大的触控面积) */}
            {['n', 's', 'e', 'w'].map(h => (
              <div 
                key={h}
                className={cn("absolute pointer-events-auto no-callout touch-none", {
                  'top-0 left-[20px] right-[20px] h-6 -translate-y-1/2 cursor-n-resize': h === 'n',
                  'bottom-0 left-[20px] right-[20px] h-6 translate-y-1/2 cursor-s-resize': h === 's',
                  'top-[20px] bottom-[20px] left-0 w-6 -translate-x-1/2 cursor-w-resize': h === 'w',
                  'top-[20px] bottom-[20px] right-0 w-6 translate-x-1/2 cursor-e-resize': h === 'e',
                })}
                onPointerDown={(e) => {
                  if (e.pointerType === 'touch') (e.nativeEvent as any).preventDefault?.();
                  startResizing(e, r.id, h, r.source as any);
                }}
              />
            ))}
          </div>
        )}
      </div>
    ))}
  </>
);

export interface DrawingPreviewProps {
  rect: Partial<ExtendedRect> & { source: 'exam' | 'reference' };
  zoom: number;
}

export const DrawingPreview: React.FC<DrawingPreviewProps> = ({ rect, zoom }) => (
  <div 
    id="drawing-preview"
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
