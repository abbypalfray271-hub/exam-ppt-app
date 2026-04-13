'use client';

import { create } from 'zustand';
import { persist, StateStorage, createJSONStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';
import { MindMapNode } from '@/types/ai';

// 自定义 Storage：使用 IndexedDB 绕过 LocalStorage 的 5MB 限制（保护高清图片不抛出 QuotaExceededError）
const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await get(name)) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};

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
  pageIndex?: number;     // 单页模式的残留（推荐废弃或作为第一个图的兜底索引）
  runId?: string;         // [NEW] 标识独立提取批次，用于隔离独立输出的卡片
  
  // -- 新增：支持多页散落片段组装（瀑布流兼容） --
  images?: string[];         // 存储 1~N 个框选片段的高清原图 Base64 画廊
  contentImages?: string[];  // 对应抠除答案后的切片图数组
  pageIndices?: number[];    // 记录各碎片来源于原卷的确切页码数组，如 [0, 1]

  answer_box?: [number, number, number, number];  // 记录原图上答案区域的万分位坐标，以便打码
  analysis_box?: [number, number, number, number]; // 记录原图上解析区域的万分位坐标，以便打码
  diagram_boxes?: [number, number, number, number][]; // [NEW] 题中的插图万分位坐标数组
  diagrams?: string[]; // [NEW] 裁剪后的插图图片流 (Base64) 数组
  answerDiagrams?: string[]; // [NEW] 来自参考池的辅助插图/截图流 (Base64) 数组
  mindmapTree?: MindMapNode; // [NEW] 交互式思维导图
}

export interface LayoutConfig {
  materialRatio: number;
  isRightPanelOpen: boolean;
  sidebarWidth: number;
  refPoolWidth: number;
}

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  type: 'danger' | 'warning' | 'info';
  onConfirm?: () => void;
  onCancel?: () => void;
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
  isMathOptimized: boolean; // 是否开启前端分式美化 [NEW]
  layoutConfig: LayoutConfig; // [NEW] 布局持久化配置



  
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
  setMathOptimized: (optimized: boolean) => void; // [NEW] 设置分式美化

  setView: (view: 'upload' | 'editor') => void; // -- 新增：切换视图 --
  setCanvasOpen: (open: boolean) => void; // -- 新增：控制框选画布 --
  setFileType: (type: 'image' | 'pdf' | null) => void;
  updateLayoutConfig: (updates: Partial<LayoutConfig>) => void; // [NEW] 更新布局参数
  setReferencePages: (pages: string[]) => void; // [NEW] 设置参考答案页
  setPages: (pages: string[], mode: 'append' | 'replace', target: 'exam' | 'reference') => void; // [NEW] 通用设置页面的 Action

  resetUpload: () => void; // -- 新增：清除上传相关的旧数据 --
  removePage: (index: number, target: 'exam' | 'reference') => void; // [NEW] 删除单页

  // -- Confirm Dialog Infrastructure --
  dialogState: ConfirmDialogState;
  showConfirm: (options: Omit<ConfirmDialogState, 'isOpen'>) => Promise<boolean>;
  closeConfirm: () => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
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
  isMathOptimized: false, // 默认关闭 [NEW]
  layoutConfig: {
    materialRatio: 55,
    isRightPanelOpen: true,
    sidebarWidth: 280,
    refPoolWidth: 400,
  },
  dialogState: {
    isOpen: false,
    title: '',
    message: '',
    confirmText: '确认',
    cancelText: '取消',
    type: 'danger',
  },

  
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
  setMathOptimized: (optimized) => set({ isMathOptimized: optimized }), // [NEW]
  setFileType: (type) => set({ fileType: type }),
  updateLayoutConfig: (updates) => set((state) => ({
    layoutConfig: { ...state.layoutConfig, ...updates }
  })),

  setReferencePages: (pages) => set({ referencePages: pages }), // [NEW]
  removePage: (index, target) => set((state) => {
    const key = target === 'exam' ? 'examPages' : 'referencePages';
    return {
      [key]: state[key].filter((_, i) => i !== index)
    };
  }),

  showConfirm: (options) => {
    return new Promise<boolean>((resolve) => {
      set({
        dialogState: {
          ...options,
          isOpen: true,
          onConfirm: () => {
            options.onConfirm?.();
            resolve(true);
            set((state) => ({ dialogState: { ...state.dialogState, isOpen: false } }));
          },
          onCancel: () => {
            options.onCancel?.();
            resolve(false);
            set((state) => ({ dialogState: { ...state.dialogState, isOpen: false } }));
          }
        }
      });
    });
  },

  closeConfirm: () => set((state) => ({ dialogState: { ...state.dialogState, isOpen: false } })),

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
    isMathOptimized: false, // 重置 [NEW]
  }),
    }),
    {
      name: 'project-storage',
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        projectName: state.projectName,
        examImageUrl: state.examImageUrl,
        examPages: state.examPages,
        referencePages: state.referencePages,
        questions: state.questions,
        currentMode: state.currentMode,
        isPresenting: state.isPresenting,
        currentSlideIndex: state.currentSlideIndex,
        currentView: state.currentView,
        isCanvasOpen: state.isCanvasOpen,
        fileType: state.fileType,
        isMathOptimized: state.isMathOptimized,
        layoutConfig: state.layoutConfig,
        // 注意：isProcessing 和 dialogState 故意排除，防止死锁或跨会话残留
      }),
    }
  )
);
