'use client';

import { UploadZone } from '@/components/UploadZone';
import { Editor } from '@/components/Editor';
import { motion, AnimatePresence } from 'framer-motion';
import { Presentation, Sparkles, Wand2 } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';

export default function Home() {
  const { questions, currentView } = useProjectStore();
  const hasQuestions = questions.length > 0;

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
          <span className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">
            EXAM PPT MAKER
          </span>
        </div>
        
        <div className="flex items-center gap-6">
          {hasQuestions ? (
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-brand-primary px-3 py-1 bg-brand-primary/10 rounded-full">
                编辑模式
              </span>
              <button 
                onClick={() => window.location.reload()}
                className="text-xs font-bold text-gray-500 hover:text-gray-900"
              >
                新建项目
              </button>
            </div>
          ) : (
            <>
              <button className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">使用教程</button>
              <button className="px-5 py-2.5 bg-gray-900 text-white rounded-full text-sm font-bold hover:bg-gray-800 transition-all shadow-md active:scale-95">
                登 录
              </button>
            </>
          )}
        </div>
      </nav>

      <section className="relative z-10 pt-4 pb-20">
        <AnimatePresence mode="wait">
          {currentView === 'upload' ? (
            <motion.div
              key="landing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-7xl mx-auto px-8 text-center"
            >
              <div className="pt-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-bold tracking-widest uppercase mb-6 shadow-sm border border-brand-primary/20">
                  <Sparkles className="w-3 h-3" /> 
                  AI 驱动的课件革命
                </div>
                
                <h1 className="text-6xl md:text-7xl font-black text-gray-900 mb-8 leading-[1.1]">
                  试卷秒变 PPT<br />
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

      {/* 特性卡片 */}
      <div className="max-w-7xl mx-auto px-8 pb-32">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { icon: Wand2, title: '智能识别', desc: '基于 Gemini 2.0 视觉模型，精准切分题目与图表。' },
            { icon: Sparkles, title: '双模教学', desc: '快速讲评 vs 深度解析，适配不同教学节奏。' },
            { icon: Presentation, title: '原生导出', desc: '支持 PPT 原生对象导出，保留二次编辑权限。' },
          ].map((item, idx) => (
            <div key={idx} className="glass-panel p-8 rounded-3xl border border-white hover:border-brand-primary/30 transition-all duration-300 group">
              <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-brand-primary/10 transition-colors">
                <item.icon className="w-6 h-6 text-gray-400 group-hover:text-brand-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">{item.title}</h3>
              <p className="text-gray-500 leading-relaxed text-sm">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
