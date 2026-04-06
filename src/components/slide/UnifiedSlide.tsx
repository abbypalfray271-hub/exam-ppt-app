'use client';

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Question, useProjectStore } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { RichExamContent } from '@/components/RichExamContent';
import { cleanLatexSymbols } from '@/lib/latexCleaner';
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
  Monitor,
  EyeOff,
  CheckSquare,
  Image as ImageIcon,
  Zap,
  Brain
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ResizableHandle } from '../ResizableHandle';
import { ImageLightbox } from './ImageLightbox';
import { MaterialViewer } from './MaterialViewer';
import { QuestionDetailModal } from './QuestionDetailModal';
import { AnswerMasks } from './AnswerMasks';

// Re-export from new modules for backward compatibility (Editor.tsx imports from here)

// ============================================================
// 内联定义已提取到独立模块:
// - SlideData, buildSlides → @/lib/slideBuilder
// - TitleSlide → @/components/slide/TitleSlide
// - cleanLatexSymbols → @/lib/latexCleaner
// ============================================================

// ============================================================
// 统一模板幻灯片：左素材 + 右侧多题目区块 (极简分割版)
// ============================================================

interface UnifiedSlideProps {
  questions: Question[];
  editable?: boolean;
  forceMask?: boolean; // [NEW] 全局打码状态，用于侧边栏预览
}

