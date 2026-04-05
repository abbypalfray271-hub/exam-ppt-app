import React, { useRef } from 'react';
import { Plus, Trash2, CheckSquare, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SectionLabelProps {
  label: string;
  count: number;
}

export const SectionLabel: React.FC<SectionLabelProps> = ({ label, count }) => (
  <div className="pt-3 pb-2 flex items-center justify-between border-b border-gray-100 mb-4 px-1">
    <span className="text-sm font-black text-slate-400 uppercase tracking-widest">{label}</span>
    <span className="text-sm font-black px-3 py-1 bg-slate-900 text-white rounded-lg shadow-sm">{count}</span>
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
      <span className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</span>
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

    <div className={cn("absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-black text-white pointer-events-none shadow-md", isRef ? "bg-slate-900" : "bg-blue-600")}>
       {isRef ? "REF" : "PAGE"} {index + 1}
    </div>

    <button 
      onClick={(e) => { e.stopPropagation(); onSelectToggle(); }}
      className={cn(
        "absolute bottom-2 right-2 w-9 h-9 rounded-xl flex items-center justify-center transition-all shadow-lg active:scale-90",
        selected 
          ? "bg-blue-600 text-white ring-4 ring-blue-500/30" 
          : "bg-white/90 text-gray-300 hover:text-blue-500 border border-gray-100"
      )}
    >
      {selected ? <CheckSquare className="w-5 h-5 fill-current" /> : <Square className="w-5 h-5" />}
    </button>

    <button 
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onDelete(); }}
      className="absolute top-2 right-2 w-8 h-8 rounded-xl bg-red-500 text-white shadow-xl opacity-100 md:opacity-0 md:group-hover/thumb:opacity-100 flex items-center justify-center transition-all hover:scale-110 active:scale-90"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  </div>
);
