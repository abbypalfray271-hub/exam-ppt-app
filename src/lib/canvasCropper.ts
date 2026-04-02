/**
 * 画布裁剪工具
 * 处理跨页矩形裁剪与 AI 图表坐标裁切
 * 从 ExtractionCanvas.tsx 提取
 */

import { cropImageByBox } from '@/lib/documentProcessor';

// ============================================================
// 类型定义
// ============================================================

export interface ImageSlice {
  base64: string;
  yOffset: number;
  height: number;
}

/** 每页图片在纵向容器中的偏移信息 */
export interface PageOffset {
  top: number;         // 图片顶部在 container 中的 offsetTop
  height: number;      // 图片显示高度
  imgWidth: number;    // 图片显示宽度
  naturalWidth: number;
  naturalHeight: number;
}

/** 画布中的矩形选区 */
export interface CanvasRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type?: 'question' | 'answer' | 'analysis' | 'diagram';
  qIdx?: number;
}

// ============================================================
// 裁剪函数
// ============================================================

/**
 * 将画布上的一个矩形区域裁剪为 Base64 图片
 * 支持跨页拼接：当框选区域跨越多页时，自动拼合
 * 
 * @param rect 画布上的矩形选区
 * @param offsets 每页图片的偏移信息
 * @param pages 每页的 Base64 图片源
 */
export async function cropRectFromCanvas(
  rect: CanvasRect,
  offsets: PageOffset[],
  pages: string[]
): Promise<ImageSlice> {
  if (offsets.length === 0) throw new Error('No page offsets');
  
  const rectTop = rect.y;
  const rectBottom = rect.y + rect.height;
  const overlapping: { pageIdx: number; cropTop: number; cropHeight: number; offset: PageOffset }[] = [];
  
  for (let i = 0; i < offsets.length; i++) {
    const pTop = offsets[i].top;
    const pBottom = pTop + offsets[i].height;
    if (rectTop < pBottom && rectBottom > pTop) {
      const cTop = Math.max(0, rectTop - pTop);
      const cBottom = Math.min(offsets[i].height, rectBottom - pTop);
      overlapping.push({ pageIdx: i, cropTop: cTop, cropHeight: cBottom - cTop, offset: offsets[i] });
    }
  }
  if (overlapping.length === 0) throw new Error('Rect does not overlap any page');

  const loaded = await Promise.all(
    overlapping.map(({ pageIdx }) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.src = pages[pageIdx];
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Page ${pageIdx} load failed`));
      })
    )
  );

  const segments: { img: HTMLImageElement; sx: number; sy: number; sw: number; sh: number }[] = [];
  let fullH = 0;
  let outputW = 0;

  for (let i = 0; i < overlapping.length; i++) {
    const { cropTop: cTop, cropHeight: cH, offset } = overlapping[i];
    const img = loaded[i];
    const sx = (rect.x / offset.imgWidth) * img.naturalWidth;
    const sy = (cTop / offset.height) * img.naturalHeight;
    const sw = (rect.width / offset.imgWidth) * img.naturalWidth;
    const sh = (cH / offset.height) * img.naturalHeight;
    segments.push({ img, sx, sy, sw, sh });
    fullH += sh;
    if (i === 0) outputW = sw;
  }

  const fullCanvas = document.createElement('canvas');
  const fullCtx = fullCanvas.getContext('2d');
  if (!fullCtx) throw new Error('Canvas ctx failed');
  fullCanvas.width = outputW;
  fullCanvas.height = fullH;

  let currY = 0;
  for (const seg of segments) {
    fullCtx.drawImage(seg.img, seg.sx, seg.sy, seg.sw, seg.sh, 0, currY, outputW, seg.sh);
    currY += seg.sh;
  }

  // 缩放限制：防止生成超大图
  const MAX_WIDTH = 2500;
  const MAX_HEIGHT = 5000;
  let finalScale = 1;
  if (outputW > MAX_WIDTH) finalScale = MAX_WIDTH / outputW;
  if (fullH * finalScale > MAX_HEIGHT) finalScale = MAX_HEIGHT / fullH;
  
  const finalCanvas = document.createElement('canvas');
  const fCtx = finalCanvas.getContext('2d');
  if (!fCtx) throw new Error('Final canvas ctx failed');
  finalCanvas.width = Math.round(outputW * finalScale);
  finalCanvas.height = Math.round(fullH * finalScale);
  fCtx.drawImage(fullCanvas, 0, 0, outputW, fullH, 0, 0, finalCanvas.width, finalCanvas.height);
  
  return {
    base64: finalCanvas.toDataURL('image/jpeg', 0.98),
    yOffset: 0,
    height: finalCanvas.height
  };
}

/**
 * 处理 AI 返回的 diagrams 坐标并裁切为图片
 * 兼容多种坐标字段名 (box_2d, box, box2d, 纯数组)
 * 自动增加 5% 的溢出保护边距
 */
export async function processAIDiagrams(
  aiDiagrams: any[],
  sourceImage: string
): Promise<string[]> {
  if (!aiDiagrams || !Array.isArray(aiDiagrams)) return [];
  
  const diagramImages: string[] = [];
  for (const d of aiDiagrams) {
    // 兼容多种可能的坐标字段名
    const box = d.box_2d || d.box || d.box2d || (Array.isArray(d) ? d : null);
    if (!box || !Array.isArray(box) || box.length < 4) continue;
    
    // 增加 5% 的溢出保护
    const boxH = box[2] - box[0];
    const boxW = box[3] - box[1];
    const expandedBox: [number, number, number, number] = [
      Math.max(0, box[0] - Math.round(boxH * 0.05)),
      Math.max(0, box[1] - Math.round(boxW * 0.05)),
      Math.min(1000, box[2] + Math.round(boxH * 0.05)),
      Math.min(1000, box[3] + Math.round(boxW * 0.05)),
    ];
    
    const dCrop = await cropImageByBox(sourceImage, expandedBox);
    if (dCrop) diagramImages.push(dCrop);
  }
  return diagramImages;
}
