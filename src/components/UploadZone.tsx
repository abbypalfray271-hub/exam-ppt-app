'use client';

import React, { useCallback, useState, useRef } from 'react';
import { 
  Upload, Image as ImageIcon, FileText, X, Wand2, 
  FileCode, Sparkles, ChevronLeft, ChevronRight, Loader2, FolderOpen
} from 'lucide-react';
import { useProjectStore, Question } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ExtractionCanvas, NormalizedRect } from './ExtractionCanvas';
import { pdfToImages, compressImage } from '@/lib/documentProcessor';
import { createPortal } from 'react-dom';

import { importProjectJSON } from '@/lib/projectIO';

/**
 * 上传区组件 (P1 重构版)
 * 
 * 核心改动：消除了双重状态源 (Single Source of Truth)
 * - 删除了本地 pdfPages, preview, localFileType 状态
 * - 全部使用 Store 中的 examPages, examImageUrl, fileType 驱动
 * - preview 由 examPages[currentPage] 派生，不再独立维护
 */
export const UploadZone = () => {
  const { 
    setExamImage, 
    setExamPages, 
    addQuestions,
    isProcessing, 
    setProcessing,
    examPages,
    setView,
    examImageUrl,
    isCanvasOpen,
    setCanvasOpen,
    resetUpload,
    setFileType,
    fileType   // [P1] 直接使用 Store 中的 fileType，不再维护本地副本
  } = useProjectStore();

  // === 仅保留纯 UI 状态 ===
  const [isDragActive, setIsDragActive] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);       // 当前预览页码 (纯 UI 导航)
  const [fileName, setFileName] = useState<string | null>(null);
  const [autoDetectedRects, setAutoDetectedRects] = useState<NormalizedRect[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  // [P1] preview 由 Store 派生，不再独立维护
  const preview = examPages.length > 0 ? examPages[currentPage] : examImageUrl || null;
  const hasContent = examPages.length > 0 || !!examImageUrl;

  // 初始化：仅处理 mounted 状态
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // 当 examPages 变化且 currentPage 越界时，自动修正
  React.useEffect(() => {
    if (examPages.length > 0 && currentPage >= examPages.length) {
      setCurrentPage(examPages.length - 1);
    }
  }, [examPages, currentPage]);

  const handleFiles = async (files: File[], mode: 'replace' | 'append' = 'replace') => {
    if (!files || files.length === 0) return;
    
    setProcessing(true);
    try {
      const mainFile = files[0];
      if (mode === 'replace') {
        setFileName(files.length > 1 ? `${mainFile.name} 等 ${files.length} 个文件` : mainFile.name);
      }

      if (mainFile.type === 'application/pdf' || mainFile.name.toLowerCase().endsWith('.pdf')) {
        setFileType('pdf');     // [P1] 只写 Store，不再双写
        const images = await pdfToImages(mainFile);
        
        if (mode === 'append') {
          const newPages = [...examPages, ...images];
          setExamPages(newPages);
          setCurrentPage(examPages.length); // 跳到新页
          if (images.length > 0) setExamImage(images[0]);
        } else {
          setExamPages(images);
          if (images.length > 0) {
            setExamImage(images[0]);
            setCurrentPage(0);
          }
        }
      } else {
        // 处理图片文件
        setFileType('image');   // [P1] 只写 Store

        const imageFiles = files.filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) {
           if (mode === 'replace') setFileName(null);
           return;
        }

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
          const newPages = [...examPages, ...base64Images];
          setExamPages(newPages);
          setCurrentPage(examPages.length); // 跳到新添加的第一页
          setExamImage(base64Images[0]);
        } else {
          setExamPages(base64Images);
          setExamImage(base64Images[0]);
          setCurrentPage(0);
        }
      }
    } catch (error: any) {
      console.error('File processing error:', error);
      alert(`无法处理此文件，建议更新浏览器、换手机尝试，或检查文件是否损坏。\n详细错误: ${error?.message?.slice(0, 40) || '未知异常'}`);
    } finally {
      setProcessing(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    handleFiles(Array.from(e.dataTransfer.files));
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      handleFiles(Array.from(files));
      e.target.value = '';
    }
  };

  // [P1] 清除预览：只需重置 Store，本地 currentPage 归零即可
  const handleClearPreview = () => {
    setCurrentPage(0);
    resetUpload();
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      {/* 始终挂载的文件输入控件 */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,application/pdf,.pdf"
        multiple
        onChange={(e) => {
          const files = e.target.files;
          if (!files) return;
          // 如果当前已经有内容，则默认为追加模式
          const mode = hasContent ? 'append' : 'replace';
          handleFiles(Array.from(files), mode);
          e.target.value = '';
        }}
      />
      
      <AnimatePresence mode="wait">
        {!hasContent ? (
          <motion.div
            key="upload-panel"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              "relative aspect-[16/9] mt-8 border-4 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all bg-white group shadow-sm",
              !isProcessing ? "border-gray-200 cursor-pointer hover:border-brand-primary hover:bg-brand-primary/5 hover:shadow-xl active:scale-[0.99]" : "border-brand-primary/30"
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={onDrop}
            onClick={() => {
              if (isProcessing) return;
              fileInputRef.current?.click();
            }}
          >
            
            <div className="bg-brand-primary/10 p-4 rounded-2xl mb-6">
              <Upload className="w-12 h-12 text-brand-primary" />
            </div>
            
            <h2 className="text-2xl font-bold mb-2">上传您的试卷</h2>
            <p className="text-gray-500 mb-8 max-w-sm text-center">
              支持高清图片或 PDF 文档，我们将自动识别题目并为您生成精美的讲解课件。
            </p>

            <AnimatePresence>
              {isProcessing && !hasContent && (
                <motion.div
                  key="processing-mask1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-white/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-8"
                >
                  <div className="relative">
                    <Loader2 className="w-16 h-16 text-brand-primary animate-spin" />
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute inset-0 bg-brand-primary/20 rounded-full blur-2xl" 
                    />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mt-8 mb-2">正在处理您的试卷</h3>
                  <div className="flex items-center gap-2 text-brand-primary font-medium animate-pulse">
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {fileType === 'pdf' ? '正在进行高清分页渲染...' : 
                       '正在优化图片清晰度...'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-6 tracking-widest uppercase font-black">
                    请稍后 · 正在处理素材
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            key="preview-panel"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative rounded-3xl overflow-hidden glass-panel border shadow-2xl aspect-[3/4] max-h-[70vh] group flex flex-col items-center justify-center"
          >
            {preview && (
              <img 
                src={preview} 
                alt="试卷预览" 
                className="w-full h-full object-contain p-4"
              />
            )}

            {/* 多页导航控件 */}
            {examPages.length > 1 && (
              <div className="absolute top-4 left-4 flex gap-2 z-10">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    const prevIdx = Math.max(0, currentPage - 1);
                    setCurrentPage(prevIdx);
                    setExamImage(examPages[prevIdx]);
                  }}
                  disabled={currentPage === 0}
                  className="p-2 bg-black/50 text-white rounded-lg disabled:opacity-30 backdrop-blur-md"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="px-3 py-1 bg-black/50 text-white rounded-lg text-xs font-bold flex items-center backdrop-blur-md">
                  {currentPage + 1} / {examPages.length}
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    const nextIdx = Math.min(examPages.length - 1, currentPage + 1);
                    setCurrentPage(nextIdx);
                    setExamImage(examPages[nextIdx]);
                  }}
                  disabled={currentPage === examPages.length - 1}
                  className="p-2 bg-black/50 text-white rounded-lg disabled:opacity-30 backdrop-blur-md"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 关闭预览按钮 */}
            <button 
              onClick={handleClearPreview}
              className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors backdrop-blur-md z-10"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300">
              <button 
                className="px-8 py-3 bg-brand-primary text-white rounded-full font-bold shadow-xl hover:scale-105 transition-transform flex items-center gap-2 whitespace-nowrap"
                onClick={() => {
                  setAutoDetectedRects([]);
                  setCanvasOpen(true);
                }}
              >
                <Wand2 className="w-5 h-5" /> 开始框选题目
              </button>
              
              {/* 允许在预览态继续添加照片 */}
              {fileType === 'image' && (
                <button 
                  className="px-6 py-3 bg-gray-900 text-white border border-gray-700 rounded-full font-bold shadow-xl hover:bg-black transition-all flex items-center gap-2 whitespace-nowrap"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  <ImageIcon className="w-5 h-5" /> 继续拍照/添加
                </button>
              )}
            </div>

            <AnimatePresence>
              {isProcessing && hasContent && (
                <motion.div
                  key="processing-mask-ai"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-brand-secondary/10 backdrop-blur-md z-[45] flex flex-col items-center justify-center p-12 text-center"
                >
                  <Loader2 className="w-16 h-16 text-brand-secondary animate-spin mb-6" />
                  <h3 className="text-2xl font-black text-gray-900 mb-3">正在处理文档</h3>
                  <div className="space-y-2">
                    <p className="text-gray-500 text-sm max-w-sm mx-auto">
                      正在转换页面为高清图片，请稍候...
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {mounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isCanvasOpen && (
            <motion.div
              key="extraction-canvas-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[999] bg-white"
            >
              <ExtractionCanvas 
                pages={examPages.length > 0 ? examPages : (preview ? [preview] : [])} 
                initialPageIndex={currentPage}
                initialNormalizedRects={autoDetectedRects}
                onComplete={() => {
                  setCanvasOpen(false);
                  setAutoDetectedRects([]);
                }}
                onClose={() => {
                  setCanvasOpen(false);
                  setAutoDetectedRects([]);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-4">
        <button
          onClick={() => importProjectJSON()}
          className="flex items-center gap-2 px-8 py-3.5 bg-gray-900 text-white rounded-2xl text-sm font-black shadow-xl hover:bg-black transition-all active:scale-95 group border-none"
        >
          <FolderOpen className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
          读档
        </button>
      </div>
    </div>
  );
};
