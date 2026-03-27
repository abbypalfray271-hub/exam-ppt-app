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

export const EXAM_PROMPT = `你是一位专业的试题切割工具。请针对上传的考题图片，将其中的**每一个编号题目**拆解为独立的对象。

### 🌟 核心原则：一题一对象，严禁合并，严禁重复！

1. **逐题拆分（最重要！）**：
   - 如果图片中有编号 1. 2. 3. 4. 5. 的题目，你必须输出 **5 个独立的 JSON 对象**。
   - **标题规范 (Title)**: \`title\` 必须严格设为题号本身（例如 "1." 或 "2."），不要生成摘要性的文字作为标题。
   - **内容规范 (Content)**: \`content\` 包含题干全文。**不要**在 content 的开头重复输出题号，直接从文字开始。

2. **精准坐标与原图切割**：
   - content_box 必须精确包围该子题目的所有内容（文字、图表、选项），格式为万分位坐标 [ymin, xmin, ymax, xmax]。
   - 必须在文字边缘留出 1%~2% 的安全空白边距，千万不要把字切缺角。

3. **素材共享**：
   - 如果多个题目共享同一段阅读素材，每个对象的 material 填写相同内容。

4. **答题位置精准回填 (Answer Positioning) —— 【核心优先级目标】**：
   - **选择题回填**：识别到题干中的括号 ( ) 或 （ ） 时，**必须**将答案字母填入其中并用 {{ }} 包裹。例如：...正确的一项是 ( {{D}} )。
   - **填空/问答题回填**：识别到题干中的下划线 ____ 时，**必须**将对应答案用 {{ }} 包裹并直接替换或覆盖下划线。
   - **原地回填原则（极端重要）**：你必须**深度清理并替换**原文中的 '____' 或 '( )' 为 '{{正确答案}}'。严禁在 content 中解析完成后仍保留占位符！
   - **解析分离原则**：【解析】、【详解】等内容必须独立追加在 content 底部。
   - **视觉打码专用 (answer_box)**：必须识别原图中印好的答案区坐标。
    - **图样检测 (diagram_boxes)**：必须探测并输出题干内**所有**几何图形、函数图象、统计表、实物图的坐标。
    - **整体性原则**：若多张图（如"图①、图②、备用图"）并排或上下排列，**必须**用一个大框将它们整体框住输出，严禁拆分为多个小框。框选时应包含图形的所有顶点和下方的图名标签，宁可稍大也不要切断。
   - 一切点击互动的呈现都通过 content 中的 {{}} 实现。

5. **图片防泄密原则 (Image Anti-leakage) —— 【绝对红线】**：
   - 遇到题干中的插图、表格等非文字元素时，**仅输出干瘪的占位符**（例如 [附图] 或 [表格]）。
   - **绝对禁止**在 content 中转述或描述插图的实质内容！如果在图片占位说明中把本题要考察的知识点（如字体名称、人物名字、具体参数等真实答案）顺手写了出来，会导致**提前泄题的严重教学事故**。务必保持沉默，只留 [附图]。

6. **格式保真原则 (Format Fidelity) —— 【必须遵守】**：
   - content 必须**忠实还原原文的排版结构**，使答题卡与原文保持视觉一致。
   - **答题横线**：原文中用于学生书写答案的空白横线，必须用连续下划线 ________ 表示（至少8个下划线字符），每条横线独占一行。
   - **换行与段距**：保留原文中的换行 (\n) 和段落间距。
   - **子题号层级**：子题号（如 ①②③ 或 (1)(2)(3)）必须保持原文中的缩进和换行。

7. **符号纯文本化原则 (Symbol Plain Text Only) —— 【核心强制要求】**：
    - **禁止任何 LaTeX**：绝对禁止输出 \\triangle, \\angle, \\perp, \\parallel 等 LaTeX 指令，也禁止用 $ 符号包裹内容。
    - **必须使用 Unicode**：直接使用图片原样的数学符号（如 △, ∠, ⊥, //, °, ², ³）。如果遇到复杂的根式或分式，优先保持排版整齐而不是转换成 LaTeX。
    - **符号原样输出**：不要尝试修正或美化符号，图片上是 "//" 就输出 "//"，不要输出 "\\parallel"。

### 📦 输出格式要求（必须为 JSON 数组）：
[
  {
    "title": "1.",
    "material": "背景材料文本",
    "content": "题干内容 [附图] ( {{真实答案}} )\n【答案】{{真实答案}}\n【解析】...",
    "answer_box": [ymin, xmin, ymax, xmax],
    "diagram_boxes": [[ymin, xmin, ymax, xmax], ...],
    "content_box": [ymin, xmin, ymax, xmax]
  }
]

只输出 JSON 数组，严禁包含 markdown 标记。`;

