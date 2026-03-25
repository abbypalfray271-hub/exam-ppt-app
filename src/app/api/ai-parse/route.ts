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
  try {
    const body = await request.json();
    const { action, imageData, images } = body;

    console.log(`[API-DEBUG] Received request for action: ${action}`);

    if (action === 'parseQuestion') {
      const result = await parseQuestion(imageData);
      return NextResponse.json({ success: true, data: extractAnalysis(result) });
    }

    if (action === 'parseFullDocument') {
      const result = await parseFullDocument(images);
      return NextResponse.json({ success: true, data: extractAnalysis(result) });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('[API Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
