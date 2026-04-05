import React, { useRef } from 'react';
import { Plus, Trash2, CheckSquare, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SectionLabelProps {
  label: string;
  count: number;
}

export const SectionLabel: React.FC<SectionLabelProps> = ({ label, count }) => (
  <div className="pt-2 pb-1 flex items-center justify-between border-b border-gray-50 mb-2">
    <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">{label}</span>
    <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">{count}</span>
  </div>
);

export interface AddCardProps {
  onAdd: (files: FileList) => void;
  label?: string;
}

export const AddCard: React.FC<AddCardProps> = ({ onAdd, label = "试题页面" }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div 
      onClick={() => inputRef.current?.click()}
      className="relative rounded-xl overflow-hidden border-2 border-dashed border-gray-200 aspect-[3/4] cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group shrink-0 w-full hover:border-blue-400 hover:bg-blue-50/30"
    >
      <Plus className="w-8 h-8 text-gray-300 group-hover:text-blue-500" />
      <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</span>
      <input type="file" multiple hidden ref={inputRef} onChange={(e) => e.target.files && onAdd(e.target.files)} accept="image/*,application/pdf" />
    </div>
  );
};

export interface ThumbnailProps {
  src: string;
  index: number;
  active: boolean;
  selected: boolean;
  onClick: () => void;
  onSelectToggle: () => void;
  onDelete: () => void;
  isRef?: boolean;
}

export const Thumbnail: React.FC<ThumbnailProps> = ({ src, index, active, selected, onClick, onSelectToggle, onDelete, isRef }) => (
  <div 
    className={cn(
      "relative rounded-xl overflow-hidden border-2 aspect-[3/4] cursor-pointer transition-all hover:shadow-md group/thumb", 
      active ? "border-blue-500 scale-[1.05] z-10 shadow-lg" : isRef ? "border-purple-200 opacity-80" : "border-gray-100",
      selected && "ring-2 ring-blue-500 ring-offset-2"
    )}
  >
    <div className="w-full h-full" onClick={onClick}>
      <img src={src} className="w-full h-full object-cover" />
    </div>

    <div className={cn("absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-black text-white pointer-events-none", isRef ? "bg-purple-500" : "bg-blue-500")}>
       {isRef ? "R" : "P"}{index}
    </div>

    <button 
      onClick={(e) => { e.stopPropagation(); onSelectToggle(); }}
      className={cn(
        "absolute bottom-2 right-2 p-1.5 rounded-lg border bg-white/80 transition-all",
        selected ? "bg-blue-500 border-blue-500 text-white" : "text-gray-400"
      )}
    >
      {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
    </button>

    <button 
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onDelete(); }}
      className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-500 text-white shadow-xl opacity-0 group-hover/thumb:opacity-100 transition-all"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  </div>
);
