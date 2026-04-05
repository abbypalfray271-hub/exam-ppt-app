'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  Loader2, 
  X, 
  ChevronLeft, 
  ChevronRight,
  ImageIcon,
  Wand2,
  FolderOpen,
  LayoutGrid,
  Plus,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectStore } from '@/store/useProjectStore';
import { pdfToImages } from '@/lib/documentProcessor';
import { importProjectJSON } from '@/lib/projectIO';
import { cn } from '@/lib/utils';

export const UploadZone: React.FC = () => {
  const { 
    examPages, 
    referencePages, 
    isProcessing, 
    processingTarget,
    isCanvasOpen,
    setCanvasOpen,
    setPages, 
    setProcessing,
    resetUpload
  } = useProjectStore();
  
  const [isDragActive, setIsDragActive] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [mounted, setMounted] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleFiles = async (files: File[], mode: 'append' | 'replace', target: 'exam' | 'reference') => {
    if (files.length === 0) return;
    
    setProcessing(true, target);
    
    try {
      const allResults: string[] = [];
      
      for (const file of files) {
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          // PDF 处理：渲染为图片数组
          const images = await pdfToImages(file);
          allResults.push(...images);
        } else {
          // 图片处理：读取为 DataURL
          const result = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
          });
          allResults.push(result);
        }
      }
      
      setPages(allResults, mode, target);
      if (target === 'exam') setCurrentPage(0);
    } catch (err) {
      console.error('File processing error:', err);
      alert('素材解析失败，请检查文件格式。');
    } finally {
      setProcessing(false);
      setIsDragActive(false);
    }
  };

  const handleClearPreview = () => {
    setPages([], 'replace', 'exam');
    setCurrentPage(0);
  };

  const hasContent = examPages.length > 0;
  const preview = examPages[currentPage];

  return (
    <div className="w-full h-full flex flex-col items-center justify-center py-4 relative">
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*,.pdf" 
        multiple 
        onChange={(e) => {
          handleFiles(Array.from(e.target.files || []), 'replace', 'exam');
          e.target.value = '';
        }}
      />
      <input 
        type="file" 
        ref={refInputRef} 
        className="hidden" 
        accept="image/*,.pdf" 
        multiple 
        onChange={(e) => {
          handleFiles(Array.from(e.target.files || []), 'replace', 'reference');
          e.target.value = '';
        }}
      />

      {/* 核心工作视窗 (沉浸式布局) */}
      <div className="relative w-full max-w-4xl flex-1 flex flex-col items-center justify-center min-h-0">
        <div className={cn(
          "relative bg-white shadow-2xl rounded-3xl overflow-hidden border border-gray-100 transition-all duration-700 flex flex-col",
          !hasContent ? "w-[65%] aspect-[3/4]" : "w-full h-full"
        )}>
          {/* 背景/预览大图 */}
          <AnimatePresence mode="wait">
             <motion.div
                key={hasContent ? examPages[currentPage] : 'empty'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full h-full relative"
             >
               <img 
                 src={hasContent ? examPages[currentPage] : '/empty_workbench.png'} 
                 className={cn(
                   "w-full h-full object-contain select-none", 
                   !hasContent && "opacity-40 grayscale-[20%] blur-[0.5px]",
                   isProcessing && "opacity-20 blur-sm"
                 )}
               />

               {/* 页面顶部的格式导引标签 */}
               {!hasContent && (
                  <div className="absolute top-10 left-1/2 -translate-x-1/2 z-30 animate-in fade-in zoom-in duration-700">
                    <div className="px-6 py-2 bg-white/40 backdrop-blur-md rounded-full border border-white/20 shadow-sm">
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] whitespace-nowrap">
                        PDF / 图片 / 拍照
                      </span>
                    </div>
                  </div>
               )}
               
               {/* 正在处理时的遮罩 */}
               {isProcessing && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/30 backdrop-blur-sm z-50">
                    <Loader2 className="w-12 h-12 text-brand-primary animate-spin mb-4" />
                    <div className="px-6 py-2 bg-white/80 rounded-full shadow-lg border border-brand-primary/10">
                      <span className="text-xs font-black uppercase tracking-widest text-gray-900">
                        {processingTarget === 'exam' ? '解析试题素材' : '同步参考答案'}
                      </span>
                    </div>
                 </div>
               )}
             </motion.div>
          </AnimatePresence>

          {/* 核心功能卡片 (悬浮枢纽) - 仅在非处理态显示 */}
          {!isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center gap-8 z-20">
               <button 
                 onClick={() => fileInputRef.current?.click()}
                 className="flex flex-col items-center gap-3 p-7 bg-white/90 backdrop-blur-xl rounded-[2.5rem] shadow-[0_30px_90px_rgba(0,0,0,0.12)] border border-white hover:border-blue-400 hover:scale-110 active:scale-95 transition-all group/btn"
               >
                 <div className="w-16 h-16 bg-blue-500 rounded-3xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30 group-hover/btn:rotate-12 transition-transform">
                    <Plus className="w-8 h-8" strokeWidth={3} />
                 </div>
                 <span className="text-sm font-black text-gray-900 tracking-tighter uppercase">试题添加</span>
               </button>

               <button 
                 onClick={() => refInputRef.current?.click()}
                 className="flex flex-col items-center gap-3 p-7 bg-white/90 backdrop-blur-xl rounded-[2.5rem] shadow-[0_30px_90px_rgba(0,0,0,0.12)] border border-white hover:border-purple-400 hover:scale-110 active:scale-95 transition-all group/btn"
               >
                 <div className="w-16 h-16 bg-purple-500 rounded-3xl flex items-center justify-center text-white shadow-lg shadow-purple-500/30 group-hover/btn:-rotate-12 transition-transform">
                    <LayoutGrid className="w-8 h-8" strokeWidth={3} />
                 </div>
                 <span className="text-sm font-black text-gray-900 tracking-tighter uppercase">补充答案</span>
               </button>
            </div>
          )}

          {/* 底部翻页控制 (内容态可见) */}
          {hasContent && examPages.length > 1 && (
             <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 px-5 py-2.5 bg-black/70 backdrop-blur-md rounded-full text-white z-30 shadow-2xl scale-90 md:scale-100">
                <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}>
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="h-4 w-px bg-white/20" />
                <span className="text-[11px] font-black uppercase tracking-[0.2em]">{currentPage + 1} / {examPages.length}</span>
                <div className="h-4 w-px bg-white/20" />
                <button onClick={() => setCurrentPage(p => Math.min(examPages.length - 1, p + 1))} disabled={currentPage === examPages.length - 1}>
                  <ChevronRight className="w-5 h-5" />
                </button>
             </div>
          )}
          
          {/* 右上角快速重置 */}
          {hasContent && (
             <button 
               onClick={resetUpload}
               className="absolute top-6 right-6 p-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-full backdrop-blur-md transition-all z-30 opacity-0 group-hover/canvas:opacity-100"
               title="清空素材"
             >
               <Trash2 className="w-5 h-5" />
             </button>
          )}
        </div>
      </div>

      {/* 底部全局控制条 (常驻可见) */}
      <div className="w-full max-w-4xl flex items-center justify-between px-2 mt-8 z-10">
         <div className="flex items-center gap-4">
            <button 
              onClick={() => importProjectJSON()}
              className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white border border-gray-100 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all shadow-sm active:scale-95 group"
            >
              <FolderOpen className="w-5 h-5 opacity-40 group-hover:opacity-100 transition-opacity" />
              <span className="text-xs font-black uppercase tracking-widest">读入演稿</span>
            </button>
            {hasContent && (
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-500 rounded-lg text-[10px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-left-2 transition-all">
                素材就绪
              </div>
            )}
         </div>

         <button 
           disabled={!hasContent || isProcessing}
           onClick={() => setCanvasOpen(true)}
           className={cn(
             "px-10 py-3.5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] transition-all flex items-center gap-3 shadow-2xl",
             hasContent 
               ? "bg-gradient-to-r from-blue-600 to-indigo-700 text-white hover:scale-105 active:scale-95 shadow-blue-500/20" 
               : "bg-gray-200 text-gray-400 cursor-not-allowed grayscale"
           )}
         >
           {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
           开始制作
         </button>
      </div>
    </div>
  );
};
