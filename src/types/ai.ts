/**
 * AI 解析相关的类型定义
 * 统一约束 AI 返回值的数据结构，消除 any 的传播
 */

import { Question } from '@/store/useProjectStore';
import { type CanvasRect as Rect } from '@/lib/canvasCropper';

/**
 * 扩展的切片坐标基类，用于兼容多源画板操作
 */
export interface ExtendedRect extends Rect {
  source: 'exam' | 'reference';
  pageIdx?: number;
}

/**
 * AI API (parseQuestion) 返回的原始题目数据结构
 * 
 * 注意：这是 AI 模型返回的原始 JSON 结构，字段名可能使用 snake_case。
 * 下游在转换为 Question 时需要做字段映射。
 */
export interface MindMapNode {
  label: string;
  children?: MindMapNode[];
  isExpanded?: boolean; // 运行时状态
}

export interface AIQuestionResult {
  title?: string;
  content: string;
  answer?: string;
  analysis?: string;
  type?: 'choice' | 'fill' | 'essay';
  material?: string;
  steps?: string[];
  summary?: string;
  auxiliary_svg?: string;
  mindmap_tree?: MindMapNode; // [NEW] 用于生成思维导图

  // AI 返回的坐标信息 (snake_case: AI 原始输出)
  content_box?: [number, number, number, number];
  contentBox?: [number, number, number, number];  // 别名兼容
  answer_box?: [number, number, number, number];
  analysis_box?: [number, number, number, number];
  diagram_boxes?: [number, number, number, number][];
  
  // AI 可能返回的图表坐标对象数组
  diagrams?: AIDiagramBox[];

  // 运行时追加的字段 (由 ExtractionCanvas 在后处理中写入)
  image?: string;
  contentImage?: string;
  materialImage?: string;
  pageIndex?: number;
  
  // 画廊扩容：多图/跨页碎片支持
  images?: string[];
  contentImages?: string[];
  pageIndices?: number[];
}

/**
 * 具名标记切片，明确 AI 的处理职责
 */
export interface AIClip {
  role: 'question' | 'answer' | 'analysis' | 'diagram';
  source: 'exam' | 'reference'; // [NEW] 区分素材来源：试卷还是参考池
  color: 'blue' | 'red' | 'purple' | 'emerald';
  image: string; // Base64
}

/**
 * AI 返回的图表坐标对象
 * 兼容多种可能的坐标字段名
 */
export interface AIDiagramBox {
  box_2d?: number[];
  box?: number[];
  box2d?: number[];
  [key: string]: unknown;  // 允许其他未知字段
}

/**
 * SSE 流中单个数据帧的类型
 */
export type SSEPayload = 
  | { type: 'status'; msg: string }
  | { type: 'data'; data: AIQuestionResult[] }
  | { type: 'error'; error: string };

/**
 * 将 AIQuestionResult 转换为 store 可用的 Question
 * 
 * @param raw AI 返回的原始题目
 * @param overrides 额外覆盖的字段 (如 id, order, image 等)
 */
export function toQuestion(
  raw: AIQuestionResult,
  overrides: Partial<Question> & { id: string; order: number }
): Question {
  return {
    title: raw.title || '',
    content: raw.content || '',
    answer: raw.answer,
    analysis: raw.analysis,
    type: raw.type || 'essay',
    material: raw.material,
    steps: raw.steps,
    summary: raw.summary,
    auxiliary_svg: raw.auxiliary_svg,
    mindmapTree: raw.mindmap_tree, // [NEW]
    contentBox: raw.content_box || raw.contentBox,
    answer_box: raw.answer_box,
    analysis_box: raw.analysis_box,
    diagram_boxes: raw.diagram_boxes,
    images: raw.images || [],
    contentImages: raw.contentImages || [],
    pageIndices: raw.pageIndices || [],
    ...overrides, // id, order, image, contentImage, diagrams 等由调用方提供
  };
}
