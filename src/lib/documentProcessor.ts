import mammoth from 'mammoth';

/**
 * 将 PDF 的每一页转化为 Base64 图片
 */
export async function pdfToImages(file: File): Promise<string[]> {
  console.log('Initiating PDF to Image conversion (Local Worker mode)');
  
  // 仅在浏览器端动态加载 pdfjs-dist
  let pdfjsLib;
  try {
    // 简化导入路径，提高兼容性
    const mod = await import('pdfjs-dist');
    pdfjsLib = mod.default || mod;
    console.log('PDF.js library loaded successfully');
  } catch (err) {
    console.error('Critical: Failed to load PDF.js library:', err);
    throw new Error('PDF 渲染引擎启动失败，请检查浏览器兼容性');
  }
  
  // 配置本地 Worker 路径
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  
  try {
    const pdf = await loadingTask.promise;
    console.log(`Document opened: ${pdf.numPages} pages found`);
    const imageUrls: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 }); // 降低一点缩放以平衡性能与清晰度
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) continue;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport: viewport,
        // @ts-ignore
        canvas: canvas
      }).promise;

      imageUrls.push(await compressImage(canvas.toDataURL('image/jpeg', 0.8), 1600));
      
      // 及时释放页面资源
      page.cleanup();
    }
    
    console.log('PDF conversion completed successfully');
    return imageUrls;
  } catch (err) {
    console.error('PDF processing error:', err);
    throw err;
  }
}

/**
 * 提取 Word 文档内容
 */
export async function wordToText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

/**
 * 图像预压缩工具
 * 限制最大宽度并强制转换为低质量 JPEG
 */
export async function compressImage(base64: string, maxWidth: number = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // 防止图片加载失败时 Promise 永远悬挂
    img.onerror = () => reject(new Error('图片加载失败，数据可能已损坏'));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.6)); // 0.6 质量通常足以进行 OCR，但体积会减小 70%+
    };
    img.src = base64;
  });
}

/**
 * 根据万分位坐标框 [ymin, xmin, ymax, xmax] 裁剪 base64 图片
 */
export async function cropImageByBox(base64Image: string, box?: [number, number, number, number]): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!box || box.length !== 4) return resolve('');
    const [ymin, xmin, ymax, xmax] = box;
    
    // 无效坐标或未识别出坐标
    if ((ymin === 0 && xmin === 0 && ymax === 0 && xmax === 0) || xmax <= xmin || ymax <= ymin) {
      return resolve('');
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('无法创建 Canvas 上下文'));

      const x = (xmin / 1000) * img.naturalWidth;
      const y = (ymin / 1000) * img.naturalHeight;
      const w = ((xmax - xmin) / 1000) * img.naturalWidth;
      const h = ((ymax - ymin) / 1000) * img.naturalHeight;

      // 如果选区过小，忽略
      if (w <= 10 || h <= 10) return resolve('');

      // 缩放，保证切出的图片质量，但不要过大
      const MAX_DIM = 2000;
      let targetW = w;
      let targetH = h;
      if (w > MAX_DIM || h > MAX_DIM) {
        const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
        targetW = w * scale;
        targetH = h * scale;
      }

      canvas.width = targetW;
      canvas.height = targetH;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, x, y, w, h, 0, 0, targetW, targetH);
      
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('底图加载失败'));
    img.src = base64Image;
  });
}

