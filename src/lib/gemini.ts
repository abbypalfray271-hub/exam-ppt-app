/**
 * [UTF-8 CLEAN VERSION] 
 * 核心识别逻辑：已修复乱码与转义冲突
 * 逻辑回归：单一强力 Prompt + Equation-First 约束
 */
export const parseQuestion = async (
  imageData: string,
  hasManualAnswer: boolean = false,
  hasManualAnalysis: boolean = false,
  onStatus?: (status: string) => void
): Promise<any> => {
  const modelName = process.env.NEXT_PUBLIC_MODEL_NAME || "gemini-3-flash-preview";
  const apiKey = process.env.API_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.devdove.site/v1';

  if (onStatus) onStatus("⚡ 视觉引擎加载中...");

  const prompt = `你是一个专业的试卷数字化专家。请**严格保持原题目的内容、格式和排版**，将其完整地转化为以下 JSON 格式。

  [核心原则]
  1. 极致还原：确保原图中可见的所有文字（含题号、题干正文、选项 A/B/C/D、括注信息）都被**原样提取**。保持布局排版。
  2. 附图必留：若题目包含插图、表格等，必须在 content 中标记 [附图]，并同步在 diagrams 数组中提取该图片的坐标 [ymin, xmin, ymax, xmax]（量程 0-1000）。
  3. 隐现打码：属于答案的读音、选项结果等，请使用 {{内容}} 包裹。
  4. 深度优先：**必须首先输出详尽的推理逻辑 (analysis)，最后再总结答案 (answer)**。
  5. 严谨格式：遵循标准 JSON 语义。字符串内的双引号转义为 \\"，反斜杠转义为 \\\\。禁止使用物理换行符。
  
  [字段规范]
  - content: 题目的全量文本（含题干+选项）。插图/表格处标注 [附图]。
  - diagrams: 坐标数组，对象格式：{"box_2d": [ymin, xmin, ymax, xmax], "label": "[附图]"}。
  - options: 选项字符串数组。
  - analysis: **“公式级”深度解析 (严禁跳步)**。要求：
    1. **硬推导要求**：禁止使用“由题意得”、“易得”、“经计算分析得”等模糊表述。
    2. **方程式原形**：每一个数值结论前，必须列出其对应的**原始方程式** (例如：(10-2t)/12 = 1.5)。
    3. **单步化简**：展示方程的关键化简步骤 (如移项、约分)，严禁直接给结论。
    4. **几何依据**：逻辑跳跃前必须注明几何定理依据 (如：∵ ΔABC ∽ ΔDEF (AA性质) ∴ ...)。
    5. **标准符号**：统一使用 ∵, ∴, Δ, ∠, ≅, ∽, √, ², π 等专业符号。
    6. **得分标记**：在关键逻辑/计算步骤右侧标注（...... 2分）。
    7. **落脚点**：以“答：[最终具体结论]”作为独立行结束。
  - answer: **答案总结 (由解析推导而来)**。要求内容缩写/精简，必须与解析末尾的结论完全一致。
  - type: "choice" 或 "essay"。
  
  [输出示例参考]
  [
    {
      "order": 24,
      "type": "essay",
      "content": "24. (本小题满分 10 分) [附图] ...",
      "diagrams": [{"box_2d": [200, 150, 450, 320], "label": "[附图]"}],
      "options": [],
      "analysis": "解：(1) [建立坐标系] 以 C 为原点 (0,0) ... \\n∵ 抛物线顶点 M(20,20)，\\n∴ 设抛物线关系式为 y = a(x - 20)² + 20 ...... 1分\\n∵ 将 (0,0) 代入方程： 0 = a(0 - 20)² + 20 \\n∴ 400a = -20 \n∴ a = -1/20 ...... 2分\\n∴ 抛物线关系式为 y = -1/20(x - 20)² + 20，即 y = -1/20x² + 2x ...... 3分\\n\\n(2) [分类讨论等腰三角形 AHM] \\n① 当 AH = AM 时：\\n∵ 运动时间为 t，AH = 2t，AM = 10 - t \\n∴ 2t = 10 - t \\n∴ 3t = 10 \n∴ t = 10/3 ...... 5分\\n② 当 AH = HM 时：\\n[列出几何方程...] \\n答：(1) y = -1/20x² + 2x；(2) t 的值为 10/3 或 ...",
      "answer": "y = -1/20x² + 2x; t = 10/3 或 ...",
      "type": "essay"
    }
  ]`;

  const body = {
    model: modelName,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageData } },
        ],
      },
    ],
    temperature: 0,
    stream: false,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

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

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

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
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');

  let result = '';
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const prev = i > 0 ? cleaned[i-1] : '';
    if (char === '"' && prev !== '\\') {
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
    const desperateClean = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    return JSON.parse(desperateClean);
  }
}

/**
 * 全文档解析接口 (保持架构一致性)
 */
export const parseFullDocument = async (
  images: string[],
  onStatus?: (status: string) => void
): Promise<any> => {
  if (onStatus) onStatus("全文档模式暂未开启，请逐页进行...");
  return [];
};
