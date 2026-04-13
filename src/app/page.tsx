'use client';

import React, { useRef, useEffect } from 'react';
import { UploadZone } from '@/components/UploadZone';
import { Editor } from '@/components/Editor';
import { motion, AnimatePresence } from 'framer-motion';
import { Presentation, Sparkles, Wand2 } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { createPortal } from 'react-dom';
import { ExtractionCanvas } from '@/components/ExtractionCanvas';



export default function Home() {
  const { 
    questions, 
    currentView, 
    isCanvasOpen, 
    setCanvasOpen, 
    examPages, 
    referencePages,
    setView,
    resetUpload
  } = useProjectStore();
  const hasQuestions = questions.length > 0;

  // SSR 安全：等待客户端挂载完成后再渲染，防止 Zustand 持久化状态导致的 Hydration 不匹配
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // 每次切回 upload 视图时递增 key，防止 AnimatePresence 的 key 冲突
  // 导致 framer-motion 将新进入的组件误判为正在退出的旧组件，从而禁用 pointer-events
  const uploadKeyRef = useRef(0);
  useEffect(() => {
    if (currentView === 'upload') {
      uploadKeyRef.current += 1;
    }
  }, [currentView]);

  // 客户端挂载前显示品牌骨架屏，避免 SSR/Client 状态差异
  if (!mounted) {
    return (
      <main className="h-[100dvh] bg-[#F8FAFC] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="w-16 h-16 bg-brand-primary rounded-2xl flex items-center justify-center shadow-lg shadow-brand-primary/30">
            <Presentation className="text-white w-10 h-10" />
          </div>
          <span className="text-sm font-black text-slate-300 uppercase tracking-[0.3em]">
            Loading...
          </span>
        </div>
      </main>
    );
  }

  return (
    <main className="h-[100dvh] bg-[#F8FAFC] overflow-hidden flex flex-col relative">
      {/* 背景装饰 */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-primary/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-brand-secondary/5 blur-[120px] rounded-full pointer-events-none" />

      <nav 
        inert={isCanvasOpen}
        className="relative z-10 px-8 py-6 flex justify-between items-center max-w-7xl mx-auto"
      >
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center shadow-lg shadow-brand-primary/30">
            <Presentation className="text-white w-6 h-6" />
          </div>
          <span className="text-xl font-black tracking-tight flex items-center gap-2">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">试题演稿制作</span>
            <span className="px-2 py-0.5 text-[10px] bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white rounded-lg shadow-sm uppercase tracking-wider font-extrabold transform -skew-x-6">Pro</span>
          </span>
        </div>
        
        {/* Debug 按钮已移除，全面使用 API 路由 */}

      </nav>

      <section 
        inert={isCanvasOpen}
        className={cn("relative z-10 flex flex-col flex-1 min-h-0", currentView === 'upload' ? "pt-10 pb-10 flex items-center justify-center overflow-x-hidden" : "")}
      >
        <AnimatePresence mode="wait">
          {currentView === 'upload' ? (
            <motion.div
              key={`landing-${uploadKeyRef.current}`}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full h-full max-w-5xl mx-auto px-4 flex items-center justify-center"
            >
              <UploadZone />
            </motion.div>
          ) : (
            <motion.div
              key="editor"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full flex-1 flex flex-col min-h-0 relative"
            >
              <Editor />
            </motion.div>
          )}
        </AnimatePresence>
      </section>



      {isCanvasOpen && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[999] bg-white">
            <ExtractionCanvas 
              examPages={examPages}
              referencePages={referencePages}
              onComplete={() => { setCanvasOpen(false); setView('editor'); }}
              onClose={() => { setCanvasOpen(false); resetUpload(); }}
            />
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </main>
  );
}
