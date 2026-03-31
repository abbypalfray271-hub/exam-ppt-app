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

  // 核心提示词：注入“全景盘点”、“方程锁死”与“符号物理隔离”逻辑
  const prompt = `你是一个顶级数学专家和视觉分析专家。**绝对禁止输出任何形式的反斜杠（\\）**。

  [符号物理隔离]
  - 所有数学依据、关系及特殊符号必须使用 **原生 UTF-8 符号**：∵, ∴, Δ, ∠, ≅, ∽, √, ², π, ⊥, ▱, ⊙。
  - 严禁使用任何形式的转义字符或由反斜杠引导的命令。

  [视觉盘点 (Visual Inventory)]
  在解析前，必须在分析首段先盘点：图中共有几张图？主图与局部放大图的对应关系是什么？关键点 M'、F、E 在哪张图中？观察是否有虚线（辅助线）及其标注。严禁忽视细节。

  [核心原则]
  1. 极致还原：文字原样提取，保持布局。
  2. 方正式锁死 (Lockdown)：数值结论（如 t=10/3）前，必须紧跟其带具体数值的原始等式（如 2t = 10 - t 或 12/y = 6/4）。
  3. 绝不省略：禁止出现“略”、“下略”、“解答略”、“同理可得”。出现此类占位符即视为任务失败。
  4. 原始数值：方程第一步必须包含图中提取的数值（12, 16, 10 等），严禁只写字母变量。

  [字段规范 - analysis]
  - 包含每一个小问 (1)(2)(3)... 的完整“推导链”。
  - 推演逻辑必须由 ∵ 依据 -> 原方程 -> 整理过程 -> 结论 构成。

  [输出示例参考 - 严禁模仿占位符]
  [
    {
      "order": 24,
      "type": "essay",
      "content": "24. [附图] ...",
      "analysis": "解：(1) [视觉盘点] 主图显示菱形 ABCD，辅图 2 显示了对称点 M'。\\n∵ 四边形 ABCD 是菱形，AC=12, BD=16 \\n∴ 根据菱形面积公式 S = 1/2 * 12 * 16 = 96 ...... 1分\\n又 ∵ S = BC * h，且根据勾股定理 BC = 10 \\n∴ 10 * h = 96，解得 h = 9.6 ...... 2分\\n答：(1) 高 h 为 9.6; (2)...",
      "answer": "(1) h=9.6; (2)..."
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
  // 1. 基础清理
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');

  // 2. [关键修复] 物理隔离非法的反斜杠
  // 将所有非标准 JSON 转义路径的反斜杠，强制升格为双斜杠字面量
  // 匹配规则：匹配反斜杠，只要后面不是紧跟着指定的合法转义字符，就将其变为 \\\\
  cleaned = cleaned.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');

  // 3. 强力清除不可见的控制字符 (防止 JSON.parse 崩溃)
  cleaned = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, (match) => {
    // 允许常见的换行和制表符，其余一律抹除
    return (match === '\n' || match === '\r' || match === '\t') ? match : '';
  });

  let result = '';
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const prev = i > 0 ? cleaned[i-1] : '';
    // 考虑转义引号的情况
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
