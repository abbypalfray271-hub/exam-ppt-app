/**
 * 考题内容解析引擎 (Industrial Lexer v4 - The Simplified Restoration)
 * 职责：回归稳健，将文本拆分为 Text, Cloze, Image, Option。
 * 核心变化：不再强制识别 LaTeX Math 块，全面拥抱原生 Unicode 符号展示。
 */

export type TokenType = 'text' | 'cloze' | 'image' | 'option' | 'math';

export interface Token {
  type: TokenType;
  content: string;
  originalLabel?: string; // 仅用于 option 类型
}

/**
 * 核心识别正则池 (极简版)
 */
const TOKEN_PATTERNS = {
  // 1. Cloze Tags ({{ ... }})
  cloze: /\{\{[\s\S]*?\}\}/g,
  // 2. Resource Placeholders
  resource: /\[附图\]|\[表格\]/g,
  // 3. Defensive Math Block (仅作为极端情况下的兼容，不主动诱导 AI 输出)
  math: /(\$\$\s*[\s\S]*?\s*\$\$)|(\$\s*[\s\S]*?\s*\$)/g,
};

// 合并正则
const combinedRegex = new RegExp(
  Object.values(TOKEN_PATTERNS).map(p => p.source).join('|'),
  'g'
);

/**
 * 处理文本段落，提取 A. B. C. D. 选项
 */
const splitTextAndOptions = (text: string): Token[] => {
  if (!text) return [];
  const result: Token[] = [];
  
  // 识别选项 A. B. C. D. (包括行首、空格后)
  const segments = text.split(/([A-D][\.．]\s*)/g);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    
    if (/^[A-D][\.．]\s*$/.test(seg)) {
      result.push({ type: 'option', content: seg, originalLabel: seg });
    } else {
      result.push({ type: 'text', content: seg });
    }
  }
  return result;
};

export const parseExamContent = (text: string): Token[] => {
  if (!text) return [];

  const tokens: Token[] = [];
  let lastIndex = 0;
  let match;

  while ((match = combinedRegex.exec(text)) !== null) {
    const matchIndex = match.index;
    const matchText = match[0];

    // 1. 填充文本缝隙
    if (matchIndex > lastIndex) {
      const gapText = text.slice(lastIndex, matchIndex);
      tokens.push(...splitTextAndOptions(gapText));
    }

    // 2. 识别类型
    let type: TokenType = 'text';
    if (matchText.startsWith('{{')) {
      type = 'cloze';
    } else if (matchText.startsWith('$')) {
      type = 'math';
    } else if (matchText === '[附图]' || matchText === '[表格]') {
      type = 'image';
    }

    tokens.push({ type, content: matchText });
    lastIndex = combinedRegex.lastIndex;
  }

  // 3. 收尾
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    tokens.push(...splitTextAndOptions(remainingText));
  }

  return tokens;
};
