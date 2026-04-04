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
  FolderOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectStore } from '@/store/useProjectStore';
import { pdfToImages } from '@/lib/documentProcessor';
import { cn } from '@/lib/utils';
import { createPortal } from 'react-dom';
import { ExtractionCanvas } from './ExtractionCanvas';

export const UploadZone: React.FC = () => {
  const { 
    examPages, 
    referencePages, 
    isProcessing, 
    processingTarget,
    setPages, 
    setProcessing,
    resetUpload,
    importProjectJSON 
  } = useProjectStore();
  
  const [isDragActive, setIsDragActive] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [isCanvasOpen, setCanvasOpen] = useState(false);
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
    <div className={cn("w-full transition-all duration-500", hasContent ? "min-h-[60vh]" : "min-h-[40vh] flex items-center justify-center")}>
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

      <AnimatePresence mode="wait">
        {!hasContent ? (
          <div className="flex flex-col items-center justify-center mt-12 w-full">
            <motion.div
              key="upload-exam"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "relative aspect-[4/3] w-full max-w-lg border-4 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all bg-white group shadow-sm",
                !isProcessing ? "border-gray-200 cursor-pointer hover:border-brand-primary hover:bg-brand-primary/5 hover:shadow-xl active:scale-[0.99]" : "border-brand-primary/30"
              )}
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={(e) => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files), 'replace', 'exam'); }}
            >
              <div className="bg-brand-primary/10 p-6 rounded-2xl mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-12 h-12 text-brand-primary" />
              </div>
              <h2 className="text-2xl font-black mb-2">上传试卷素材</h2>
              <p className="text-gray-400 text-xs px-8 text-center uppercase tracking-widest font-bold">PDF / 图片 / 拍照</p>
              {isProcessing && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-3xl">
                  <Loader2 className="w-10 h-10 text-brand-primary animate-spin" />
                </div>
              )}
            </motion.div>
          </div>
        ) : (
          <div className="flex flex-col items-center pt-8">
            <motion.div
              key="preview-panel"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-xl rounded-3xl overflow-hidden glass-panel border shadow-2xl aspect-[3/4] group flex flex-col items-center justify-center"
            >
              {preview && <img src={preview} alt="预览" className={cn("w-full h-full object-contain p-4 transition-opacity", isProcessing ? "opacity-30" : "opacity-100")} />}
              
              {isProcessing && (
                <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center">
                  <div className="bg-white/90 p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4 border border-brand-primary/10">
                    <Loader2 className="w-12 h-12 text-brand-primary animate-spin" />
                    <div className="flex flex-col items-center">
                      <p className="text-sm font-black text-gray-900 tracking-widest uppercase">正在处理新素材</p>
                      <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-tighter">AI 引擎正在解析预览图...</p>
                    </div>
                  </div>
                </div>
              )}

              {examPages.length > 1 && (
                <div className="absolute top-4 left-4 flex gap-2 z-10">
                  <button onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))} disabled={currentPage === 0 || isProcessing} className="p-2 bg-black/50 text-white rounded-lg disabled:opacity-30 backdrop-blur-md transition-all active:scale-90"><ChevronLeft className="w-4 h-4" /></button>
                  <div className="px-3 py-1 bg-black/50 text-white rounded-lg text-xs font-bold flex items-center backdrop-blur-md">{currentPage + 1} / {examPages.length}</div>
                  <button onClick={() => setCurrentPage(prev => Math.min(examPages.length - 1, prev + 1))} disabled={currentPage === examPages.length - 1 || isProcessing} className="p-2 bg-black/50 text-white rounded-lg disabled:opacity-30 backdrop-blur-md transition-all active:scale-90"><ChevronRight className="w-4 h-4" /></button>
                </div>
              )}

              <button onClick={handleClearPreview} disabled={isProcessing} className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 disabled:opacity-30 transition-all backdrop-blur-md z-10 active:scale-90"><X className="w-6 h-6" /></button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* [工业版控制中心] 全局化物理排布 - 让首页也具备读入入口 */}
      {mounted && (
        <div className="fixed inset-0 z-[100] pointer-events-none">
          {/* 1. 左下角：读入演稿 (全局可见) */}
          <div className="absolute left-6 bottom-6 pointer-events-auto">
            <button 
              disabled={isProcessing}
              className="w-32 h-16 flex flex-col items-center justify-center bg-gray-900 text-white rounded-2xl shadow-xl border-b-2 border-gray-950 hover:bg-black transition-all active:scale-95 gap-1"
              onClick={() => importProjectJSON()}
            >
              <FolderOpen className="w-5 h-5 opacity-60" />
              <span className="text-sm font-black tracking-normal whitespace-nowrap">读入演稿</span>
            </button>
          </div>

          {/* 仅在已有内容时显示的核心操作区 */}
          {hasContent && (
            <>
              {/* 2. 中央：素材双核 (垂直+水平双向居中) */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto flex items-center gap-12">
                  {/* 试题添加 (精巧立牌) */}
                  <button 
                    disabled={isProcessing}
                    className="w-24 h-32 flex flex-col items-center justify-center bg-white text-gray-900 rounded-[2rem] shadow-[0_20px_70px_rgba(0,0,0,0.15)] border-2 border-gray-50 hover:shadow-[0_35px_90px_rgba(0,0,0,0.25)] transition-all active:scale-95 group" 
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isProcessing && processingTarget === 'exam' ? (
                      <Loader2 className="w-8 h-8 animate-spin mb-2 text-brand-primary" />
                    ) : (
                      <div className="p-3 bg-gray-50 rounded-2xl group-hover:bg-brand-primary/10 transition-colors mb-2">
                        <ImageIcon className="w-8 h-8 text-gray-400 group-hover:text-brand-primary" />
                      </div>
                    )}
                    <div className="text-lg font-black tracking-tight whitespace-nowrap">
                      试题添加
                    </div>
                  </button>

                  {/* 补充答案 (精巧立牌) */}
                  <button 
                    disabled={isProcessing}
                    className="w-24 h-32 flex flex-col items-center justify-center bg-[#E0E8FF] text-brand-primary rounded-[2rem] shadow-[0_20px_70px_rgba(40,113,255,0.1)] border-2 border-white/50 hover:bg-[#D4E0FF] transition-all active:scale-95 group" 
                    onClick={() => refInputRef.current?.click()}
                  >
                    {isProcessing && processingTarget === 'reference' ? (
                      <Loader2 className="w-8 h-8 animate-spin mb-2" />
                    ) : (
                      <div className="p-3 bg-white/50 rounded-2xl mb-2">
                        <FileText className="w-8 h-8" />
                      </div>
                    )}
                    <div className="text-lg font-black tracking-tight whitespace-nowrap">
                      补充答案
                    </div>
                  </button>
              </div>

              {/* 3. 右下角：执行终端 (开始制作) */}
              <div className="absolute right-6 bottom-6 pointer-events-auto">
                <button 
                  disabled={isProcessing}
                  style={{
                    background: 'linear-gradient(135deg, #FF3D77 0%, #FFB100 30%, #00E4A1 50%, #0088FF 70%, #A155FF 100%)',
                  }}
                  className="w-32 h-16 flex flex-col items-center justify-center text-white rounded-2xl shadow-[0_15px_45px_rgba(255,61,119,0.35)] border border-white/30 backdrop-blur-xl hover:scale-110 active:scale-95 transition-all group gap-1"
                  onClick={() => setCanvasOpen(true)}
                >
                  <Wand2 className="w-6 h-6 group-hover:rotate-12 transition-transform drop-shadow-md" />
                  <div className="text-sm font-black tracking-normal leading-none drop-shadow-sm">
                      开始制作
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {mounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isCanvasOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[999] bg-white">
              <ExtractionCanvas 
                examPages={examPages}
                referencePages={referencePages}
                initialPageIndex={currentPage}
                onComplete={() => setCanvasOpen(false)}
                onClose={() => { setCanvasOpen(false); resetUpload(); }}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
