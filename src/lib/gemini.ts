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

export async function chatWithReasoningModel(prompt: string): Promise<{ answer: string; analysis: string }> {
  const apiKey = process.env.API_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.devdove.site/v1';
  // Fallback to gemini-pro if not found, but we prefer deepseek
  const model = process.env.REASONING_MODEL_NAME || 'deepseek-r1';

  const body: any = {
    model,
    messages: [
      {
        role: 'system',
        content: `你是一个专业的试卷推理与解答系统。
你的任务是：接收纯文本的题目干（主要依据题目现有的文字和选项提示来进行逻辑推理），
给出准确的解答，并输出详细的思路解析。
要求：
- 请分两步返回：先写【答案】（只写简短结果），再写【解析】（包含详细分析）。
- 【答案】部分：填空题请用数组或清晰文本，选择题给选项，解答题给结果。
- 【解析】部分：请逻辑递进，推导严密。
- 【格式强制】：禁止使用复杂的 LaTeX 数学公式标签（如禁止出现 \\( \\)、\\[ \\]、\\frac 等）。请采用“直观纯文本”形式表达，如分数直接写成 16/5，平方写成 t^2，根号写成 √。
- 禁止重复寒暄，直接输出如下格式：\n【答案】选项A / 填空值\n【解析】因为...所以...`
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    stream: true,
    temperature: 0.2, // Reasoning models benefit from slightly higher temp
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 900000); // 终极防御阈值：15 分钟，解放 R1 推演极限

  try {
    console.log(`[DeepSeek] 启动深度推理 (长链接涓流抵抗CF超时)... (Model: ${model})`);
    const startTime = Date.now();
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    
    if (!response.ok) {
      clearTimeout(timeoutId);
      const errText = await response.text();
      throw new Error(`Reasoning Service Error: ${response.status} - ${errText}`);
    }
    
    if (!response.body) {
      clearTimeout(timeoutId);
      throw new Error('未接收到完整的流响应结构 (Response body is null)');
    }

    let resultText = '';
    const reader = (response.body as any).getReader();
    const decoder = new TextDecoder('utf-8');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (let line of lines) {
        line = line.trim();
        if (line.startsWith('data:') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(5).trim());
            const delta = data.choices?.[0]?.delta;
            if (delta) {
              if (delta.reasoning_content) {
                // [物理防御]: 只要在收 thought 流，Cloudflare 网络层判定活跃便绝不断开连接
              }
              if (delta.content) {
                resultText += delta.content; // 将分块回传来的文本慢慢拼接到一起
              }
            }
          } catch(e) {}
        }
      }
    }
    
    clearTimeout(timeoutId);
    
    console.log(`[DeepSeek] 涓流接收全部完成，深思耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    
    let answer = '';
    let analysis = '';
    
    const ansMatch = resultText.match(/【答案】([\s\S]*?)(?=【解析】|$)/);
    const analMatch = resultText.match(/【解析】([\s\S]*)/);
    
    if (ansMatch) answer = ansMatch[1].trim();
    if (analMatch) analysis = analMatch[1].trim();
    
    if (!ansMatch && !analMatch) {
      // 如果大模型不听话没生成标签，直接截取全文给解析
      analysis = resultText.trim();
    }
    
    return { answer, analysis };
  } catch (error: any) {
    console.error('[DeepSeek Error]', error);
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

4. **无需强制补全难度解析**：
   - 如果图片中原本就有答案/解析，请正常剥离并加上【答案】或【解析】前缀。
   - 如果图片中没有印出答案，保持原样即可，**绝对不要自己胡乱编造解答**，我们会交给推导系统处理。
   - content 格式示例：\`题干...\\nA. xxx B. yyy\\n【如果有的话就加分析与答案，没有就不加】\`

5. **符号纯净 (Unicode Only)**：
   - 严禁使用 $ 符号或 LaTeX 指令。直接输出符号：△, ∠, ⊥, //, °, ², ³ 等。

6. **视觉转译协议 (Visual-to-Text Translation)**：
   - **核心职责**：如果题目涉及几何图形、动点或函数图像，必须在 \`content\` 字段的题面文字之后，另起一段以 **\`[场景描述]\`** 开头。
   - **转译内容**：详细描述图中无法通过文字直接获知的空间关系。例如：“图中△ABC是直角三角形，∠C=90°，AC=6, BC=8。点P在AC边上，此时距离A点位置约为1/3处。”
   - **目标**：确保后续的逻辑推导系统仅凭这段描述即可在脑海中完成“复刻”。

### 📦 输出格式 (JSON Array)：
[
  {
    "title": "题号",
    "material": "素材内容",
    "content": "题干文字\\n[场景描述] 这里详细描述图中几何关系、图形标记、垂直、平行等条件...\\n【答案】{{答案}}\\n【解析】...",
    "answer_box": [ymin, xmin, ymax, xmax],
    "diagram_boxes": [[ymin, xmin, ymax, xmax]],
    "content_box": [ymin, xmin, ymax, xmax]
  }
]
只输出 JSON 数组，严禁任何反引号或 Markdown 标记。`;

export const FULL_EXAM_PROMPT = EXAM_PROMPT;

export async function parseQuestion(imageBase64: string, hasManualAnswer?: boolean, hasManualAnalysis?: boolean) {
  let instruction = EXAM_PROMPT;

  // Step 1: 视觉纯净提取 (Gemini)
  const response = await chatWithGemini(
    [
      { role: 'system', content: instruction },
      { role: 'user', content: '请解析图片内容。' }
    ],
    imageBase64
  );
  const arrayMatch = response.match(/\[[\s\S]*\]/);
  if (!arrayMatch) throw new Error('解析失败');
  
  let result = JSON.parse(arrayMatch[0]);

  // Step 2: 按需接入深度推理 (DeepSeek)
  if (!hasManualAnswer || !hasManualAnalysis) {
    console.log('[Pipeline] 该题缺失人工框选的答案/解析，移交 DeepSeek 进行深度填补...');
    for (let i = 0; i < result.length; i++) {
        const q = result[i];
        try {
            const reasoning = await chatWithReasoningModel(`请深度解答这道题目：\n${q.content}`);
            let suffix = '';
            if (reasoning.answer) suffix += `\n\n【答案】${reasoning.answer}`;
            if (reasoning.analysis) suffix += `\n【解析】${reasoning.analysis}`;
            
            q.content = `${q.content}${suffix}`;
        } catch (err: any) {
            console.error('[Pipeline] DeepSeek 推理阶段临时异常:', err);
            const errMsg = err.name === 'AbortError' ? '本地防御超时 (耗时过久被强杀，建议原图重试)' : (err.message || '未知异常');
            q.content = `${q.content}\n\n【说明】深度推理服务异常 (${errMsg})，未能生成详尽解析。`;
        }
    }
  }

  return result;
}

export async function parseFullDocument(input: string | string[]) {
  const images = typeof input === 'string' ? undefined : input;
  const userMsg = typeof input === 'string' ? input : '请解析图片序列。';
  
  // 第一段仍然是 Gemini 大范围视觉提取
  const response = await chatWithGemini(
    [
      { role: 'system', content: FULL_EXAM_PROMPT },
      { role: 'user', content: userMsg }
    ],
    images
  );
  const resultText = response.replace(/```json/g, '').replace(/```/g, '').trim();
  let resultJSON = JSON.parse(resultText);

  // 全文档智能全量推理 (因无法预先人工确认某题是否有答案，检测是否存在解析前置判定)
  console.log('[Pipeline] 全页解析完毕，进入长程自主推理巡检...');
  for (let i = 0; i < resultJSON.length; i++) {
    const q = resultJSON[i];
    // 如果题目中根本还没包含【解析】，就由 DeepSeek 强行破译
    if (!q.content?.includes('【解析】')) {
       try {
           const reasoning = await chatWithReasoningModel(`请深度解答这道题目：\n${q.content}`);
           
           let suffix = '';
           if (reasoning.answer) suffix += `\n\n【答案】${reasoning.answer}`;
           if (reasoning.analysis) suffix += `\n【解析】${reasoning.analysis}`;
           
           q.content = `${q.content}${suffix}`;
       } catch (err: any) {
           console.error('[Pipeline] DeepSeek 巡检推理失败:', err);
           const errMsg = err.name === 'AbortError' ? '本地防御超时 (耗时过久被强杀，建议原图重试)' : (err.message || '未知异常');
           q.content = `${q.content}\n\n【说明】深度推理服务异常 (${errMsg})，未能生成详尽解析。`;
       }
    }
  }

  return resultJSON;
}
