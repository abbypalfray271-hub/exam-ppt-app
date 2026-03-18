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

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

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
  } catch (error) {
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

4. **无解析原则**：只提取原图文字，**不要**进行任何解答、分析或总结。

### 📦 输出格式要求（必须为 JSON 数组）：
[
  {
    "title": "1.",
    "material": "背景材料文本",
    "content": "具体的题干/问题文本",
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

4. **精准裁剪与无解析**：
   - \`content_box\` 必须避开素材段落。仅提取原文文字到 \`content\`，不要生成任何解析或答案。

### 📦 输出格式要求 (JSON Array)：
[
  {
    "title": "1.",
    "material": "共享素材文本",
    "material_box": [ymin, xmin, ymax, xmax],
    "content": "题干文本",
    "content_box": [ymin, xmin, ymax, xmax]
  }
]

只输出 JSON 数组，严禁任何解释性文字。`;
