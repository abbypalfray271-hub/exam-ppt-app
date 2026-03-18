'use client';

import React from 'react';
import { Question, useProjectStore } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { 
  Trash2, 
  BookOpen,
  ZoomIn,
  Maximize2,
  Minimize2,
  X,
  Play,
  ChevronLeft,
  ChevronRight,
  Monitor
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ResizableHandle } from './ResizableHandle';

// ============================================================
// 幻灯片数据模型
// ============================================================

export interface SlideData {
  type: 'title' | 'unified';
  questions: Question[];      // 该页包含的所有题目 (用于支持同屏多题)
}

/** 
 * 根据 questions 数组生成完整的幻灯片序列
 * 逻辑：如果连续的题目具有【完全相同】的 material (素材)，则将它们归并为同一张幻灯片。
 */
export function buildSlides(questions: Question[]): SlideData[] {
  const slides: SlideData[] = [{ type: 'title', questions: [] }];
  
  if (questions.length === 0) return slides;

  // === 防御性去重：确保即使 store 中已有重复数据，也不会产生重复幻灯片 ===
  const seen = new Set<string>();
  const dedupedQuestions = questions.filter(q => {
    const fp = (q.content || '').replace(/[\s\p{P}\p{S}]/gu, '').slice(0, 60);
    if (seen.has(fp) && fp.length > 0) return false;
    seen.add(fp);
    return true;
  });

  let currentGroup: Question[] = [dedupedQuestions[0]];
  
  for (let i = 1; i < dedupedQuestions.length; i++) {
    const prevQ = dedupedQuestions[i - 1];
    const currQ = dedupedQuestions[i];
    
    // 判断是否共用素材 (由于 material 可能很大，建议通过精准匹配判断)
    const sameMaterial = prevQ.material === currQ.material && !!prevQ.material;
    
    if (sameMaterial) {
      currentGroup.push(currQ);
    } else {
      slides.push({ type: 'unified', questions: currentGroup });
      currentGroup = [currQ];
    }
  }
  
  // 最后一组
  slides.push({ type: 'unified', questions: currentGroup });
  
  return slides;
}

// ============================================================
// 标题页幻灯片
// ============================================================

interface TitleSlideProps {
  editable?: boolean;
}

export const TitleSlide: React.FC<TitleSlideProps> = ({ editable = false }) => {
  const { projectName, setProjectName } = useProjectStore();

  return (
    <div className="w-full h-full bg-[#F8FAFC] flex flex-col items-center justify-center relative">
      {/* 装饰性背景圆 */}
      <div className="absolute top-[10%] right-[10%] w-[30%] h-[30%] bg-blue-500/5 rounded-full blur-[60px]" />
      <div className="absolute bottom-[10%] left-[10%] w-[25%] h-[25%] bg-purple-500/5 rounded-full blur-[60px]" />
      
      {editable ? (
        <input
          className="text-[2.2em] font-bold text-[#1e293b] text-center bg-transparent border-none outline-none w-[80%] hover:bg-gray-100/50 focus:bg-blue-50/50 rounded-xl px-4 py-2 transition-colors"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="点击编辑项目名..."
        />
      ) : (
        <h1 className="text-[2.2em] font-bold text-[#1e293b] text-center leading-tight px-[10%]">
          {projectName}
        </h1>
      )}
      <p className="text-[0.9em] text-[#64748b] mt-[4%] tracking-wide">
        助教工具：试卷题目极简分割
      </p>
    </div>
  );
};

// ============================================================
// 统一模板幻灯片：左素材 + 右侧多题目区块 (极简分割版)
// ============================================================

interface UnifiedSlideProps {
  questions: Question[];
  editable?: boolean;
}

