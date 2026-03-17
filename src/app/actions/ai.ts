'use server';

import { chatWithGemini, EXAM_PROMPT, FULL_EXAM_PROMPT } from '@/lib/gemini';

export async function parseQuestionAction(imageBase64: string) {
  try {
    const response = await chatWithGemini(
      [
        { role: 'system', content: EXAM_PROMPT },
        { role: 'user', content: '请解析这张考题图片的内容，逐题拆分为独立对象。' }
      ],
      imageBase64
    );

    // 优先匹配 JSON 数组 [...]，兼容单对象 {...}
    const arrayMatch = response.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      const results = JSON.parse(arrayMatch[0]);
      // 确保返回的是数组
      return { success: true, data: Array.isArray(results) ? results : [results] };
    }

    // 兜底：尝试匹配单个 JSON 对象
    const objMatch = response.match(/\{[\s\S]*\}/);
    if (objMatch) {
      const result = JSON.parse(objMatch[0]);
      return { success: true, data: [result] };
    }

    throw new Error('AI 返回的内容不包含有效的 JSON 格式');
  } catch (error: any) {
    console.error('parseQuestionAction failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 全卷自动化解析 Action
 * 支持纯文本 (Word) 或 图片序列 (PDF/多图)
 */
export async function parseFullDocumentAction(input: string | string[]) {
  try {
    let userMessage = '';
    let images: string[] | undefined = undefined;

    if (typeof input === 'string') {
      // Word 文本模式
      userMessage = `以下是整份考卷的文本内容，请识别所有题目并按要求输出 JSON 数组：\n\n${input}`;
    } else {
      // PDF/多图模式
      userMessage = '请识别并解析这些图片序列中的所有题目，按顺序输出 JSON 数组。';
      images = input;
    }

    const response = await chatWithGemini(
      [
        { role: 'system', content: FULL_EXAM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      images
    );

    const jsonStr = response.replace(/```json/g, '').replace(/```/g, '').trim();
    const results = JSON.parse(jsonStr);

    return { success: true, data: results };
  } catch (error: any) {
    console.error('Full document parse failed:', error);
    return { success: false, error: error.message };
  }
}
