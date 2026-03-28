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

export async function chatWithReasoningModel(prompt: string, imageBase64?: string, onProgress?: (token: string, think: string) => void): Promise<{ answer: string; analysis: string }> {
  const apiKey = process.env.API_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.devdove.site/v1';
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
- 【排雷·独立核算】：题干中如果携带 \`{{ }}\` 包裹的预设选项（这是未经核实的学生手写墨迹），你必须保持全盲怀疑，自己重新独立计算，绝对不可受其暗示或干扰！
- 【强制映射核验】(防呆设计)：在输出最终【答案】的字母前，**必须执行最后一次交叉核对**！例如：如果你算出坐标是 (0,3)，你必须回看题目顶部的 A/B/C/D 选项，确认哪一个完全等于 (0,3)（假设是选项 D），然后才能在【答案】里输出 D。严禁算出的数值是 C，却随手写成选项 D！
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
    temperature: 0.2,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 900000); // 15 分钟超时
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[DeepSeek] 启动推理尝试 ${attempt}/3 (Model: ${model})...`);
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
        const errText = await response.text();
        throw new Error(`Reasoning Service Error: ${response.status} - ${errText}`);
      }

      if (!response.body) {
        throw new Error('未接收到流响应结构 (Response body is null)');
      }

      // 处理流式逻辑
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
                  onProgress?.('', delta.reasoning_content);
                }
                if (delta.content) {
                  resultText += delta.content;
                  onProgress?.(delta.content, '');
                }
              }
            } catch (e) {}
          }
        }
      }

      clearTimeout(timeoutId);
      console.log(`[DeepSeek] 涓流接收完成，耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

      let answer = '';
      let analysis = '';
      const ansMatch = resultText.match(/【答案】([\s\S]*?)(?=【解析】|$)/);
      const analMatch = resultText.match(/【解析】([\s\S]*)/);
      if (ansMatch) answer = ansMatch[1].trim();
      if (analMatch) analysis = analMatch[1].trim();
      if (!ansMatch && !analMatch) analysis = resultText.trim();

      return { answer, analysis };
    } catch (err: any) {
      lastError = err;
      console.warn(`[Pipeline] 尝试 ${attempt} 失败: ${err.message}`);
      if (attempt < 3 && (err.name === 'AbortError' || err.message.includes('fetch failed') || err.message.includes('ECONNRESET'))) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      break;
    }
  }

  clearTimeout(timeoutId);
  throw lastError || new Error('推理失败，重试已耗尽');
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
   - 严禁使用 $ 符号或 LaTeX 指令。直接输出符号：△, ∠, ⊥, //, °, ² , ³ 等。

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

export async function parseQuestion(imageBase64: string, hasManualAnswer?: boolean, hasManualAnalysis?: boolean) {
  const needsReasoning = !hasManualAnswer || !hasManualAnalysis;
  const baseVisionModel = process.env.NEXT_PUBLIC_MODEL_NAME || 'gemini-3-flash-preview';
  const reasoningModel = process.env.REASONING_MODEL_NAME || 'deepseek-r1';
  
  const isMultimodalReasoning = reasoningModel.toLowerCase().includes('gemini');

  console.log(`[Pipeline] 视觉骨架提取启动. 使用模型: ${baseVisionModel}`);

  const response = await chatWithGemini(
    [
      { role: 'system', content: EXAM_PROMPT },
      { role: 'user', content: '请解析图片内容。' }
    ],
    imageBase64,
    baseVisionModel
  );
  const arrayMatch = response.match(/\[[\s\S]*\]/);
  if (!arrayMatch) throw new Error('解析失败');
  
  let result = JSON.parse(arrayMatch[0]);

  if (needsReasoning) {
    console.log(`[Pipeline] 启用推理通道 (引擎: ${reasoningModel})...`);
    for (let i = 0; i < result.length; i++) {
        const q = result[i];
        if (!q.content?.includes('【解析】')) {
           try {
               const reasoningPrompt = `请深度解答这道题目：\n${q.content}`;
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
                       console.log(`[Pipeline] 注入 ${missingCount} 个缺失的 [附图]`);
                   }
                   suffix += `\n【解析】${finalAnalysis}`;
               }
               
               q.content = `${q.content}${suffix}`;
           } catch (err: any) {
               console.error('[Pipeline] 推理异常:', err);
               const errMsg = err.name === 'AbortError' ? '超时阻断' : (err.message || '网络异常');
               q.content = `${q.content}\n\n【说明】推理引擎异常 (${errMsg})。`;
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

  console.log(`[Pipeline] 全文档漫游启动. 模型: ${baseVisionModel}`);

  const response = await chatWithGemini(
    [
      { role: 'system', content: FULL_EXAM_PROMPT },
      { role: 'user', content: userMsg }
    ],
    images,
    baseVisionModel
  );
  const resultText = response.replace(/```json/g, '').replace(/```/g, '').trim();
  let resultJSON = JSON.parse(resultText);

  console.log(`[Pipeline] 开启全卷巡检 (引擎: ${reasoningModel})...`);
  for (let i = 0; i < resultJSON.length; i++) {
    const q = resultJSON[i];
    if (!q.content?.includes('【解析】')) {
       try {
           const reasoningPrompt = `请深度解答这道题目：\n${q.content}`;
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
           q.content = `${q.content}\n\n【说明】推理巡检异常。`;
       }
    }
  }

  return resultJSON;
}
