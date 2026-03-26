'use client';

import React, { useRef, useEffect } from 'react';
import { UploadZone } from '@/components/UploadZone';
import { Editor } from '@/components/Editor';
import { motion, AnimatePresence } from 'framer-motion';
import { Presentation, Sparkles, Wand2 } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';



export default function Home() {
  const { questions, currentView } = useProjectStore();
  const hasQuestions = questions.length > 0;

  // 每次切回 upload 视图时递增 key，防止 AnimatePresence 的 key 冲突
  // 导致 framer-motion 将新进入的组件误判为正在退出的旧组件，从而禁用 pointer-events
  const uploadKeyRef = useRef(0);
  useEffect(() => {
    if (currentView === 'upload') {
      uploadKeyRef.current += 1;
    }
  }, [currentView]);

  return (
    <main className="min-h-screen bg-[#F8FAFC] overflow-hidden relative">
      {/* 背景装饰 */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-primary/5 blur-[120px] rounded-full" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-brand-secondary/5 blur-[120px] rounded-full" />

      <nav className="relative z-10 px-8 py-6 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center shadow-lg shadow-brand-primary/30">
            <Presentation className="text-white w-6 h-6" />
          </div>
          <span className="text-xl font-black tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500">Ai</span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 ml-1.5">试卷专家</span>
          </span>
        </div>
        
        {/* Debug 按钮已移除，全面使用 API 路由 */}

      </nav>

      <section className="relative z-10 pt-4 pb-20">
        <AnimatePresence mode="wait">
          {currentView === 'upload' ? (
            <motion.div
              key={`landing-${uploadKeyRef.current}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-7xl mx-auto px-8 text-center"
            >
              <div className="pt-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 backdrop-blur-sm text-xs font-bold tracking-widest uppercase mb-6 shadow-md border border-gray-100 animate-pulse transition-all hover:scale-105">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" /> 
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500">
                    AI 驱动的课件革命
                  </span>
                </div>
                
                <h1 className="text-6xl md:text-7xl font-black text-gray-900 mb-8 leading-[1.1]">
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500">Ai</span> 让试卷秒变<br />
                  <span className="text-brand-primary italic">智慧讲解</span> 即刻开启
                </h1>

                <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-16 leading-relaxed">
                  上传试卷，由 AI 自动切割题目、生成解析、并排版成精美的讲解课件。
                  支持手写识别与双模教学。
                </p>

                <UploadZone />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="editor"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full"
            >
              <Editor />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* 终极缓存验证探针：版本号 */}
      <div className="fixed bottom-1 right-2 text-[8px] text-gray-200/50 pointer-events-none z-[9999] select-none font-mono">
        v202603261457
      </div>
    </main>
  );
}
