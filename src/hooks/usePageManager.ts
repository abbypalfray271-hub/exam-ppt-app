'use client';

import { useState, useCallback } from 'react';
import { compressImage, pdfToImages } from '@/lib/documentProcessor';
import { useProjectStore } from '@/store/useProjectStore';

// ============================================================
// usePageManager — 页面选择/删除/添加管理 Hook
// 从 ExtractionCanvas 中提取的试卷与参考页面管理逻辑
// ============================================================

interface UsePageManagerParams {
  examPages: string[];
  referencePages: string[];
  initialPageIndex?: number;
}

export interface UsePageManagerReturn {
  // --- 选中状态 ---
  selectedPageIndices: Set<number>;
  selectedRefPageIndices: Set<number>;
  activeExamPageIdx: number;
  setActiveExamPageIdx: React.Dispatch<React.SetStateAction<number>>;
  // --- 试卷页面操作 ---
  togglePageSelection: (idx: number) => void;
  handleToggleAll: () => void;
  handleDeleteSelected: () => void;
  // --- 参考页面操作 ---
  toggleRefPageSelection: (idx: number) => void;
  handleToggleAllRef: () => void;
  handleDeleteSelectedRef: () => void;
  // --- 通用操作 ---
  handlePageDelete: (idx: number, source: 'exam' | 'reference') => void;
  handleAddFiles: (files: FileList, source: 'exam' | 'reference') => Promise<void>;
}

export function usePageManager({
  examPages,
  referencePages,
  initialPageIndex = 0,
}: UsePageManagerParams): UsePageManagerReturn {
  const [selectedPageIndices, setSelectedPageIndices] = useState<Set<number>>(new Set());
  const [selectedRefPageIndices, setSelectedRefPageIndices] = useState<Set<number>>(new Set());
  const [activeExamPageIdx, setActiveExamPageIdx] = useState(initialPageIndex);

  const {
    setProcessing,
    setExamPages,
    setReferencePages,
  } = useProjectStore();

  // === 试卷页面 ===

  const togglePageSelection = useCallback((idx: number) => {
    setSelectedPageIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    if (selectedPageIndices.size === examPages.length) {
      setSelectedPageIndices(new Set());
    } else {
      const all = new Set<number>();
      examPages.forEach((_, i) => all.add(i));
      setSelectedPageIndices(all);
    }
  }, [selectedPageIndices.size, examPages.length]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedPageIndices.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedPageIndices.size} 个页面吗？`)) return;

    const newPages = examPages.filter((_, i) => !selectedPageIndices.has(i));
    setExamPages(newPages);
    setSelectedPageIndices(new Set());
    // 如果当前选中的页被删了，重置 activeIdx 到第一页
    setActiveExamPageIdx(0);
  }, [selectedPageIndices, examPages, setExamPages]);

  // === 参考页面 ===

  const toggleRefPageSelection = useCallback((idx: number) => {
    setSelectedRefPageIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const handleToggleAllRef = useCallback(() => {
    if (selectedRefPageIndices.size === referencePages.length) {
      setSelectedRefPageIndices(new Set());
    } else {
      setSelectedRefPageIndices(new Set(referencePages.map((_, i) => i)));
    }
  }, [selectedRefPageIndices.size, referencePages.length]);

  const handleDeleteSelectedRef = useCallback(() => {
    if (selectedRefPageIndices.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedRefPageIndices.size} 个答案页吗？`)) return;
    const newPages = referencePages.filter((_, i) => !selectedRefPageIndices.has(i));
    setReferencePages(newPages);
    setSelectedRefPageIndices(new Set());
  }, [selectedRefPageIndices, referencePages, setReferencePages]);

  // === 通用操作 ===

  const handlePageDelete = useCallback((idx: number, source: 'exam' | 'reference') => {
    if (!confirm(`确定删除该 ${source === 'exam' ? '试卷' : '参考'} 页面吗？`)) return;

    if (source === 'exam') {
      const newPages = examPages.filter((_, i) => i !== idx);
      setExamPages(newPages);
    } else {
      const newPages = referencePages.filter((_, i) => i !== idx);
      setReferencePages(newPages);
    }
    // 重置选中状态以防越界
    setSelectedPageIndices(new Set());
  }, [examPages, referencePages, setExamPages, setReferencePages]);

  const handleAddFiles = useCallback(async (files: FileList, source: 'exam' | 'reference') => {
    setProcessing(true);
    try {
      const newPages: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type === 'application/pdf') {
          const imgs = await pdfToImages(file);
          newPages.push(...imgs);
        } else {
          const reader = new FileReader();
          const base64 = await new Promise<string>((res) => {
            reader.onload = (e) => res(e.target?.result as string);
            reader.readAsDataURL(file);
          });
          const compressed = await compressImage(base64);
          newPages.push(compressed);
        }
      }
      if (source === 'exam') setExamPages([...examPages, ...newPages]);
      else setReferencePages([...referencePages, ...newPages]);
    } catch (error) {
      console.error('Failed to add pages:', error);
      alert('添加页面失败。');
    } finally {
      setProcessing(false);
    }
  }, [examPages, referencePages, setExamPages, setReferencePages, setProcessing]);

  return {
    selectedPageIndices,
    selectedRefPageIndices,
    activeExamPageIdx,
    setActiveExamPageIdx,
    togglePageSelection,
    handleToggleAll,
    handleDeleteSelected,
    toggleRefPageSelection,
    handleToggleAllRef,
    handleDeleteSelectedRef,
    handlePageDelete,
    handleAddFiles,
  };
}
