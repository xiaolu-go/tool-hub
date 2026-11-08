import { imageFormats, MAX_FILE_BYTES, outputSize, validSize, type RenderOptions } from './domain';

export async function loadImage(file: File): Promise<HTMLImageElement> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPEG 或 WebP 图片。');
  if (file.size === 0 || file.size > MAX_FILE_BYTES) throw new Error('图片须大于 0 且不超过 25 MB。');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { throw new Error('图片无法读取，文件可能损坏，请选择有效的 PNG、JPEG 或 WebP 图片。'); }
    if (!validSize(img.naturalWidth, img.naturalHeight)) throw new Error('原图每边最多 8192 像素，总计不超过 1600 万像素，请缩小后再试。');
    return img;
  } finally { URL.revokeObjectURL(url); }
}

export function renderImage(canvas: HTMLCanvasElement, image: HTMLImageElement, options: RenderOptions) {
  const size = outputSize(options);
  canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器无法创建图片画布，请换用支持 Canvas 的浏览器。');
  if (options.format === 'jpeg') {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, size.width, size.height);
  }
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.save();
  ctx.translate(size.width / 2, size.height / 2);
  ctx.rotate(options.rotation * Math.PI / 180);
  ctx.scale(options.flipX ? -1 : 1, options.flipY ? -1 : 1);
  const crop = options.crop;
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, -options.width / 2, -options.height / 2, options.width, options.height);
  ctx.restore();
  if (!options.watermark) return;
  const mark = options.watermark;
  ctx.save();
  ctx.globalAlpha = mark.opacity;
  ctx.fillStyle = mark.color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const margin = Math.min(24, Math.max(1, Math.min(size.width, size.height) * .04));
  const availableWidth = Math.max(1, size.width - 2 * margin);
  const font = (size: number) => `600 ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  ctx.font = font(mark.fontSize);
  const fontSize = Math.min(mark.fontSize, Math.max(1, size.height - 2 * margin), mark.fontSize * availableWidth / Math.max(1, ctx.measureText(mark.text).width));
  ctx.font = font(fontSize);
  const textWidth = ctx.measureText(mark.text).width;
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = Math.min(3, fontSize / 8);
  if (mark.position === 'tile') {
    ctx.translate(size.width / 2, size.height / 2);
    ctx.rotate(-25 * Math.PI / 180);
    const extent = Math.hypot(size.width, size.height) / 2;
    const stepX = Math.max(textWidth + fontSize * 2, size.width / 12, 32);
    const stepY = Math.max(fontSize * 4, size.height / 12, 32);
    for (let row = -Math.ceil(extent / stepY); row <= Math.ceil(extent / stepY); row++) {
      for (let col = -Math.ceil(extent / stepX); col <= Math.ceil(extent / stepX); col++) ctx.fillText(mark.text, col * stepX + (row % 2 ? stepX / 2 : 0), row * stepY);
    }
  } else {
    const horizontal = mark.position.endsWith('left') ? margin + textWidth / 2 : mark.position.endsWith('right') ? size.width - margin - textWidth / 2 : size.width / 2;
    const vertical = mark.position.startsWith('top') ? margin + fontSize / 2 : mark.position.startsWith('bottom') ? size.height - margin - fontSize / 2 : size.height / 2;
    ctx.fillText(mark.text, horizontal, vertical, availableWidth);
  }
  ctx.restore();
}

export function encodeImage(canvas: HTMLCanvasElement, options: Pick<RenderOptions, 'format' | 'quality'>): Promise<Blob> {
  const mime = imageFormats[options.format];
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) reject(new Error('图片导出失败，请减小尺寸后重试。'));
      else if (blob.type !== mime) reject(new Error('此浏览器不支持所选格式，请改用 PNG 或 JPEG。'));
      else resolve(blob);
    }, mime, options.quality);
  });
}
