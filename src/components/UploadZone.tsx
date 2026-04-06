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
    resetUpload,
    removePage
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

  const handleDeleteCurrent = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (examPages.length === 0) return;
    
    // 如果删除的是最后一页且有前页，自动切换到前一页
    if (currentPage === examPages.length - 1 && currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
    
    removePage(currentPage, 'exam');
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center py-4 relative overflow-hidden bg-[#f8fafc]">
      {/* 🌊 极光流体梯变背景 (Aurora Fluid Background) */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-400/10 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-fuchsia-400/10 blur-[130px] animate-pulse [animation-delay:2s]" />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-orange-400/5 blur-[100px] animate-pulse [animation-delay:4s]" />
      </div>
      
      {/* 🧩 极简动态坐标系 */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.08]" 
           style={{ 
             backgroundImage: 'radial-gradient(#64748b 1px, transparent 0)', 
             backgroundSize: '30px 30px' 
           }} 
      />
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
      <div className="relative w-full max-w-4xl flex-1 flex flex-col items-center justify-center min-h-0 z-10 px-4 md:px-0">
        <div className={cn(
          "relative bg-white/40 backdrop-blur-3xl border border-white rounded-[2.5rem] overflow-hidden shadow-[0_32px_80px_-20px_rgba(31,38,135,0.15)] transition-all duration-1000 flex flex-col",
          !hasContent ? "w-[65%] max-w-md aspect-[3/4] landscape:aspect-[4/3] landscape:w-[50%]" : "w-full h-full"
        )}>
          {/* ✨ 极细白边补强 */}
          <div className="absolute inset-0 border border-white/60 rounded-[2.5rem] pointer-events-none" />


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

               {/* 页面顶部的格式导引标签 (黑化增强对比度) */}
               {!hasContent && (
                  <div className="absolute top-10 left-1/2 -translate-x-1/2 z-30 animate-in fade-in zoom-in duration-700">
                    <div className="px-6 py-2 bg-slate-900 backdrop-blur-md rounded-full border border-white/10 shadow-xl shadow-slate-900/20">
                      <span className="text-[10px] font-black text-white uppercase tracking-[0.4em] whitespace-nowrap">
                        PDF / 图片 / 拍照
                      </span>
                    </div>
                  </div>
               )}
               
               {/* 🧬 丝滑光泽脉冲动效 */}
               {isProcessing && (
                 <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.4, 0] }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                    className="absolute inset-0 z-40 pointer-events-none bg-blue-500/20 shadow-[inset_0_0_100px_rgba(59,130,246,0.3)]"
                 />
               )}

               {/* 正在处理时的清新遮罩 */}
               {isProcessing && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/50 backdrop-blur-xl z-50">
                    <div className="relative mb-8">
                       <Loader2 className="w-16 h-16 text-blue-600 animate-spin opacity-20" strokeWidth={1} />
                       <div className="absolute inset-0 flex items-center justify-center">
                          <Wand2 className="w-8 h-8 text-blue-600 animate-pulse" />
                       </div>
                    </div>
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="px-8 py-3 rounded-full border border-blue-500/20 bg-blue-50 animate-in fade-in zoom-in"
                    >
                      <span className="text-xs font-black text-blue-600 uppercase tracking-[0.4em] animate-pulse">
                        {processingTarget === 'exam' ? '解析试题素材' : '同步参考答案'}
                      </span>
                    </motion.div>
                 </div>
               )}
             </motion.div>
          </AnimatePresence>

          {!isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center gap-4 md:gap-16 z-20">
               <button 
                 onClick={() => fileInputRef.current?.click()}
                 className="flex flex-col items-center gap-2 landscape:gap-1 p-4 landscape:p-3 md:p-8 bg-white border border-slate-200 rounded-[2rem] md:rounded-[2.5rem] shadow-[0_24px_48px_-12px_rgba(15,23,42,0.12)] hover:scale-105 active:scale-95 transition-all duration-500 group/btn relative overflow-hidden"
               >
                 <div className="absolute inset-0 bg-blue-50 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                 <div className="w-12 h-12 landscape:w-10 landscape:h-10 md:w-16 md:h-16 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-[0_12px_24px_-5px_rgba(37,99,235,0.4)] relative z-10">
                    <Plus className="w-6 h-6 landscape:w-5 landscape:h-5 md:w-8 md:h-8" strokeWidth={3} />
                 </div>
                 <div className="text-center relative z-10">
                   <span className="text-sm landscape:text-xs md:text-lg font-black text-slate-900 tracking-widest uppercase block">试题添加</span>
                 </div>
               </button>

               <button 
                 onClick={() => refInputRef.current?.click()}
                 className="flex flex-col items-center gap-2 landscape:gap-1 p-4 landscape:p-3 md:p-8 bg-white border border-slate-200 rounded-[2rem] md:rounded-[2.5rem] shadow-[0_24px_48px_-12px_rgba(15,23,42,0.12)] hover:scale-105 active:scale-95 transition-all duration-500 group/btn relative overflow-hidden"
               >
                 <div className="absolute inset-0 bg-fuchsia-50 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                 <div className="w-12 h-12 landscape:w-10 landscape:h-10 md:w-16 md:h-16 bg-fuchsia-600 text-white rounded-full flex items-center justify-center shadow-[0_12px_24px_-5px_rgba(192,38,211,0.4)] relative z-10">
                    <LayoutGrid className="w-6 h-6 landscape:w-5 landscape:h-5 md:w-8 md:h-8" strokeWidth={3} />
                 </div>
                 <div className="text-center relative z-10">
                    <span className="text-sm landscape:text-xs md:text-lg font-black text-slate-900 tracking-widest uppercase block">补充答案</span>
                 </div>
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
          
          {/* 🗑️ 右上角“删除当前页” (对应截图红圈) */}
          {hasContent && !isProcessing && (
             <button 
               onClick={handleDeleteCurrent}
               className="absolute top-6 right-6 p-3 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-full backdrop-blur-xl border border-red-500/20 shadow-xl shadow-red-500/10 transition-all z-40 group/del active:scale-95"
               title="移除当前这一页"
             >
               <Trash2 className="w-5 h-5 group-hover/del:scale-110 transition-transform" />
             </button>
          )}
        </div>
      </div>

      {/* 底部全局控制条 (常驻可见) */}
      <div className="w-full max-w-4xl flex flex-row items-center justify-between px-4 mt-4 landscape:mt-2 md:mt-16 z-10 gap-4">
         <div className="flex items-center gap-4">
            <button 
              onClick={() => importProjectJSON()}
              className="h-12 landscape:h-10 md:h-16 px-6 md:px-10 rounded-full bg-orange-500 text-white font-black text-xs md:text-sm uppercase tracking-[0.2em] shadow-[0_8px_20px_-6px_rgba(249,115,22,0.6)] hover:scale-[1.03] hover:bg-orange-600 transition-all active:scale-95 group shrink-0 flex items-center gap-2 md:gap-4"
            >
              <div className="p-1.5 md:p-2 bg-white/20 rounded-full text-white">
                <FolderOpen className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <span>读入演稿</span>
            </button>

         </div>

         <button 
           disabled={!hasContent || isProcessing}
           onClick={() => setCanvasOpen(true)}
           className={cn(
             "h-12 landscape:h-10 md:h-16 px-8 md:px-16 rounded-full font-black text-base md:text-xl uppercase tracking-[0.3em] transition-all duration-700 flex items-center gap-3 md:gap-4 shadow-xl shadow-blue-500/20 overflow-hidden relative group",
             hasContent 
               ? "bg-blue-600 text-white hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/40" 
               : "bg-slate-200 text-slate-400 cursor-not-allowed"
           )}
         >
           <div className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-white/10 to-blue-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
           {isProcessing ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : <Wand2 className="w-5 h-5 md:w-6 md:h-6" />}
           <span className="relative z-10">开始制作</span>
         </button>
      </div>
    </div>
  );
};
