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
  auxiliary_svg?: string; // [NEW] AI 生成的 SVG 辅助线配图
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
  answer_box?: [number, number, number, number];  // 记录原图上答案区域的万分位坐标，以便打码
  analysis_box?: [number, number, number, number]; // 记录原图上解析区域的万分位坐标，以便打码
  diagram_boxes?: [number, number, number, number][]; // [NEW] 题中的插图万分位坐标数组
  diagrams?: string[]; // [NEW] 裁剪后的插图图片流 (Base64) 数组
  answerDiagrams?: string[]; // [NEW] 来自参考池的辅助插图/截图流 (Base64) 数组
}

interface ProjectState {
  projectName: string;
  examImageUrl?: string;
  examPages: string[]; // PDF 各页图像
  referencePages: string[]; // [NEW] 参考答案/素材库

  questions: Question[];
  currentMode: 'quick' | 'deep';
  isProcessing: boolean;
  isPresenting: boolean;      // -- 新增：全屏演示状态 --
  currentSlideIndex: number;  // -- 新增：当前播放页码 --
  currentView: 'upload' | 'editor'; // -- 新增：当前视图 --
  isCanvasOpen: boolean; // -- 新增：框选画布是否打开 --
  fileType: 'image' | 'pdf' | null; // -- 统一：文件类型 --
  processingTarget: 'exam' | 'reference' | null; // [NEW] 正在处理的目标


  
  // Actions
  setProjectName: (name: string) => void;
  setExamImage: (url?: string) => void;
  setExamPages: (pages: string[]) => void;

  addQuestion: (question: Question) => void;
  addQuestions: (questions: Question[]) => void;
  setQuestions: (questions: Question[]) => void;
  updateQuestion: (id: string, updates: Partial<Question>) => void;
  removeQuestion: (id: string) => void;
  removeQuestions: (ids: string[]) => void;
  setMode: (mode: 'quick' | 'deep') => void;
  setProcessing: (processing: boolean, target?: 'exam' | 'reference' | null) => void;
  setPresenting: (presenting: boolean) => void;    // -- 新增：进入/退出全屏 --
  setCurrentSlideIndex: (index: number) => void; // -- 新增：切页 --
  setView: (view: 'upload' | 'editor') => void; // -- 新增：切换视图 --
  setCanvasOpen: (open: boolean) => void; // -- 新增：控制框选画布 --
  setFileType: (type: 'image' | 'pdf' | null) => void;
  setReferencePages: (pages: string[]) => void; // [NEW] 设置参考答案页
  setPages: (pages: string[], mode: 'append' | 'replace', target: 'exam' | 'reference') => void; // [NEW] 通用设置页面的 Action

  resetUpload: () => void; // -- 新增：清除上传相关的旧数据 --
  importProjectJSON: () => void; // [NEW] 导入项目 JSON 演稿

}

export const useProjectStore = create<ProjectState>((set) => ({
  projectName: '新考试试卷讲解',
  examPages: [],
  referencePages: [], // [NEW]
  questions: [],
  currentMode: 'quick',
  isProcessing: false,
  isPresenting: false,
  currentSlideIndex: 0,
  currentView: 'upload',
  isCanvasOpen: false,
  fileType: null,
  processingTarget: null,

  
  setProjectName: (name) => set({ projectName: name }),
  setExamImage: (url) => set({ examImageUrl: url }),
  setExamPages: (pages) => set({ examPages: pages }),

  setPages: (newPages, mode, target) => set((state) => {
    const key = target === 'exam' ? 'examPages' : 'referencePages';
    const oldPages = state[key];
    return {
      [key]: mode === 'replace' ? newPages : [...oldPages, ...newPages],
      fileType: target === 'exam' ? (newPages.length > 0 ? (newPages[0].startsWith('data:application/pdf') ? 'pdf' : 'image') : state.fileType) : state.fileType
    };
  }),

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
  setProcessing: (processing, target = null) => set({ isProcessing: processing, processingTarget: target }),
  setPresenting: (presenting) => set({ isPresenting: presenting }),
  setCurrentSlideIndex: (index) => set({ currentSlideIndex: index }),
  setView: (view) => set({ currentView: view }),
  setCanvasOpen: (open) => set({ isCanvasOpen: open }),
  setFileType: (type) => set({ fileType: type }),
  setReferencePages: (pages) => set({ referencePages: pages }), // [NEW]
  resetUpload: () => set({ 
    examImageUrl: undefined, 
    examPages: [], 
    referencePages: [], // [NEW] 同时清空参考页
    questions: [], 
    isProcessing: false,
    processingTarget: null,
    currentSlideIndex: 0,
    currentView: 'upload',
    isCanvasOpen: false,
    fileType: null,
  }),
  importProjectJSON: () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          set({
            projectName: data.projectName || '导入的试卷',
            examPages: data.examPages || [],
            referencePages: data.referencePages || [],
            questions: data.questions || [],
            fileType: data.fileType || null,
            currentView: 'editor'
          });
        } catch (err) {
          console.error('Failed to parse project JSON', err);
          alert('读取演稿失败，请检查文件格式。');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  },
}));
