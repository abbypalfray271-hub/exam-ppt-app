/**
 * LaTeX 符号清理引擎
 * 将常见的 LaTeX 命令转换为 Unicode 纯文本，适配课堂投影展示
 * 从 SlidePreview.tsx 提取
 */

/**
 * 将常见的 LaTeX 符号转换为 Unicode
 */
export const cleanLatexSymbols = (text: string): string => {
  if (!text) return text;

  // === 第一步：保护 {{...}} 答案块，防止被后续正则破坏 ===
  const preserved: string[] = [];
  let safed = text.replace(/\{\{[\s\S]*?\}\}/g, (match) => {
    preserved.push(match);
    return `__CLOZE_${preserved.length - 1}__`;
  });

  // === 第二步：执行 LaTeX 符号清理 ===
  safed = safed
    // === 高优先级结构化指令解析 (必须最先运行) ===
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, (match, p1, p2) => {
       // 智能规则：如果分子或分母包含运算符（+ - * /）或空格，则添加括号，否则直接输出
       const wrapIfComplex = (s: string) => {
         const needsWrap = /[\+\-\s\/\*]/.test(s.trim());
         return needsWrap ? `(${s})` : s;
       };
       return `${wrapIfComplex(p1)}/${wrapIfComplex(p2)}`;
    })
    .replace(/\\frac\s*(\d+)\s*(\d+)/g, '$1/$2')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\sqrt/g, '√')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    .replace(/\\pi/g, 'π')
    
    .replace(/\\overset\{\\frown\}\{([^}]+)\}/g, '⌒$1')
    .replace(/\\frown\{([^}]+)\}/g, '⌒$1')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\delta/g, 'δ')
    .replace(/\\theta/g, 'θ')
    .replace(/\\rho/g, 'ρ')
    .replace(/\\sigma/g, 'σ')
    .replace(/\\phi/g, 'φ')
    .replace(/\\omega/g, 'ω')
    .replace(/\\lambda/g, 'λ')
    .replace(/\^\\\circ/g, '°') 
    .replace(/\^°/g, '°')
    
    // === 常用几何与数学符号映射 ===
    .replace(/\\triangle/g, '△')
    .replace(/\\angle/g, '∠')
    .replace(/\\perp/g, '⊥')
    .replace(/\\parallel/g, '∥')
    .replace(/\\circ/g, '°')
    .replace(/\\degree/g, '°')
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
    
    // === 处理数学指数 (Unicode 上标) ===
    .replace(/\^\{?(-?[0-9]+)\}?/g, (match, digits) => {
      const superscripts: Record<string, string> = {
        '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', 
        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
        '-': '⁻'
      };
      return digits.split('').map((d: string) => superscripts[d] || d).join('');
    })
    
    // === 兜底清理排版残留 ===
    .replace(/\\t/g, '    ')         // 制表符转 4 格空格
    .replace(/\$/g, '')              // 全量剥离 $
    .replace(/\\{2,}/g, '\n')        // 将双反斜杠 \\ 转换为换行符
    .replace(/\\/g, '')              // 移除孤立反斜杠
    .replace(/\{/g, '')              // 清除残余 {
    .replace(/\}/g, '')              // 清除残余 }
    .replace(/\{\{/g, '')            // 清除孤立 {{
    .replace(/\}\}/g, '');           // 清除孤立 }}

  // === 第三步：恢复被保护的答案块 ===
  safed = safed.replace(/__CLOZE_(\d+)__/g, (_, idx) => preserved[parseInt(idx)]);

  return safed;
};

/**
 * 渲染规范化文本片段：识别并高亮"解："、"答："等关键词
 * 返回 React 元素数组，需要在 React 组件中使用
 * 
 * 注意：此函数返回的是纯字符串处理结果（parts 数组 + isKeyword 判断）
 * React 渲染逻辑仍留在组件中，此处只提供关键词分割服务
 */
export function splitByKeywords(rawText: string): { part: string; isKeyword: boolean; isConclusion: boolean }[] {
  if (!rawText) return [];
  const text = cleanLatexSymbols(rawText);
  
  // 匹配关键字
  const parts = text.split(/(解：|证明：|答：|因为|由于|所以|则|综上所述)/g);
  
  return parts.map((part) => {
    const isKeyword = /^(解：|证明：|答：|因为|由于|所以|则|综上所述)$/.test(part);
    const isConclusion = part === '答：' || part === '综上所述';
    return { part, isKeyword, isConclusion };
  });
}
