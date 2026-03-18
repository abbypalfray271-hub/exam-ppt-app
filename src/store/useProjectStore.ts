'use client';

import { create } from 'zustand';

export interface Question {
  id: string;
  image?: string;         // 原有图片
  material?: string;      // 关联素材文本
  title: string;
  content: string;
  answer?: string;
  analysis?: string;
  steps?: string[];
  summary?: string;
  type: 'choice' | 'fill' | 'essay';
  order: number;
  
  // -- 新增：用于图像切割微调 --
  materialBox?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 万分位坐标 0-1000
  contentBox?: [number, number, number, number];  
  materialImage?: string; // 裁剪后的素材图片 (Base64)
  contentImage?: string;  // 裁剪后的题目图片 (Base64)
  pageIndex?: number;     // 所在页码，如果在多页 PDF 模式下
}

interface ProjectState {
  projectName: string;
  examImageUrl?: string;
  examPages: string[]; // PDF 各页图像
  examText?: string;   // Word 提取的文本
  questions: Question[];
  currentMode: 'quick' | 'deep';
  isProcessing: boolean;
  isPresenting: boolean;      // -- 新增：全屏演示状态 --
  currentSlideIndex: number;  // -- 新增：当前播放页码 --
  currentView: 'upload' | 'editor'; // -- 新增：当前视图 --
  isCanvasOpen: boolean; // -- 新增：框选画布是否打开 --
  
  // Actions
  setProjectName: (name: string) => void;
  setExamImage: (url?: string) => void;
  setExamPages: (pages: string[]) => void;
  setExamText: (text: string) => void;
  addQuestion: (question: Question) => void;
  addQuestions: (questions: Question[]) => void;
  setQuestions: (questions: Question[]) => void;
  updateQuestion: (id: string, updates: Partial<Question>) => void;
  removeQuestion: (id: string) => void;
  removeQuestions: (ids: string[]) => void;
  setMode: (mode: 'quick' | 'deep') => void;
  setProcessing: (processing: boolean) => void;
  setPresenting: (presenting: boolean) => void;    // -- 新增：进入/退出全屏 --
  setCurrentSlideIndex: (index: number) => void; // -- 新增：切页 --
  setView: (view: 'upload' | 'editor') => void; // -- 新增：切换视图 --
  setCanvasOpen: (open: boolean) => void; // -- 新增：控制框选画布 --
  resetUpload: () => void; // -- 新增：清除上传相关的旧数据 --
}

export const useProjectStore = create<ProjectState>((set) => ({
  projectName: '新考试试卷讲解',
  examPages: [],
  questions: [],
  currentMode: 'quick',
  isProcessing: false,
  isPresenting: false,
  currentSlideIndex: 0,
  currentView: 'upload',
  isCanvasOpen: false,
  
  setProjectName: (name) => set({ projectName: name }),
  setExamImage: (url) => set({ examImageUrl: url }),
  setExamPages: (pages) => set({ examPages: pages }),
  setExamText: (text) => set({ examText: text }),
  addQuestion: (q) => set((state) => ({ questions: [...state.questions, q] })),
  addQuestions: (qs) => set((state) => ({ questions: [...state.questions, ...qs] })),
  setQuestions: (qs) => set({ questions: qs }),
  updateQuestion: (id, updates) => set((state) => ({
    questions: state.questions.map((q) => (q.id === id ? { ...q, ...updates } : q))
  })),
  removeQuestion: (id) => set((state) => ({
    questions: state.questions.filter((q) => q.id !== id)
  })),
  removeQuestions: (ids) => set((state) => ({
    questions: state.questions.filter((q) => !ids.includes(q.id))
  })),
  setMode: (mode) => set({ currentMode: mode }),
  setProcessing: (processing) => set({ isProcessing: processing }),
  setPresenting: (presenting) => set({ isPresenting: presenting }),
  setCurrentSlideIndex: (index) => set({ currentSlideIndex: index }),
  setView: (view) => set({ currentView: view }),
  setCanvasOpen: (open) => set({ isCanvasOpen: open }),
  resetUpload: () => set({ 
    examImageUrl: undefined, 
    examPages: [], 
    examText: undefined, 
    questions: [], 
    isProcessing: false,
    currentSlideIndex: 0 
  }),
}));
