'use client';

import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';

// ============================================================
// 标题页幻灯片
// 从 SlidePreview.tsx 提取
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
      <p className="text-2xl font-black text-slate-400 mt-[5%] tracking-[0.3em] uppercase">
        助教工具：试卷题目极简分割
      </p>
    </div>
  );
};
