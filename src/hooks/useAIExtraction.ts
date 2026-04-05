'use client';

import { useState, useCallback, useRef } from 'react';
import { useProjectStore, Question } from '@/store/useProjectStore';
import { cropRectFromCanvas, PageOffset, CanvasRect } from '@/lib/canvasCropper';
import { AIClip, SSEPayload, AIQuestionResult, ExtendedRect, toQuestion } from '@/types/ai';
import { compressImage, cropImageByBox } from '@/lib/documentProcessor';

interface UseAIExtractionProps {
  pages: string[];
  rects: ExtendedRect[];
  onComplete: () => void;
}

export function useAIExtraction({ pages, rects, onComplete }: UseAIExtractionProps) {
  const { 
    addQuestions, 
    setProcessing, 
    isProcessing,
    setView,
    questions 
  } = useProjectStore();


  const [progressLabel, setProgressLabel] = useState("");
  const [parsingFailures, setParsingFailures] = useState<{ id: string; label: string; error: string }[]>([]);
  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [totalItems, setTotalItems] = useState(0);



  const startExtraction = useCallback(async (
    offsets: PageOffset[], 
    selectedPageIndices: Set<number>,
    isDeepThinking: boolean,
    correctedRects?: ExtendedRect[] // [NEW] 接收已经处理过坐标偏移的 Rect
  ) => {
    if (isProcessing) return;

    const targetRects = correctedRects || rects;
    const qRects = targetRects.filter(r => r.type === 'question' || !r.type);
    
    // 情况 A: 全自动批量识别 (无手动框选题目)
    if (qRects.length === 0) {
      if (selectedPageIndices.size === 0) {
        alert('请先勾选需要全自动解析的页面。');
        return;
      }
      await runFullAutoExtraction(Array.from(selectedPageIndices), isDeepThinking);
    } 
    // 情况 B: 手动/半自动框选识别
    else {
      await runManualBoxExtraction(offsets, isDeepThinking, targetRects);
    }
  }, [rects, isProcessing, pages]);

  // --- 全自动模式 ---
  async function runFullAutoExtraction(pageIndices: number[], isDeepThinking: boolean) {
    setProcessing(true);
    setParsingFailures([]);
    setTotalItems(pageIndices.length);
    const allResults: Question[] = [];

    try {
      for (let i = 0; i < pageIndices.length; i++) {
        const pageIdx = pageIndices[i];
        setCurrentItemIdx(i);
        setProgressLabel(`正在全自动分析第 ${pageIdx + 1} 页...`);

        const compressedPage = await compressImage(pages[pageIdx], 2000);
        
        // 构造切片：全页作为 Question
        const clips: AIClip[] = [{
          role: 'question',
          source: 'exam', // 全自动模式默认为试卷来源
          color: 'blue',
          image: compressedPage
        }];

        const streamResults = await callAIStream(clips, isDeepThinking, `第 ${pageIdx + 1} 页`);
        if (streamResults) {
          // 处理模型返回的坐标裁剪
          const processed = await Promise.all(streamResults.map(async (q) => {
             let contentImg = compressedPage;
             // 兼容 AI 返回的 snake_case 和 camelCase 坐标字段
             const box = q.content_box || q.contentBox;
             if (box) {
                const crop = await cropImageByBox(compressedPage, box);
                if (crop) contentImg = crop;
             }
             return toQuestion(q, {
               id: Math.random().toString(36).substring(2),
               order: questions.length + allResults.length + 1,
               image: compressedPage,
               contentImage: contentImg,
               pageIndex: pageIdx
             });
          }));
          allResults.push(...processed);
        }
      }

      if (allResults.length > 0) {
        addQuestions(allResults);
        setView('editor');
        onComplete();
      }
    } finally {
      setProcessing(false);
    }
  }

  // --- 手动框选模式 (核心重构：基于颜色切片) ---
  async function runManualBoxExtraction(offsets: PageOffset[], isDeepThinking: boolean, targetRects: ExtendedRect[]) {
    setProcessing(true);
    setParsingFailures([]);
    
    // 按 qIdx 分组
    const groupMap = new Map<number, ExtendedRect[]>();
    targetRects.forEach(r => {
      const qIdx = r.qIdx || 1;
      if (!groupMap.has(qIdx)) groupMap.set(qIdx, []);
      groupMap.get(qIdx)!.push(r);
    });

    const sortedGroups = Array.from(groupMap.entries())
      .filter(([_, g]) => g.some(r => r.type === 'question' || !r.type))
      .sort(([a], [b]) => a - b);

    setTotalItems(sortedGroups.length);
    const allResults: Question[] = [];

    try {
      for (let i = 0; i < sortedGroups.length; i++) {
        const [qIdx, groupRects] = sortedGroups[i];
        setCurrentItemIdx(i);
        setProgressLabel(`正在转录第 ${qIdx} 题...`);

        // 1. 准备该题的所有切片
        const clips: AIClip[] = [];
        const questionImages: string[] = [];
        const questionPageIndices: number[] = [];

        for (const r of groupRects) {
          const slice = await cropRectFromCanvas(r, offsets, pages);
          const role = r.type || 'question';
          const colorMap = { question: 'blue', answer: 'red', analysis: 'purple', diagram: 'emerald' } as const;
          
          clips.push({
            role: role as any,
            source: r.source || 'exam', // [NEW] 传递来源
            color: colorMap[role as keyof typeof colorMap] || 'blue',
            image: slice.base64
          });

          if (role === 'question') {
            questionImages.push(slice.base64);
            if (r.pageIdx !== undefined) questionPageIndices.push(r.pageIdx);
          }
        }

        // 2. 调用 AI
        const streamResults = await callAIStream(clips, isDeepThinking, `题号 ${qIdx}`);
        
        if (streamResults && streamResults.length > 0) {
          const processed = streamResults.map((q, subIdx) => {
            // 极致精准分流：仅保留角色为 'diagram' 的插图，排除所有识字用的文本切片
            const examDiagrams = clips
              .filter(c => c.source !== 'reference' && c.role === 'diagram')
              .map(c => c.image);
            
            const refDiagrams = clips
              .filter(c => c.source === 'reference' && c.role === 'diagram')
              .map(c => c.image);

            return toQuestion(q, {
              id: Math.random().toString(36).substring(2),
              order: questions.length + allResults.length + subIdx + 1,
              images: questionImages,
              contentImages: questionImages,
              pageIndices: questionPageIndices,
              image: questionImages[0] || "",
              contentImage: questionImages[0] || "",
              diagrams: examDiagrams,
              answerDiagrams: refDiagrams,
            });
          });
          allResults.push(...processed);
        }
      }

      if (allResults.length > 0) {
        addQuestions(allResults);
        setView('editor');
        onComplete();
      }
    } finally {
      setProcessing(false);
    }
  }

  // --- SSE 通信核心 ---
  async function callAIStream(clips: AIClip[], isDeepThinking: boolean, label: string): Promise<AIQuestionResult[] | null> {
    const controller = new AbortController();
    const timeoutMs = isDeepThinking ? 300000 : 120000; // 深度思考 300s，普通 120s
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch('/api/ai-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parseQuestion', clips, isDeepThinking }),
        signal: controller.signal
      });

      if (!res.body) throw new Error('ReadableStream not supported');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let data: AIQuestionResult[] | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const payload: SSEPayload = JSON.parse(line.slice(6));
              if (payload.type === 'status') {
                setProgressLabel(`${label}: ${payload.msg}`);
              } else if (payload.type === 'data') {
                data = payload.data;
              } else if (payload.type === 'error') {
                setParsingFailures(prev => [...prev, { id: Date.now().toString(), label, error: payload.error }]);
                return null;
              }
            } catch (e) {}
          }
        }
      }
      return data;
    } catch (err: any) {
      const errorMessage = err.name === 'AbortError' ? 'AI 请求超时无响应（超过120秒），可能是网络波动或模型计算拥堵，请重试该题。' : err.message;
      setParsingFailures(prev => [...prev, { id: Date.now().toString(), label, error: errorMessage }]);
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    startExtraction,
    progressLabel,
    parsingFailures,
    isProcessing,
    currentItemIdx,
    totalItems
  };
}
