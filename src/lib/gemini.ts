export interface GeminiMessage {
  role: 'user' | 'model' | 'system';
  content: string;
}

export interface GeminiResponse {
  content: string;
}

export async function chatWithGemini(
  messages: GeminiMessage[],
  imageBuffer?: Buffer | string | (Buffer | string)[]
): Promise<string> {
  const apiKey = process.env.API_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.devdove.site/v1';
  const model = process.env.NEXT_PUBLIC_MODEL_NAME || 'gemini-2.5-flash';

  const body: any = {
    model,
    messages: messages.map(m => ({
      role: m.role === 'system' ? 'system' : m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    })),
    stream: false,
    temperature: 0,
  };

  if (imageBuffer && messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user') {
      const images = Array.isArray(imageBuffer) ? imageBuffer : [imageBuffer];
      const content: any[] = [{ type: "text", text: lastMessage.content }];
      images.forEach(img => {
        const imageData = typeof img === 'string' ? img : img.toString('base64');
        const base64Url = imageData.startsWith('data:') ? imageData : `data:image/jpeg;base64,${imageData}`;
        content.push({ type: "image_url", image_url: { url: base64Url } });
      });
      body.messages[body.messages.length - 1].content = content;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI 服务异常: ${response.status}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error: any) {
    throw error;
  }
}

export const EXAM_PROMPT = `你是一位专业的试题解析工具。请将图片中的每一个题目拆解为独立的 JSON 对象。

### 🌟 核心准则：

1. **题目拆分与坐标**：
   - 每题一个对象。坐标规范：所有 box 坐标必须使用 **千分位 [0, 1000]** 格式。
   - content_box 必须全包围题干、选项和插图。

2. **答案原地回填（最高优先级）**：
   - 必须保留原文的括号或下划线。
   - 必须用 {{ }} 包裹正确内容并填入占位符中。示例：( {{D}} ) 或 _____{{答案}}_____。

3. **图样检测与整体性 (Totality Principle)**：
   - **探测所有图样**：通过 diagram_boxes 记录坐标。
   - **严禁拆分**：如果题目中有多个相关图形，**必须用一个大框**整体框住并输出一个坐标！严禁拆成多个框！
   - 框选范围包含图名和所有标签。

4. **强制完整输出**：
   - 即使图片中没有显式写出答案，你也必须利用知识库**自主补全**【答案】和【解析】并附在 content 末尾。
   - content 格式示例：\`题干...\\n【答案】{{答案}}\\n【解析】解析内容...\`

5. **符号纯净 (Unicode Only)**：
   - 严禁使用 $ 符号或 LaTeX 指令。直接输出符号：△, ∠, ⊥, //, °, ², ³ 等。

### 📦 输出格式 (JSON Array)：
[
  {
    "title": "题号",
    "material": "素材",
    "content": "内容 [附图]\\n【答案】{{答案}}\\n【解析】...",
    "answer_box": [ymin, xmin, ymax, xmax], (0-1000)
    "diagram_boxes": [[ymin, xmin, ymax, xmax]], (合并大框, 0-1000)
    "content_box": [ymin, xmin, ymax, xmax] (0-1000)
  }
]
只输出 JSON 数组，严禁任何反引号或 Markdown 标记。`;

export const FULL_EXAM_PROMPT = EXAM_PROMPT;

export async function parseQuestion(imageBase64: string, hasManualAnswer?: boolean, hasManualAnalysis?: boolean) {
  let instruction = EXAM_PROMPT;
  if (!hasManualAnswer || !hasManualAnalysis) {
    instruction += '\n\n### 🚀 特别补全指令：\n请你自主分析题目，补齐缺失的【答案】和【解析】。';
  }

  const response = await chatWithGemini(
    [
      { role: 'system', content: instruction },
      { role: 'user', content: '请解析图片内容。' }
    ],
    imageBase64
  );
  const arrayMatch = response.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return JSON.parse(arrayMatch[0]);
  }
  throw new Error('解析失败');
}

export async function parseFullDocument(input: string | string[]) {
  const images = typeof input === 'string' ? undefined : input;
  const userMsg = typeof input === 'string' ? input : '请解析图片序列。';
  const response = await chatWithGemini(
    [
      { role: 'system', content: FULL_EXAM_PROMPT + '\n\n请自主补全所有题目的答案与解析。' },
      { role: 'user', content: userMsg }
    ],
    images
  );
  return JSON.parse(response.replace(/```json/g, '').replace(/```/g, '').trim());
}
