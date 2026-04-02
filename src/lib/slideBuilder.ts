/**
 * 幻灯片数据模型与构建逻辑
 * 从 SlidePreview.tsx 提取
 */

import { Question } from '@/store/useProjectStore';

// ============================================================
// 幻灯片数据模型
// ============================================================

export interface SlideData {
  type: 'title' | 'unified';
  questions: Question[];      // 该页包含的所有题目 (用于支持同屏多题)
}

/** 
 * 根据 questions 数组生成完整的幻灯片序列
 * 逻辑：如果连续的题目具有【完全相同】的 material (素材)，则将它们归并为同一张幻灯片。
 */
export function buildSlides(questions: Question[]): SlideData[] {
  const slides: SlideData[] = [{ type: 'title', questions: [] }];
  
  if (questions.length === 0) return slides;

  // === 防御性去重：确保即使 store 中已有重复数据，也不会产生重复幻灯片 ===
  const seen = new Set<string>();
  const dedupedQuestions = questions.filter(q => {
    const fp = (q.content || '').replace(/[\s\p{P}\p{S}]/gu, '').slice(0, 60);
    if (seen.has(fp) && fp.length > 0) return false;
    seen.add(fp);
    return true;
  });

  let currentGroup: Question[] = [dedupedQuestions[0]];
  
  for (let i = 1; i < dedupedQuestions.length; i++) {
    const prevQ = dedupedQuestions[i - 1];
    const currQ = dedupedQuestions[i];
    
    // 判断是否共用素材 (除了文本精确匹配外，还要判断图片 URL)
    const sameMaterialText = prevQ.material === currQ.material && !!prevQ.material;
    const sameMaterialImage = prevQ.materialImage === currQ.materialImage && !!prevQ.materialImage;
    const sameFullImage = prevQ.image === currQ.image && !!prevQ.image;
    
    const sameMaterial = sameMaterialText || sameMaterialImage || sameFullImage;
    
    if (sameMaterial) {
      currentGroup.push(currQ);
    } else {
      slides.push({ type: 'unified', questions: currentGroup });
      currentGroup = [currQ];
    }
  }
  
  // 最后一组
  slides.push({ type: 'unified', questions: currentGroup });
  
  return slides;
}
