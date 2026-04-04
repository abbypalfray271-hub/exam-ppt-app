'use client';

import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { cn } from '@/lib/utils';
import { Image as ImageIcon } from 'lucide-react';
import { parseExamContent, Token } from '@/lib/examTextParser';
import { sanitizeExamContent } from '@/lib/contentSanitizer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * 核心数学公式渲染单元
 */
const MathItem = ({ tex }: { tex: string }) => {
  const html = useMemo(() => {
    let content = tex.trim();
    // 强制脱敏：移除所有可能的双重包裹 $
    if (content.startsWith('$$')) content = content.slice(2);
    else if (content.startsWith('$')) content = content.slice(1);
    
    if (content.endsWith('$$')) content = content.slice(0, -2);
    else if (content.endsWith('$')) content = content.slice(0, -1);
    
    content = content.trim();
    if (!content) return '';

    // 极简渲染与关键字自动修复 (自动补全被 AI 遗漏的反斜杠)
    const healed = content
      .replace(/\\(\$)/g, '$1')
      .replace(/(?<!\\)\b(div|cdot|times|frac|sqrt|pm|mp|le|ge|ne|approx|degree|begin|end|sin|cos|tan)\b/g, '\\$1')
      .trim();

    try {
      const isDisplay = tex.includes('$$');
      const html = katex.renderToString(healed, { 
        throwOnError: false, 
        displayMode: isDisplay,
        strict: false,
        trust: true
      });
      return html;
    } catch (e) {
      return healed;
    }
  }, [tex]);
  
  return <span dangerouslySetInnerHTML={{ __html: html }} className="mx-0.5 inline-block align-middle select-all katex-formula whitespace-nowrap break-keep shrink-0" />;
};

/**
 * 互动填空渲染单元
 */
const ClozeItem = ({ raw, showAnswer, diagrams = [] }: { raw: string, showAnswer: boolean, diagrams?: string[] }) => {
  // 提取核心答案文本
  const answerText = raw.replace(/\{\{/g, '').replace(/\}\}/g, '').replace(/[\(（\)）]/g, '').trim();
  if (!answerText) return null;

  if (showAnswer) {
    const displayContent = raw.replace(/\{\{|\}\}/g, '');
    return (
      <span className="inline-block text-brand-primary font-black border-b-[2px] border-brand-primary pb-[1px] px-1 mx-1 bg-brand-primary/10 rounded-sm scale-110 transition-transform">
        <RichExamContent content={displayContent} showClozeAnswers={true} isInternal={true} diagrams={diagrams} />
      </span>
    );
  } else {
    return (
      <span className="inline-block min-w-[5em] text-transparent border-b-[2.5px] border-gray-400/50 pb-[1px] px-2 mx-1 select-none relative bg-gray-100/50 rounded-sm">
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-400 font-bold tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">答案已隐藏</span>
        <RichExamContent content={raw.replace(/\{\{|\}\}/g, '')} showClozeAnswers={false} isInternal={true} diagrams={diagrams} />
      </span>
    );
  }
};

/**
 * 统一排版渲染组件 (The Thorough Solution)
 */
