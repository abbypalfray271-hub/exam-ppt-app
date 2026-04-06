import { NextRequest, NextResponse } from 'next/server';
import { parseQuestion } from '@/lib/gemini';
import type { AIQuestionResult, SSEPayload } from '@/types/ai';

/** 从 content 中提取【解析】部分，写入 analysis 字段（保留 content 不变） */
function extractAnalysis(questions: AIQuestionResult[]): AIQuestionResult[] {
  const splitRegex = /[\r\n]*【(?:解析|详解|分析)】/;
  return questions.map(q => {
    if (!q.content || q.analysis) return q;
    const idx = q.content.search(splitRegex);
    if (idx > 0) {
      return { ...q, analysis: q.content.slice(idx).trim() };
    }
    return q;
  });
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      const send = (data: SSEPayload) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (e) {
          isClosed = true;
        }
      };

      // [心跳监控]: 每 5 秒发送一个空格，穿透 Cloudflare/网关的超时死线 (ECONNRESET 防御)
      const keepaliveInterval = setInterval(() => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n')); 
        } catch (e) {
          isClosed = true;
        }
      }, 5000);

      try {
        const body = await request.json();
        const { action = 'parseQuestion', clips, isDeepThinking } = body;
        
        console.log(`[API-STREAM] Action: ${action} (Clips: ${clips?.length || 0}) (DeepThinking: ${!!isDeepThinking})`);

        const onStatus = (msg: string) => {
          if (msg.startsWith('FAILURE_ITEM:')) {
            send({ type: 'error', error: msg.replace('FAILURE_ITEM:', '').trim() });
          } else {
            send({ type: 'status', msg });
          }
        };

        if (action === 'parseQuestion' || action === 'generateMindMap') {
          // clips 现在是一个 AIClip[] 数组
          const result = await parseQuestion(
            clips || [], 
            onStatus,
            !!isDeepThinking,
            action as any
          );
          send({ type: 'data', data: extractAnalysis(result) });
        } else {
          send({ type: 'error', error: `Invalid action: ${action}` });
        }
      } catch (error: any) {
        console.error('[API Stream Error]:', error);
        send({ type: 'error', error: error.message || 'Internal Server Error' });
      } finally {
        isClosed = true;
        clearInterval(keepaliveInterval);
        try {
          controller.close();
        } catch (e) {}
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // 禁用 Nginx 缓冲，确保心跳即时到达
    },
  });
}
