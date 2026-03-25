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
  Monitor,
  EyeOff,
  Lightbulb
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
    
    // 判断是否共用素材 (除了文本精确匹配外，还要判断图片 URL)
    const sameMaterialText = prevQ.material === currQ.material && !!prevQ.material;
    const sameMaterialImage = prevQ.materialImage === currQ.materialImage && !!prevQ.materialImage;
    const sameFullImage = prevQ.image === currQ.image && !!prevQ.image;
    
    const sameMaterial = sameMaterialText || sameMaterialImage || sameFullImage;
    
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

const renderClozeText = (text: string, show: boolean) => {
  if (!text) return null;
  // 正则匹配 {{内容}}
  const parts = text.split(/(\{\{.*?\}\})/g);
  return parts.map((part, index) => {
    if (part.startsWith('{{') && part.endsWith('}}')) {
      const answerText = part.slice(2, -2);
      if (show) {
        return (
          <span key={index} className="inline-block text-brand-primary font-black border-b-[2px] border-brand-primary pb-[1px] px-1 mx-1 bg-brand-primary/10 rounded-sm">
            {answerText}
          </span>
        );
      } else {
        return (
          <span key={index} className="inline-block min-w-[3em] text-transparent border-b-[2px] border-gray-400 pb-[1px] px-1 mx-1 select-none">
            {answerText}
          </span>
        );
      }
    }
    return <span key={index}>{part}</span>;
  });
};

