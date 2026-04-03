/**
 * LaTeX 符号清理引擎 (轻量版)
 * 将常见的 LaTeX 符号转换为 Unicode 字符，仅用于极简展现或 KaTeX 渲染前的预处理。
 * 复杂的数学结构（如分式、根号）现由 KaTeX 高保真渲染引擎接管。
 */

/**
 * 将常见的 LaTeX 符号转换为 Unicode
 */
export const cleanLatexSymbols = (text: string): string => {
  if (!text) return text;

  // === 第一步：如果文本包含 KaTeX 定界符 $，则跳过大部分清理，交给渲染器 ===
  // 但我们依然清理一些基础符号以便在不支持 KaTeX 的地方也能看
  
  let safed = text
    // === 基础 LaTeX 符号映射 (由 LaTeX 语法保持) ===
    .replace(/\\triangle/g, '△')
    .replace(/\\angle/g, '∠')
    .replace(/\\perp/g, '⊥')
    .replace(/\\parallel/g, '∥')
    .replace(/\\odot/g, '⊙')
    .replace(/\\pi/g, 'π')
    .replace(/\\pm/g, '±')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\neq/g, '≠')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\approx/g, '≈')
    .replace(/\\infty/g, '∞')
    .replace(/\\quad/g, ' ')
    .replace(/\\cdot/g, '·')
    .replace(/\\le/g, '≤')
    .replace(/\\ge/g, '≥')
    .replace(/\\circ/g, '°')
    .replace(/\\degree/g, '°')
    
    // === 处理一些 AI 容易输出的非标符号 ===
    .replace(/\\\*/g, '×')
    
    // === 基础格式清理 ===
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    .replace(/\\{2,}/g, '\n')        // 将双反斜杠 \\ 转换为换行符

  // 注意：我们不再移除单反斜杠 \，因为这会破坏 KaTeX 结构
  // 也不再模拟 \frac 或 \sqrt
  
  return safed;
};

/**
 * 识别并分割关键词
 */
export function splitByKeywords(rawText: string): { part: string; isKeyword: boolean; isConclusion: boolean }[] {
  if (!rawText) return [];
  
  // 注意：在分割关键字前不要进行全量 LaTeX 清理，防止破坏数学式
  const parts = rawText.split(/(解：|证明：|答：|因为|由于|所以|则|综上所述)/g);
  
  return parts.map((part) => {
    const isKeyword = /^(解：|证明：|答：|因为|由于|所以|则|综上所述)$/.test(part);
    const isConclusion = part === '答：' || part === '综上所述';
    return { part, isKeyword, isConclusion };
  });
}
