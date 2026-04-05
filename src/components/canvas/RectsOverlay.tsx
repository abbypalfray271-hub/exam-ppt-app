import React from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExtendedRect } from '@/types/ai';

export interface RectsLayerProps {
  rects: ExtendedRect[];
  zoom: number;
  selectedId: string | null;
  startMoving: (e: React.PointerEvent, id: string) => void;
  startResizing: (e: React.PointerEvent, id: string, handle: string) => void;
  onRemove: (id: string) => void;
}

export const RectsLayer: React.FC<RectsLayerProps> = ({ rects, zoom, selectedId, startMoving, startResizing, onRemove }) => (
  <>
    {rects.map((r) => (
      <div
        key={r.id}
        onPointerDown={(e) => startMoving(e, r.id)}
        style={{ left: r.x * zoom, top: r.y * zoom, width: r.width * zoom, height: r.height * zoom }}
        className={cn("absolute border-2 shadow-lg group transition-colors", {
          'border-blue-500 bg-blue-500/10': r.type === 'question' || !r.type,
          'border-rose-500 bg-rose-500/10': r.type === 'answer',
          'border-fuchsia-500 bg-fuchsia-500/10': r.type === 'analysis',
          'border-emerald-500 bg-emerald-500/10': r.type === 'diagram',
          'ring-4 ring-yellow-400 z-50': selectedId === r.id
        })}
      >
        <div className="absolute -top-7 left-0 px-2 py-1 bg-black/80 text-white text-[9px] font-black rounded backdrop-blur-md flex items-center gap-2 whitespace-nowrap">
           #{r.qIdx} {r.type === 'question' ? '题目' : r.type === 'answer' ? '答案' : r.type === 'analysis' ? '分析' : '插图'}
           <button onClick={(e) => { e.stopPropagation(); onRemove(r.id); }} className="hover:text-rose-400 p-0.5"><Trash2 className="w-3 h-3" /></button>
        </div>
        {selectedId === r.id && ['nw','ne','sw','se','n','s','e','w'].map(h => (
          <div 
            key={h} 
            // 外壳：提供巨大的 32x32 触控热区 (w-8 h-8)，拦截手势
            className={cn("absolute w-8 h-8 z-[100] flex items-center justify-center -translate-x-1/2 -translate-y-1/2 touch-none", {
              'top-0 left-0 cursor-nw-resize': h === 'nw',
              'top-0 left-full cursor-ne-resize': h === 'ne',
              'top-full left-0 cursor-sw-resize': h === 'sw',
              'top-full left-full cursor-se-resize': h === 'se',
              'top-0 left-1/2 cursor-n-resize': h === 'n',
              'top-full left-1/2 cursor-s-resize': h === 's',
              'top-1/2 left-full cursor-e-resize': h === 'e',
              'top-1/2 left-0 cursor-w-resize': h === 'w',
            })}
            onPointerDown={(e) => startResizing(e, r.id, h)}
          >
            {/* 内核：真实可见的锚点，增加点击时的呼吸放大动效 */}
            <div className="w-3.5 h-3.5 bg-white border-2 rounded-full shadow-md border-blue-500 transition-transform scale-100 group-active/handle:scale-150 pointer-events-none active:scale-150" />
          </div>
        ))}
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
