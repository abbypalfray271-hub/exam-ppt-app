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

### 🌟 核心原则：一题一对象，严禁合并！

1. **逐题拆分（最重要！）**：
   - 如果图片中有编号 1. 2. 3. 4. 5. 的题目，你必须输出 **5 个独立的 JSON 对象**。
   - **严禁**将多个编号题目合并成一个对象。
   - 如果图片中只有一道题（无子编号），则输出仅包含 1 个对象的数组。

2. **精准坐标与原图切割**：
   - \`content_box\` 必须精确包围该子题目的所有内容（文字、图表、选项），格式为万分位坐标 \`[ymin, xmin, ymax, xmax]\`。
   - 坐标是基于**你接收到的这张图片**计算的相对坐标。

3. **素材共享**：
   - 如果多个题目共享同一段阅读素材，每个对象的 \`material\` 填写相同内容。

4. **无解析原则**：只提取原图文字，**不要**进行任何解答、分析或总结。

### 📦 输出格式要求（必须为 JSON 数组）：
[
  {
    "title": "题目简短标题",
    "material": "背景材料文本（如果没有则为空字符串）",
    "content": "具体的题干/问题文本",
    "content_box": [ymin, xmin, ymax, xmax]
  }
]

只输出 JSON 数组，严禁包含 markdown 标记。坐标为数组格式，表示万分位 [ymin, xmin, ymax, xmax]。`;

export const FULL_EXAM_PROMPT = `你是一个专业的试题切割工具。请深度分析提供的整张试卷图像，将上面的**每一个编号题目**拆解为独立的对象。

### 🛠️ 核心原则：一题一对象，严禁合并！

1. **逐题拆分（最重要！）**：
   - 如果试卷中有编号 1. 2. 3. 4. 5. 的题目，你必须输出 **5 个独立的 JSON 对象**。
   - **严禁**将多个编号题目合并成一个对象。每个编号题目都必须拥有自己独立的 \`content_box\`。
   - 每个 \`content_box\` 仅包含该题自身的区域（从该题号开始，到下一个题号之前结束）。

2. **素材共享**：
   - 如果多个题目共享同一段阅读素材（如《杨氏之子》），每个题目对象都必须携带**相同的** \`material\` 文本和 \`material_box\`。
   - 这样前端可以自动聚合它们到同一页展示。

3. **精准裁剪**：
   - \`content_box\` 必须**严格避开**阅读素材段落。从题号开始（如 "1. 给文中的..."），到该题最后一行结束。
   - 如果一道题包含图表（如框图、连线题），\`content_box\` 必须完整覆盖该图表区域。

4. **无解析原则**：仅提取原文文字到 \`content\`，不要生成任何解析或答案。

### 📦 输出格式要求（JSON Array）：
[
  {
    "title": "第1题简短标题",
    "material": "共享的阅读素材文本（多个题目填写相同内容）",
    "material_box": [ymin, xmin, ymax, xmax],
    "content": "该题的题干文本",
    "content_box": [ymin, xmin, ymax, xmax]
  },
  {
    "title": "第2题简短标题",
    "material": "共享的阅读素材文本（与上面保持一致）",
    "material_box": [ymin, xmin, ymax, xmax],
    "content": "该题的题干文本",
    "content_box": [ymin, xmin, ymax, xmax]
  }
]

### ⚠️ 举例说明：
如果试卷上有一篇阅读文章，下面跟着 5 个问题（1-5），你必须输出 5 个对象，每个对象的 material 相同，但 content 和 content_box 各不相同。

只输出 JSON 数组，严禁任何解释性文字。坐标格式：[ymin, xmin, ymax, xmax]，万分位单位。`;