export const UnifiedSlide: React.FC<UnifiedSlideProps> = ({ questions, editable = false, forceMask = false }) => {
  const { 
    updateQuestion, 
    removeQuestion,
    removeQuestions,
    examPages,
    layoutConfig,
    updateLayoutConfig
  } = useProjectStore();

  // ======= 素材区/题目区 宽度比例（可从全局 Store 获取并支持持久化） =======
  const { materialRatio, isRightPanelOpen } = layoutConfig;
  const slideContainerRef = useRef<HTMLDivElement>(null);

  const handleMaterialResize = useCallback((dx: number) => {
    if (!slideContainerRef.current) return;
    const containerWidth = slideContainerRef.current.clientWidth;
    if (containerWidth <= 0) return;
    const deltaPercent = (dx / containerWidth) * 100;
    const newRatio = Math.max(30, Math.min(80, materialRatio + deltaPercent));
    updateLayoutConfig({ materialRatio: newRatio });
  }, [materialRatio, updateLayoutConfig]);

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

  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  
  // 核心优化：实时从 Store 中获取最新的题目数据，确保脑图等修改能即时响应
  const expandedQuestion = useMemo(() => 
    selectedQuestionId ? questions.find(q => q.id === selectedQuestionId) || null : null
  , [selectedQuestionId, questions]);

  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [isMaterialExpanded, setIsMaterialExpanded] = useState(false);
  const [selectedQIds, setSelectedQIds] = useState<string[]>([]); // [NEW] 批量勾选的题目 ID
  
  // 原文素材分页状态
  const firstQ = questions[0];
  const [materialPageIndex, setMaterialPageIndex] = useState(firstQ?.pageIndex || 0);

  // 当弹窗打开时，确保索引与当前题目同步 (如果题目有 pageIndex)
  useEffect(() => {
    if (isMaterialExpanded && firstQ?.pageIndex !== undefined) {
      setMaterialPageIndex(firstQ.pageIndex);
    }
  }, [isMaterialExpanded, firstQ?.pageIndex]);

  const hasMaterial = firstQ?.material && firstQ.material.trim().length > 0;
  const hasMaterialImage = !!firstQ?.materialImage;

  return (
    <div 
      ref={slideContainerRef} 
      className={cn(
        "w-full h-full bg-white overflow-hidden relative",
        isRightPanelOpen ? "flex flex-col md:grid" : "block"
      )} 
      style={{ gridTemplateColumns: isRightPanelOpen ? `${materialRatio}% auto minmax(0, 1fr)` : '1fr' }}
    >
      {/* 左侧素材区：手机端占据上半部分，电脑端占据左半部分 */}
      <div className="flex-[4] md:flex-none md:h-full bg-[#f8fafc] flex flex-col p-2 md:p-[1.5%] border-b md:border-b-0 md:border-r border-gray-100 min-h-0 md:min-w-0 overflow-hidden relative">
        <div 
          className="flex items-center gap-2 mb-2 md:mb-[4%] px-3 py-1.5 bg-slate-900 text-white rounded-lg self-start shadow-xl border border-white/20"
        >
          <BookOpen className="w-5 h-5" />
          <span className="text-xs font-black uppercase tracking-widest">
            原文切片
          </span>
        </div>
        
        <div className="flex-1 overflow-y-auto flex flex-col gap-2 custom-scrollbar min-h-0 min-w-0">
          {hasMaterialImage ? (
            <div 
              className="w-full shrink-0 rounded-xl flex items-start justify-center bg-white shadow-inner p-1 relative border border-gray-100 group cursor-pointer overflow-hidden transition-all duration-300 hover:border-brand-primary/50 hover:shadow-lg"
              onClick={() => setIsMaterialExpanded(true)}
              title="点击全屏查看原文切片"
            >
              <div className="relative inline-flex w-full overflow-hidden rounded-lg">
                <img src={firstQ.materialImage} alt="素材原图" className="w-full h-auto object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.02]" />
                <AnswerMasks questions={questions} />
                
                {/* 悬浮全屏提示遮罩 */}
                <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none z-20">
                  <div className="bg-black/70 text-white px-4 py-2 rounded-full flex items-center gap-2 backdrop-blur-md shadow-2xl transform scale-90 group-hover:scale-100 transition-all duration-300">
                    <Maximize2 className="w-4 h-4" />
                    <span className="text-sm font-bold tracking-widest">全屏查看</span>
                  </div>
                </div>
              </div>
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
          ) : (firstQ.images && firstQ.images.length > 0) || firstQ.image ? (
            <div 
              className="w-full shrink-0 rounded-xl flex flex-col items-center justify-center bg-white shadow-inner p-1 relative border border-gray-100 group cursor-pointer overflow-hidden transition-all duration-300 hover:border-brand-primary/50 hover:shadow-lg gap-1"
              onClick={() => setIsMaterialExpanded(true)}
              title="点击全屏查看原文切片"
            >
              <div className="relative flex flex-col w-full overflow-hidden rounded-lg bg-gray-100/50">
                {(firstQ.images && firstQ.images.length > 0 ? firstQ.images : [firstQ.image]).map((imgSrc, idx) => (
                  <img key={idx} src={imgSrc} alt={`原文切片-${idx}`} className={cn("w-full h-auto object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.02]", idx > 0 && "border-t-[2px] border-dashed border-gray-400/50 mt-[1px]")} />
                ))}
                
                {/* 遮罩由于原图已碎片化，仅附着于顶部容器，在画廊模式下通常很少使用去答案功能 */}
                <AnswerMasks questions={questions} />
                
                {/* 悬浮全屏提示遮罩 */}
                <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none z-20">
                  <div className="bg-black/70 text-white px-4 py-2 rounded-full flex items-center gap-2 backdrop-blur-md shadow-2xl transform scale-90 group-hover:scale-100 transition-all duration-300">
                    <Maximize2 className="w-4 h-4" />
                    <span className="text-sm font-bold tracking-widest">全屏查看</span>
                  </div>
                </div>
              </div>
            </div>
          ) : hasMaterial ? (
            <div 
              ref={materialRef}
              className="flex-1 overflow-y-auto rounded-xl bg-white shadow-inner p-[5%] custom-scrollbar border border-gray-100 relative min-h-0 min-w-0"
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

      {/* 素材区 ↔ 题目区 可拖拽分隔条 (移动端隐藏此横向拖拽条) */}
      {isRightPanelOpen && <div className="hidden md:flex"><ResizableHandle onDrag={handleMaterialResize} /></div>}

      {/* 右侧题目聚合区：自动占满后续 */}
      {isRightPanelOpen ? (
        <div className="flex-[6] md:flex-none md:h-full flex flex-col p-4 md:p-[4%] gap-6 md:gap-[4%] overflow-y-auto custom-scrollbar bg-gray-50/50 min-h-0 min-w-0 overflow-x-hidden relative w-full items-center">
          {editable && (
            <button
              onClick={() => updateLayoutConfig({ isRightPanelOpen: false })}
              className="absolute top-2 right-4 p-2 flex items-center justify-center bg-red-500 border border-red-600 shadow-lg text-white hover:bg-red-600 rounded-lg transition-all active:scale-95 z-20"
              title="收起右侧题目区"
            >
              <ChevronRight className="w-6 h-6" strokeWidth={3} />
            </button>
          )}

          {/* 批量操作工具栏 */}
          {editable && questions.length > 0 && (
            <div className="w-full max-w-xl flex items-center justify-between bg-white px-4 py-3 rounded-2xl shadow-sm border border-gray-100 mb-2 shrink-0 z-10 sticky top-0 md:static">
              <label className="flex items-center gap-2 cursor-pointer group select-none">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 rounded-md border-gray-300 text-brand-primary focus:ring-brand-primary transition-all cursor-pointer"
                  checked={selectedQIds.length > 0 && selectedQIds.length === questions.length}
                  onChange={(e) => {
                     if (e.target.checked) setSelectedQIds(questions.map(q => q.id));
                     else setSelectedQIds([]);
                  }}
                />
                <span className="text-sm font-bold text-gray-600 group-hover:text-brand-primary transition-colors">全选 ({questions.length})</span>
              </label>
              
              <AnimatePresence>
                {selectedQIds.length > 0 && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={() => {
                        if (confirm(`确定要删除选中的 ${selectedQIds.length} 题吗？（相应的画框也会自动移除）`)) {
                          removeQuestions(selectedQIds);
                          setSelectedQIds([]);
                        }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg text-sm font-black transition-all active:scale-95"
                  >
                    <Trash2 className="w-4 h-4" />
                    一键删除
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          )}
          
          {questions.map((q, qIdx) => (
          <div key={q.id} className="flex flex-col shrink-0 w-full max-w-xl mx-auto my-auto md:my-0">
            {/* 题干高亮卡片 (点击展开看大图 + OCR文字) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                if (q.contentImage) {
                  setSelectedQuestionId(q.id);
                }
              }}
              className={cn(
                "w-full text-left flex flex-col items-center justify-center gap-3 p-5 md:p-6 rounded-3xl transition-all duration-300 border bg-white shadow-xl hover:shadow-2xl",
                q.contentImage 
                  ? "border-brand-primary/20 hover:border-brand-primary/50 hover:-translate-y-1 cursor-pointer group" 
                  : "border-gray-200 cursor-default"
              )}
            >
              <div className="flex flex-col w-full">
                  {!forceMask && (
                    <div className="flex items-center justify-center gap-4 w-full border-b-2 border-gray-100 pb-4 mb-4 relative pl-8 md:pl-10">
                      {/* 单题勾选框 */}
                      {editable && (
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            className="w-5 h-5 rounded-md border-gray-300 text-brand-primary focus:ring-brand-primary cursor-pointer shrink-0"
                            checked={selectedQIds.includes(q.id)}
                            onChange={(e) => {
                               if (e.target.checked) setSelectedQIds([...selectedQIds, q.id]);
                               else setSelectedQIds(selectedQIds.filter(id => id !== q.id));
                            }}
                          />
                        </div>
                      )}

                      <div className="bg-[#1e293b] text-white px-6 py-2.5 rounded-2xl shadow-2xl shrink-0 transform -rotate-1 border-2 border-white/10">
                        <span className="text-xl md:text-2xl font-black italic tracking-tighter">第 {qIdx + 1} 题</span>
                      </div>
                      {editable ? (
                        <input
                          className="flex-1 min-w-0 text-xl md:text-2xl font-black text-center text-[#1e293b] bg-transparent border-none outline-none hover:bg-gray-50 focus:bg-gray-50 rounded-xl px-4 transition-all"
                          value={q.title}
                          onChange={(e) => updateQuestion(q.id, { title: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="修改题号/标题..."
                        />
                      ) : (
                        <h3 className="flex-1 min-w-0 text-xl md:text-2xl font-black text-[#1e293b] leading-tight text-center tracking-tight">
                          {q.title || '题目内容'}
                        </h3>
                      )}

                      {/* 状态标识：AI 几何 或 思维导图 */}
                      <div className="flex items-center gap-2 shrink-0 ml-1">
                        {q.mindmapTree && (
                          <div className="p-2 bg-indigo-500 text-white rounded-full shadow-lg shadow-indigo-200 animate-pulse" title="包含互动思维导图">
                            <Brain className="w-5 h-5" />
                          </div>
                        )}
                        {q.contentImage && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('确定要删除这道题目吗？')) {
                                removeQuestion(q.id);
                              }
                            }}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all shrink-0"
                            title="删除题目"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                
                {/* 内容摘要 - 缩略图模式下大幅缩小字体并显示更多行 */}
                {q.content && (
                  <p className={cn(
                    "w-full text-center text-[#1e293b] font-black leading-tight tracking-tight px-4",
                    forceMask 
                      ? "text-[12px] line-clamp-6 mt-2 opacity-80" 
                      : "text-xl md:text-3xl line-clamp-2 md:line-clamp-3 mt-6"
                  )}>
                    {cleanLatexSymbols(q.content.replace(/\{\{.*?\}\}/g, ' ________ '))
                      .replace(/\n/g, ' ')
                      .replace(/【答案】.*/g, '')
                      .replace(/【解析】.*/g, '')
                    }
                  </p>
                )}

                {/* 切片大图 - 显著放大且居中 */}
                {q.contentImage && (
                  <div className="mt-4 w-full flex flex-col items-center justify-center relative rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 p-2 md:p-4 group-hover:bg-brand-primary/5 transition-colors">
                    <img 
                      src={q.contentImage} 
                      alt="题目内容" 
                      className="w-full h-auto max-h-48 md:max-h-64 object-contain rounded-xl mix-blend-darken shadow-sm pointer-events-none" 
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/5 rounded-2xl pointer-events-none">
                       <span className="bg-brand-primary text-white text-xs font-black px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
                         <Maximize2 className="w-4 h-4" /> 点击全屏查看
                       </span>
                    </div>
                  </div>
                )}

                {/* AI 几何辅助线渲染区 */}
                {q.auxiliary_svg && (
                  <div className="mt-4 w-full flex flex-col items-center gap-2 p-4 bg-white rounded-2xl border-2 border-purple-100 shadow-inner relative overflow-hidden group/svg">
                    <div className="absolute top-2 left-3 flex items-center gap-1 opacity-40 group-hover/svg:opacity-100 transition-opacity">
                      <Zap className="w-3 h-3 text-purple-600 fill-purple-600" />
                      <span className="text-[10px] font-black text-purple-600 tracking-tighter uppercase whitespace-nowrap">Ai Geometry Engine</span>
                    </div>
                    <div 
                      className="w-full max-h-64 flex justify-center py-2 [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-w-md [&>svg]:drop-shadow-sm"
                      dangerouslySetInnerHTML={{ __html: q.auxiliary_svg }} 
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 如果没有图片，兜底展示文字逻辑 */}
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
      ) : editable ? (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 z-50 flex items-center justify-end h-32 w-10 group">
          <button
            onClick={() => updateLayoutConfig({ isRightPanelOpen: true })}
            className="p-2 bg-red-500 border border-red-600 border-r-0 shadow-2xl rounded-l-2xl text-white hover:bg-red-600 group-hover:pr-3 group-hover:w-10 w-8 transition-all flex items-center justify-center"
            title="展开题目侧边栏"
          >
            <ChevronLeft className="w-6 h-6" strokeWidth={3} />
          </button>
        </div>
      ) : null}

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
          <QuestionDetailModal
            expandedQuestion={expandedQuestion}
            setExpandedQuestion={(q) => setSelectedQuestionId(q ? q.id : null)}
            editable={editable}
            updateQuestion={updateQuestion}
            setZoomedImage={setZoomedImage}
          />
        )}
      </AnimatePresence>

       {/* 原文素材全屏放大弹窗 */}
       <AnimatePresence>
         {isMaterialExpanded && (
           <MaterialViewer 
             firstQ={firstQ} 
             questions={questions} 
             onClose={() => setIsMaterialExpanded(false)} 
           />
         )}
       </AnimatePresence>

       {/* [NEW] 交互式全屏灯箱 (Portal) - 支持滚轮缩放与拖拽平移 */}
       {zoomedImage && (
         <ImageLightbox 
           src={zoomedImage} 
           onClose={() => setZoomedImage(null)} 
         />
       )}
    </div>
  );
};



// SlideFrame 已提取到 @/components/slide/SlideFrame.tsx
