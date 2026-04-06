'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Maximize2, Minimize2, Target, DownloadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MindMapNode } from '@/types/ai';

interface InteractiveMindMapProps {
  data: MindMapNode;
  onClose?: () => void;
  onUpdate?: (newData: MindMapNode) => void;
}

const NodeItem = ({ 
  node, 
  isFirst = true,
  isLast = false, 
  depth = 0,
  onUpdate
}: { 
  node: MindMapNode, 
  isFirst?: boolean,
  isLast?: boolean, 
  depth?: number,
  onUpdate: (newNode: MindMapNode) => void
}) => {
  const [isExpanded, setIsExpanded] = useState(depth < 1); // 默认展开根节点
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.label);
  const hasChildren = node.children && node.children.length > 0;

  // 同步外部更新到编辑框（当 AI 重新生成或外部修改时）
  useEffect(() => {
    setEditValue(node.label);
  }, [node.label]);

  const handleSave = () => {
    if (editValue.trim() !== node.label) {
      onUpdate({ ...node, label: editValue });
    }
    setIsEditing(false);
  };

  return (
    <div className={cn(
      "flex items-start relative group/node",
      depth > 0 ? "pt-3 pb-3 pl-[48px]" : "py-3" // 动态内边距：给线条留出绝佳 48px 空间
    )}>
      {/* ==================================================== */}
      {/* 🚀 连续连线引擎：分布式局部坐标系完美拼接视觉脊椎 */}
      {/* ==================================================== */}
      {depth > 0 && (
        <>
          {/* 水平接入线：连接主干和当前节点主体 */}
          {!isLast && (
            <div className="absolute border-t-[2.5px] border-orange-500/60 z-0"
                 style={{ 
                   left: '16px', 
                   width: '32px', 
                   top: '2.5rem', // 精确对准节点 Body 的物理中心位置
                   boxShadow: '0 2px 6px rgba(249,115,22,0.15)' 
                 }} />
          )}

          {/* 垂直主干线：由每个子节点负责绘制身旁的这一截 */}
          <div className={cn(
               "absolute border-orange-500/60 z-0",
               // 如果是最后一个节点，那么它是 L 型拐角线；否则只是纯垂直线
               isLast ? "border-l-[2.5px] border-b-[2.5px] rounded-bl-[16px]" : "border-l-[2.5px]",
               // 高度截断策略：让线条完美闭环
               isFirst && isLast ? "top-[1.25rem] h-[1.25rem] shadow-[-2px_2px_8px_rgba(249,115,22,0.2)]" : // 独生子：从父级 Chevron 连到自己即可
               isFirst ? "top-[1.25rem] bottom-0 shadow-[-2px_0_8px_rgba(249,115,22,0.15)]" : // 长子：从 Chevron 获取起点，往下贯通
               isLast ? "top-0 h-[2.5rem] shadow-[-2px_2px_8px_rgba(249,115,22,0.2)]" : // 老幺：上接兄长，止步于自身中心并拐弯
               "top-0 bottom-0 shadow-[-2px_0_8px_rgba(249,115,22,0.15)]" // 中段班：完全的上下贯通桥梁
             )}
             style={{ 
               left: '16px', 
               width: isLast ? '32px' : '0'
             }}
          />
        </>
      )}

      {/* 节点主体 */}
      <div className="flex flex-col items-center shrink-0 z-10 w-full max-w-max">
        <motion.div
          layout
          initial={{ opacity: 0, scale: 0.9, x: -20 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          whileHover={{ scale: 1.02, y: -2 }}
          className={cn(
            "relative px-5 py-4 rounded-2xl shadow-xl border cursor-pointer min-w-[160px] max-w-[280px] transition-all",
            "bg-white/80 backdrop-blur-xl border-white/40 overflow-visible",
            "hover:shadow-blue-200/50 hover:border-blue-300",
            isExpanded && hasChildren ? "ring-2 ring-blue-500/20 shadow-blue-100" : ""
          )}
          onClick={(e) => {
            if (!isEditing && hasChildren) setIsExpanded(!isExpanded);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
        >
          {/* 装饰性渐变背景 */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-50/50 to-transparent opacity-50 pointer-events-none" />
          
          {/* 文本输入或展示区域 */}
          <div className="relative z-10 w-full">
            {isEditing ? (
              <textarea
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSave();
                  }
                  if (e.key === 'Escape') {
                    setEditValue(node.label);
                    setIsEditing(false);
                  }
                }}
                // 修复编辑时拖拽导致事件冒泡的问题
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                className="w-full bg-transparent text-sm font-bold text-slate-800 leading-relaxed outline-none border-b-2 border-orange-500/50 resize-none px-0"
                rows={Math.max(1, editValue.split('\n').length)}
              />
            ) : (
              <p className="text-sm font-bold text-slate-800 leading-relaxed tracking-tight group-hover:text-blue-700">
                {node.label}
              </p>
            )}
          </div>

          {/* 展开/收回 Chevron 按钮 */}
          {hasChildren && (
            <div className={cn(
              "absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border shadow-md flex items-center justify-center transition-all z-20",
              isExpanded ? "bg-blue-600 border-blue-500 text-white rotate-90" : "bg-white text-blue-600 hover:scale-110"
            )}>
              <ChevronRight className="w-4 h-4" />
            </div>
          )}
        </motion.div>
      </div>

      {/* 递归渲染树状子节点大包 */}
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            // 移除了旧版的 ml-8，将间隔物理让出归由内部 NodeItem 的 pl-[48px] 控制，进而实现脊椎的绝对对齐
            className="flex flex-col relative"
          >
            {node.children!.map((child, idx) => (
              <NodeItem 
                key={`${child.label}-${idx}`} // 使用下标 + Label 的组合（更建议未来引入 ID）
                node={child} 
                depth={depth + 1}
                isFirst={idx === 0}
                isLast={idx === node.children!.length - 1} 
                onUpdate={(newChild) => {
                  const newChildren = [...node.children!];
                  newChildren[idx] = newChild;
                  onUpdate({ ...node, children: newChildren });
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const InteractiveMindMap: React.FC<InteractiveMindMapProps> = ({ data, onClose, onUpdate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [isFullScreen, setIsFullScreen] = useState(true);

  // 快捷键支持：ESC 退出
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) setIsFullScreen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullScreen]);

  // 高级特性：导出到 Obsidian (双引擎)
  const exportToObsidian = () => {
    // 1. 生成原生 Markdown 嵌套列表
    const generateMarkdownList = (n: MindMapNode, d: number = 0): string => {
      const indent = '  '.repeat(d);
      const safeLabel = n.label.replace(/\n/g, ' ').trim();
      let res = `${indent}- ${safeLabel}\n`;
      if (n.children) {
        n.children.forEach(child => {
          res += generateMarkdownList(child, d + 1);
        });
      }
      return res;
    };

    // 2. 生成 Mermaid Mindmap 代码
    const generateMermaid = (n: MindMapNode, d: number = 0): string => {
      const indent = '  '.repeat(d + 1);
      // 抹除可能在 Mermaid 中视作特殊闭合图形的字符，以防语法越界解析失败
      const safeLabel = n.label.replace(/[{}[\]()"\n\r]/g, ' ').trim() || '未命名节';
      const shape = d === 0 ? `((${safeLabel}))` : `(${safeLabel})`;
      let res = `${indent}${shape}\n`;
      if (n.children) {
        n.children.forEach(child => {
          res += generateMermaid(child, d + 1);
        });
      }
      return res;
    };

    const markdownList = generateMarkdownList(data);
    const mermaidMap = generateMermaid(data);

    // 结构化拼接 Markdown 内容
    const title = data.label.replace(/\n/g, ' ').trim();
    const finalContent = `# ${title}\n\n## 📋 线性大纲视图\n*(支持 Obsidian 双链展开与折叠)*\n\n${markdownList}\n\n## 🗺️ Mermaid 鸟瞰视图\n*(支持 Obsidian 阅读模式原生渲染)*\n\n\`\`\`mermaid\nmindmap\n  root\n${mermaidMap}\n\`\`\`\n`;

    // 拉起文件下载
    const blob = new Blob([finalContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeTitle = title.replace(/[\\/:*?"<>|\n]/g, '_').substring(0, 30);
    link.download = `${safeTitle.trim() || '未命名脑图'}_导出.md`;
    document.body.appendChild(link);
    link.click();
    
    // 内存自动回收
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 150);
  };

  return (
    <div 
      className={cn(
        "bg-[#f8faff] overflow-hidden flex flex-col transition-all duration-500",
        isFullScreen ? "fixed inset-0 z-[999] p-0" : "relative w-full h-[600px] rounded-3xl shadow-2xl border"
      )}
      onClick={(e) => e.stopPropagation()} 
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* 操控顶栏 */}
      <div className="flex items-center justify-between px-8 py-4 bg-white/60 backdrop-blur-md border-b border-white z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
            <Target className="text-white w-6 h-6" />
          </div>
          <div>
            <h3 className="font-black text-slate-900 tracking-tight">交互式思维导图</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Interactive Logic Explorer</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
            {/* Obsidian 一键导出 */}
            <button 
                onClick={exportToObsidian}
                className="group relative h-10 px-4 flex items-center gap-2 rounded-xl bg-teal-500/10 text-teal-700 font-black text-sm hover:bg-teal-500 hover:text-white transition-all mr-2 shadow-sm border border-teal-500/20"
            >
                <DownloadCloud className="w-4 h-4" />
                <span className="hidden md:inline font-bold">提现到 Obsidian</span>
                
                {/* 悬浮气泡 */}
                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[10px] font-bold tracking-widest rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl z-[9999]">
                   下载 MD 与 MERMAID 原生渲染源码
                </div>
            </button>

            <div className="flex bg-slate-100 p-1 rounded-xl items-center gap-1 mr-4">
                <button 
                  onClick={() => setZoom(prev => Math.max(0.5, prev - 0.1))}
                  className="px-3 py-1 hover:bg-white rounded-lg text-xs font-bold transition-all"
                >-</button>
                <span className="text-[10px] font-black w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button 
                  onClick={() => setZoom(prev => Math.min(2, prev + 0.1))}
                  className="px-3 py-1 hover:bg-white rounded-lg text-xs font-bold transition-all"
                >+</button>
            </div>

            <button 
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-900 text-white shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
                {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            
            {onClose && (
                <button 
                    onClick={onClose}
                    className="h-10 px-4 rounded-xl bg-rose-500 text-white font-black text-sm shadow-xl hover:bg-rose-600 active:scale-95 transition-all"
                >
                    关闭
                </button>
            )}
        </div>
      </div>

      {/* 画布区域 */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-auto bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed"
        style={{ cursor: 'grab' }}
      >
        <motion.div 
          drag
          dragConstraints={false}
          dragElastic={0.1}
          style={{ 
            scale: zoom,
            transformOrigin: '0 0'
          }}
          className="inline-block p-20 min-w-full"
        >
          <NodeItem 
            node={data} 
            depth={0} 
            onUpdate={(newNode) => onUpdate?.(newNode)}
          />
        </motion.div>
      </div>

      {/* 底部装饰：极光光晕 */}
      <div className="absolute -bottom-48 -left-48 w-96 h-96 bg-blue-400/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute -top-48 -right-48 w-96 h-96 bg-purple-400/20 blur-[120px] rounded-full pointer-events-none" />
    </div>
  );
};
