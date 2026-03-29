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
    fileType: storeFileType
  } = useProjectStore();

  
  const [isDragActive, setIsDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [fileType, setLocalFileType] = useState<'image' | 'pdf' | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);

  const [autoDetectedRects, setAutoDetectedRects] = useState<NormalizedRect[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  
  // 初始化预览 (从 Store 恢复)
  React.useEffect(() => {
    setMounted(true);
    if (examPages.length > 0) {
      setPdfPages(examPages);
      setLocalFileType('image'); // 开启多页模式
      if (!preview) {
        setPreview(examPages[0]);
        setExamImage(examPages[0]);
      }
    } else if (examImageUrl && !preview) {
      setPreview(examImageUrl);
      setLocalFileType('image');
    }
  }, [examPages, examImageUrl, preview]);

  // handleWordParse removed


  const handleFiles = async (files: File[], mode: 'replace' | 'append' = 'replace') => {
    if (!files || files.length === 0) return;
    
    setProcessing(true);
    try {
      // 检查首选处理模式
      const mainFile = files[0];
      if (mode === 'replace') {
        setFileName(files.length > 1 ? `${mainFile.name} 等 ${files.length} 个文件` : mainFile.name);
      }

      if (mainFile.type === 'application/pdf' || mainFile.name.toLowerCase().endsWith('.pdf')) {
        setLocalFileType('pdf');
        setFileType('pdf');
        const images = await pdfToImages(mainFile);
        
        if (mode === 'append') {
          const newPages = [...pdfPages, ...images];
          setPdfPages(newPages);
          setExamPages(newPages);
          setCurrentPage(pdfPages.length);
          setPreview(images[0]);
          setExamImage(images[0]);
        } else {
          setPdfPages(images);
          setExamPages(images);
          if (images.length > 0) {
            setPreview(images[0]);
            setExamImage(images[0]);
            setCurrentPage(0);
          }
        }
      } else {
        // 处理图片文件
        setLocalFileType('image');
        setFileType('image');

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
          const newPages = [...pdfPages, ...base64Images];
          setPdfPages(newPages);
          setExamPages(newPages);
          // 跳转到新添加的第一页
          setCurrentPage(pdfPages.length);
          setPreview(base64Images[0]);
          setExamImage(base64Images[0]);
        } else {
          setPdfPages(base64Images);
          setExamPages(base64Images);
          setPreview(base64Images[0]);
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

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      {/* 始终挂载的文件输入控件，确保 preview 切换时 fileInputRef 不为 null */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,application/pdf,.pdf"
        multiple
        onChange={(e) => {
          const files = e.target.files;
          if (!files) return;
          // 如果当前已经在预览模式，则默认为追加模式
          // 否则为替换模式
          const mode = preview ? 'append' : 'replace';
          handleFiles(Array.from(files), mode);
          e.target.value = '';
        }}
      />
      
      <AnimatePresence mode="wait">
        {!preview ? (
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
              {isProcessing && !preview && (
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
            {(fileType === 'image' || fileType === 'pdf') && (
              <img 
                src={preview} 
                alt="试卷预览" 
                className="w-full h-full object-contain p-4"
              />
            )}

            
            {(fileType === 'pdf' || (fileType === 'image' && pdfPages.length > 1)) && pdfPages.length > 1 && (

              <div className="absolute top-4 left-4 flex gap-2 z-10">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    const prevIdx = Math.max(0, currentPage - 1);
                    setCurrentPage(prevIdx);
                    setPreview(pdfPages[prevIdx]);
                    setExamImage(pdfPages[prevIdx]);
                  }}
                  disabled={currentPage === 0}
                  className="p-2 bg-black/50 text-white rounded-lg disabled:opacity-30 backdrop-blur-md"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="px-3 py-1 bg-black/50 text-white rounded-lg text-xs font-bold flex items-center backdrop-blur-md">
                  {currentPage + 1} / {pdfPages.length}
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    const nextIdx = Math.min(pdfPages.length - 1, currentPage + 1);
                    setCurrentPage(nextIdx);
                    setPreview(pdfPages[nextIdx]);
                    setExamImage(pdfPages[nextIdx]);
                  }}
                  disabled={currentPage === pdfPages.length - 1}
                  className="p-2 bg-black/50 text-white rounded-lg disabled:opacity-30 backdrop-blur-md"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <button 
              onClick={() => { 
                setPreview(null); 
                setLocalFileType(null); 
                setPdfPages([]); 
                setCurrentPage(0); 
                resetUpload();
              }}

              className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors backdrop-blur-md z-10"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300">
              {(fileType === 'image' || fileType === 'pdf') && (
                <button 
                  className="px-8 py-3 bg-brand-primary text-white rounded-full font-bold shadow-xl hover:scale-105 transition-transform flex items-center gap-2 whitespace-nowrap"
                  onClick={() => {
                    setAutoDetectedRects([]);
                    setCanvasOpen(true);
                  }}
                >
                  <Wand2 className="w-5 h-5" /> 开始框选题目
                </button>
              )}
              
              {/* [NEW] 允许在预览态继续添加照片（由于 PDF 本身是静态的一般不追加，此处限定为 image 模式或 PDF 各页均显示） */}
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
              {isProcessing && preview && (
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
                pages={examPages.length > 0 ? examPages : (pdfPages.length > 0 ? pdfPages : [preview!])} 
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