export const UnifiedSlide: React.FC<UnifiedSlideProps> = ({ questions, editable = false }) => {
  const { 
    updateQuestion, 
    removeQuestion,
    examPages
  } = useProjectStore();

  // ======= 素材区/题目区 宽度比例（可拖拽调整） =======
  const [materialRatio, setMaterialRatio] = useState(55);
  const slideContainerRef = useRef<HTMLDivElement>(null);

  const handleMaterialResize = useCallback((dx: number) => {
    if (!slideContainerRef.current) return;
    const containerWidth = slideContainerRef.current.clientWidth;
    if (containerWidth <= 0) return;
    const deltaPercent = (dx / containerWidth) * 100;
    setMaterialRatio(prev => Math.max(30, Math.min(80, prev + deltaPercent)));
  }, []);

  // ======= 放大镜状态 =======
  const [selectedText, setSelectedText] = useState('');
  const [magnifierPos, setMagnifierPos] = useState<{ x: number; y: number } | null>(null);
  const materialRef = useRef<HTMLDivElement>(null);

  // 全局点击监听：点击空白处取消选中和放大镜
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (magnifierPos && materialRef.current && !materialRef.current.contains(e.target as Node)) {
        setSelectedText('');
        setMagnifierPos(null);
        window.getSelection()?.removeAllRanges(); // 取消浏览器的默认选中状态
      }
    };
    window.addEventListener('mousedown', handleGlobalClick);
    return () => window.removeEventListener('mousedown', handleGlobalClick);
  }, [magnifierPos]);

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      const text = selection.toString().trim();
      
      // 限制放大的字数，防止弹窗过大
      if (text.length > 50) {
        setSelectedText(text.substring(0, 50) + '...');
      } else {
        setSelectedText(text);
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      // 定位在选中文字的上方中心
      setMagnifierPos({
        x: rect.left + rect.width / 2,
        y: rect.top - 10, // 距离文字上方 10px
      });
    } else {
      setSelectedText('');
      setMagnifierPos(null);
    }
  };
  // =========================

  // ======= 题干放大弹窗状态 =======
  const [expandedQuestion, setExpandedQuestion] = useState<Question | null>(null);
  const [isMaterialExpanded, setIsMaterialExpanded] = useState(false);
  const [isDetailFullScreen, setIsDetailFullScreen] = useState(false);
  
  // 原文素材分页状态
  const firstQ = questions[0];
  const [materialPageIndex, setMaterialPageIndex] = useState(firstQ?.pageIndex || 0);

  // 素材全图缩放和平移状态
  const [zoomState, setZoomState] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // 当弹窗打开时，确保索引与当前题目同步 (如果题目有 pageIndex)
  useEffect(() => {
    if (isMaterialExpanded && firstQ?.pageIndex !== undefined) {
      setMaterialPageIndex(firstQ.pageIndex);
    }
  }, [isMaterialExpanded, firstQ?.pageIndex]);

  const hasMaterial = firstQ?.material && firstQ.material.trim().length > 0;
  const hasMaterialImage = !!firstQ?.materialImage;

  return (
    <div ref={slideContainerRef} className="w-full h-full bg-white flex">
      {/* 左侧素材区：宽度可拖拽调整 */}
      <div className="h-full bg-[#f8fafc] flex flex-col p-[1.5%] border-r border-gray-100" style={{ width: `${materialRatio}%` }}>
        <div 
          onClick={() => {
            if (hasMaterialImage || firstQ?.image || examPages?.length > 0) {
              setIsMaterialExpanded(true);
            }
          }}
          className="flex items-center gap-2 mb-[3%] cursor-pointer group hover:bg-gray-200/50 p-1 -ml-1 rounded transition-colors self-start"
          title="点击满屏放大阅读该素材"
        >
          <BookOpen className="w-[1.2em] h-[1.2em] text-[#64748b] group-hover:text-brand-primary transition-colors" />
          <span className="text-[0.65em] font-black text-[#64748b] tracking-wider uppercase group-hover:text-brand-primary transition-colors flex items-center gap-1">
            原文切片(整个切片)
            <Maximize2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </span>
        </div>
        
        <div className="flex-1 overflow-y-auto flex flex-col gap-2 custom-scrollbar">
          {hasMaterialImage ? (
            <div 
              onClick={() => setIsMaterialExpanded(true)}
              className="flex-1 rounded-xl flex items-start justify-center bg-white shadow-inner p-1 relative group border border-gray-100 cursor-zoom-in"
            >
              <img src={firstQ.materialImage} alt="素材原图" className="w-full h-full object-contain mix-blend-multiply" />
              {editable && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateQuestion(firstQ.id, { materialImage: undefined });
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : firstQ.image ? (
            <div 
              onClick={() => setIsMaterialExpanded(true)}
              className="flex-1 rounded-xl flex items-start bg-white shadow-inner p-1 border border-gray-100 cursor-zoom-in"
            >
              <img src={firstQ.image} alt="原文切片" className="w-full h-auto object-contain mix-blend-multiply" />
            </div>
          ) : hasMaterial ? (
            <div 
              ref={materialRef}
              className="flex-1 overflow-y-auto rounded-xl bg-white shadow-inner p-[5%] custom-scrollbar border border-gray-100 relative"
              onMouseUp={handleTextSelection}
            >
              <p className="text-[0.6em] text-gray-700 leading-[2.2] whitespace-pre-wrap font-medium selection:bg-brand-primary/20 selection:text-brand-primary cursor-text">
                {firstQ.material}
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#f1f5f9]/50 rounded-xl border-2 border-dashed border-gray-200">
              <BookOpen className="w-8 h-8 text-gray-200 mb-2" />
              <p className="text-[0.55em] text-gray-300 font-bold">暂无关联素材</p>
            </div>
          )}
        </div>
      </div>

      {/* 素材区 ↔ 题目区 可拖拽分隔条 */}
      <ResizableHandle onDrag={handleMaterialResize} />

      {/* 右侧题目聚合区：宽度自动适应 */}
      <div className="h-full flex flex-col p-[3%] gap-[3%] overflow-y-auto custom-scrollbar bg-white" style={{ width: `${100 - materialRatio}%` }}>
        {questions.map((q, qIdx) => (
          <div key={q.id} className="flex flex-col shrink-0">
            {/* 题干卡片 (点击展开看大图 + OCR文字) - 使用 div + role 避免 button 嵌套 */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                if (q.contentImage) setExpandedQuestion(q);
              }}
              className={cn(
                "w-full text-left flex items-start gap-[3%] p-[3%] rounded-xl transition-all duration-200 border",
                q.contentImage 
                  ? "border-gray-100 hover:border-brand-primary/30 hover:bg-brand-primary/5 hover:shadow-md cursor-pointer group" 
                  : "border-transparent cursor-default"
              )}
            >
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center gap-2">
                  <div className="bg-[#1e293b] text-white px-2 py-0.5 rounded shadow-sm shrink-0">
                    <span className="text-[0.7em] font-black italic tracking-tighter">Q{qIdx + 1}</span>
                  </div>
                  {editable ? (
                    <input
                      className="w-12 shrink-0 text-[1.05em] font-black text-[#1e293b] bg-transparent border-none outline-none hover:bg-white focus:bg-white rounded px-1 transition-colors"
                      value={q.title}
                      onChange={(e) => updateQuestion(q.id, { title: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <h3 className="shrink-0 text-[1.1em] font-black text-[#1e293b] leading-tight whitespace-nowrap">
                      {q.title || '题目'}
                    </h3>
                  )}
                  {/* 内容摘要紧跟标题，同一行 */}
                  {q.content && (
                    <p className="flex-1 text-[0.85em] text-gray-600 font-bold truncate">
                      {q.content.replace(/\n/g, ' ')}
                    </p>
                  )}
                </div>
                
                {q.contentImage && (
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1 text-brand-primary opacity-0 group-hover:opacity-100 transition-opacity px-1">
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-black tracking-wider uppercase">Click to Zoom</span>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('确定要删除这道题目吗？')) {
                          removeQuestion(q.id);
                        }
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                      title="删除题目"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 如果没有图片，兜底展示文字逻辑 (不再默认展示 textarea，除非处于 editable) */}
            {!q.contentImage && editable && (
              <div className="bg-gray-50 rounded-lg p-2 border border-gray-100 mt-2 ml-10">
                <textarea
                  className="w-full text-[0.75em] font-medium text-[#475569] leading-[1.8] bg-transparent border-none outline-none resize-none focus:ring-0 min-h-[3em]"
                  value={q.content}
                  onChange={(e) => updateQuestion(q.id, { content: e.target.value })}
                  placeholder="请输入或等待提取题目内容..."
                />
              </div>
            )}
            {!q.contentImage && !editable && q.content && (
               <div className="ml-10 mt-1 pl-3 border-l-2 border-gray-200">
                  <p className="text-[0.7em] text-gray-500 leading-relaxed max-h-20 overflow-hidden line-clamp-3">
                    {q.content}
                  </p>
               </div>
            )}
          </div>
        ))}
      </div>

      {/* 放大镜悬浮气泡 (挂载到全局) */}
      <AnimatePresence>
        {magnifierPos && selectedText && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ type: 'spring', bounce: 0.4, duration: 0.4 }}
            className="fixed z-50 pointer-events-none"
            style={{ 
              left: magnifierPos.x, 
              top: magnifierPos.y, 
              transform: 'translate(-50%, -100%)' // 锚点在其底部中心
            }}
          >
            <div className="bg-white rounded-2xl shadow-2xl border-2 border-brand-primary/30 p-4 max-w-sm flex items-start gap-3 backdrop-blur-xl bg-white/95">
              <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
                <ZoomIn className="w-4 h-4 text-brand-primary" />
              </div>
              <div className="flex-1">
                <span className="text-3xl font-black text-[#1e293b] leading-tight tracking-tight drop-shadow-sm">
                  {selectedText}
                </span>
              </div>
              
              {/* 向下的小箭头 */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-b-2 border-r-2 border-brand-primary/30 rotate-45 transform origin-center" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 题目原图看大图弹窗 (Modal - 上图下文) */}
      <AnimatePresence>
        {expandedQuestion && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300",
              isDetailFullScreen ? "p-0" : "p-8"
            )}
            onClick={() => {
              setExpandedQuestion(null);
              setIsDetailFullScreen(false);
            }} // 点击遮罩层关闭
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={cn(
                "relative bg-white shadow-2xl overflow-hidden flex flex-col transition-all duration-300 ease-in-out",
                isDetailFullScreen 
                  ? "w-screen h-screen rounded-none" 
                  : "max-w-5xl w-full max-h-[90vh] rounded-2xl"
              )}
              onClick={(e) => e.stopPropagation()} // 阻止冒泡，防止点击内容区关闭
            >
              {/* 弹窗头部栏 */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsDetailFullScreen(!isDetailFullScreen)}
                    className="p-2 hover:bg-brand-primary/10 rounded-lg transition-colors group"
                    title={isDetailFullScreen ? "还原窗口" : "全屏显示"}
                  >
                    {isDetailFullScreen ? (
                      <Minimize2 className="w-5 h-5 text-brand-primary group-hover:scale-110 transition-transform" />
                    ) : (
                      <Maximize2 className="w-5 h-5 text-brand-primary group-hover:scale-110 transition-transform" />
                    )}
                  </button>
                  <h3 className="text-lg font-black text-gray-800 tracking-tight flex-1 truncate pr-4">
                    题目详情：{expandedQuestion.title} {expandedQuestion.content ? expandedQuestion.content.split('\n')[0] : ''}
                  </h3>
                </div>
                <button
                  onClick={() => setExpandedQuestion(null)}
                  className="p-2 bg-gray-200 text-gray-600 rounded-full hover:bg-red-500 hover:text-white transition-all active:scale-95"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* 图文混合展示区 (可滚动) */}
              <div className="flex-1 overflow-auto p-6 custom-scrollbar flex flex-col gap-6 bg-[#f8fafc]">
                 {(() => {
                   const lines = expandedQuestion.content ? expandedQuestion.content.split('\n') : [];
                   const firstLine = lines[0] || '';
                   const remainingContent = lines.slice(1).join('\n');

                   return (
                     <div className="w-full flex flex-col gap-2">
                       <div className="flex items-center gap-2 text-gray-500 text-sm font-semibold ml-1">
                         <BookOpen className="w-4 h-4" />
                         <span>题目内容 (选项与正文)</span>
                       </div>
                       <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                         {editable ? (
                           <textarea
                             className="w-full text-xl font-bold text-[#1e293b] leading-loose bg-transparent border-none outline-none resize-y focus:ring-0 min-h-[12em] custom-scrollbar"
                             value={remainingContent}
                             onChange={(e) => {
                               const newContent = firstLine + (firstLine ? '\n' : '') + e.target.value;
                               updateQuestion(expandedQuestion.id, { content: newContent });
                               setExpandedQuestion({ ...expandedQuestion, content: newContent });
                             }}
                             placeholder="可以在此补充或修正题目内容..."
                           />
                         ) : (
                           <p className="text-xl font-bold text-[#1e293b] leading-loose whitespace-pre-wrap">
                             {remainingContent || '暂无更多内容'}
                           </p>
                         )}
                       </div>
                     </div>
                   );
                 })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

       {/* 原文素材全屏放大弹窗 */}
       <AnimatePresence>
         {isMaterialExpanded && (
           <motion.div
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-hidden"
             onClick={() => {
               setIsMaterialExpanded(false);
               setZoomState({ scale: 1, x: 0, y: 0 });
             }}
           >
             <motion.div
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="relative max-w-[95vw] max-h-[95vh] flex flex-col items-center"
               onClick={(e) => e.stopPropagation()}
             >
               <button
                 onClick={() => setIsMaterialExpanded(false)}
                 className="absolute -top-12 right-0 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors mb-4"
               >
                 <X className="w-6 h-6" />
               </button>

                {/* 素材主体图片: 优先使用选中的页码图片，若无则回退到 materialImage */}
                <div 
                  className={cn("relative group inline-block", zoomState.scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "")}
                  style={{
                    transform: `translate(${zoomState.x}px, ${zoomState.y}px) scale(${zoomState.scale})`,
                    transformOrigin: 'center center',
                    transition: isDragging ? 'none' : 'transform 0.2s ease-out'
                  }}
                  onPointerDown={(e) => {
                    if (zoomState.scale > 1) {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setIsDragging(true);
                      setDragStart({ x: e.clientX - zoomState.x, y: e.clientY - zoomState.y });
                    }
                  }}
                  onPointerMove={(e) => {
                    if (isDragging && zoomState.scale > 1) {
                      setZoomState(prev => ({
                        ...prev,
                        x: e.clientX - dragStart.x,
                        y: e.clientY - dragStart.y
                      }));
                    }
                  }}
                  onPointerUp={(e) => {
                    setIsDragging(false);
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }}
                  onPointerCancel={() => setIsDragging(false)}
                  onWheel={(e) => {
                    // 阻止页面默认滚动
                    e.preventDefault();
                    // 动态调整整体缩放倍数 (1.0 到 5.0)，以当前鼠标位置缩放会比较复杂，这里用简单的中心缩放
                    setZoomState(prev => {
                      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
                      let newScale = Math.min(Math.max(1, prev.scale * zoomFactor), 5.0);
                      
                      // 如果缩放回 1，重置位置
                      if (newScale === 1) {
                        return { scale: 1, x: 0, y: 0 };
                      }
                      
                      return { ...prev, scale: newScale };
                    });
                  }}
                >
                  <img 
                    src={firstQ.materialImage || firstQ.image || ((examPages && examPages.length > 0) ? examPages[materialPageIndex] : '')} 
                    alt="全屏原文切片" 
                    className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl bg-white block select-none pointer-events-none"
                    draggable={false}
                  />
                 
                 {/* 左右翻页按钮 (仅当有多个 examPages 时显示) */}
                 {examPages && examPages.length > 1 && (
                   <>
                     <button
                       onClick={(e) => {
                         e.stopPropagation();
                         setMaterialPageIndex(prev => Math.max(0, prev - 1));
                       }}
                       disabled={materialPageIndex === 0}
                       className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/20 hover:bg-black/50 text-white rounded-full backdrop-blur-md transition-all disabled:opacity-30 disabled:cursor-not-allowed group-hover:scale-110 active:scale-95 shadow-xl"
                     >
                       <ChevronLeft className="w-8 h-8" />
                     </button>
                     <button
                       onClick={(e) => {
                         e.stopPropagation();
                         setMaterialPageIndex(prev => Math.min(examPages.length - 1, prev + 1));
                       }}
                       disabled={materialPageIndex === examPages.length - 1}
                       className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/20 hover:bg-black/50 text-white rounded-full backdrop-blur-md transition-all disabled:opacity-30 disabled:cursor-not-allowed group-hover:scale-110 active:scale-95 shadow-xl"
                     >
                       <ChevronRight className="w-8 h-8" />
                     </button>
                   </>
                 )}
               </div>

               <div className="mt-4 px-6 py-2 bg-white/10 backdrop-blur-sm rounded-full border border-white/20 flex items-center gap-4">
                 <p className="text-white text-sm font-bold tracking-widest uppercase">
                   {examPages && examPages.length > 0 ? `原文第 ${materialPageIndex + 1} / ${examPages.length} 页` : '原文切片预览'}
                 </p>
               </div>
             </motion.div>
           </motion.div>
         )}
       </AnimatePresence>
    </div>
  );
};

// ============================================================
// 单张幻灯片容器（16:9 固定比例）
// ============================================================

interface SlideFrameProps {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  label?: string;
  onDelete?: () => void;
}

export const SlideFrame: React.FC<SlideFrameProps> = ({ children, selected, onClick, className, label, onDelete }) => {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "relative cursor-pointer group transition-all duration-200",
        className
      )}
    >
      {/* 16:9 比例容器 */}
      <div className={cn(
        "relative w-full aspect-[16/9] rounded-xl overflow-hidden shadow-md border-2 transition-all duration-200",
        selected 
          ? "border-brand-primary shadow-lg shadow-brand-primary/20 ring-2 ring-brand-primary/30"
          : "border-transparent hover:border-gray-300 hover:shadow-lg"
      )}>
        {children}
      </div>
      {/* 页码标签 */}
      {label && (
        <div className={cn(
          "absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-black px-2 py-0.5 rounded-full transition-colors",
          selected 
            ? "bg-brand-primary text-white"  
            : "bg-gray-200 text-gray-500 group-hover:bg-gray-300"
        )}>
          {label}
        </div>
      )}
      
      {/* 鼠标悬浮显示的删除按钮 */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-1 -right-1 p-1 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:scale-110 active:scale-90 z-20"
          title="删除此页"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
