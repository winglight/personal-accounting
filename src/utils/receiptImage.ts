export interface ProcessedReceiptImage {
  file: File;
  dataUrl: string;
  width: number;
  height: number;
  originalBytes: number;
  outputBytes: number;
  overTarget: boolean;
}

const MAX_INPUT_BYTES = 30 * 1024 * 1024;
const TARGET_BYTES = 700 * 1024;
const HARD_OUTPUT_BYTES = 2 * 1024 * 1024;

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob(blob => {
    if (!blob || blob.type !== 'image/jpeg') reject(new Error('JPEG 编码失败'));
    else resolve(blob);
  }, 'image/jpeg', quality);
});

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('无法读取处理后的图片'));
  reader.onload = () => resolve(String(reader.result || ''));
  reader.readAsDataURL(blob);
});

export const processReceiptImage = async (input: File, grayscale = true): Promise<ProcessedReceiptImage> => {
  if (!input.size) throw new Error('图片文件为空');
  if (input.size > MAX_INPUT_BYTES) throw new Error('图片超过 30 MB，请先裁剪后重试');
  if (typeof createImageBitmap !== 'function') throw new Error('当前浏览器不支持本地图片处理，请更新浏览器');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('图片无法解码；HEIC 图片请先转换为 JPEG');
  }

  const canvas = document.createElement('canvas');
  try {
    const shortEdge = Math.min(bitmap.width, bitmap.height);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, 1400 / shortEdge, 4000 / longEdge, Math.sqrt(4_000_000 / (bitmap.width * bitmap.height)));
    const width = Math.max(1, Math.floor(bitmap.width * scale));
    const height = Math.max(1, Math.floor(bitmap.height * scale));
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: grayscale });
    if (!ctx) throw new Error('无法创建图片处理画布');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    if (grayscale) {
      const image = ctx.getImageData(0, 0, width, height);
      for (let i = 0; i < image.data.length; i += 4) {
        const gray = Math.round(0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2]);
        image.data[i] = gray;
        image.data[i + 1] = gray;
        image.data[i + 2] = gray;
      }
      ctx.putImageData(image, 0, 0);
    }

    let output = await canvasToBlob(canvas, 0.86);
    for (const quality of [0.82, 0.78]) {
      if (output.size <= TARGET_BYTES) break;
      const candidate = await canvasToBlob(canvas, quality);
      if (candidate.size < output.size) output = candidate;
    }
    if (output.size > HARD_OUTPUT_BYTES) throw new Error('处理后仍超过 2 MB，请裁剪或分段拍摄');

    const name = `${input.name.replace(/\.[^.]+$/, '') || 'receipt'}.jpg`;
    const file = new File([output], name, { type: 'image/jpeg', lastModified: Date.now() });
    return {
      file,
      dataUrl: await blobToDataUrl(output),
      width,
      height,
      originalBytes: input.size,
      outputBytes: output.size,
      overTarget: output.size > TARGET_BYTES,
    };
  } finally {
    bitmap.close();
    canvas.width = 1;
    canvas.height = 1;
  }
};
