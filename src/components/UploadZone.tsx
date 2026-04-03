'use client';

import React, { useCallback, useState, useRef } from 'react';
import { 
  Upload, Image as ImageIcon, FileText, X, Wand2, 
  Sparkles, ChevronLeft, ChevronRight, Loader2, FolderOpen
} from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ExtractionCanvas } from './ExtractionCanvas';
import { pdfToImages, compressImage } from '@/lib/documentProcessor';
import { createPortal } from 'react-dom';
import { importProjectJSON } from '@/lib/projectIO';

export const UploadZone = () => {
  const { 
    setExamImage, 
    setExamPages, 
    setReferencePages,
    isProcessing, 
    setProcessing,
    examPages,
    referencePages,
    setView,
    examImageUrl,
    isCanvasOpen,
    setCanvasOpen,
    resetUpload,
    setFileType,
    fileType
  } = useProjectStore();

  const [currentPage, setCurrentPage] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  const preview = examPages.length > 0 ? examPages[currentPage] : examImageUrl || null;
  const hasContent = examPages.length > 0 || !!examImageUrl || referencePages.length > 0;

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (examPages.length > 0 && currentPage >= examPages.length) {
      setCurrentPage(examPages.length - 1);
    }
  }, [examPages, currentPage]);

  const handleFiles = async (
    files: File[], 
    mode: 'replace' | 'append' = 'replace',
    target: 'exam' | 'reference' = 'exam'
  ) => {
    if (!files || files.length === 0) return;
    
    setProcessing(true);
    try {
      const setter = target === 'exam' ? setExamPages : setReferencePages;
      const currentList = target === 'exam' ? examPages : referencePages;
      const mainFile = files[0];

      if (mainFile.type === 'application/pdf' || mainFile.name.toLowerCase().endsWith('.pdf')) {
        if (target === 'exam') setFileType('pdf');
        const images = await pdfToImages(mainFile);
        
        if (mode === 'append') {
          setter([...currentList, ...images]);
          if (target === 'exam') {
            setCurrentPage(examPages.length);
            if (images.length > 0) setExamImage(images[0]);
          }
        } else {
          setter(images);
          if (target === 'exam') {
            if (images.length > 0) {
              setExamImage(images[0]);
              setCurrentPage(0);
            }
          }
        }
      } else {
        const imageFiles = files.filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;
        if (target === 'exam') setFileType('image');

        const base64Images: string[] = [];
        for (const file of imageFiles) {
          const rawBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsDataURL(file);
          });
          const compressed = await compressImage(rawBase64, 1600);
          base64Images.push(compressed);
        }

        if (mode === 'append') {
          setter([...currentList, ...base64Images]);
          if (target === 'exam') {
            setCurrentPage(examPages.length);
            setExamImage(base64Images[0]);
          }
        } else {
          setter(base64Images);
          if (target === 'exam') {
            setExamImage(base64Images[0]);
            setCurrentPage(0);
          }
        }
      }
    } catch (error: any) {
      console.error('File processing error:', error);
      alert(`无法处理此文件: ${error?.message || '未知错误'}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleClearPreview = () => {
    setCurrentPage(0);
    resetUpload();
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-6">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,application/pdf,.pdf"
        multiple
        onChange={(e) => {
          const files = e.target.files;
          if (!files) return;
          const mode = examPages.length > 0 ? 'append' : 'replace';
          handleFiles(Array.from(files), mode, 'exam');
          e.target.value = '';
        }}
      />
      <input
        ref={refInputRef}
        type="file"
        className="hidden"
        accept="image/*,application/pdf,.pdf"
        multiple
        onChange={(e) => {
          const files = e.target.files;
          if (!files) return;
          const mode = referencePages.length > 0 ? 'append' : 'replace';
          handleFiles(Array.from(files), mode, 'reference');
          e.target.value = '';
        }}
      />
      
      <AnimatePresence mode="wait">
        {!hasContent ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
            <motion.div
              key="upload-exam"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                "relative aspect-[4/3] border-4 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all bg-white group shadow-sm",
                !isProcessing ? "border-gray-200 cursor-pointer hover:border-brand-primary hover:bg-brand-primary/5 hover:shadow-xl active:scale-[0.99]" : "border-brand-primary/30"
              )}
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={(e) => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files), 'replace', 'exam'); }}
            >
              <div className="bg-brand-primary/10 p-4 rounded-2xl mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-10 h-10 text-brand-primary" />
              </div>
              <h2 className="text-xl font-black mb-1">上传试卷素材</h2>
              <p className="text-gray-400 text-xs px-8 text-center uppercase tracking-widest font-bold">主素材池 · 支持混合内容</p>
              {isProcessing && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-3xl">
                  <Loader2 className="w-10 h-10 text-brand-primary animate-spin" />
                </div>
              )}
            </motion.div>

            <motion.div
              key="upload-reference"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                "relative aspect-[4/3] border-4 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all bg-white group shadow-sm",
                !isProcessing ? "border-gray-200 cursor-pointer hover:border-purple-500 hover:bg-purple-50 hover:shadow-xl active:scale-[0.99]" : "border-purple-200"
              )}
              onClick={() => !isProcessing && refInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={(e) => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files), 'replace', 'reference'); }}
            >
              <div className="bg-purple-100 p-4 rounded-2xl mb-4 group-hover:scale-110 transition-transform">
                <FileText className="w-10 h-10 text-purple-600" />
              </div>
              <h2 className="text-xl font-black mb-1">上传答案解析</h2>
              <p className="text-gray-400 text-xs px-8 text-center uppercase tracking-widest font-bold">参考池 · 提高 100% 识别准度</p>
              {isProcessing && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-3xl">
                  <Loader2 className="w-10 h-10 text-purple-600 animate-spin" />
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
              {preview && <img src={preview} alt="预览" className="w-full h-full object-contain p-4" />}
              
              {examPages.length > 1 && (
                <div className="absolute top-4 left-4 flex gap-2 z-10">
                  <button onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))} disabled={currentPage === 0} className="p-2 bg-black/50 text-white rounded-lg disabled:opacity-30 backdrop-blur-md"><ChevronLeft className="w-4 h-4" /></button>
                  <div className="px-3 py-1 bg-black/50 text-white rounded-lg text-xs font-bold flex items-center backdrop-blur-md">{currentPage + 1} / {examPages.length}</div>
                  <button onClick={() => setCurrentPage(prev => Math.min(examPages.length - 1, prev + 1))} disabled={currentPage === examPages.length - 1} className="p-2 bg-black/50 text-white rounded-lg disabled:opacity-30 backdrop-blur-md"><ChevronRight className="w-4 h-4" /></button>
                </div>
              )}

              <button onClick={handleClearPreview} className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors backdrop-blur-md z-10"><X className="w-6 h-6" /></button>

              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 opacity-100 transition-opacity">
                <button className="px-8 py-3 bg-brand-primary text-white rounded-full font-bold shadow-xl hover:scale-105 transition-transform flex items-center gap-2" onClick={() => setCanvasOpen(true)}><Wand2 className="w-5 h-5" /> 开始框选状态</button>
                <button className="px-6 py-3 bg-purple-600 text-white rounded-full font-bold shadow-xl hover:bg-purple-700 transition-all flex items-center gap-2" onClick={() => refInputRef.current?.click()}><FileText className="w-5 h-5" /> 补充答案</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {mounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isCanvasOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[999] bg-white">
              <ExtractionCanvas 
                examPages={examPages}
                referencePages={referencePages}
                initialPageIndex={currentPage}
                onComplete={() => setCanvasOpen(false)}
                onClose={() => setCanvasOpen(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <div className="fixed bottom-6 right-6 z-50">
        <button onClick={() => importProjectJSON()} className="flex items-center gap-2 px-8 py-3.5 bg-gray-900 text-white rounded-2xl text-sm font-black shadow-xl hover:bg-black transition-all group">
          <FolderOpen className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
          读档
        </button>
      </div>
    </div>
  );
};
