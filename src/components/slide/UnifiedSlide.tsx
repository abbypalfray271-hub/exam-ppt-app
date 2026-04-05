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
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ResizableHandle } from '../ResizableHandle';

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

const renderAnswerMasks = (questions: Question[], isDrawMode = false) => {
  const masks: React.ReactNode[] = [];
  
  questions.forEach(q => {
    // 渲染答案遮挡区
    if (q.answer_box && q.answer_box.length === 4) {
      const [ymin, xmin, ymax, xmax] = q.answer_box;
      const isTenThousand = q.answer_box.some(v => v > 1000);
      const divisor = isTenThousand ? 100 : 10;
      const top = ymin / divisor;
      const left = xmin / divisor;
      const height = (ymax - ymin) / divisor;
      const width = (xmax - xmin) / divisor;
      
      masks.push(
        <div
          key={`mask-answer-${q.id}`}
          className={cn(
            "absolute z-10 backdrop-blur-2xl bg-white/95 border-2 border-dashed border-gray-400 rounded-lg shadow-xl flex flex-col items-center justify-center transition-all duration-300 group/mask",
            isDrawMode ? "pointer-events-none opacity-20" : "cursor-help hover:opacity-0"
          )}
          style={{ top: `${top}%`, left: `${left}%`, height: `${height}%`, width: `${width}%` }}
          title="此处答案已被打码遮挡 (鼠标移入可查看原图)"
          onClick={(e) => { e.stopPropagation(); }}
        >
          <EyeOff className="w-5 h-5 text-gray-400 mb-1 group-hover/mask:opacity-0 transition-opacity" />
          <span className="text-[10px] font-bold text-gray-400 group-hover/mask:opacity-0 transition-opacity">答案</span>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              const { updateQuestion } = useProjectStore.getState();
              updateQuestion(q.id, { answer_box: undefined });
            }}
            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/mask:opacity-100 transition-opacity shadow-lg hover:bg-red-600 z-20"
            title="删除此错误遮罩"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      );
    }

    // 渲染试题分析区 (紫色主题)
    if (q.analysis_box && q.analysis_box.length === 4) {
      const [ymin, xmin, ymax, xmax] = q.analysis_box;
      const isTenThousand = q.analysis_box.some(v => v > 1000);
      const divisor = isTenThousand ? 100 : 10;
      const top = ymin / divisor;
      const left = xmin / divisor;
      const height = (ymax - ymin) / divisor;
      const width = (xmax - xmin) / divisor;
      
      masks.push(
        <div
          key={`mask-analysis-${q.id}`}
          className={cn(
            "absolute z-10 backdrop-blur-2xl bg-purple-50/95 border-2 border-dashed border-purple-400 rounded-lg shadow-xl flex flex-col items-center justify-center transition-all duration-300 group/mask",
            isDrawMode ? "pointer-events-none opacity-20" : "cursor-help hover:opacity-0"
          )}
          style={{ top: `${top}%`, left: `${left}%`, height: `${height}%`, width: `${width}%` }}
          title="此处试题分析已被隐藏 (鼠标移入可查看原图)"
          onClick={(e) => { e.stopPropagation(); }}
        >
          <EyeOff className="w-5 h-5 text-purple-400 mb-1 group-hover/mask:opacity-0 transition-opacity" />
          <span className="text-[10px] font-bold text-purple-400 group-hover/mask:opacity-0 transition-opacity">分析</span>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              const { updateQuestion } = useProjectStore.getState();
              updateQuestion(q.id, { analysis_box: undefined });
            }}
            className="absolute -top-2 -right-2 w-5 h-5 bg-purple-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/mask:opacity-100 transition-opacity shadow-lg hover:bg-purple-600 z-20"
            title="删除此分析遮罩"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      );
    }
  });
  
  return masks;
};

interface UnifiedSlideProps {
  questions: Question[];
  editable?: boolean;
  forceMask?: boolean; // [NEW] 全局打码状态，用于侧边栏预览
}

