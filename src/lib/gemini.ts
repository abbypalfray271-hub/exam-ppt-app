/**
 * [UTF-8 CLEAN VERSION] 
 * 核心识别逻辑：已修复乱码与转义冲突
 * 逻辑：独立双通道 (3.0 Flash 极速 / 3.1 Pro 深度推理)
 */
export const parseQuestion = async (
  imageData: string,
  hasManualAnswer: boolean = false,
  hasManualAnalysis: boolean = false,
  onStatus?: (status: string) => void,
  isDeepThinking: boolean = false
): Promise<any> => {
  const model30 = process.env.NEXT_PUBLIC_MODEL_NAME || "gemini-3-flash-preview";
  const model31 = process.env.REASONING_MODEL_NAME || "gemini-3.1-pro-preview";
  
  const modelName = isDeepThinking ? model31 : model30;
  const apiKey = process.env.API_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.devdove.site/v1';

  if (onStatus) {
    onStatus(isDeepThinking ? "🧠 正在深度分析图像与逻辑关系..." : "⚡ 正在快速识别题目内容...");
  }

  let manualInstruction = "";
  if (hasManualAnswer || hasManualAnalysis) {
    manualInstruction = `
[SPECIAL INSTRUCTION: MANUAL MODE]
！！！用户已经手动标注了结果区域，禁止进行任何数学推理或解题演算！！！
- 如果 hasManualAnswer=true: 'answer' 字段必须严谨 OCR 识别并提取图中指定区域的文字内容，**绝对禁止** 利用 AI 能力生成新的解题结论！
- 如果 hasManualAnalysis=true: 'analysis' 字段必须由 OCR 转录图中对应区域的解析文字，**绝对禁止** 自行构思解题步骤！
- 此时 '_thought_process' 只能用于盘点坐标系和文字内容，严禁进行逻辑推算。
`;
  }

  // 核心提示词：注入“全景盘点”、“方程锁死”、“符号物理隔离”、“平面几何降维”以及“SVG重绘”逻辑
  const prompt = `你是一个顶级数学专家和视觉分析专家。**绝对禁止输出任何形式的反斜杠（\\）**。
  ${manualInstruction}

  [解题流派定调 (Methodology Constraint)]
  1. 核心原则：如果存在上述 [MANUAL MODE] 指令，请优先服从！否则，按以下逻辑。
  2. 强制纯几何推导优先：针对几何与动点问题，即使题目背景是在直角坐标系或抛物线中，在处理线段长度、角度、面积、相似全等推导时，必须严格优先使用纯平面几何方法（如：构造垂线、相似比、全等、勾股定理、三角函数等）构建逻辑链，极力避免陷入复杂的“直线方程联立求解”、“两点距离公式”等繁琐的坐标死算中。
  3. 严禁代数泥潭：遇到坐标系题目时，计算初始坐标点应适可而止，后续的几何关系论证严禁过度依赖坐标系解析法，必须回归到纯粹的初等平面几何图形关系上！对于非坐标系题目，绝对绝对禁止私自建立平面直角坐标系。
  4. 动点路径锁定：在梳理动点时，必须先明确动点的运动轨迹、临界状态，以及在 t 时刻转化出的实际线段标量长度表达式，再代入纯几何定理。禁止将动点定义为带有 t 的繁杂坐标点去找直线交点。

  [SVG 辅助线绘图引擎]
  对于几何或动点问题，你需要推算图形比例，使用标准的 SVG 代码重建一个包含辅助线的示意图，输出到 auxiliary_svg 字段中。
  规范：
  - <svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
  - 使用 stroke="black" 绘制实线原图，使用 stroke="red" stroke-dasharray="5,5" 绘制你新增的辅助线或动点轨迹。
  - 使用 <text> 标签标记关键点 (如 P, Q, E 等)。

  [Atomic Splitting & Context Inheritance - 课堂 PPT 专用原子化拆分]
  1. 一题一页 (One Item per Slide)：如果图片中包含阅读理解、综合题或带编号的小题 (如 1., 2., 3. 或 (1), (2), (3) 等)，你必须坚决地将其拆分为 JSON 数组中的 **独立对象**。
  2. 首题捆绑原文：仅限数组中的 **第一个对象** (通常是第 1 题) 需要包含完整的 [公共背景/原文/ passage] 内容。后续的所有小题 (从第 2 题开始) **绝对禁止** 再次重复原文背景，只需输出该项对应的小题干本身。
  3. 禁止合并：严禁将多个不同编号的小题合并在同一个 JSON 对象中。

  [符号物理隔离]
  - 所有数学依据、关系及特殊符号必须使用 **原生 UTF-8 符号**：∵, ∴, Δ, ∠, ≅, ∽, √, ², π, ⊥, ▱, ⊙。
  - 严禁使用任何形式的转义字符或由反斜杠引导的命令。

  [视觉盘点 (Visual Inventory)]
  在解析前，必须在分析首段先盘点：图中共有几张图？主图与局部放大图的对应关系是什么？关键点在哪里？观察是否有虚线（辅助线）及其标注。严禁忽视细节。

  [思维漫游 (Chain of Thought - Scratchpad)]
  为了保证解析 (analysis) 的纯粹性与格式严肃性，你必须在 "_thought_process" 字段中完成所有的内部思考、试错、寻找解题路径、关键点推测等「草稿」推导过程。
  ！！！极其重要：因为大模型有严格的输出截断限制，你的思维漫游必须极度精简（控制在300字以内，仅罗列几何关系与方程组合），若废话连篇会导致下游 "analysis" 被强行截断，任务彻底失败！！！
  在 "analysis" 字段中，绝对不参与任何胡言乱语或自我验证，只允许输出给学生看的、最终梳理好的标准解题步骤！

  [核心原则]
  1. 极致还原：文字原样提取，保持布局。
  2. 方正式锁死 (Lockdown)：数值结论之前，必须紧跟其带具体数值的原始等式。
  3. 绝不省略：禁止出现“略”、“下略”、“同理可得”。出现此类占位符即视为任务失败。
  4. 原始数值：方程第一步必须包含图中提取的数值（12, 16, 10 等），严禁只写字母变量。
  5. 纯粹分数制 (Strict Fraction)：计算过程中所有的非整除结果，必须无条件保留为最简分数形式。绝对禁止将其转化为小数。
  6. 严格 JSON 引用隔离：在思维漫游区 (_thought_process) 或解析区 (analysis) 写作时，如果需要强调或引用文字内容，【绝对禁止使用双引号 (")】，必须且只能使用单引号 (') 或书名号 (《》)。内部的双引号会导致 JSON 端点解析崩溃！

  [输出示例参考 - 严禁模仿占位符]
  [
    {
      "order": 1,
      "type": "essay",
      "content": "阅读下面片段并回答：[原文] 床前明月光，疑是地上霜。\\n1. 作者是谁？",
      "_thought_process": "静夜思李白...",
      "analysis": "解：作者是唐代著名诗人李白。",
      "answer": "李白",
      "auxiliary_svg": ""
    },
    {
      "order": 2,
      "type": "essay",
      "content": "2. 该诗表达了什么意境？",
      "_thought_process": "思乡情...",
      "analysis": "解：表达了诗人在寂静月夜对家乡的深切思念。",
      "answer": "思乡",
      "auxiliary_svg": ""
    }
  ]`;

  const body = {
    model: modelName,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: imageData }
          },
          {
            type: "text",
            text: `${prompt}
            
[CRITICAL INSTRUCTION: ATOMIC SPLIT REQUIRED]
Output ONLY the raw JSON array. 
IMPORTANT: Every numbered sub-question in the image MUST be a separate element in the array. 
ONLY the first element should include the shared passage/context. 
Subsequent elements should ONLY contain the sub-question text.
Do NOT include any preamble or conversational filler.
Return the result in this exact format:
[{ "order": 1, "type": "essay", "content": "...", "_thought_process": "...", "analysis": "...", "answer": "...", "auxiliary_svg": "" }]
`
          }
        ],
      },
    ],
    temperature: 0,
    max_tokens: 8192, // 开启 8K 输出窗口，防截断
    stream: true, // [STREAMING FIX] 开启流式以绕过上游 Nginx/Cloudflare 的 100s HTTP 死霸超时
  };

  const controller = new AbortController();
  const timeoutMs = isDeepThinking ? 600000 : 120000; // 3.1 Pro 给予 10 分钟思考时间
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
        throw new Error(`AI 服务异常: ${response.status}`);
    }

    // [STREAMING FIX] 手动读取并拼接流式响应 (避免 524 Timeout)
    const reader = response.body?.getReader();
    const decoder = new TextDecoder("utf-8");
    let content = "";
    
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        
        // 解析 SSE 格式的 data: {...}
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              const delta = data.choices?.[0]?.delta?.content || "";
              content += delta;
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } else {
      throw new Error('Response body is null');
    }

    const jsonMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
    const rawJson = jsonMatch ? jsonMatch[0] : content;
    
    return robustParseJson(rawJson);
  } catch (error: any) {
    console.error("[Parse API Error]:", error.message);
    throw error;
  }
};

