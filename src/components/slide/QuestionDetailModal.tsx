import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Maximize2, Minimize2, BookOpen, CheckSquare, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Question } from '@/store/useProjectStore';
import { RichExamContent } from '@/components/RichExamContent';

export interface QuestionDetailModalProps {
  expandedQuestion: Question | null;
  setExpandedQuestion: (q: Question | null) => void;
  editable: boolean;
  updateQuestion: (id: string, updates: Partial<Question>) => void;
  setZoomedImage: (img: string | null) => void;
}

export const QuestionDetailModal: React.FC<QuestionDetailModalProps> = ({
  expandedQuestion,
  setExpandedQuestion,
  editable,
  updateQuestion,
  setZoomedImage
}) => {
  // 隔离内部状态
  const [isDetailFullScreen, setIsDetailFullScreen] = useState(false);
  const [revealState, setRevealState] = useState<'hidden' | 'answer' | 'analysis'>('hidden');
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [mounted, setMounted] = useState(false); // SSR 安全：仅客户端渲染 Portal
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  
  // 🛡️ iOS Safari 橡皮筋回弹拦截：当滚动到顶部/底部边界时，阻止触控默认行为
  React.useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    
    const handleTouchMove = (e: TouchEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
      
      // 判断滑动方向
      const touch = e.touches[0];
      const startY = (el as any).__startY ?? touch.clientY;
      const deltaY = touch.clientY - startY;
      
      // 在顶部继续往下拉 或 在底部继续往上推 → 拦截
      if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
        if (e.cancelable) e.preventDefault();
      }
    };
    
    const handleTouchStart = (e: TouchEvent) => {
      (el as any).__startY = e.touches[0].clientY;
    };
    
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);
  
  // 🏆 iOS Safari 专用：position:fixed 锁定背景滚动（overflow:hidden 在 iOS 上无效）
  React.useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const html = document.documentElement;
    
    // 保存原始样式
    const originalBodyStyle = body.style.cssText;
    const originalHtmlStyle = html.style.cssText;
    
    // 强制锁定：将 body 钉死在当前位置
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    
    return () => {
      // 还原：恢复原始样式并跳回原来的滚动位置
      body.style.cssText = originalBodyStyle;
      html.style.cssText = originalHtmlStyle;
      window.scrollTo(0, scrollY);
    };
  }, []);

  // SSR 安全检测：确保 document.body 存在后才渲染 Portal
  React.useEffect(() => setMounted(true), []);

  if (!expandedQuestion || !mounted) return null;

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

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "fixed inset-0 z-[100] flex justify-center bg-black/60 backdrop-blur-sm transition-all duration-300 touch-none overscroll-none",
        isDetailFullScreen ? "p-0 items-stretch" : "items-start pt-[max(env(safe-area-inset-top,0px),2.5rem)] px-2 md:items-center md:pt-0 md:p-8"
      )}
      onTouchMove={(e) => e.preventDefault()}
      onClick={() => {
        setExpandedQuestion(null);
        setIsDetailFullScreen(false);
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={cn(
          "relative bg-white shadow-2xl overflow-hidden flex flex-col transition-all duration-300 ease-in-out touch-auto",
          isDetailFullScreen 
            ? "w-screen h-screen rounded-none" 
            : "max-w-5xl w-full max-h-[90vh] rounded-2xl"
        )}
        onClick={(e) => {
          e.stopPropagation();
          // 🛡️ 立即解除焦点，防止 iOS 键盘弹出
          (document.activeElement as HTMLElement)?.blur();
          setRevealState(prev => prev === 'hidden' ? 'answer' : prev === 'answer' ? 'analysis' : 'hidden');
        }}
      >
        {/* 弹窗头部栏 */}
        <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-100 bg-white gap-2 shrink-0 z-50">
          <h3 className="text-base md:text-xl font-black text-slate-800 tracking-tight flex-1 truncate">
            题目详情：{expandedQuestion.title}
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDetailFullScreen(!isDetailFullScreen);
              }}
              className="flex items-center gap-2 min-h-[44px] px-4 bg-brand-primary text-white rounded-xl font-black text-sm shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 active:scale-95 transition-all"
              title={isDetailFullScreen ? "还原窗口" : "全屏显示"}
            >
              {isDetailFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              <span className="hidden sm:inline">{isDetailFullScreen ? "还原" : "全屏"}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpandedQuestion(null);
              }}
              className="flex items-center gap-2 min-h-[44px] px-4 bg-red-500 text-white rounded-xl font-black text-sm shadow-lg shadow-red-500/20 hover:bg-red-600 active:scale-95 transition-all"
            >
              <X className="w-5 h-5" />
              <span className="hidden sm:inline">关闭</span>
            </button>
          </div>
        </div>
        
        {/* 图文混合展示区 (可滚动 + 动能隔离) */}
        <div ref={scrollContainerRef} className="flex-1 overflow-auto p-6 custom-scrollbar flex flex-col gap-6 bg-[#f8fafc] overscroll-contain">
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
        </div>
      </motion.div>
    </motion.div>,
    document.body  // 🏆 Portal: 彻底脱离祖先滚动容器的 DOM 树
  );
};
