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

      try {
        const body = await request.json();
        const { action, imageData, images, hasManualAnswer, hasManualAnalysis } = body;
        
        console.log(`[API-STREAM] Action: ${action}`);

        const onStatus = (msg: string) => {
          send({ type: 'status', msg });
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
        controller.close();
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
