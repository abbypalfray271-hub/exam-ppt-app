import pptxgen from 'pptxgenjs';
import { Question } from '@/store/useProjectStore';

/** 导出 PPT：极简课件模式 (同素材多区块聚合版) */
export async function exportToPpt(questions: Question[], projectName: string) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE'; // 16:9

  // 1. 标题页
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: 'F8FAFC' };
  titleSlide.addText(projectName, {
    x: '10%', y: '42%', w: '80%', h: 1,
    fontSize: 44, color: '1e293b', align: 'center', bold: true
  });
  titleSlide.addText('助教工具：试卷题目极简分割课件', {
    x: '10%', y: '56%', w: '80%', h: 0.5,
    fontSize: 18, color: '64748b', align: 'center'
  });

  // 2. 对题目进行分组 (相同 Material 归为一组)
  const groupedTasks: Question[][] = [];
  if (questions.length > 0) {
    let currentGroup: Question[] = [questions[0]];
    for (let i = 1; i < questions.length; i++) {
      if (questions[i].material === questions[i-1].material && !!questions[i].material) {
        currentGroup.push(questions[i]);
      } else {
        groupedTasks.push(currentGroup);
        currentGroup = [questions[i]];
      }
    }
    groupedTasks.push(currentGroup);
  }

  // 3. 循环生成幻灯片
  groupedTasks.forEach((group) => {
    const slide = pptx.addSlide();
    const firstQ = group[0];
    
    // 左侧：素材区
    slide.addShape(pptx.ShapeType.rect, { 
      x: 0, y: 0, w: '38%', h: '100%', 
      fill: { color: 'F8FAFC' },
      line: { color: 'E2E8F0', width: 0.5 }
    });
    
    slide.addText('📖 素材原文', { 
      x: 0.25, y: 0.2, w: 3.2, h: 0.4, 
      fontSize: 12, color: '64748b', bold: true 
    });
    
    if (firstQ.materialImage) {
      slide.addImage({
        data: firstQ.materialImage,
        x: 0.25, y: 0.7, w: 3.3, h: 6.5,
        sizing: { type: 'contain', w: 3.3, h: 6.5 }
      });
    } else if (firstQ.material) {
      slide.addText(firstQ.material, {
        x: 0.25, y: 0.7, w: 3.3, h: 6.5,
        fontSize: 11, color: '334155', valign: 'top', lineSpacing: 22
      });
    }

    // 右侧：多题目聚合区
    // 动态计算每个题目块的高度和位置
    const qCount = group.length;
    const rightMargin = 4.1;
    const rightWidth = 5.6;
    const totalContentHeight = 6.4;
    const startY = 0.8;
    const qHeight = totalContentHeight / qCount;

    group.forEach((q, idx) => {
      const currentY = startY + (idx * qHeight);
      
      // 这里的布局简单化：在一个小区域内显示题号和图片
      // 100% 还原图片切片是最关键的
      if (q.contentImage) {
        slide.addImage({
          data: q.contentImage,
          x: rightMargin, y: currentY, w: rightWidth, h: qHeight - 0.2,
          sizing: { type: 'contain', w: rightWidth, h: qHeight - 0.2 }
        });
      } else {
        // 兜底文字
        slide.addText(`Q: ${q.content}`, {
          x: rightMargin, y: currentY, w: rightWidth, h: qHeight - 0.2,
          fontSize: 12, color: '334155', valign: 'top'
        });
      }
      
      // 区块分割线 (除最后一个外)
      if (idx < qCount - 1) {
        slide.addShape(pptx.ShapeType.line, {
          x: rightMargin, y: currentY + qHeight - 0.1, w: rightWidth, h: 0,
          line: { color: 'F1F5F9', width: 0.5 }
        });
      }
    });

    // 顶部通用页眉 (显示 Q 范围)
    slide.addText(`题目组: Q1 - Q${qCount}`, {
      x: 4.1, y: 0.2, w: 3, h: 0.4,
      fontSize: 14, color: '1e293b', bold: true
    });
  });

  const fileName = `${projectName || '考试题目分割课件'}.pptx`;
  return pptx.writeFile({ fileName });
}
