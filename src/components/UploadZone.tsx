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
import { pdfToImages, wordToText, compressImage } from '@/lib/documentProcessor';
// 删掉原本的 Server Action 引用
// // import { parseFullDocumentAction } from '@/app/actions/ai';
import { importProjectJSON } from '@/lib/projectIO';


export const UploadZone = () => {
  const { 
    setExamImage, 
    setExamPages, 
    setExamText, 
    addQuestions,
    isProcessing, 
    setProcessing,
    examPages,
    examText,
    setView,
    examImageUrl,
    isCanvasOpen,
    setCanvasOpen,
    resetUpload
  } = useProjectStore();
  
  const [isDragActive, setIsDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [fileType, setFileType] = useState<'image' | 'pdf' | 'word' | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [autoDetectedRects, setAutoDetectedRects] = useState<NormalizedRect[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 初始化预览 (从 Store 恢复)
  React.useEffect(() => {
    if (examImageUrl && !preview) {
      setPreview(examImageUrl);
      setFileType('image');
    } else if (examPages.length > 0 && !preview) {
      setPreview(examPages[0]);
      setFileType('pdf');
      setPdfPages(examPages);
    }
  }, [examImageUrl, examPages, preview]);

  const handleWordParse = async () => {
    if (!examText) return;
    try {
      setProcessing(true);
      const response = await fetch('/api/ai-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parseFullDocument', images: examText })
      });
      const result = await response.json();
      if (result.success && result.data) {
        const questions: Question[] = result.data.map((q: any, idx: number) => ({
          ...q,
          id: crypto.randomUUID(),
          order: idx + 1,
          type: q.type || 'essay'
        }));
        addQuestions(questions);
        setView('editor');
      } else {
        throw new Error(result.error || '解析失败');
      }
    } catch (error) {
      console.error('Word parse error:', error);
      alert('解析过程中发生错误');
    } finally {
      setProcessing(false);
    }
  };

  const handleFile = async (file: File) => {
    if (!file) return;
    setFileName(file.name);
    setProcessing(true);
    try {
      if (file.type.startsWith('image/')) {
        const rawBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error('文件读取失败'));
          reader.readAsDataURL(file);
        });
        const compressed = await compressImage(rawBase64, 1600);
        setPreview(compressed);
        setExamImage(compressed);
        setFileType('image');
        setPdfPages([]);
      } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setFileType('pdf');
        const images = await pdfToImages(file);
        setPdfPages(images);
        setExamPages(images);
        if (images.length > 0) {
          setPreview(images[0]);
          setExamImage(images[0]);
          setCurrentPage(0);
        }
      } else if (
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
        file.name.endsWith('.docx')
      ) {
        setFileType('word');
        const text = await wordToText(file);
        setExamText(text);
        setPreview('word-placeholder');
        setPdfPages([]);
      }
    } catch (error) {
      console.error('File processing error:', error);
      alert('文件处理失败，请检查格式是否正确');
    } finally {
      setProcessing(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
      e.target.value = '';
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
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
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.docx"
              onChange={onChange}
            />
            
            <div className="bg-brand-primary/10 p-4 rounded-2xl mb-6">
              <Upload className="w-12 h-12 text-brand-primary" />
            </div>
            
            <h2 className="text-2xl font-bold mb-2">上传您的试卷</h2>
            <p className="text-gray-500 mb-8 max-w-sm">
              支持高清图片、PDF 或 Word 文档，我们将自动识别题目并为您生成精美的讲解演示稿。
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
                       fileType === 'word' ? '正在提取考题纯文本...' : 
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
            {fileType === 'image' || fileType === 'pdf' ? (
              <img 
                src={preview} 
                alt="试卷预览" 
                className="w-full h-full object-contain p-4"
              />
            ) : (
              <div className="flex flex-col items-center gap-6 p-12">
                <div className="w-32 h-32 rounded-3xl bg-blue-50 flex items-center justify-center shadow-2xl">
                  <FileCode className="w-16 h-16 text-blue-600" />
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">{fileName}</h3>
                  <p className="text-sm text-gray-500 uppercase tracking-widest font-black font-sans">
                    DOCX 文本识别就绪
                  </p>
                </div>
              </div>
            )}
            
            {fileType === 'pdf' && pdfPages.length > 1 && (
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
                setFileType(null); 
                setPdfPages([]); 
                setCurrentPage(0); 
                resetUpload();
              }}
              className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors backdrop-blur-md z-10"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {(fileType === 'image' || fileType === 'pdf') && (
                <button 
                  className="px-8 py-3 bg-brand-primary text-white rounded-full font-bold shadow-xl hover:scale-105 transition-transform flex items-center gap-2"
                  onClick={() => {
                    setAutoDetectedRects([]);
                    setCanvasOpen(true);
                  }}
                >
                  <Wand2 className="w-5 h-5" /> 开始框选题目
                </button>
              )}
              
              {fileType === 'word' && (
                <button 
                  className="px-8 py-3 bg-brand-secondary text-white rounded-full font-bold shadow-xl hover:scale-105 transition-transform flex items-center gap-2 disabled:opacity-50"
                  onClick={handleWordParse}
                  disabled={isProcessing}
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  <span>AI 一键解析全文</span>
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
                  <h3 className="text-2xl font-black text-gray-900 mb-3">AI 正在深度解析文档</h3>
                  <div className="space-y-2">
                    <p className="text-gray-500 text-sm max-w-sm mx-auto">
                      正在提取题目、解析与解题思路...
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

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
              pages={pdfPages.length > 0 ? pdfPages : (examPages.length > 0 ? examPages : [preview!])} 
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
      </AnimatePresence>

      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-4">
        {preview && (
          <button
            onClick={() => {
              setAutoDetectedRects([]);
              setCanvasOpen(true);
            }}
            className="flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white rounded-2xl text-sm font-black shadow-xl hover:bg-orange-600 transition-all active:scale-95 group border-none"
          >
            <Wand2 className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
            返回预处理
          </button>
        )}

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