export const RichExamContent = ({ 
  content, 
  showClozeAnswers = false, 
  diagrams = [],
  diagramStartIndex = 0,
  isInternal = false,
  onImageClick
}: { 
  content: string; 
  showClozeAnswers?: boolean;
  diagrams?: string[];
  diagramStartIndex?: number;
  isInternal?: boolean; 
  onImageClick?: (src: string) => void;
}) => {
  const tokens = useMemo(() => {
    const cleaned = isInternal ? content : sanitizeExamContent(content);
    return parseExamContent(cleaned);
  }, [content, isInternal]);

  // --- 高级排版逻辑：对 Token 序列进行二次处理 (Step 5) ---
  const groupedTokens = useMemo(() => {
    const result: (Token | { type: 'options-group', items: { label: string, content: Token[] }[] })[] = [];
    let i = 0;
    
    while (i < tokens.length) {
      if (tokens[i].type === 'option') {
        const optionGroup: { label: string, content: Token[] }[] = [];
        
        while (i < tokens.length && tokens[i].type === 'option') {
          const label = tokens[i].content;
          const contentItems: Token[] = [];
          i++;
          // 收集此选项后的内容，直到遇到下一个选项
          while (i < tokens.length && tokens[i].type !== 'option') {
            contentItems.push(tokens[i]);
            i++;
          }
          optionGroup.push({ label, content: contentItems });
        }
        
        if (optionGroup.length >= 2) {
          result.push({ type: 'options-group', items: optionGroup });
        } else {
          // 只有一个选项，回退为普通渲染
          optionGroup.forEach(opt => {
            result.push({ type: 'option', content: opt.label });
            opt.content.forEach(c => result.push(c));
          });
        }
      } else {
        result.push(tokens[i]);
        i++;
      }
    }
    return result;
  }, [tokens]);

  let diagramIndex = diagramStartIndex;

  return (
    <>
      {groupedTokens.map((token, idx) => {
        // 处理组合类型的 Token (选项网格)
        if ('type' in token && token.type === 'options-group') {
          const avgLength = token.items.reduce((sum, it) => sum + it.content.reduce((s, c) => s + (c.content?.length || 0), 0), 0) / token.items.length;
          let gridCols = "grid-cols-4";
          if (avgLength > 25) gridCols = "grid-cols-1";
          else if (avgLength > 12) gridCols = "grid-cols-2";

          return (
            <div key={idx} className={cn("grid gap-y-4 gap-x-8 mt-6 mb-8 w-full", gridCols)}>
              {token.items.map((opt, i) => (
                <div key={i} className="flex items-start gap-2 group/opt hover:bg-slate-50 transition-colors rounded-lg p-2 -ml-2">
                  <span className="font-black text-brand-primary min-w-[2em] text-[1.1em] transition-transform group-hover/opt:scale-110">
                    {opt.label}
                  </span>
                  <div className="flex-1 text-slate-700 font-medium">
                    {opt.content.map((c, ci) => {
                      let src = undefined;
                      if (c.type === 'image') {
                        src = diagrams[diagramIndex++];
                      }
                      return <RichExamContentFragment key={ci} token={c} src={src} diagrams={diagrams} showClozeAnswers={showClozeAnswers} onImageClick={onImageClick} />;
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        }

        let src = undefined;
        const t = token as Token;
        if (t.type === 'image') {
          src = diagrams[diagramIndex++];
        }

        return <RichExamContentFragment key={idx} token={t} src={src} diagrams={diagrams} showClozeAnswers={showClozeAnswers} onImageClick={onImageClick} />;
      })}
    </>
  );
};

/**
 * 基础单元渲染器 (Fragment)
 */
const RichExamContentFragment = ({ 
  token, 
  src, 
  diagrams, 
  showClozeAnswers, 
  onImageClick 
}: { 
  token: Token, 
  src?: string, 
  diagrams: string[], 
  showClozeAnswers: boolean,
  onImageClick?: (src: string) => void
}) => {
  switch (token.type) {
    case 'math':
      return <MathItem tex={token.content} />;
    case 'cloze':
      return <ClozeItem raw={token.content} showAnswer={showClozeAnswers} diagrams={diagrams} />;
    case 'image':
      return <ImageItem content={token.content} src={src} onClick={() => src && onImageClick?.(src)} />;
    case 'option':
      return <span className="font-black text-brand-primary min-w-[1.8em] text-[1.1em] drop-shadow-sm ml-2">{token.content}</span>;
    case 'text':
      // 兜底逻辑：如果文本中遗留了 LaTeX 关键词或反斜杠命令，且未被 Lexer 识别，则按 MathItem 渲染
      if (token.content.includes('\\') || token.content.includes('begin{') || token.content.includes('frac{')) {
        return <MathItem tex={token.content} />;
      }
      return <TextItem content={token.content} />;
    case 'table':
      return <TableItem content={token.content} />;
    default:
      return null;
  }
};

/**
 * 文本渲染项 (支持关键字高亮)
 */
const TextItem = ({ content }: { content: string }) => {
  // 识别标记词：解、证明、答、因为、由于、所以、则、综上所述
  const parts = content.split(/(解：|证明：|答：|因为|由于|所以|则|综上所述|【解析】|【答案】|【分析】)/g);

  return (
    <span className="whitespace-pre-wrap break-words leading-relaxed inline">
      {parts.map((part, index) => {
        const isKeyword = /^(解：|证明：|答：|因为|由于|所以|则|综上所述|【解析】|【答案】|【分析】)$/.test(part);
        if (isKeyword) {
          const isHeader = /【/.test(part);
          const isConclusion = part === '答：' || part === '综上所述' || part === '【答案】';
          return (
            <span 
              key={index} 
              className={cn(
                "font-black mr-1 decoration-skip-ink-auto",
                isHeader ? "text-slate-800 text-[1.25em] block mt-6 mb-3 border-l-4 border-brand-primary pl-3 bg-slate-100/50 py-1 rounded-r-md" : 
                isConclusion ? "text-brand-primary text-[1.1em] border-b-2 border-brand-primary/20 pb-0.5" : "text-purple-700"
              )}
            >
              {part}
            </span>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
};

const ImageItem = ({ content, src, onClick }: { content: string, src?: string, onClick?: () => void }) => {
  if (src) {
    return (
      <span className="block my-6 max-w-full overflow-hidden">
        <img 
          src={src} 
          alt="Exam fragment" 
          onClick={onClick}
          className="max-h-[500px] w-auto max-w-full rounded-xl shadow-2xl border-2 border-slate-100 hover:scale-[1.02] transition-transform duration-300 cursor-zoom-in active:scale-95" 
        />
      </span>
    );
  }
  return (
    <span className="text-gray-400 italic mx-1 opacity-50 inline-flex items-center gap-1 border border-dashed border-gray-200 px-2 py-1 rounded">
      <ImageIcon className="w-3 h-3" /> {content}载入中...
    </span>
  );
};

const TableItem = ({ content }: { content: string }) => {
  return (
    <div className="my-4 overflow-x-auto w-full max-w-full print:overflow-visible">
      <div className="markdown-table-wrapper inline-block min-w-full align-middle border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({node, ...props}) => <table className="min-w-full divide-y divide-slate-200 text-sm border-collapse" {...props} />,
            thead: ({node, ...props}) => <thead className="bg-slate-50" {...props} />,
            tbody: ({node, ...props}) => <tbody className="divide-y divide-slate-200 bg-white" {...props} />,
            tr: ({node, ...props}) => <tr className="hover:bg-slate-50/50 transition-colors" {...props} />,
            th: ({node, ...props}) => <th className="px-4 py-3 text-left font-bold text-slate-700 whitespace-nowrap border border-slate-200" {...props} />,
            td: ({node, ...props}) => <td className="px-4 py-3 text-slate-600 font-medium border border-slate-200" {...props} />
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};

