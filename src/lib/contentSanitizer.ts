/**
 * 考题内容净化引擎 (Restored & Stable)
 * 职责：回归文本本元，不再对 LaTeX 进行深度干预，仅处理基础转义与换行。
 */

/**
 * 1. HTML 实体解码
 */
const decodeHtmlEntities = (text: string): string => {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
};

/**
 * 2. 换行符恢复
 */
const restoreNewlines = (text: string): string => {
  // 恢复过大的转义换行 (\\n) 为实际换行
  return text.replace(/\\(?!b|f|n|r|t|u)/g, '').replace(/\\n/g, '\n');
};

/**
 * 3. 基础反转义
 */
const basicUnescape = (text: string): string => {
  return text
    // 移除 AI 偶尔带出的转义符号
    .replace(/\\(\$)/g, '$1')
    .replace(/\\(\{)/g, '$1')
    .replace(/\\(\})/g, '$1')
    .replace(/\\(\[)/g, '$1')
    .replace(/\\(\])/g, '$1');
};

/**
 * 核心对外接口：全量净化
 */
export const sanitizeExamContent = (rawText: string): string => {
  if (!rawText || typeof rawText !== 'string') return '';

  let sanitized = rawText;

  sanitized = decodeHtmlEntities(sanitized);
  sanitized = restoreNewlines(sanitized);
  sanitized = basicUnescape(sanitized);

  return sanitized.trim();
};
