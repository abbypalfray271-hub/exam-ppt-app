export interface GeminiMessage {
  role: 'user' | 'model' | 'system';
  content: string;
}

export interface GeminiResponse {
  content: string;
}

export async function chatWithGemini(
  messages: GeminiMessage[],
  imageBuffer?: Buffer | string | (Buffer | string)[] // 支持单图或多图
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

  console.log(`[Gemini-Request] BaseURL: ${baseUrl}, Model: ${model}, Payload: ${JSON.stringify(body).length} bytes`);

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
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout

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
      console.error(`[Gemini API Error] Status: ${response.status}, Body: ${errText}`);
      throw new Error(`AI 服务响应错误 (${response.status}): ${errText || response.statusText}`);
    }

    const responseText = await response.text();
    
    try {
      const data = JSON.parse(responseText);
      return data.choices?.[0]?.message?.content || '';
    } catch (parseError) {
      console.error('Failed to parse Gemini JSON response:', responseText.slice(0, 200));
      throw new Error('API 返回了格式错误的响应，请稍后重试');
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('请求超时（已超过60秒），Gemini 响应过慢，请稍后重试或尝试缩小截图范围');
    }
    console.error('Gemini API Fetch failed:', error);
    throw error;
  }
}

export const EXAM_PROMPT = `你是一位专业的试题切割工具。请针对上传的考题图片，将其中的每一个编号题目拆解为独立的对象。

### 🌟 核心规则：逻辑优先级

1. **双重回填（最重要）**：你必须将答案填入原文对应的位置，并用 {{ }} 标记。
   - **优先级 1**：回填优先级 ({{ }}) > 格式保真优先级 (________)。
   - **优先级 2**：原地回填 > 底部追加。严禁仅在底部显示答案而不回填位置！
   
2. **格式保留要求**：必须保留原文的括号或下划线作为容器。
   - 选择题：( ) -> ( {{答案字母}} )
   - 填空题：____ -> _____{{答案内容}}_____（在长划线中间插入标记，保持总长一致）

3. **横线规则 (Rule 118)**：仅当该位置【没有】对应答案（供学生书写）时，才使用至少 8 个下划线 ________ 表示。若有答案，必须优先执行回填。

4. **符号禁令 (Rule 123)**：严格执行！禁止在内容中使用 $ 符号。所有的数学符号（△, ∠, ⊥, //, °）必须以 Unicode 形式直接输出。

### 💡 范例演示 (Few-shot Examples)：
- [原文]：1. 正确的是 (     )
  [输出]：1. 正确的是 ( {{C}} )
- [原文]：2. 已知 t = ____。
  [输出]：2. 已知 t = _____{{3.5}}_____
- [原文]：3. 简述其背景：________
  [输出]：3. 简述其背景：________ (此题无固定答案，故保留横线)

### 📦 输出格式要求（JSON 数组）：
[
  {
    "title": "题号",
    "material": "素材内容",
    "content": "题干内容 [附图] ( {{正确答案}} )\\n【答案】{{正确答案}}\\n【解析】...",
    "answer_box": [ymin, xmin, ymax, xmax],
    "diagram_boxes": [[ymin, xmin, ymax, xmax], ...],
    "content_box": [ymin, xmin, ymax, xmax]
  }
]
只输出 JSON 数组，内容中严禁使用任何反引号，严禁包含 markdown 标记。`;

export const FULL_EXAM_PROMPT = `你是一个专业的试卷全量切割工具。

### 🌟 核心原则：

1. **回填高于一切（优先级最高）**：
   - 如果已知答案，必须将 {{答案}} 填入题干对应的 ( ) 或 ____ 位置。
   - 严禁为了满足“还原排版”规则而仅仅输出 ________，而不进行 {{ }} 回填。
   - 只有在真正需要学生动笔填写的空白区域才使用 ________。

2. **跨页除重**：如果某道题目跨越了两页，请合并为一个对象输出，不要重复。

3. **符号禁令 (Rule 123)**：严格执行！禁止使用 $ 符号或 LaTeX 命令（\\triangle 等）。必须全文使用纯净的 Unicode 符号。

### 💡 范例演示 (Few-shot Examples)：
- [原文]：1. 结果是 ( )
  [输出]：1. 结果是 ( {{正确答案}} )
- [原文]：2. 计算：____。
  [输出]：2. 计算：_____{{正确答案}}_____

### 📦 输出格式要求 (JSON Array)：
[
  {
    "title": "题号",
    "material": "共享素材文本",
    "material_box": [ymin, xmin, ymax, xmax],
    "content": "题干内容 [附图] ( {{包裹答案}} )\\n【答案】{{答案内容}}\\n【解析】详细解析...",
    "answer_box": [ymin, xmin, ymax, xmax],
    "diagram_boxes": [[ymin, xmin, ymax, xmax], ...],
    "content_box": [ymin, xmin, ymax, xmax]
  }
]
只输出 JSON 数组，严禁任何解释性文字。`;

export async function parseQuestion(imageBase64: string, hasManualAnswer?: boolean, hasManualAnalysis?: boolean) {
  let completionInstruction = '';
  if (!hasManualAnswer && !hasManualAnalysis) {
    completionInstruction = '\n\n### 🚀 特别补全指令：\n当前图片【未标注】答案区和解析区。请你利用自己的知识库，为识别出的每一道题目【自主补齐】准确的“【答案】”和详细的“【解析】”，并追加在 content 末尾。';
  } else if (hasManualAnswer && !hasManualAnalysis) {
    completionInstruction = '\n\n### 🚀 特别补全指令：\n当前图片【已标注】答案区但【未标注】解析区。请你提取图中的答案，并利用自己的知识库【自主补齐】详细的“【解析】”，追加在 content 末尾。';
  }

  const response = await chatWithGemini(
    [
      { role: 'system', content: EXAM_PROMPT + completionInstruction },
      { role: 'user', content: '请解析这张考题图片的内容，逐题拆分为独立对象。' }
    ],
    imageBase64
  );

  const arrayMatch = response.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    const results = JSON.parse(arrayMatch[0]);
    return Array.isArray(results) ? results : [results];
  }

  const objMatch = response.match(/\{[\s\S]*\}/);
  if (objMatch) {
    const result = JSON.parse(objMatch[0]);
    return [result];
  }

  throw new Error('AI 返回的内容不包含有效的 JSON 格式');
}

export async function parseFullDocument(input: string | string[]) {
  let userMessage = '';
  let images: string[] | undefined = undefined;

  if (typeof input === 'string') {
    userMessage = '以下是整份考卷的文本内容，请识别所有题目并按要求输出 JSON 数组：\n\n' + input;
  } else {
    userMessage = '请识别并解析这些图片序列中的所有题目，按顺序输出 JSON 数组。';
    images = input;
  }

  const response = await chatWithGemini(
    [
      { role: 'system', content: FULL_EXAM_PROMPT },
      { role: 'user', content: userMessage }
    ],
    images
  );

  const jsonStr = response.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(jsonStr);
}
