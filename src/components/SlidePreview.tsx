'use client';

import React from 'react';
import { Question, useProjectStore } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { 
  Trash2, 
  BookOpen,
  ZoomIn
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

  let currentGroup: Question[] = [questions[0]];
  
  for (let i = 1; i < questions.length; i++) {
    const prevQ = questions[i - 1];
    const currQ = questions[i];
    
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
  const { updateQuestion } = useProjectStore();

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

  // 假设同一组题目的素材是一致的，取第一个即可
  const firstQ = questions[0];
  const hasMaterial = firstQ.material && firstQ.material.trim().length > 0;
  const hasMaterialImage = !!firstQ.materialImage;

  return (
    <div className="w-full h-full bg-white flex">
      {/* 左侧 38%：素材区 */}
      <div className="w-[38%] h-full bg-[#f8fafc] flex flex-col p-[2.5%] border-r border-gray-100">
        <div className="flex items-center gap-2 mb-[3%]">
          <BookOpen className="w-[1.2em] h-[1.2em] text-[#64748b]" />
          <span className="text-[0.65em] font-black text-[#64748b] tracking-wider uppercase">
            素材原文
          </span>
        </div>
        
        <div className="flex-1 overflow-hidden flex flex-col gap-2">
          {hasMaterialImage ? (
            <div className="flex-1 overflow-hidden rounded-xl flex items-center justify-center bg-white shadow-inner p-[3%] relative group border border-gray-100">
              <img src={firstQ.materialImage} alt="素材原图" className="w-full h-full object-contain mix-blend-multiply" />
              {editable && (
                <button
                  onClick={() => updateQuestion(firstQ.id, { materialImage: undefined })}
                  className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
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
          ) : firstQ.image ? (
            <div className="flex-1 overflow-hidden rounded-xl flex items-center bg-white shadow-inner p-[3%] border border-gray-100">
              <img src={firstQ.image} alt="背景图" className="w-full h-auto object-contain mix-blend-multiply" />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#f1f5f9]/50 rounded-xl border-2 border-dashed border-gray-200">
              <BookOpen className="w-8 h-8 text-gray-200 mb-2" />
              <p className="text-[0.55em] text-gray-300 font-bold">暂无关联素材</p>
            </div>
          )}
        </div>
      </div>

      {/* 右侧 62%：题目聚合区 */}
      <div className="w-[62%] h-full flex flex-col p-[2%] gap-[2%] overflow-y-auto custom-scrollbar bg-white">
        {questions.map((q, qIdx) => (
          <div key={q.id} className="flex flex-col gap-2 shrink-0">
            {/* 题号与标题 */}
            <div className="flex items-center gap-[2%] shrink-0 pb-1 border-b border-gray-50 mt-2 first:mt-0">
              <div className="bg-[#1e293b] text-white px-2 py-0.5 rounded-md shadow-sm">
                <span className="text-[0.6em] font-black italic tracking-tighter">Q{qIdx + 1}</span>
              </div>
              <div className="flex-1 overflow-hidden">
                {editable ? (
                  <input
                    className="w-full text-[0.8em] font-black text-[#1e293b] bg-transparent border-none outline-none hover:bg-gray-50 focus:bg-blue-50/50 rounded px-1 transition-colors truncate"
                    value={q.title}
                    onChange={(e) => updateQuestion(q.id, { title: e.target.value })}
                  />
                ) : (
                  <h3 className="text-[0.8em] font-black text-[#1e293b] truncate">
                    {q.title || `题目`}
                  </h3>
                )}
              </div>
            </div>

            {/* 题目展示内容 (优先展示原卷图片切片) */}
            <div className="relative group">
              {q.contentImage ? (
                <div className="w-full rounded-xl border border-gray-100 overflow-hidden bg-gray-50/50 p-1 relative flex items-center justify-center">
                  <img src={q.contentImage} alt="题目切片" className="w-full h-auto object-contain mix-blend-multiply" />
                  {editable && (
                    <button
                      onClick={() => updateQuestion(q.id, { contentImage: undefined })}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-lg p-2 border border-gray-50">
                  {editable ? (
                    <textarea
                      className="w-full text-[0.75em] font-bold text-[#334155] leading-[2] bg-transparent border-none outline-none resize-none focus:ring-0 min-h-[4em]"
                      value={q.content}
                      onChange={(e) => updateQuestion(q.id, { content: e.target.value })}
                    />
                  ) : (
                    <p className="text-[0.75em] font-bold text-[#334155] leading-[2] whitespace-pre-wrap">
                      {q.content}
                    </p>
                  )}
                </div>
              )}
            </div>
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
}

export const SlideFrame: React.FC<SlideFrameProps> = ({ children, selected, onClick, className, label }) => {
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
    </div>
  );
};