export const UnifiedSlide: React.FC<UnifiedSlideProps> = ({ questions, editable = false, forceMask = false }) => {
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

  const [expandedQuestion, setExpandedQuestion] = useState<Question | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  // 3-state click cycle: hidden → answer → analysis → hidden
  const [revealState, setRevealState] = useState<'hidden' | 'answer' | 'analysis'>('hidden');
  const [isEditingContent, setIsEditingContent] = useState(false); // 新增状态：控制是否处于富文本编辑状态
  const [isMaterialExpanded, setIsMaterialExpanded] = useState(false);
  const [isDetailFullScreen, setIsDetailFullScreen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  
  // 原文素材分页状态
  const firstQ = questions[0];
  const [materialPageIndex, setMaterialPageIndex] = useState(firstQ?.pageIndex || 0);

  // 素材全图缩放和平移状态
  const [zoomState, setZoomState] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // 手动打码区状态
  const [isMaskDrawMode, setIsMaskDrawMode] = useState(false);
  const [drawingMask, setDrawingMask] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

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
          className="flex items-center gap-2 mb-1 md:mb-[3%] p-1 -ml-1 rounded self-start"
        >
          <BookOpen className="w-[1.2em] h-[1.2em] text-[#64748b]" />
          <span className="text-[0.65em] font-black text-[#64748b] tracking-wider uppercase flex items-center gap-1">
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
                {renderAnswerMasks(questions)}
                
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
          ) : firstQ.image ? (
            <div 
              className="w-full shrink-0 rounded-xl flex items-start justify-center bg-white shadow-inner p-1 relative border border-gray-100 group cursor-pointer overflow-hidden transition-all duration-300 hover:border-brand-primary/50 hover:shadow-lg"
              onClick={() => setIsMaterialExpanded(true)}
              title="点击全屏查看原文切片"
            >
              <div className="relative inline-flex w-full overflow-hidden rounded-lg">
                <img src={firstQ.image} alt="原文切片" className="w-full h-auto object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.02]" />
                {renderAnswerMasks(questions)}
                
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
              onClick={() => setIsRightPanelOpen(false)}
              className="absolute top-2 right-4 p-2 flex items-center justify-center bg-red-500 border border-red-600 shadow-lg text-white hover:bg-red-600 rounded-lg transition-all active:scale-95 z-20"
              title="收起右侧题目区"
            >
              <ChevronRight className="w-6 h-6" strokeWidth={3} />
            </button>
          )}
          
          {questions.map((q, qIdx) => (
          <div key={q.id} className="flex flex-col shrink-0 w-full max-w-xl mx-auto my-auto md:my-0">
            {/* 题干高亮卡片 (点击展开看大图 + OCR文字) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                if (q.contentImage) {
                  setExpandedQuestion(q);
                  setRevealState('hidden');
                  setIsEditingContent(false);
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
                <div className="flex items-center justify-center gap-4 w-full border-b-2 border-gray-100 pb-4 mb-4">
                  <div className="bg-[#1e293b] text-white px-5 py-1.5 rounded-2xl shadow-xl shrink-0 transform -rotate-1">
                    <span className="text-lg md:text-xl font-black italic tracking-tighter">第 {qIdx + 1} 题</span>
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

                  {/* 删除按钮 */}
                  {q.contentImage && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('确定要删除这道题目吗？')) {
                          removeQuestion(q.id);
                        }
                      }}
                      className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all shrink-0 ml-1"
                      title="删除题目"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
                
                {/* 内容摘要 - 提升字号与对比度 */}
                {q.content && (
                  <p className="w-full text-center text-lg md:text-xl text-[#1e293b]/70 font-bold line-clamp-2 md:line-clamp-3 mt-4 px-4 leading-relaxed">
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
            onClick={() => setIsRightPanelOpen(true)}
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
              style={isDetailFullScreen ? { paddingTop: 'max(56px, env(safe-area-inset-top, 56px))' } : undefined}
              onClick={(e) => {
                e.stopPropagation();
                // 3-state cycle: hidden → answer → analysis → hidden
                setRevealState(prev => prev === 'hidden' ? 'answer' : prev === 'answer' ? 'analysis' : 'hidden');
              }} // 点击弹窗内部空白区，触发 3 阶段切换
            >
              {/* 弹窗头部栏 */}
              <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-gray-100 bg-gray-50/50 gap-2">
                <h3 className="text-base md:text-lg font-black text-gray-800 tracking-tight flex-1 truncate">
                  题目详情：{expandedQuestion.title}
                </h3>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setIsDetailFullScreen(!isDetailFullScreen)}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-brand-primary text-white rounded-xl font-black text-sm shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 active:scale-95 transition-all"
                    title={isDetailFullScreen ? "还原窗口" : "全屏显示"}
                  >
                    {isDetailFullScreen ? (
                      <><Minimize2 className="w-5 h-5" /> 缩小</>
                    ) : (
                      <><Maximize2 className="w-5 h-5" /> 全屏</>
                    )}
                  </button>
                  <button
                    onClick={() => setExpandedQuestion(null)}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-red-500 text-white rounded-xl font-black text-sm shadow-lg shadow-red-500/20 hover:bg-red-600 active:scale-95 transition-all"
                  >
                    <X className="w-5 h-5" /> 关闭
                  </button>
                </div>
              </div>
              
              {/* 图文混合展示区 (可滚动) */}
              <div className="flex-1 overflow-auto p-6 custom-scrollbar flex flex-col gap-6 bg-[#f8fafc]">
                  {(() => {
                    const fullContent = expandedQuestion.content || '';
                    // 健壮的分割逻辑：支持 【答案】 和 【解析】 的多级分割
                    const segments = fullContent.split(/([\r\n]*【(?:答案|参考答案|解析|详解|分析)】)/);
                    
                    let questionPart = segments[0] || '';
                    let answerPart = '';
                    let analysisPart = '';

                    for (let i = 1; i < segments.length; i += 2) {
                      const tag = segments[i];
                      const content = segments[i + 1] || '';
                      const cleanContent = content.replace(/\{\{(.*?)\}\}/g, '$1'); // 去掉 {{ }} 装饰
                      
                      if (tag.includes('答案')) {
                        answerPart = tag + cleanContent;
                      } else if (tag.includes('解析') || tag.includes('分析') || tag.includes('详解')) {
                        analysisPart = tag + cleanContent;
                      }
                    }
                    
                    if (!analysisPart && expandedQuestion.analysis) {
                      analysisPart = `\n\n【解析】\n${expandedQuestion.analysis}`;
                    }

                    return (
                      <div className="w-full flex flex-col gap-2">
                        <div className="flex items-center justify-between ml-1 text-gray-500 text-sm font-semibold">
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            <span>题目内容 (选项与正文)</span>
                          </div>
                          {editable && (
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 setIsEditingContent(!isEditingContent);
                               }}
                               className={cn(
                                 "flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-black transition-all shadow-xl active:scale-95 group border-none",
                                 isEditingContent 
                                   ? "bg-brand-primary text-white" 
                                   : "bg-orange-500 text-white hover:bg-orange-600"
                               )}
                             >
                               <span className="group-hover:-translate-y-0.5 transition-transform">{isEditingContent ? '✅' : '✏️'}</span>
                               <span>{isEditingContent ? '完成编辑' : '编辑源码'}</span>
                             </button>
                           )}
                        </div>
                        <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 min-h-[12em]">
                          {editable && isEditingContent ? (
                            <textarea
                              className="w-full text-xl font-bold text-[#1e293b] leading-loose bg-transparent border-none outline-none resize-y focus:ring-0 min-h-[12em] custom-scrollbar"
                              value={fullContent}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const newContent = e.target.value;
                                updateQuestion(expandedQuestion.id, { content: newContent });
                                setExpandedQuestion({ ...expandedQuestion, content: newContent });
                              }}
                              placeholder="可以在此补充或修正题目内容... 使用 {{文本}} 语法可以添加可隐现的答案特效"
                              autoFocus
                            />
                          ) : (
                            <div className="text-xl font-bold text-[#1e293b] leading-loose cursor-pointer" onClick={(e) => e.stopPropagation()}>
                              {/* [题干渲染] */}
                              <RichExamContent 
                                content={questionPart} 
                                showClozeAnswers={revealState === 'answer' || revealState === 'analysis'}
                                diagrams={expandedQuestion.diagrams}
                                onImageClick={setZoomedImage}
                              />
                              
                              {/* [答案区域] */}
                              {(answerPart || expandedQuestion.answer) && (revealState === 'answer' || revealState === 'analysis') && (
                                <div className="mt-8 pt-6 border-t-2 border-dashed border-brand-primary/10 flex flex-col gap-4">
                                  <div className="flex items-center gap-2 text-brand-primary">
                                    <CheckSquare className="w-6 h-6" />
                                    <span className="text-sm font-black uppercase tracking-widest bg-brand-primary/5 px-3 py-1 rounded-full">参考答案</span>
                                  </div>
                                  <div className="text-brand-primary font-black text-2xl md:text-4xl pl-2 drop-shadow-sm">
                                    <RichExamContent 
                                      content={answerPart ? answerPart.replace(/【.*?答案.*?】/, '').trim() : (expandedQuestion.answer || '无')} 
                                      showClozeAnswers={true} 
                                      diagrams={expandedQuestion.diagrams}
                                      diagramStartIndex={(questionPart.match(/\[附图\]/g) || []).length}
                                      onImageClick={setZoomedImage}
                                    />
                                  </div>
                                </div>
                              )}

                              {/* [解析区域] */}
                              {analysisPart && revealState === 'analysis' && (
                                <div className="mt-8 pt-6 border-t-2 border-dashed border-purple-200">
                                  <div className="flex items-center gap-2 text-purple-700 mb-4">
                                    <BookOpen className="w-6 h-6" />
                                    <span className="text-sm font-black uppercase tracking-widest bg-purple-50 px-3 py-1 rounded-full">详解步骤</span>
                                  </div>
                                  <div className="text-xl md:text-2xl font-bold text-slate-700 leading-relaxed">
                                    <RichExamContent 
                                      content={analysisPart} 
                                      showClozeAnswers={true} 
                                      diagrams={expandedQuestion.diagrams}
                                      diagramStartIndex={(questionPart.match(/\[附图\]/g) || []).length + (answerPart?.match(/\[附图\]/g) || []).length}
                                      onImageClick={setZoomedImage}
                                    />
                                  </div>

                                  {/* [辅助配图廊] - 精细化分流展示 */}
                                  {expandedQuestion.answerDiagrams && expandedQuestion.answerDiagrams.length > 0 && (
                                    <div className="mt-8 flex flex-wrap justify-center gap-6">
                                      {expandedQuestion.answerDiagrams.map((dg, dgIdx) => (
                                        <div key={dgIdx} className="group/dg relative">
                                          <div className="absolute -top-3 -left-2 z-10 bg-brand-primary text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg">
                                            补充知识点 #{dgIdx + 1}
                                          </div>
                                          <img 
                                            src={dg} 
                                            alt={`Supplement ${dgIdx}`}
                                            className="max-h-64 md:max-h-80 rounded-2xl shadow-xl border-4 border-white cursor-zoom-in hover:scale-[1.03] transition-transform active:scale-95"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setZoomedImage(dg);
                                            }}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  
                                  {/* AI 渲染的 SVG 辅助配图 */}
                                  {expandedQuestion.auxiliary_svg && (
                                    <div className="w-full flex flex-col items-center gap-3 mt-8 bg-white rounded-2xl p-6 border-2 border-purple-100 shadow-inner">
                                      <div className="text-xs font-black text-purple-400 uppercase tracking-widest flex items-center gap-1.5 self-start">
                                        <Zap className="w-4 h-4 fill-purple-400" /> AI 几何作图引擎
                                      </div>
                                      <div 
                                        className="w-full max-w-sm aspect-square flex items-center justify-center p-2 overflow-hidden"
                                        dangerouslySetInnerHTML={{ __html: expandedQuestion.auxiliary_svg }}
                                      />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                       {/* 交互指引提示：根据当前状态动态切换 */}
                       <div className={cn(
                         "text-center mt-6 mb-2 text-[11px] font-black tracking-widest uppercase animate-pulse pointer-events-none",
                         revealState === 'hidden' ? 'text-gray-400' : revealState === 'answer' ? 'text-brand-primary' : 'text-purple-500'
                       )}>
                         {isEditingContent
                            ? "👆 在文本中加入类似 {{答案}} 即可创建下划线特效"
                            : revealState === 'hidden' ? "👆 点击屏幕任意空白处即可显示答案"
                            : revealState === 'answer' ? "👆 再次点击即可查看解析"
                            : "👆 再次点击即可隐藏答案/解析"
                         }
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
             className="fixed inset-0 z-[110] flex items-start justify-center p-0 bg-black/90 backdrop-blur-md overflow-y-auto custom-scrollbar"
             onClick={() => {
               setIsMaterialExpanded(false);
               setZoomState({ scale: 1, x: 0, y: 0 });
               setIsMaskDrawMode(false);
               setDrawingMask(null);
             }}
           >
             <motion.div
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="relative w-full min-h-screen flex flex-col items-center py-12"
               onClick={(e) => e.stopPropagation()}
             >
                <button
                  onClick={() => setIsMaterialExpanded(false)}
                  className="fixed top-4 right-6 p-3 bg-black/50 hover:bg-red-500 text-white rounded-full transition-colors z-50 backdrop-blur-sm shadow-xl"
                  title="关闭全屏"
                >
                  <X className="w-6 h-6" />
                </button>

                {/* 素材主体图片: 优先使用选中的页码图片，若无则回退到 materialImage */}

                {/* 素材主体图片: 优先使用选中的页码图片，若无则回退到 materialImage */}
                <div 
                  className={cn("relative group inline-block w-[80vw]", isMaskDrawMode ? "cursor-crosshair" : (zoomState.scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : ""))}
                  style={{
                    transform: `translate(${zoomState.x}px, ${zoomState.y}px) scale(${zoomState.scale})`,
                    transformOrigin: 'center top',
                    transition: (isDragging || isMaskDrawMode) ? 'none' : 'transform 0.2s ease-out'
                  }}
                  onPointerDown={(e) => {
                    if (isMaskDrawMode) {
                      e.stopPropagation();
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pctX = (e.clientX - rect.left) / rect.width;
                      const pctY = (e.clientY - rect.top) / rect.height;
                      setDrawingMask({ startX: pctX, startY: pctY, currentX: pctX, currentY: pctY });
                    } else if (zoomState.scale > 1) {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setIsDragging(true);
                      setDragStart({ x: e.clientX - zoomState.x, y: e.clientY - zoomState.y });
                    }
                  }}
                  onPointerMove={(e) => {
                    if (isMaskDrawMode && drawingMask) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      let pctX = (e.clientX - rect.left) / rect.width;
                      let pctY = (e.clientY - rect.top) / rect.height;
                      pctX = Math.max(0, Math.min(1, pctX));
                      pctY = Math.max(0, Math.min(1, pctY));
                      setDrawingMask(prev => prev ? { ...prev, currentX: pctX, currentY: pctY } : null);
                    } else if (isDragging && zoomState.scale > 1) {
                      setZoomState(prev => ({
                        ...prev,
                        x: e.clientX - dragStart.x,
                        y: e.clientY - dragStart.y
                      }));
                    }
                  }}
                  onPointerUp={(e) => {
                    if (isMaskDrawMode && drawingMask) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                      const minX = Math.min(drawingMask.startX, drawingMask.currentX);
                      const maxX = Math.max(drawingMask.startX, drawingMask.currentX);
                      const minY = Math.min(drawingMask.startY, drawingMask.currentY);
                      const maxY = Math.max(drawingMask.startY, drawingMask.currentY);
                      
                      if (maxX - minX > 0.01 && maxY - minY > 0.01) {
                         const answer_box: [number, number, number, number] = [
                           Math.round(minY * 10000),
                           Math.round(minX * 10000),
                           Math.round(maxY * 10000),
                           Math.round(maxX * 10000)
                         ];
                         updateQuestion(firstQ.id, { answer_box });
                      }
                      
                      setDrawingMask(null);
                      setIsMaskDrawMode(false);
                    } else {
                      setIsDragging(false);
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                  onPointerCancel={() => {
                     setIsDragging(false);
                     setDrawingMask(null);
                  }}
                  onWheel={(e) => {
                    if (isMaskDrawMode) return;
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
                    src={firstQ.materialImage || firstQ.image} 
                    alt="全屏原文切片" 
                    className="w-full h-auto object-contain shadow-2xl bg-white block select-none pointer-events-none"
                    draggable={false}
                  />
                  {renderAnswerMasks(questions, isMaskDrawMode)}

                  {drawingMask && (
                    <div 
                      className="absolute z-50 border-2 border-brand-primary bg-brand-primary/20 shadow-lg"
                      style={{
                         left: `${Math.min(drawingMask.startX, drawingMask.currentX) * 100}%`,
                         top: `${Math.min(drawingMask.startY, drawingMask.currentY) * 100}%`,
                         width: `${Math.abs(drawingMask.currentX - drawingMask.startX) * 100}%`,
                         height: `${Math.abs(drawingMask.currentY - drawingMask.startY) * 100}%`
                      }}
                    />
                  )}
                 
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-4 px-6 py-2 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
                  <p className="text-white text-sm font-bold tracking-widest uppercase">
                    原文切片预览
                  </p>
                 
                 <button
                   onClick={(e) => {
                     e.stopPropagation();
                     if (!isMaskDrawMode) {
                       setZoomState({ scale: 1, x: 0, y: 0 }); 
                     } else {
                       setDrawingMask(null);
                     }
                     setIsMaskDrawMode(!isMaskDrawMode);
                   }}
                   className={cn(
                     "px-4 py-1.5 rounded-full flex items-center gap-2 transition-all shadow-md active:scale-95",
                     isMaskDrawMode 
                       ? "bg-red-500 hover:bg-red-600 text-white" 
                       : "bg-white/20 hover:bg-brand-primary text-white"
                   )}
                 >
                   <EyeOff className="w-4 h-4" />
                   <span className="text-sm font-bold tracking-widest">
                     {isMaskDrawMode ? '在此处拖拽鼠标画框 (点击取消)' : '手动框选隐藏区'}
                   </span>
                 </button>
               </div>
             </motion.div>
           </motion.div>
          )}
        </AnimatePresence>

       {/* [NEW] 交互式全屏灯箱 (Portal) - 支持滚轮缩放与拖拽平移 */}
       {typeof document !== 'undefined' && zoomedImage && createPortal(
         <Lightbox 
           src={zoomedImage} 
           onClose={() => setZoomedImage(null)} 
         />,
         document.body
       )}
    </div>
  );
};

/**
 * 内部功能组件：交互式滚动缩放灯箱
 * 技术栈：Framer Motion (Spring Physics) + React Hooks
 */
const Lightbox: React.FC<{ src: string; onClose: () => void }> = ({ src, onClose }) => {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 核心逻辑：平滑滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    // 灵敏度控制：向上滚放大，向下滚缩小
    const delta = e.deltaY < 0 ? 1.15 : 0.85; 
    const newScale = Math.min(Math.max(0.5, scale * delta), 12); // 最高支持 12 倍放大
    setScale(newScale);

    // 回弹重置：当缩放接近原始比例时，清空偏移量
    if (newScale <= 1.05) {
      setOffset({ x: 0, y: 0 });
    }
  };

  // 核心逻辑：拖拽平移 (仅在放大状态激活)
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || scale <= 1) return;
    setOffset(prev => ({
      x: prev.x + e.movementX,
      y: prev.y + e.movementY
    }));
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000] bg-black/95 backdrop-blur-3xl flex items-center justify-center overflow-hidden touch-none"
        onWheel={handleWheel}
        onClick={onClose}
        onPointerDown={(e) => {
          if (scale > 1) {
            setIsDragging(true);
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }
        }}
        onPointerUp={(e) => {
          setIsDragging(false);
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        }}
        onPointerMove={handlePointerMove}
      >
        {/* 右上角悬浮控制栏 */}
        <div className="absolute top-8 right-8 z-50 flex items-center gap-4">
          <div className="bg-white/10 px-5 py-2.5 rounded-2xl border border-white/20 backdrop-blur-xl text-white text-[10px] font-black tracking-[0.2em] uppercase flex items-center gap-3">
             <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                <span>Zoomed {Math.round(scale * 100)}%</span>
             </div>
             <div className="w-px h-3 bg-white/20" />
             <span className="opacity-60">Interactive Mode</span>
          </div>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-14 h-14 bg-white text-black rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(0,0,0,0.5)] hover:scale-110 active:scale-90 transition-all text-2xl font-black border-4 border-black/10 z-50"
          >
            ✕
          </button>
        </div>

        {/* 动态渲染容器 */}
        <motion.div
          animate={{ 
            scale: scale,
            x: offset.x,
            y: offset.y,
            rotate: isDragging ? 0.2 : 0 // 增加微小的物理扭曲感
          }}
          transition={{ 
            type: 'spring', 
            damping: 30, 
            stiffness: 250, 
            mass: 0.8
          }}
          className={cn(
            "relative flex items-center justify-center p-4 transition-all duration-300",
            scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={src}
            alt="Large preview"
            className="max-w-[70vw] max-h-[70vh] md:max-w-[85vw] md:max-h-[85vh] object-contain rounded-2xl shadow-[0_0_120px_rgba(0,0,0,0.8)] border-4 border-white/30 select-none pointer-events-none"
            draggable={false}
          />
        </motion.div>
        
        {/* 底部操作反馈 */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 opacity-30 group pointer-events-none">
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center gap-1">
               <div className="w-8 h-8 rounded-lg border border-white/40 flex items-center justify-center mb-1">
                 <div className="w-1 h-3 bg-white/60 rounded-full" />
               </div>
               <span className="text-[9px] font-black text-white uppercase tracking-tighter">Scroll Zoom</span>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="flex flex-col items-center gap-1">
               <div className="w-8 h-8 rounded-lg border border-white/40 flex items-center justify-center mb-1">
                 <div className="w-3 h-3 border-2 border-white/60 rounded-sm" />
               </div>
               <span className="text-[9px] font-black text-white uppercase tracking-tighter">Drag Pan</span>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// SlideFrame 已提取到 @/components/slide/SlideFrame.tsx
