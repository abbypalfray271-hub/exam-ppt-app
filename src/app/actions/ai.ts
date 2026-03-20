'use server';

import { parseQuestion, parseFullDocument } from '@/lib/gemini';

export async function parseQuestionAction(imageBase64: string) {
  try {
    const data = await parseQuestion(imageBase64);
    return { success: true, data };
  } catch (error: any) {
    console.error('parseQuestionAction failed:', error);
    return { success: false, error: error.message };
  }
}

export async function parseFullDocumentAction(input: string | string[]) {
  try {
    const data = await parseFullDocument(input);
    return { success: true, data };
  } catch (error: any) {
    console.error('Full document parse failed:', error);
    return { success: false, error: error.message };
  }
}

export async function testServerAction() {
  console.log('Test Server Action called!');
  return { success: true, message: 'Server Action is working!' };
}