/**
 * 强力 JSON 解析器：处理 AI 输出中常见的格式错误、转义失败和截断问题
 */
function robustParseJson(raw: string): any {
  // 1. [精准定位起始符] 过滤所有非 JSON 的前缀杂质（如 [视觉盘点] 等描述性文字）
  const firstBrace = raw.indexOf('{');
  const firstBracket = raw.indexOf('[');
  let startIndex = -1;
  
  if (firstBrace !== -1 && firstBracket !== -1) {
    startIndex = Math.min(firstBrace, firstBracket);
  } else {
    startIndex = Math.max(firstBrace, firstBracket);
  }

  if (startIndex === -1) {
    throw new Error('No JSON structure found in response');
  }

  // 截断起始点之前的所有无关字符
  let cleaned = raw.substring(startIndex).trim();

  // 2. 基础清理 Markdown 代码块
  cleaned = cleaned.replace(/```json\s*/i, '').replace(/\s*```$/i, '');

  // 3. 物理隔离非法的反斜杠
  cleaned = cleaned.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');

  // 4. 强力清除不可见的控制字符
  cleaned = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, (match) => {
    return (match === '\n' || match === '\r' || match === '\t') ? match : '';
  });

  let result = '';
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const prev = i > 0 ? cleaned[i-1] : '';
    
    if (char === '"' && (prev !== '\\' || (i > 1 && cleaned[i-2] === '\\'))) {
      inString = !inString;
      result += char;
      continue;
    }
    
    if (inString) {
      if (char === '\n') result += '\\n';
      else if (char === '\r') result += '\\r';
      else if (char === '\t') result += '\\t';
      else result += char;
    } else {
      if (char === '{') braceCount++;
      else if (char === '}') braceCount--;
      else if (char === '[') bracketCount++;
      else if (char === ']') bracketCount--;
      // 增强容错：如果 JSON 数组项之间漏写了逗号，尝试补全
      if (char === '{' && result.trim().endsWith('}')) result = result.trim() + ', ';
      if (char === '[' && result.trim().endsWith(']')) result = result.trim() + ', ';
      
      result += char;
    }
  }

  cleaned = result;
  if (inString) cleaned += '"';
  while (braceCount > 0) { cleaned += ' }'; braceCount--; }
  while (bracketCount > 0) { cleaned += ' ]'; bracketCount--; }
  cleaned = cleaned.replace(/,(\s*[\]\}])/g, '$1');

  try {
    return JSON.parse(cleaned);
  } catch (err: any) {
    // [最终兜底] 如果还是失败，尝试通过正则更激进地清理
    console.error("[RobustParse Initial Failure]:", err.message);
    try {
      const desperateClean = cleaned.replace(/\\/g, '\\\\').replace(/\\\\\\\\/g, '\\\\');
      return JSON.parse(desperateClean);
    } catch (innerErr) {
      console.error("[RobustParse Critical Failure]:", innerErr);
      throw err;
    }
  }
}

/**
 * 全文档解析接口 (同步双通道逻辑)
 */
export const parseFullDocument = async (
  images: string[],
  onStatus?: (status: string) => void,
  isDeepThinking: boolean = false
): Promise<any> => {
  const model30 = process.env.NEXT_PUBLIC_MODEL_NAME || "gemini-3-flash-preview";
  const model31 = process.env.REASONING_MODEL_NAME || "gemini-3.1-pro-preview";
  const modelName = isDeepThinking ? model31 : model30;
  
  const apiKey = process.env.API_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.devdove.site/v1';

  if (onStatus) {
    onStatus(isDeepThinking ? "🧠 正在深度分析全页内容..." : "⚡ 正在智能提取页面题目...");
  }

  // TODO: 目前仅作为架构预留，实际调用逻辑仍主要由 ExtractionCanvas 分页驱动
  return []; 
};

