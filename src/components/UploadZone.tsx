'use client';

import React, { useCallback, useState, useRef } from 'react';
import { 
  Upload, Image as ImageIcon, FileText, X, Wand2, 
  FileCode, Sparkles, ChevronLeft, ChevronRight, Loader2, FolderOpen
} from 'lucide-react';
import { useProjectStore, Question } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ExtractionCanvas } from './ExtractionCanvas';
import { pdfToImages, wordToText, compressImage, cropImageByBox } from '@/lib/documentProcessor';
import { parseFullDocumentAction } from '@/app/actions/ai';
import { importProjectJSON } from '@/lib/projectIO';

export const UploadZone = () => {
  const { 
    setExamImage, 
    setExamPages, 
    setExamText, 
    setQuestions,
    addQuestions,
    isProcessing, 
    setProcessing,
    examPages,
    examText,
    setView,
    examImageUrl,
    currentMode,
    isCanvasOpen,
    setCanvasOpen
  } = useProjectStore();
  
  const [isDragActive, setIsDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [fileType, setFileType] = useState<'image' | 'pdf' | 'word' | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseProgress, setParseProgress] = useState<{current: number; total: number} | null>(null);
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

  const handleFullParse = async () => {
    setProcessing(true);
    // 不再清空已有题目，新解析结果会追加到现有题目后面
    let allExtractedQuestions: Question[] = [];
    
    try {
      if (fileType === 'pdf' || (fileType === 'image' && examPages.length > 0)) {
        const pages = examPages.length > 0 ? examPages : [preview!];
        
        // === 加速策略: 降低单批数量，提高并发上限 ===
        // 因为 AI Prompt 复杂度变高（要求精确切分大阅读题和框选），
        // 如果把多页塞给同一个请求，模型处理时长会指数级增加。改用 1页1发 + 高并发。
        const PAGES_PER_BATCH = 1;  
        const MAX_CONCURRENCY = 8; // 提升并发数以榨干 API 吞吐量
        
        // 将页面分批: [0,1,2], [3,4,5], [6,7,8], ...
        const batches: string[][] = [];
        for (let i = 0; i < pages.length; i += PAGES_PER_BATCH) {
          batches.push(pages.slice(i, i + PAGES_PER_BATCH));
        }
        
        setParseProgress({ current: 0, total: batches.length });
        let completedBatches = 0;
        
        // 带并发限制的批处理执行器
        const processBatch = async (batch: string[], batchIndex: number) => {
          // 直接将多页图片传入，API 支持多图输入
          const result = await parseFullDocumentAction(batch);
          
          completedBatches++;
          setParseProgress({ current: completedBatches, total: batches.length });
          
          if (result.success && result.data) {
            const newQuestions: Question[] = result.data.map((q: any, idx: number) => ({
              ...q,
              id: crypto.randomUUID(),
              order: (batchIndex * PAGES_PER_BATCH * 10) + idx + 1, // 粗排保证批次顺序
              type: q.type || 'essay',
              pageIndex: batchIndex * PAGES_PER_BATCH // 记录该题来源自哪一页
            }));
            allExtractedQuestions.push(...newQuestions);
          } else {
            console.warn(`批次 ${batchIndex + 1} 解析失败:`, result.error);
          }
        };
        
        // 以滑动窗口方式并发执行批次
        for (let i = 0; i < batches.length; i += MAX_CONCURRENCY) {
          const concurrentBatches = batches.slice(i, i + MAX_CONCURRENCY);
          await Promise.all(
            concurrentBatches.map((batch, j) => processBatch(batch, i + j))
          );
        }
        
        if (allExtractedQuestions.length > 0) {
          // 按照 order 重新排序
          allExtractedQuestions.sort((a, b) => a.order - b.order);

          // === 强化去重策略 ===
          // AI 跨页识别时可能返回同一题的略微不同版本。
          // 策略：激进标准化（去除所有标点、空格、换行），同时按 title+content 双指纹拦截。
          const uniqueQuestions: Question[] = [];
          const seenFingerprints = new Set<string>();

          const normalize = (text: string) => 
            text.replace(/[\s\p{P}\p{S}]/gu, '').slice(0, 60); // 去除所有空白+标点，取前60字符

          allExtractedQuestions.forEach(q => {
            const titleFp = normalize(q.title || '');
            const contentFp = normalize(q.content || '');
            const fingerprint = `${titleFp}::${contentFp}`;
            
            if (!seenFingerprints.has(fingerprint)) {
              seenFingerprints.add(fingerprint);
              uniqueQuestions.push(q);
            } else {
              console.log('自动拦截重复题目:', q.title, '指纹:', fingerprint);
            }
          });

          // 自动模式统一手动模式：直接后台裁剪，跳过审阅弹窗，直达 Editor!
          setParseProgress({ current: 100, total: 100 });
          for (let i = 0; i < uniqueQuestions.length; i++) {
            const q = uniqueQuestions[i];
            const pageIdx = q.pageIndex || 0;
            const base64Img = pages[pageIdx];
            if (!base64Img) continue;

            if (q.materialBox && q.materialBox.length === 4) {
              q.materialImage = await cropImageByBox(base64Img, q.materialBox as [number,number,number,number]) || undefined;
            }
            if (q.contentBox && q.contentBox.length === 4) {
              const [ymin, xmin, ymax, xmax] = q.contentBox;
              if (ymax > ymin && xmax > xmin) {
                q.contentImage = await cropImageByBox(base64Img, q.contentBox as [number,number,number,number]) || undefined;
              }
            }
          }
          addQuestions(uniqueQuestions);
          setView('editor');
        } else {
          alert('未能识别到题目，请重试');
        }
      } else if (fileType === 'word' && examText) {
        setParseProgress({ current: 1, total: 1 });
        const result = await parseFullDocumentAction(examText);
        if (result.success && result.data) {
          const questions: Question[] = result.data.map((q: any, idx: number) => ({
            ...q,
            id: crypto.randomUUID(),
            order: idx + 1,
            type: q.type || 'essay'
          }));
          addQuestions(questions);
          setView('editor');
        }
      }
    } catch (error) {
      console.error('Full parse error:', error);
      alert('解析过程中发生错误');
    } finally {
      setProcessing(false);
      setParseProgress(null);
    }
  };

  // Bug 4 修复: 图片文件改用 async/await 模式避免 setProcessing 时序问题
  const handleFile = async (file: File) => {
    if (!file) return;
    
    setFileName(file.name);
    setProcessing(true);
    
    try {
      if (file.type.startsWith('image/')) {
        // 使用 Promise 包装 FileReader，确保 setProcessing 在 finally 中统一处理
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
        return;
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
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
      // 重置 value，允许连续上传同一个文件触发 onChange
      e.target.value = '';
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <AnimatePresence mode="wait">
        {!preview ? (
          <motion.div
            key="upload-panel"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{ pointerEvents: 'auto' }}
            className={cn(
              "relative aspect-[16/9] mt-8 border-4 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all bg-white group shadow-sm",
              !isProcessing ? "border-gray-200 cursor-pointer hover:border-brand-primary hover:bg-brand-primary/5 hover:shadow-xl active:scale-[0.99]" : "border-brand-primary/30"
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={onDrop}
            onClick={() => {
              if (isProcessing) return;
              // 优先使用 Ref，兜底使用 ID
              const input = fileInputRef.current || document.getElementById('file-upload') as HTMLInputElement;
              input?.click();
            }}
          >
            <input
              ref={fileInputRef}
              id="file-upload"
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
              支持高清图片、PDF 或 Word 文档，我们将自动识别题目并为您生成精美的讲解 PPT。
            </p>


            {/* 动态上传遮罩 */}
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
                    <span key="sparkles"><Sparkles className="w-4 h-4" /></span>
                    <span key="desc">
                      {fileType === 'pdf' ? '正在进行高清分页渲染...' : 
                       fileType === 'word' ? '正在提取考题纯文本...' : 
                       '正在优化图片清晰度...'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-6 tracking-widest uppercase font-black">
                    Please Wait · Processing Material
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
                alt="Exam Preview" 
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
                setExamPages([]);
                setExamText('');
                setExamImage(undefined);
              }}
              className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors backdrop-blur-md z-10"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {fileType === 'image' || fileType === 'pdf' ? (
                <button 
                  className="px-8 py-3 bg-brand-primary text-white rounded-full font-bold shadow-xl hover:scale-105 transition-transform flex items-center gap-2"
                  onClick={() => setCanvasOpen(true)}
                >
                  <Wand2 className="w-5 h-5" /> 框选提取题目
                </button>
              ) : null}
              
              <button 
                className="px-8 py-3 bg-brand-secondary text-white rounded-full font-bold shadow-xl hover:scale-105 transition-transform flex items-center gap-2 disabled:opacity-50"
                onClick={handleFullParse}
                disabled={isProcessing}
              >
                <span key="icon" className="flex items-center">
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                </span>
                <span key="text">
                  {fileType === 'word' ? 'AI 一键全卷解析' : 'AI 全页自动识别'}
                </span>
              </button>
            </div>

            <AnimatePresence>
              {/* AI 解析专用遮罩 (已有预览图时触发) */}
              {isProcessing && preview && (
                <motion.div
                  key="processing-mask2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-brand-secondary/10 backdrop-blur-md z-[45] flex flex-col items-center justify-center p-12 text-center"
                >
                  <div className="relative mb-10">
                    <motion.div 
                      animate={{ 
                        rotate: 360,
                        scale: [1, 1.1, 1]
                      }}
                      transition={{ 
                        rotate: { duration: 3, repeat: Infinity, ease: "linear" },
                        scale: { duration: 2, repeat: Infinity }
                      }}
                      className="w-24 h-24 rounded-full border-4 border-t-brand-secondary border-r-transparent border-b-brand-secondary border-l-transparent"
                    />
                    <Sparkles className="absolute inset-0 m-auto w-10 h-10 text-brand-secondary animate-pulse" />
                  </div>
                  
                  <h3 className="text-2xl font-black text-gray-900 mb-3">AI 正在深度解析全卷</h3>
                  <div className="space-y-2">
                    <p className="text-gray-600 font-medium italic">
                      <span key="progress">
                        {parseProgress ? `正在识别第 ${parseProgress.current} / ${parseProgress.total} 页...` : '准备中...'}
                      </span>
                    </p>
                    <p className="text-gray-500 text-sm max-w-sm mx-auto">
                      正在提取题目、解析与解题思路，已发现 {useProjectStore.getState().questions.length} 道题目
                    </p>
                    <p className="text-[10px] text-brand-secondary font-black tracking-[0.2em] uppercase mt-4">
                      Gemini 2.0 Multimodal Processing
                    </p>
                  </div>

                  <div className="mt-12 w-64 h-2 bg-gray-200 rounded-full overflow-hidden border shadow-inner">
                    <motion.div 
                      key={parseProgress?.current}
                      initial={{ width: `${((parseProgress?.current || 1) - 1) / (parseProgress?.total || 1) * 100}%` }}
                      animate={{ width: `${(parseProgress?.current || 1) / (parseProgress?.total || 1) * 100}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className="h-full bg-brand-secondary shadow-[0_0_12px_rgba(var(--brand-secondary-rgb),0.5)]"
                    />
                  </div>
                  <p className="mt-4 text-[10px] font-bold text-gray-400">
                    STABILITY MODE ENABLED · PAGINATED STREAMING
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* === 全屏框选画布（提升到顶层，脱离 motion.div 的 transform 上下文） === */}
      <AnimatePresence>
        {isCanvasOpen && (
          <motion.div
            key="extraction-canvas"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] bg-white"
          >
            <ExtractionCanvas 
              pages={pdfPages.length > 0 ? pdfPages : (examPages.length > 0 ? examPages : [preview!])} 
              initialPageIndex={currentPage}
              onComplete={() => setCanvasOpen(false)}
            />
            <button 
              onClick={() => setCanvasOpen(false)}
              className="fixed top-2.5 right-60 z-[1000] p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>


      {/* 右下角读档按钮 */}
      <button
        onClick={() => importProjectJSON()}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-2.5 bg-white/90 backdrop-blur-md rounded-full text-sm font-bold shadow-lg border hover:bg-white hover:shadow-xl hover:scale-105 transition-all active:scale-95 group"
      >
        <FolderOpen className="w-4 h-4 text-brand-secondary group-hover:-translate-y-0.5 transition-transform" />
        读档
      </button>
    </div>
  );
};
