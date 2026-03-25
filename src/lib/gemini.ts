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
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

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

    const responseText = await response.text();
    
    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error?.message || errorMessage;
      } catch {
        errorMessage = `HTTP ${response.status}: ${responseText.slice(0, 100)}...`;
      }
      throw new Error(`Gemini API Error: ${errorMessage}`);
    }

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
   - \`content_box\` 必须精确包围该子题目的所有内容（文字、图表、选项），格式为万分位坐标 \`[ymin, xmin, ymax, xmax]\`。
   - 必须在文字边缘留出 1%~2% 的安全空白边距，千万不要把字切缺角。

3. **素材共享**：
   - 如果多个题目共享同一段阅读素材，每个对象的 \`material\` 填写相同内容。

4. **挖空填词与答案回填原则 (Cloze & Answer) —— 【核心指令】**：
   - \`title\` 必须保持纯净的大题号（如 "1."），**严禁**将子题号（如 ①、(1)）混入 \`title\` 中。子题号和正文全部放入 \`content\` 里。
   - **对于短句填词（如填空题）**：如果图片底部有散落的答案词汇，请**智能匹配对位**并用 \`{{\` 和 \`}}\` 包裹填入对应空白处。例如原图 \`① _______ ② _______\`，答案是甲骨文、小篆；输出 \`① {{甲骨文}} ② {{小篆}}\`。
   - **对于长篇解答论述题（大段横线） —— 【极度重要：严格重现题目格式】**：
     - 如果原文提供了一整行或多行的长空白答题横线（________），**严禁使用 {{ }} 进行强制回填，务必保留原本的连续下划线**排版！
     - 必须在题目结尾，将详尽的长段答案抽出，并**强制单列显示**。
     - 格式规范：\`\\n\\n【答案】\\n原图中的长段答题正文\`。
   - **【解析】部分 —— 【必须分离提取】**：如果原图中印有【解析】、【详解】、【分析】、解题过程、知识点说明等，**必须**在 \`content\` 末尾（若有【答案】则放在其后）追加 \`\\n\\n【解析】\\n原图中的解析原文\`。绝不能将答案和解析混杂到一起！
   - **视觉打码专用 (answer_box) —— 【严格分级】**：
     - 你必须识别图片中**印好的正确答案区域**（例如：最底部的“【答案】”整行，或分栏旁边的汇总答案）。
     - **严禁**：严禁将题干中的空白下划线（如 ① _______）作为打码区域！那里是学生答题区，不能打码。
     - **必须**：必须只针对原图中本来就印着的、给老师参考的、泄露真相的那一部分答案进行打码。支持 [0-1000] 归一化坐标：\`answer_box: [ymin, xmin, ymax, xmax]\`。
   - 一切互动均通过 \`content\` 中的 \`{{}}\` 实现。长段解答则遵循上述追加 \`【答案】\` 的规范；严禁生造顶层级的独立 answer 字段。

5. **图片防泄密原则 (Image Anti-leakage) —— 【绝对红线】**：
   - 遇到题干中的插图、表格等非文字元素时，**仅输出干瘪的占位符**（例如 \`[附图]\` 或 \`[表格]\`）。
   - **绝对禁止**在 \`content\` 中转述或描述插图的实质内容！如果在图片占位说明中把本题要考察的知识点（如字体名称、人物名字、具体参数等真实答案）顺手写了出来，会导致**提前泄题的严重教学事故**。务必保持沉默，只留 \`[附图]\`。

6. **格式保真原则 (Format Fidelity) —— 【必须遵守】**：
   - \`content\` 必须**忠实还原原文的排版结构**，使答题卡与原文保持视觉一致。
   - **答题横线**：原文中用于学生书写答案的空白横线，必须用连续下划线 \`________\` 表示（至少8个下划线字符），每条横线独占一行。
   - **换行与段距**：保留原文中的换行 (\\n) 和段落间距。
   - **子题号层级**：子题号（如 ①②③ 或 (1)(2)(3)）必须保持原文中的缩进和换行。

### 📦 输出格式要求（必须为 JSON 数组）：
[
  {
    "title": "1.",
    "material": "背景材料文本",
    "content": "包含 {{真实答案}} 的题干全文结构",
    "answer_box": [ymin, xmin, ymax, xmax],
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
   - 你可能会看到多张代表连续页面的图片。如果某道题目在第1页底部和第2页顶部同时出现，请**仅输出一次**。
   - 优先选择显示最完整的那个版本。

3. **素材共享**：
   - 如果多个题目共享同一段阅读素材，每个题目对象都必须携带**相同的** \`material\` 文本和 \`material_box\`。
   - 这是实现“同屏讲解”的关键，请务必保证 material 文本字符完全匹配。

4. **挖空填词与答案回填原则 (Cloze & Answer) —— 【核心指令】**：
   - 提取原文到 \`content\` 时，切勿自行生成任何解析。
   - \`title\` 保持纯净，子题号（如 ①）和下划线留在 \`content\` 里。
   - **填空类短词**：若发现原图底部/侧边印有散落的短词答案，请对其**智能对位匹配**，并**直接填回**到 \`content\` 的对应空白处，并**必须用 \`{{\` 和 \`}}\` 包裹**！例如原图 \`① _______ ② _______\`，答案是甲骨文、小篆；输出 \`① {{甲骨文}} ② {{小篆}}\`。
   - **解答论述类长段 —— 【极度重要：严格重现题目格式】**：
     - 若原文中含有占满整行或多行的空白答题横线（________），要求 AI **严禁使用 {{ }} 强制进行长段回填**！必须保留原始的连续下划线排版。
     - 此类长段答案，**必须在内容末尾强制使用 \`【答案】\` 单列显示**。格式规范：\`\\n\\n【答案】\\n详尽的解答正文\`。
   - **【解析】部分 —— 【必须分离提取】**：如果原图中印有【解析】、【详解】、【分析】、解题过程、知识点说明等内容，**必须**单列在 \`content\` 末尾（若有【答案】则追加在其后）：\`\\n\\n【解析】\\n解题思路和知识点...\`。严禁将答案和解析混为一谈！
   - **视觉打码专用 (answer_box)**：
     - 必须输出原图中印着的**答案详解/备选答案汇总区**的归一化坐标 \`answer_box: [ymin, xmin, ymax, xmax]\`。
   - 严禁生造顶层级的独立 \`answer\` 字段；短空答案用 \`{{}}\` 挖空，长答案与解析追加于 \`content\` 底部。

5. **图片防泄密原则 (Image Anti-leakage) —— 【绝对红线】**：
   - 遇到插图、表格等非文字元素时，**仅输出占位符**（例如 \`[附图]\` 或 \`[表格]\`）。
   - **绝对禁止**在 \`content\` 中尝试描述插图的实质内容！

6. **格式保真原则 (Format Fidelity) —— 【必须遵守】**：
   - \`content\` 必须**忠实还原原文的排版结构**，使答题卡与原文保持视觉一致。
   - **答题横线**：原文中用于学生书写答案的空白横线，必须用连续下划线 \`________\` 表示（至少8个下划线字符），每条横线独占一行。
   - **换行与段距**：保留原文中的换行 (\\n) 和段落间距。
   - **子题号层级**：子题号（如 ①②③ 或 (1)(2)(3)）必须保持原文中的缩进和换行。

### 📦 输出格式要求 (JSON Array)：
[
  {
    "title": "1.",
    "material": "共享素材文本",
    "material_box": [ymin, xmin, ymax, xmax],
    "content": "包含 {{包裹答案}} 的题干全文",
    "answer_box": [ymin, xmin, ymax, xmax],
    "content_box": [ymin, xmin, ymax, xmax]
  }
]

只输出 JSON 数组，严禁任何解释性文字。`;

export async function parseQuestion(imageBase64: string) {
  const response = await chatWithGemini(
    [
      { role: 'system', content: EXAM_PROMPT },
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
