/**
 * [UTF-8 CLEAN VERSION] 
 * 核心识别逻辑：已修复乱码与转义冲突
 * 逻辑：独立双通道 (3.0 Flash 极速 / 3.1 Pro 深度推理)
 */
import type { AIQuestionResult, AIClip } from '@/types/ai';

export const parseQuestion = async (
  clips: AIClip[],
  onStatus?: (status: string) => void,
  isDeepThinking: boolean = false,
  action: 'parseQuestion' | 'generateMindMap' = 'parseQuestion', // [NEW] 支持分流
  _retryCount: number = 0
): Promise<AIQuestionResult[]> => {
  const model30 = process.env.NEXT_PUBLIC_MODEL_NAME || "gemini-3-flash-preview";
  const model31 = process.env.REASONING_MODEL_NAME || "gemini-3.1-pro-preview";
  
  const modelName = isDeepThinking ? model31 : model30;
  const apiKey = process.env.API_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.devdove.site/v1';

  if (onStatus) {
    onStatus(isDeepThinking ? "🧠 正在深度分析图像与逻辑关系..." : "⚡ 正在快速识别题目内容...");
  }

  const hasManualAnswer = clips.some(c => c.role === 'answer');
  const hasManualAnalysis = clips.some(c => c.role === 'analysis');
  
  let manualInstruction = "";
  if (hasManualAnswer || hasManualAnalysis) {
    manualInstruction = `
[SPECIAL INSTRUCTION: COLOR-CODED TRANSCRIPTION MODE]
你已收到带有颜色语义标识的精准切片，请执行以下最高优先级的处理逻辑：
- 🔴 【红色切片 (Answer)】：这是官方答案。你必须进入“纯文字 OCR 转录”模式。**绝对禁止** 利用 AI 逻辑进行任何形式的自发推理、解题、计算或猜测。请闭合你的数学大脑，仅作为一个高精度的打字员，逐字还原图中的文字。
- 🟣 【紫色切片 (Analysis)】：这是官方解析。同样进入“纯文字 OCR 转录”模式。请原封不动地提取图中的解题逻辑，不要尝试简化或修正原文内容。
- 🔵 【蓝色切片 (Question)】：这是题干核心上下文。
- 🟢 【绿色切片 (Diagram)】：这是关联插图。
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
  - **重要：由于 JSON 格式限制，输出反斜杠时请确保其能被正确转义（如果你输出单反斜杠，下游解析器会自动处理，但请尽量保持语法标准）。**
  - **重要：如果你收到了绿色切片 (Diagram)，必须在输出文字 (content 或 analysis) 的对应位置插入 [附图] 占位符，严禁漏掉。**

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

  const mindMapPrompt = `你是一个顶级的解题思维教练和逻辑学家。你的任务是根据提供的题目素材，生成一份全景式的交互思维导图。
  
  [核心使命]
  你需要将复杂的题目拆解成一套逻辑严密、详细可读的 JSON 树结构。
  
  [内容规范]
  1. 全景覆盖：导图必须包含：[题目核心目标] -> [解题关键件/已知条件] -> [精细化推导步骤] -> [知识点总结/最终结论]。
  2. 详细文本：每个节点的 label 必须是完整的“教学语言”或“详细推导描述”，绝对禁止使用简短单词。例如使用“第一步：利用勾股定理计算出 AC 的长度为 10”而不是“求 AC”。
  3. 逻辑分层：通常建议拆解为 2-4 层深度。

  [输出格式锁定]
  你必须仅输出一个 JSON 数组，其中包含一个对象，该对象必须包含 mindmap_tree 字段。
  mindmap_tree 的结构如下：{ "label": "题目核心", "children": [ { "label": "子节点1", "children": [...] } ] }
  
  [示例]
  [{
    "order": 1,
    "type": "essay",
    "content": "...",
    "mindmap_tree": {
      "label": "题目全景解析",
      "children": [
        { "label": "考点：一元二次方程根的判别式", "children": [...] }
      ]
    }
  }]`;

  const selectedPrompt = action === 'generateMindMap' ? mindMapPrompt : prompt;

  // 构建多模态消息内容
  const messageContent: any[] = [];
  
  // 1. 按照特定顺序排列图片：题干 -> 答案 -> 解析 -> 插图
  const sortedClips = [...clips].sort((a, b) => {
    const order = { question: 0, answer: 1, analysis: 2, diagram: 3 };
    return order[a.role] - order[b.role];
  });

  sortedClips.forEach((clip, index) => {
    const sourceText = clip.source === 'reference' ? '源自参考池' : '源自试卷';
    let label = "";
    if (clip.role === 'question') label = `【蓝色切片 - 题干内容 (${sourceText} #${index + 1})】`;
    if (clip.role === 'answer') label = `【红色切片 - 官方答案 (${sourceText} #${index + 1})】`;
    if (clip.role === 'analysis') label = `【紫色切片 - 官方解析 (${sourceText} #${index + 1})】`;
    if (clip.role === 'diagram') label = `【绿色切片 - 关联插图 (${sourceText} #${index + 1})】`;

    messageContent.push({
      type: "text",
      text: label
    });
    messageContent.push({
      type: "image_url",
      image_url: { url: clip.image }
    });
  });

  // 2. 注入提示词
  messageContent.push({
    type: "text",
    text: `${selectedPrompt}

[CRITICAL INSTRUCTION: ATOMIC SPLIT REQUIRED]
Output ONLY the raw JSON array. 
IMPORTANT: Every numbered sub-question in the image MUST be a separate element in the array. 
DO NOT include any preamble or conversational filler.
Return the result in this exact format:
[{ "order": 1, "type": "essay", "content": "...", "_thought_process": "...", "analysis": "...", "answer": "...", "auxiliary_svg": "", "mindmap_tree": null }]
`
  });

  const body = {
    model: modelName,
    messages: [
      {
        role: "user",
        content: messageContent,
      },
    ],
    temperature: 0,
    max_tokens: 8192,
    stream: true,
  };

  const controller = new AbortController();
  const timeoutMs = isDeepThinking ? 300000 : 120000; // 普通 120s，深度思考 300s
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
    if (_retryCount < 1) {
      console.warn(`[Parse API Retry]: JSON parsing failed (Attempt ${_retryCount + 1}), retrying once...`);
      if (onStatus) onStatus("🔄 识别结构异常，正在进行自我纠错重试...");
      return parseQuestion(clips, onStatus, isDeepThinking, action, _retryCount + 1);
    }
    console.error(`[Parse API Error after ${_retryCount} retries]:`, error.message);
    throw error;
  }
};

/**
 * 强力 JSON 解析器：处理 AI 输出中常见的格式错误、转义失败和截断问题
 */
function robustParseJson(raw: string): AIQuestionResult[] {
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

  // 3. 物理隔离非法的反斜杠（保护已被双转义的正确 LaTeX，拒绝将 \\alpha 破坏为 \\\alpha）
  cleaned = cleaned.replace(/(?<!\\)\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');

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
    console.error("[RobustParse Critical Failure]:", err.message);
    // 移除强破坏性的 desperateClean 盲区替换逻辑（保护 LaTeX 转义）
    // 让外层触发 API 级别的静默重试机制
    throw err;
  }
}

// parseFullDocument 已被移除 — 全文档解析现由 ExtractionCanvas 分页驱动调用 parseQuestion
