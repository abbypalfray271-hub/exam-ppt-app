import mammoth from 'mammoth';

/**
 * 将 PDF 的每一页转化为 Base64 图片
 */
export async function pdfToImages(file: File): Promise<string[]> {
  console.log('Initiating PDF to Image conversion (Parallel local mode)');
  
  let pdfjsLib;
  try {
    const mod = await import('pdfjs-dist');
    pdfjsLib = mod.default || mod;
  } catch (err) {
    console.error('Critical: Failed to load PDF.js library:', err);
    throw new Error('PDF 渲染引擎启动失败，请检查浏览器兼容性');
  }
  
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  
  try {
    const pdf = await loadingTask.promise;
    console.log(`Document opened: ${pdf.numPages} pages found`);
    const imageUrls: string[] = new Array(pdf.numPages);

    // 并发控制器
    const concurrencyLimit = 3;
    const pageIndices = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    
    const renderPage = async (pageNum: number) => {
      const page = await pdf.getPage(pageNum);
      // 这里的 scale 1.5 通常足够清晰且性能较好
      const viewport = page.getViewport({ scale: 1.5 });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas context failed');

      // 自动计算目标尺寸，限制最大宽度以节省内存和提高速度
      const maxWidth = 2000;
      let width = viewport.width;
      let height = viewport.height;
      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      // 渲染时直接缩放到目标尺寸
      await page.render({
        canvasContext: context,
        viewport: page.getViewport({ scale: width / (viewport.width / 1.5) }),
        // @ts-ignore
        canvas: canvas
      }).promise;

      // 直接输出中等质量 JPEG，省去二次加载 Image 对象的过程
      imageUrls[pageNum - 1] = canvas.toDataURL('image/jpeg', 0.8);
      
      page.cleanup();
      console.log(`Page ${pageNum} rendered and compressed`);
    };

    // 执行并发渲染
    const executing: Promise<void>[] = [];
    for (const pageNum of pageIndices) {
      const p = renderPage(pageNum).then(() => {
        executing.splice(executing.indexOf(p), 1);
      });
      executing.push(p);
      if (executing.length >= concurrencyLimit) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);
    
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
      resolve(canvas.toDataURL('image/jpeg', 0.85)); // 0.85 质量是高清与体积的最佳平衡点
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