export const FULL_EXAM_PROMPT = `你是一个专业的试题切割工具。请深度分析提供的整张试卷图像，将上面的**每一个编号题目**拆解为独立的对象。

### 🛠️ 核心原则：一题一对象，严禁合并，严防跨页重复！

1. **逐题拆分 (一题一号)**：
   - **标题规范 (Title)**: \`title\` 必须严格设为题号（如 "1." 或 "Q1."），严禁生成摘要作为标题。
   - 每个编号题目必须拥有自己独立的 \`content_box\`。

2. **严禁跨页重复 (De-duplication)**：
   - 你可能会看到多张代表连续页面的图片。如果某道题目在第1页底部 and 第2页顶部同时出现，请**仅输出一次**。
   - 优先选择显示最完整的那个版本。

3. **素材共享**：
   - 如果多个题目共享同一段阅读素材，每个题目对象都必须携带**相同的** \`material\` 文本和 \`material_box\`。
   - 这是实现“同屏讲解”的关键，请务必保证 material 文本字符完全匹配。

4. **答题位置精准回填与智能补全 (Positioning & Supplement) —— 【核心优先级目标】**：
   - **原地回填原则**：识别到题干中的括号 ( ) 或下划线 ____ 时，**必须**将答案用 {{ }} 包裹并填入对应位置。
   - **智能补全逻辑**：如果图中没有印出正确答案或解析，作为专家，你**必须根据题意自主生成**最可能的答案和详尽解析。
   - **全覆盖原则**：严禁仅在底部显示答案而不回填位置！所有答案第一优先级是填入 content 对应的 {{}} 位置。
   - **解析分离原则**：【解析】、【详解】等内容必须独立追加在 content 底部。如果图中缺失，请自行生成。
   - **视觉打码专用 (answer_box)**：若原图有印好的答案区，请输出坐标。
   - **图样检测 (diagram_boxes)**：必须检测并输出题干中所有由于排版需要而存在的图形、图面、表格的具体物理坐标。格式为 [[ymin, xmin, ymax, xmax], ...]。这些坐标需与 content 里的 [附图] 占位符一一对应。
   - 严禁生造顶层级的独立 answer 字段；所有答案互动均通过 content 中的 {{}} 实现。

5. **图片防泄密原则 (Image Anti-leakage) —— 【绝对红线】**：
   - 遇到插图、表格等非文字元素时，**仅输出占位符**（例如 [附图] 或 [表格]）。
   - **绝对禁止**在 content 中尝试描述插图的实质内容！

6. **格式保真原则 (Format Fidelity) —— 【必须遵守】**：
   - content 必须**忠实还原原文的排版结构**，使答题卡与原文保持视觉一致。
   - **答题横线**：原文中用于学生书写答案的空白横线，必须用连续下划线 ________ 表示（至少8个下划线字符），每条横线独占一行。
   - **换行与段距**：保留原文中的换行 (\n) 和段落间距。
   - **子题号层级**：子题号（如 ①②③ 或 (1)(2)(3)）必须保持原文中的缩进和换行。

7. **符号保真与清理原则 (Symbol Fidelity & Cleanup)**：
    - **优先 Unicode**：直接使用图片原样符号（如 △, ∠, ⊥, //, °, ²），严禁使用 LaTeX 转换简单符号。
    - **禁止散乱包裹**：严禁将普通字母或单位（如 t, S, cm, s）包裹在 $ 中。
    - **追求极致简约**：文本应保持纯净，只有极其复杂的公式才允许使用 LaTeX。

### 📦 输出格式要求 (JSON Array)：
[
  {
    "title": "1.",
    "material": "共享素材文本",
    "material_box": [ymin, xmin, ymax, xmax],
    "content": "题干内容 [附图] ( {{包裹答案}} )\n【答案】{{答案内容}}\n【解析】详细解析...",
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
