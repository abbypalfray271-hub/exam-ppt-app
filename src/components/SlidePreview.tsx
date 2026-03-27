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
  EyeOff
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
// 工具函数：将常见的 LaTeX 符号转换为 Unicode
// ============================================================
const cleanLatexSymbols = (text: string): string => {
  if (!text) return text;

  // === 第一步：保护 {{...}} 答案块，防止被后续正则破坏 ===
  const preserved: string[] = [];
  let safed = text.replace(/\{\{[\s\S]*?\}\}/g, (match) => {
    preserved.push(match);
    return `__CLOZE_${preserved.length - 1}__`;
  });

  // === 第二步：执行 LaTeX 符号清理 ===
  safed = safed
    .replace(/\\triangle/g, '△')
    .replace(/\\angle/g, '∠')
    .replace(/\\perp/g, '⊥')
    .replace(/\\parallel/g, '//')
    .replace(/\\circ/g, '°')
    .replace(/\\degree/g, '°')
    .replace(/\\pm/g, '±')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\neq/g, '≠')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\approx/g, '≈')
    .replace(/\\infty/g, '∞')
    .replace(/\\quad/g, ' ')
    .replace(/\\text\{(\w+)\}/g, '$1')
    .replace(/\\mathrm\{(\w+)\}/g, '$1')
    .replace(/\$([^$]+)\$/g, '$1')  // 移除 $...$ 包裹，保留内容
    .replace(/\}\}/g, '');           // 清除孤立 }}（真正的答案已被保护）

  // === 第三步：恢复被保护的答案块 ===
  safed = safed.replace(/__CLOZE_(\d+)__/g, (_, idx) => preserved[parseInt(idx)]);

  return safed;
};

// ============================================================

const renderClozeText = (rawText: string, show: boolean, diagrams?: string[]) => {
  if (!rawText) return null;
  const text = cleanLatexSymbols(rawText);
  // 正则匹配 {{内容}} 或 [附图] 或 [表格]（[\s\S] 支持跨换行匹配）
  const parts = text.split(/(\{\{[\s\S]*?\}\}|\[附图\]|\[表格\])/g);
  let diagramIndex = 0;

  const renderedParts = parts.map((part, index) => {
    // 处理图样占位符
    if (part === '[附图]' || part === '[表格]') {
      const imgSrc = diagrams?.[diagramIndex++];
      if (imgSrc) {
        return (
          <div key={`diag-${index}`} className="my-4 flex items-center justify-center w-full">
            <img 
              src={imgSrc} 
              alt="插图" 
              className="max-w-[80%] max-h-[16em] object-contain rounded-lg shadow-sm border border-gray-100 bg-white mix-blend-multiply" 
            />
          </div>
        );
      }
      return <span key={index} className="text-gray-400 italic mx-1 opacity-50">{part}</span>;
    }

    // 处理 {{答案}} 语法
    if (part.startsWith('{{') && part.endsWith('}}')) {
      // 深度清理可能存在的嵌套括号或错误包裹（如 {{{{5}}}} 或 {{$5$）
      const answerText = part.slice(2, -2)
        .replace(/^[\{\s\$]+/, '')
        .replace(/[\}\s\$]+$/, '')
        .trim();
      
      // 如果清理完变空了，不显示
      if (!answerText) return null;
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
    return <span key={index} className="whitespace-pre-wrap">{part}</span>;
  });

  // 如果仍有未使用的图样（可能 AI 没给占位符，或者手动框选但未编辑文本），则追加在末尾
  const remainingDiagrams: React.ReactNode[] = [];
  if (diagrams && diagramIndex < diagrams.length) {
    for (let i = diagramIndex; i < diagrams.length; i++) {
      remainingDiagrams.push(
        <div key={`rem-diag-${i}`} className="my-4 flex items-center justify-center w-full">
          <img 
            src={diagrams[i]} 
            alt="追加插图" 
            className="max-w-[80%] max-h-[16em] object-contain rounded-lg shadow-sm border border-gray-100 bg-white mix-blend-multiply" 
          />
        </div>
      );
    }
  }

  return (
    <>
      {renderedParts}
      {remainingDiagrams}
    </>
  );
};

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
          <span className="text-[10px] font-bold text-gray-400 group-hover/mask:opacity-0 transition-opacity">答案隐藏区</span>
          
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
          <span className="text-[10px] font-bold text-purple-400 group-hover/mask:opacity-0 transition-opacity">试题分析区</span>
          
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

  const [expandedQuestion, setExpandedQuestion] = useState<Question | null>(null);
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
                  setRevealState('hidden');
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
                  {/* 内容摘要紧跟标题，同一行 */}
                  {q.content && (
                    <p className="flex-1 text-[0.85em] text-gray-600 font-bold truncate">
                      {q.content.replace(/\n/g, ' ')}
                    </p>
                  )}
                </div>
                
                {q.contentImage && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {/* 补充被遗漏的题目切片图 */}
                    <img 
                      src={q.contentImage} 
                      alt="题目内容" 
                      className="w-full h-auto max-h-32 object-contain rounded-md bg-white mix-blend-darken shadow-sm border border-gray-100 pointer-events-none" 
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-brand-primary opacity-0 group-hover:opacity-100 transition-opacity px-1">
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-black tracking-wider uppercase">点击全屏大图</span>
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
              onClick={(e) => {
                e.stopPropagation();
                // 3-state cycle: hidden → answer → analysis → hidden
                setRevealState(prev => prev === 'hidden' ? 'answer' : prev === 'answer' ? 'analysis' : 'hidden');
              }} // 点击弹窗内部空白区，触发 3 阶段切换
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
                            <div className="text-xl font-bold text-[#1e293b] leading-loose whitespace-pre-wrap cursor-pointer" onClick={(e) => e.stopPropagation()}>
                              {/* 题目部分：内部 {{}} 在 answer/analysis 状态下可见 */}
                              {renderClozeText(questionPart, revealState === 'answer' || revealState === 'analysis', expandedQuestion.diagrams)}
                              
                              {/* 答案部分：在 answer 或 analysis 状态下可见 */}
                              {answerPart && (revealState === 'answer' || revealState === 'analysis') && (
                                <div className="mt-4 pt-4 border-t-2 border-dashed border-brand-primary/10">
                                  <div className="text-brand-primary whitespace-pre-wrap font-bold">
                                    {answerPart}
                                  </div>
                                </div>
                              )}

                              {/* 解析部分：仅在 analysis 状态下显示 */}
                              {analysisPart && revealState === 'analysis' && (
                                <div className="mt-4 pt-4 border-t-2 border-dashed border-purple-200">
                                  <div className="text-purple-600 whitespace-pre-wrap">
                                    {analysisPart}
                                  </div>
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
