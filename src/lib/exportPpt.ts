import pptxgen from 'pptxgenjs';
import { Question } from '@/store/useProjectStore';
import { buildSlides } from './slideBuilder';

/** 
 * 导出演示稿：Aurora 极简风格全功能版
 * 支持图片原片切割、题干、解答、辅助图像等多维度的排布
 */
export async function exportToPpt(questions: Question[], projectName: string) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE'; // 16:9
  
  // ==========================================
  // 主题与色彩定义设计系统 (Aurora Theme)
  // ==========================================
  const colors = {
    bg: 'F8FAFC',
    card: 'FFFFFF',
    primary: '2563EB',
    textMain: '1E293B',
    textMuted: '64748B',
    border: 'E2E8F0',
    accent: '8B5CF6'
  };

  // 1. 封面幻灯片
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: colors.bg };
  
  // 封面装饰图形
  titleSlide.addShape(pptx.ShapeType.ellipse, {
    x: '70%', y: '-20%', w: 6, h: 6,
    fill: { color: 'EFF6FF' },
  });
  titleSlide.addShape(pptx.ShapeType.ellipse, {
    x: '-10%', y: '60%', w: 4, h: 4,
    fill: { color: 'F5F3FF' },
  });

  titleSlide.addText(projectName || 'AI 题目智能解析演示稿', {
    x: '10%', y: '40%', w: '80%', h: 1.2,
    fontSize: 48, color: colors.textMain, align: 'center', bold: true
  });
  titleSlide.addText('Powered by Exam-PPT Aurora Engine', {
    x: '10%', y: '55%', w: '80%', h: 0.5,
    fontSize: 16, color: colors.primary, align: 'center', bold: true, charSpacing: 2
  });

  // 2. 根据构建器分组创建内容页
  const slides = buildSlides(questions);
  
  slides.forEach((slideData, sIdx) => {
    if (slideData.type === 'title') return; // 跳过虚拟 title
    
    // 如果这一组有很多题，我们分页处理。这里简便起见，每组一页，高度压缩计算。
    // 如果是正常切割，每组往往是一道大题及其小题，或者完全独立的单题。
    const slide = pptx.addSlide();
    slide.background = { color: colors.bg };

    const questions = slideData.questions;
    const firstQ = questions[0];
    
    // ===== 布局切分 =====
    // 左栏: 原题切片/材料图 (占 45%)
    // 右栏: 智能解析/分步解答 (占 55%)
    
    const leftW = 5.6; // pptxgenjs w 默认 in inches, LAYOUT_WIDE = 13.33 x 7.5
    const rightW = 6.8;
    const rightX = 6.0;
    
    // 画布背景卡片 - 左
    slide.addShape(pptx.ShapeType.rect, { 
      x: 0.4, y: 0.4, w: leftW, h: 6.7, 
      fill: { color: colors.card }, 
      rectRadius: 0.1, line: { color: colors.border, width: 0.5 },
      shadow: { type: 'outer', color: '000000', opacity: 0.05, blur: 5, offset: 2, angle: 45 }
    });
    
    // 画布背景卡片 - 右
    slide.addShape(pptx.ShapeType.rect, { 
      x: rightX, y: 0.4, w: rightW, h: 6.7, 
      fill: { color: colors.card }, 
      rectRadius: 0.1, line: { color: colors.border, width: 0.5 },
      shadow: { type: 'outer', color: '000000', opacity: 0.05, blur: 5, offset: 2, angle: 45 }
    });

    // --- 左侧：题目区 ---
    slide.addText('📌 题干区 QUESTION', { 
      x: 0.6, y: 0.6, w: leftW - 0.4, h: 0.4, 
      fontSize: 11, color: colors.textMuted, bold: true 
    });

    // 优先渲染裁剪好的原题图片
    let cursorY = 1.2;
    const imgPadding = 0.2;
    
    // 支持瀑布流多图片断 (images 数组)
    const renderImages = firstQ.images || (firstQ.image ? [firstQ.image] : []);
    if (renderImages.length > 0) {
      renderImages.forEach((imgBase64, idx) => {
        if (cursorY > 6.0) return; // 超出屏幕简单截断
        slide.addImage({
          data: imgBase64,
          x: 0.6, y: cursorY, w: leftW - 0.4, h: 2.5,
          sizing: { type: 'contain', w: leftW - 0.4, h: 2.5 }
        });
        cursorY += 2.6;
      });
    } else if (firstQ.material || firstQ.content) {
      // 降级使用文本
      slide.addText(firstQ.material || firstQ.content, {
        x: 0.6, y: 1.2, w: leftW - 0.4, h: 5.0,
        fontSize: 14, color: colors.textMain, valign: 'top', lineSpacing: 22
      });
    }

    // --- 右侧：解析区 ---
    slide.addText('💡 智能解析 ANALYSIS', { 
      x: rightX + 0.2, y: 0.6, w: rightW - 0.4, h: 0.4, 
      fontSize: 11, color: colors.primary, bold: true 
    });

    let rightCursorY = 1.2;
    const rightAvailH = 6.7;

    questions.forEach((q, qIdx) => {
      // 如果屏幕空间不够了，跳过后续（工业级应分页处理，此处为提纯版）
      if (rightCursorY > rightAvailH) return;

      // 小标题
      slide.addText(`步骤/解析 ${qIdx + 1}`, {
        x: rightX + 0.2, y: rightCursorY, w: rightW - 0.4, h: 0.3,
        fontSize: 12, color: colors.textMain, bold: true
      });
      rightCursorY += 0.35;

      // 如果有步骤分析
      if (q.steps && q.steps.length > 0) {
        let stepText = '';
        q.steps.forEach((s, idx) => stepText += `${idx + 1}. ${s}\n`);
        slide.addText(stepText, {
          x: rightX + 0.2, y: rightCursorY, w: rightW - 0.4, h: Math.min(2, rightAvailH - rightCursorY + 0.5),
          fontSize: 12, color: colors.textMuted, valign: 'top', lineSpacing: 20
        });
        rightCursorY += 2.2;
      } else if (q.analysis) {
        slide.addText(q.analysis, {
          x: rightX + 0.2, y: rightCursorY, w: rightW - 0.4, h: 1.5,
          fontSize: 12, color: colors.textMuted, valign: 'top', lineSpacing: 20
        });
        rightCursorY += 1.7;
      }

      // 如果有答案辅助插图 (answerDiagrams)
      if (q.answerDiagrams && q.answerDiagrams.length > 0) {
        slide.addImage({
          data: q.answerDiagrams[0], // 取第一张
          x: rightX + 0.2, y: rightCursorY, w: rightW - 0.4, h: 1.8,
          sizing: { type: 'contain', w: rightW - 0.4, h: 1.8 }
        });
        rightCursorY += 2.0;
      }

      // 最终答案
      if (q.answer) {
        // 画个小色块
        slide.addShape(pptx.ShapeType.roundRect, {
          x: rightX + 0.2, y: rightCursorY, w: rightW - 0.4, h: 0.6,
          fill: { color: 'F0FDF4' }, rectRadius: 0.1, line: { color: 'BBF7D0', width: 1 }
        });
        slide.addText(`答案：${q.answer}`, {
          x: rightX + 0.3, y: rightCursorY, w: rightW - 0.6, h: 0.6,
          fontSize: 14, color: '166534', bold: true, valign: 'middle'
        });
        rightCursorY += 0.8;
      }
    });

    // 右下角页脚
    slide.addText(`${sIdx} / ${slides.length - 1}`, {
      x: 12.0, y: 7.1, w: 1, h: 0.3,
      fontSize: 10, color: '94A3B8', align: 'right'
    });
  });

  const fileName = `${projectName || '考试题目分割课件'}.pptx`;
  return pptx.writeFile({ fileName });
}
