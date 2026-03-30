import { NextRequest, NextResponse } from 'next/server';
import { parseQuestion, parseFullDocument } from '@/lib/gemini';

/** 从 content 中提取【解析】部分，写入 analysis 字段（保留 content 不变） */
function extractAnalysis(questions: any[]): any[] {
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
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // [心跳监控]: 每 10 秒发送一个空格，穿透 Cloudflare/网关的超时死线 (ECONNRESET 防御)
      const keepaliveInterval = setInterval(() => {
        try {
          // 使用注释格式的心跳，不会被 JSON.parse 干扰
          controller.enqueue(encoder.encode(': heartbeat\n\n')); 
        } catch (e) {}
      }, 10000);

      try {
        const body = await request.json();
        const { action, imageData, images, hasManualAnswer, hasManualAnalysis } = body;
        
        console.log(`[API-STREAM] Action: ${action} (Ultra-Speed Heartbeat Mode Enabled)`);

        const onStatus = (msg: string) => {
          // 局部失败信号转发：将 FAILURE_ITEM 映射为 SSE 的错误消息
          if (msg.startsWith('FAILURE_ITEM:')) {
            send({ type: 'error', error: msg.replace('FAILURE_ITEM:', '').trim() });
          } else {
            send({ type: 'status', msg });
          }
        };

        if (action === 'parseQuestion') {
          const result = await parseQuestion(imageData, !!hasManualAnswer, !!hasManualAnalysis, onStatus);
          send({ type: 'data', data: extractAnalysis(result) });
        } else if (action === 'parseFullDocument') {
          const result = await parseFullDocument(images, onStatus);
          send({ type: 'data', data: extractAnalysis(result) });
        } else {
          send({ type: 'error', error: 'Invalid action' });
        }
      } catch (error: any) {
        console.error('[API Stream Error]:', error);
        send({ type: 'error', error: error.message || 'Internal Server Error' });
      } finally {
        clearInterval(keepaliveInterval);
        controller.close();
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
