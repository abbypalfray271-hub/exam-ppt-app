export interface GeminiMessage {
  role: 'user' | 'model' | 'system';
  content: string;
}

export interface GeminiResponse {
  content: string;
}

export async function chatWithGemini(
  messages: GeminiMessage[],
  imageBuffer?: Buffer | string | (Buffer | string)[],
  modelOverride?: string
): Promise<string> {
  const apiKey = process.env.API_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.devdove.site/v1';
  const model = modelOverride || process.env.NEXT_PUBLIC_MODEL_NAME || 'gemini-2.5-flash';

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

export async function chatWithReasoningModel(prompt: string, imageBase64?: string): Promise<{ answer: string; analysis: string }> {
  const apiKey = process.env.API_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.devdove.site/v1';
  // Fallback to gemini-pro if not found, but we prefer deepseek
  const model = process.env.REASONING_MODEL_NAME || 'deepseek-r1';

  let userContent: any = prompt;
  if (imageBase64) {
    const imageData = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
    userContent = [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: imageData } }
    ];
  }

  const body: any = {
    model,
    messages: [
      {
        role: 'system',
        content: `你是一个专业的资深数学教师和试卷命题组长。
你的任务是：接收题目内容（包含文字和描述图片关系的场景描述），给出如同“正式教辅或考卷官方标准答案”般的详尽解析。
要求：
- 请分两步返回：先写【答案】（只写简短结果），再写【解析】（包含详细分析）。
- 【格式强制】：禁止使用 LaTeX 数学公式标签（禁止出现 \\( \\)、\\[ \\]、\\frac 等）。请采用直观纯文本：分数写成 16/5，平方写成 t^2，根号写成 √。
- 【图像集成】(最高优先级)：如果题干原文中包含 [附图] 占位符，你**必须**在输出的【解析】开头或关键步骤处，原样打印出相同数量的 [附图] 字符串！否则用户的试卷将失去图片！
- 【解析风格】：
    1. 逻辑严密，多使用 ∵ (因为) 和 ∴ (所以) 符号进行推导。
    2. 使用标准几何语言，如“在 Rt △ABC 中”，“由勾股定理得”，“由对称性可知”等。
    3. 模拟考卷评分标准：在每一个逻辑关键步骤结束时，自动添加类似“...... 4分”、“...... 8分”的进度分值标记。
    4. 即使使用坐标系辅助，也请将推导过程讲得有血有肉，包含几何性质的描述。
- 禁止重复寒暄，直接输出如下格式：\n【答案】选项A / 填空值\n【解析】解析内容...`
      },
      {
        role: 'user',
        content: userContent
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
   - **核心职责**：如果题目涉及几何图形、动点或函数图像，必须在 \`content\` 字段的对应位置（通常是提到图形的句子末尾或段落之间）插入 **\`[附图]\`** 占位符。
   - **转译内容**：在 \`content\` 的题面文字之后，另起一段以 **\`[场景描述]\`** 开头，详细描述图中无法通过文字直接获知的空间关系。例如：“图中△ABC是直角三角形，∠C=90°，AC=6, BC=8。点P在AC边上，此时距离A点位置约为1/3处。”
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

const REASONING_INSTRUCTIONS = `
### 🧠 深度推理指令：
- **核心任务**：本题目缺失现成答案，你必须在识别图片的同时，发挥你的逻辑推演能力，直接给出详尽解答。
- **输出位置**：请将解答过程直接写在 \`content\` 字段内，紧跟在 [场景描述] 之后。
- **解析风格**：
    1. 逻辑严密，多使用 ∵ (因为) 和 ∴ (所以) 符号进行推导。
    2. 使用标准几何语言，模拟考卷评分标准（如在步骤后加 ...... 4分）。
    3. 风格应正式，如同官方标准答案。
`;

export async function parseQuestion(imageBase64: string, hasManualAnswer?: boolean, hasManualAnalysis?: boolean) {
  const needsReasoning = !hasManualAnswer || !hasManualAnalysis;
  const baseVisionModel = process.env.NEXT_PUBLIC_MODEL_NAME || 'gemini-3-flash-preview';
  const reasoningModel = process.env.REASONING_MODEL_NAME || 'deepseek-r1';
  
  // 核心路由判断：配置的推理模型是否具备视觉能力 (例如 gemini 系列)
  const isMultimodalReasoning = reasoningModel.toLowerCase().includes('gemini');

  // Step 1: 永远使用基础模型 (Flash) 进行不受强推理指令干扰的结构化 OCR 提取
  let instruction = EXAM_PROMPT;
  console.log(`[Pipeline] 视觉骨架提取启动. 使用模型: ${baseVisionModel}`);

  const response = await chatWithGemini(
    [
      { role: 'system', content: instruction },
      { role: 'user', content: '请解析图片内容。' }
    ],
    imageBase64,
    baseVisionModel
  );
  const arrayMatch = response.match(/\[[\s\S]*\]/);
  if (!arrayMatch) throw new Error('解析失败');
  
  let result = JSON.parse(arrayMatch[0]);

  // Step 2: 无论是 3.1 Pro 还是 DeepSeek，全都走长程流式高强度推理通道
  if (needsReasoning) {
    console.log(`[Pipeline] 启用并行推理接力通道 (引擎: ${reasoningModel}, 带有视觉: ${isMultimodalReasoning})...`);
    for (let i = 0; i < result.length; i++) {
        const q = result[i];
        if (!q.content?.includes('【解析】')) {
           try {
               const reasoningPrompt = `请深度解答这道题目：\n${q.content}`;
               
               // 灵魂注入：如果是多模态 3.1 Pro，就带上原图，让它看图解题；如果是盲区 DeepSeek，就不带图凭空推导
               const attachedImage = isMultimodalReasoning ? imageBase64 : undefined;
               
               const reasoning = await chatWithReasoningModel(reasoningPrompt, attachedImage);
               let suffix = '';
               if (reasoning.answer) suffix += `\n\n【答案】${reasoning.answer}`;
               if (reasoning.analysis) {
                   let finalAnalysis = reasoning.analysis;
                   const promptDiagramCount = (q.content.match(/\[附图\]/g) || []).length;
                   const analysisDiagramCount = (finalAnalysis.match(/\[附图\]/g) || []).length;
                   
                   if (promptDiagramCount > analysisDiagramCount) {
                       const missingCount = promptDiagramCount - analysisDiagramCount;
                       finalAnalysis = '\n' + '[附图]\n'.repeat(missingCount) + finalAnalysis;
                       console.log(`[Pipeline] 大模型遗漏了图像占位符，已强制托底注入 ${missingCount} 个 [附图] 入口`);
                   }
                   suffix += `\n【解析】${finalAnalysis}`;
               }
               
               q.content = `${q.content}${suffix}`;
           } catch (err: any) {
               console.error('[Pipeline] 推理阶段临时异常:', err);
               const errMsg = err.name === 'AbortError' ? '本地防御超时 (耗时过久被强杀，建议原图重试)' : (err.message || '未知异常');
               q.content = `${q.content}\n\n【说明】深度推理服务异常 (${errMsg})，未能生成详尽解析。`;
           }
        }
    }
  }

  return result;
}

export async function parseFullDocument(input: string | string[]) {
  const images = typeof input === 'string' ? undefined : input;
  const userMsg = typeof input === 'string' ? input : '请解析图片序列。';
  
  const baseVisionModel = process.env.NEXT_PUBLIC_MODEL_NAME || 'gemini-3-flash-preview';
  const reasoningModel = process.env.REASONING_MODEL_NAME || 'deepseek-r1';

  // 对于全页游侠：原封不动用基础提取
  let instruction = FULL_EXAM_PROMPT;

  console.log(`[Pipeline] 全文档漫游启动. 视角引擎: ${baseVisionModel}`);

  const response = await chatWithGemini(
    [
      { role: 'system', content: instruction },
      { role: 'user', content: userMsg }
    ],
    images,
    baseVisionModel
  );
  const resultText = response.replace(/```json/g, '').replace(/```/g, '').trim();
  let resultJSON = JSON.parse(resultText);

  // 一律走流式后置通道
  console.log(`[Pipeline] 启动全卷流式后置巡检 (引擎: ${reasoningModel})...`);
  for (let i = 0; i < resultJSON.length; i++) {
    const q = resultJSON[i];
    if (!q.content?.includes('【解析】')) {
       try {
           const reasoningPrompt = `请深度解答这道题目：\n${q.content}`;
           // 由于全文档游侠模式很少使用，且切页复杂，此处推理通道不传图，纯视作最后一道文本兜底防线
           const reasoning = await chatWithReasoningModel(reasoningPrompt, undefined);
           let suffix = '';
           if (reasoning.answer) suffix += `\n\n【答案】${reasoning.answer}`;
           if (reasoning.analysis) {
               let finalAnalysis = reasoning.analysis;
               const promptDiagramCount = (q.content.match(/\[附图\]/g) || []).length;
               const analysisDiagramCount = (finalAnalysis.match(/\[附图\]/g) || []).length;
               
               if (promptDiagramCount > analysisDiagramCount) {
                   const missingCount = promptDiagramCount - analysisDiagramCount;
                   finalAnalysis = '\n' + '[附图]\n'.repeat(missingCount) + finalAnalysis;
               }
               suffix += `\n【解析】${finalAnalysis}`;
           }
           q.content = `${q.content}${suffix}`;
       } catch (err: any) {
           console.error('[Pipeline] 分题巡检异常:', err);
           const errMsg = err.name === 'AbortError' ? '超时阻断' : '网络异常';
           q.content = `${q.content}\n\n【说明】深度推理服务被拦截 (${errMsg})。`;
       }
    }
  }

  return resultJSON;
}
