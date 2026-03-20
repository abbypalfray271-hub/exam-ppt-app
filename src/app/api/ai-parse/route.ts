import { NextRequest, NextResponse } from 'next/server';
import { parseQuestion, parseFullDocument } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, imageData, images } = body;

    if (action === 'parseQuestion') {
      const result = await parseQuestion(imageData);
      return NextResponse.json({ success: true, data: result });
    } 
    
    if (action === 'parseFullDocument') {
      const result = await parseFullDocument(images);
      return NextResponse.json({ success: true, data: result });
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
