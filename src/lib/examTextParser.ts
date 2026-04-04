/**
 * 考题内容解析引擎 (Industrial Lexer v4 - The Simplified Restoration)
 * 职责：回归稳健，将文本拆分为 Text, Cloze, Image, Option。
 * 核心变化：不再强制识别 LaTeX Math 块，全面拥抱原生 Unicode 符号展示。
 */

export type TokenType = 'text' | 'cloze' | 'image' | 'option' | 'math' | 'table';

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
  // 3. Math Block (强力捕获：$ 包裹的内容，或以 \begin, \frac, \sqrt 等开头的原生 LaTeX 序列)
  math: /(\$\$\s*[\s\S]*?\s*\$\$)|(\$\s*[\s\S]*?\s*\$)|(\\begin\{[\s\S]*?\}[\s\S]*?(?:\\end|end)\{[\s\S]*?\}|\\frac\{[\s\S]*?\}\{[\s\S]*?\}|\\sqrt\{[\s\S]*?\}|\\vec\{[\s\S]*?\})/g,
  // 4. Markdown Table Block
  table: /\|[^\n]*\|[ \t]*\n\|[ \t]*[:\-]+[ \t]*\|(?:[ \t]*[:\-]+[ \t]*\|)*[ \t]*(?:\n|$)(?:\|[^\n]*\|[ \t]*(?:\n|$))*/g,
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
      const processed = seg.replace(/(?<!\\)\b(div|cdot|times|frac|sqrt|pm|mp|le|ge|ne|approx|degree|begin|end)\b/g, '\\$1');
      result.push({ type: 'text', content: processed });
    }
  }
  return result;
};

export const parseExamContent = (text: string): Token[] => {
  function safeDecode(str: string): string {
    if (!str || typeof str !== 'string' || !str.includes('%')) return str || '';
    try {
      // 核心算法：使用正则匹配连贯的 %XX 序列进行解码
      // [FIX] 增加对特殊填充字符 (如 \uFFFD) 的物理清除，防止其破坏 URI 序列
      const cleanedStr = str.replace(/\uFFFD/g, ''); 
      return cleanedStr.replace(/(%[0-9A-Fa-f]{2})+/g, (match) => {
        try {
          return decodeURIComponent(match);
        } catch {
          let result = '';
          for (let i = 0; i < match.length; i += 3) {
            const segment = match.substring(i, i + 3);
            try {
              result += decodeURIComponent(segment);
            } catch {
              result += segment;
            }
          }
          return result;
        }
      });
    } catch {
      return str;
    }
  }

  const decodedText = safeDecode(text);
  if (!decodedText) return [];

  const tokens: Token[] = [];
  let lastIndex = 0;
  let match;

  while ((match = combinedRegex.exec(decodedText)) !== null) {
    const matchIndex = match.index;
    const matchText = match[0];

    // 1. 填充文本缝隙
    if (matchIndex > lastIndex) {
      const gapText = decodedText.slice(lastIndex, matchIndex);
      tokens.push(...splitTextAndOptions(gapText));
    }

    // 2. 识别类型
    let type: TokenType = 'text';
    if (matchText.startsWith('{{')) {
      type = 'cloze';
    } else if (matchText.startsWith('$')) {
      type = 'math';
    } else if (matchText.startsWith('|')) {
      type = 'table';
    } else if (matchText === '[附图]' || matchText === '[表格]') {
      type = 'image';
    }

    tokens.push({ type, content: matchText });
    lastIndex = combinedRegex.lastIndex;
  }

  // 3. 收尾
  if (lastIndex < decodedText.length) {
    const remainingText = decodedText.slice(lastIndex);
    tokens.push(...splitTextAndOptions(remainingText));
  }

  return tokens;
};