const renderAnswerMasks = (questions: Question[], displayMode: number = 0, isDrawMode = false) => {
  return questions.flatMap(q => {
    const masks = [];
    
    // 答案遮罩：始终显示以保持素材区“干净”
    if (q.answer_box && q.answer_box.length === 4) {
      masks.push({
        id: `answer-${q.id}`,
        box: q.answer_box,
        type: 'answer' as const,
        label: '答案隐藏区',
        show: true, // 始终显示遮挡
        color: 'border-red-400',
        activeColor: 'bg-white/95',
        qId: q.id
      });
    }

    // 解析遮罩：始终显示以保持素材区“干净”
    if (q.analysis_box && q.analysis_box.length === 4) {
       masks.push({
         id: `analysis-${q.id}`,
         box: q.analysis_box,
         type: 'analysis' as const,
         label: '解题思路隐藏区',
         show: true, // 始终显示遮挡
         color: 'border-emerald-400',
         activeColor: 'bg-emerald-50/95',
         qId: q.id
       });
    }

    return masks.map(m => {
      const [ymin, xmin, ymax, xmax] = m.box;
      const isTenThousand = m.box.some(v => v > 1000);
      const divisor = isTenThousand ? 100 : 10;
      const top = ymin / divisor;
      const left = xmin / divisor;
      const height = (ymax - ymin) / divisor;
      const width = (xmax - xmin) / divisor;

      return (
        <div
          key={m.id}
          className={cn(
            "absolute z-10 backdrop-blur-2xl border-2 border-dashed rounded-lg shadow-xl flex flex-col items-center justify-center transition-all duration-500 group/mask",
            m.color,
            m.activeColor,
            m.show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none",
            isDrawMode ? "pointer-events-none opacity-20" : "cursor-help hover:opacity-10"
          )}
          style={{ top: `${top}%`, left: `${left}%`, height: `${height}%`, width: `${width}%` }}
          onClick={(e) => { e.stopPropagation(); }}
        >
          <EyeOff className="w-5 h-5 text-gray-400 mb-1" />
          <span className="text-[10px] font-bold text-gray-400 px-1 text-center leading-tight">{m.label}</span>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              const { updateQuestion } = useProjectStore.getState();
              if (m.type === 'answer') {
                updateQuestion(m.qId, { answer_box: undefined });
              } else {
                updateQuestion(m.qId, { analysis_box: undefined });
              }
            }}
            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/mask:opacity-100 transition-opacity shadow-lg hover:bg-red-600 z-20"
            title="删除此错误遮罩"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      );
    });
  });
};

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
  const [displayMode, setDisplayMode] = useState<0 | 1 | 2>(0);
  const [maskTypeToDraw, setMaskTypeToDraw] = useState<'answer' | 'analysis'>('answer');
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
    <div ref={slideContainerRef} className="w-full h-full bg-white grid overflow-hidden relative" style={{ gridTemplateColumns: isRightPanelOpen ? `${materialRatio}% auto minmax(0, 1fr)` : '1fr' }}>
      {/* 左侧素材区：宽度强制受 Grid 控制，就算内置图片一万像素，也休想挤破屏幕边界！ */}
      <div className="h-full bg-[#f8fafc] flex flex-col p-[1.5%] border-r border-gray-100 min-w-0 overflow-hidden relative">
        <div 
          className="flex items-center gap-2 mb-[3%] p-1 -ml-1 rounded self-start"
        >
          <BookOpen className="w-[1.2em] h-[1.2em] text-[#64748b]" />
          <span className="text-[0.65em] font-black text-[#64748b] tracking-wider uppercase flex items-center gap-1">
            原文切片(整个切片)
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
                {renderAnswerMasks(questions, displayMode)}
                
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
                {renderAnswerMasks(questions, displayMode)}
                
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

      {/* 素材区 ↔ 题目区 可拖拽分隔条 */}
      {isRightPanelOpen && <ResizableHandle onDrag={handleMaterialResize} />}

      {/* 右侧题目聚合区：自动占满后续 Grid */}
      {isRightPanelOpen ? (
        <div className="h-full flex flex-col p-[3%] gap-[3%] overflow-y-auto custom-scrollbar bg-white min-w-0 overflow-x-hidden relative pt-10">
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
          <div key={q.id} className="flex flex-col shrink-0">
            {/* 题干卡片 (点击展开看大图 + OCR文字) - 使用 div + role 避免 button 嵌套 */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                if (q.contentImage) {
                  setExpandedQuestion(q);
                  setDisplayMode(0);
                  setIsEditingContent(false); // 每次打开弹窗默认显示特效模式
                }
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
                    <span className="text-[0.7em] font-black italic tracking-tighter">题{qIdx + 1}</span>
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
                  {/* 内容摘要紧跟标题，同一行。使用 renderClozeText 避免答案泄露 */}
                  {q.content && (
                    <div className="flex-1 text-[0.85em] text-gray-600 font-bold truncate ml-2">
                      {renderClozeText(q.content.split('【解析】')[0].replace(/\n/g, ' '), displayMode >= 1)}
                    </div>
                  )}
                </div>
                
                {/* 移除侧边栏多余的省略图，仅保留文字摘要 */}
                <div className="mt-1 flex items-center justify-end">
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
            {/* 如果没有图片，且不在缩图卡片中显示解析内容 */}
            {!q.contentImage && !editable && q.content && (
               <div className="ml-10 mt-1 pl-3 border-l-2 border-gray-200">
                  <p className="text-[0.7em] text-gray-500 leading-relaxed max-h-20 overflow-hidden line-clamp-3">
                    {q.content.split('【解析】')[0]}
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
            className="p-2 bg-red-500 border border-red-600 border-r-0 shadow-2xl rounded-l-2xl text-white hover:bg-red-600 group-hover:pr-3 group-hover:w-10 transition-all flex items-center justify-center"
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
              onClick={(e) => {
                e.stopPropagation();
                setDisplayMode(prev => (prev + 1) % 3 as 0 | 1 | 2);
              }} // 点击弹窗内部空白区，触发答案显隐
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
                    题目详情：{expandedQuestion.title}
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
                    const fullContent = expandedQuestion.content || '';
                    // 自动过滤解析内容：如果不是在编辑源码模式下，且包含【解析】字样，则截断显示
                    const displayContent = (!isEditingContent && fullContent.includes('【解析】')) 
                      ? fullContent.split('【解析】')[0].trim() 
                      : fullContent;
                    
                    // 提取解析内容：优先使用 analysis 字段，否则从 content 中截取
                    const analysisText = expandedQuestion.analysis || (fullContent.includes('【解析】') ? fullContent.split('【解析】')[1].trim() : '');

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
                                if (!isEditingContent) {
                                  // 进入编辑模式时的冷启动逻辑：自动拆分旧数据中的解析到独立字段
                                  const content = expandedQuestion.content || '';
                                  if (content.includes('【解析】') && !expandedQuestion.analysis) {
                                    const parts = content.split('【解析】');
                                    const newContent = parts[0].trim();
                                    const newAnalysis = parts[1].trim();
                                    updateQuestion(expandedQuestion.id, { content: newContent, analysis: newAnalysis });
                                    setExpandedQuestion({ ...expandedQuestion, content: newContent, analysis: newAnalysis });
                                  }
                                }
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
                           <div className="flex flex-col gap-6 w-full h-full min-h-[400px]">
                              {/* 题干编辑 */}
                              <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-black text-brand-primary tracking-widest uppercase ml-1">题目正文与选项</label>
                                <textarea
                                  className="w-full text-xl font-bold text-[#1e293b] leading-loose bg-white rounded-xl border border-gray-200 p-4 outline-none resize-y focus:ring-2 focus:ring-brand-primary/20 min-h-[10em] custom-scrollbar"
                                  value={expandedQuestion.content}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const newContent = e.target.value;
                                    updateQuestion(expandedQuestion.id, { content: newContent });
                                    setExpandedQuestion({ ...expandedQuestion, content: newContent });
                                  }}
                                  placeholder="可以在此补充或修正题目内容... 使用 {{文本}} 语法可以添加可隐现的答案特效"
                                  autoFocus
                                />
                              </div>
                              
                              {/* 解析编辑 */}
                              <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-black text-brand-primary tracking-widest uppercase ml-1">解题过程 (解析/详解)</label>
                                <textarea
                                  className="w-full text-lg font-bold text-gray-600 leading-loose bg-white rounded-xl border border-gray-200 p-4 outline-none resize-y focus:ring-2 focus:ring-brand-primary/20 min-h-[10em] custom-scrollbar"
                                  value={expandedQuestion.analysis || ''}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const newAnalysis = e.target.value;
                                    updateQuestion(expandedQuestion.id, { analysis: newAnalysis });
                                    setExpandedQuestion({ ...expandedQuestion, analysis: newAnalysis });
                                  }}
                                  placeholder="在此输入解题过程、详解等内容..."
                                />
                              </div>
                           </div>
                         ) : (
                           <div className="text-xl font-bold text-[#1e293b] leading-loose whitespace-pre-wrap cursor-pointer" onClick={(e) => e.stopPropagation()}>
                                                            {renderClozeText(displayContent, displayMode >= 1)}
                           </div>
                         )}
                         </div>

                        {/* 新增：解题过程展示区 (只在放大页显示，且随显隐逻辑联动) */}
                        <AnimatePresence>
                          {displayMode === 2 && analysisText && !isEditingContent && (
                            <motion.div
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="mt-4 flex flex-col gap-3"
                              onClick={(e) => e.stopPropagation()} // 阻止冒泡
                            >
                              <div className="flex items-center gap-2 ml-1 text-brand-primary text-sm font-black tracking-widest uppercase">
                                <div className="p-1.5 bg-brand-primary/10 rounded-lg">
                                  <Lightbulb className="w-4 h-4" />
                                </div>
                                <span>解题过程</span>
                              </div>
                              <div className="w-full bg-brand-primary/5 rounded-2xl border border-brand-primary/20 p-6 shadow-sm">
                                <div className="text-lg font-bold text-gray-700 leading-loose whitespace-pre-wrap">
                                  {renderClozeText(analysisText, true)}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                       {/* 交互指引提示 */}
                       <div className="text-center mt-6 mb-2 text-gray-400 text-[11px] font-black tracking-widest uppercase animate-pulse pointer-events-none">
                         {isEditingContent
                            ? "👆 在文本中加入类似 {{答案}} 即可创建下划线特效"
                             : "👇 点击空白处切换：显示答案 -> 显示解析 -> 隐藏全部"
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
                         const box: [number, number, number, number] = [
                           Math.round(minY * 10000),
                           Math.round(minX * 10000),
                           Math.round(maxY * 10000),
                           Math.round(maxX * 10000)
                         ];
                         if (maskTypeToDraw === 'answer') {
                           updateQuestion(firstQ.id, { answer_box: box });
                         } else {
                           updateQuestion(firstQ.id, { analysis_box: box });
                         }
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
                  {renderAnswerMasks(questions, displayMode, isMaskDrawMode)}

                  {drawingMask && (
                    <div 
                      className="absolute z-50 border-2 border-brand-primary bg-brand-primary/20 shadow-lg"
                      style={{
                         left: `${Math.min(drawingMask.startX, drawingMask.currentX) * 100}%`,
                         top: `${Math.min(drawingMask.startY, drawingMask.currentY) * 100}%`,
                         width: `${Math.abs(drawingMask.currentX - drawingMask.startX) * 100}%`,
                         height: `${Math.abs(drawingMask.startY - drawingMask.currentY) * 100}%`
                      }}
                    />
                  )}
                 
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-4 px-6 py-2 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
                  <p className="text-white text-sm font-bold tracking-widest uppercase">
                    原文切片预览
                  </p>

                  <div className="flex bg-white/10 p-1 rounded-full border border-white/10">
                    <button
                      onClick={(e) => { e.stopPropagation(); setMaskTypeToDraw('answer'); }}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-[12px] font-black transition-all flex items-center gap-2",
                        maskTypeToDraw === 'answer' ? "bg-white text-gray-900 shadow-md" : "text-white/60 hover:text-white"
                      )}
                    >
                      <div className="w-2 h-2 rounded-full bg-red-400" />
                      框选答案
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setMaskTypeToDraw('analysis'); }}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-[12px] font-black transition-all flex items-center gap-2",
                        maskTypeToDraw === 'analysis' ? "bg-white text-emerald-600 shadow-md" : "text-white/60 hover:text-white"
                      )}
                    >
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      框选解析
                    </button>
                  </div>
                 
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
                     {isMaskDrawMode ? '在此处拖拽鼠标画框 (点击取消)' : (maskTypeToDraw === 'answer' ? '框选答案隐藏区' : '框选解析隐藏区')}
                   </span>
                 </button>
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
