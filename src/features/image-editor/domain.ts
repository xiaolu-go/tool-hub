export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_SIDE = 8192;
export const MAX_PIXELS = 16_000_000;
export const imageFormats = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;
export type ImageFormat = keyof typeof imageFormats;
export type Position = 'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right' | 'tile';
export const positions: { value: Position; label: string }[] = [
  { value: 'bottom-right', label: '右下角' }, { value: 'bottom-left', label: '左下角' },
  { value: 'top-right', label: '右上角' }, { value: 'top-left', label: '左上角' },
  { value: 'center', label: '居中' }, { value: 'tile', label: '全图平铺' },
];
export const builtinPresets = ['仅供学习交流', '未经许可 请勿转载', '仅供办理业务使用'];
export const PRESETS_KEY = 'tool-hub-image-watermarks-v1';

export interface ImageSize { width: number; height: number }
export interface EditorDraft {
  x: string; y: string; cropWidth: string; cropHeight: string;
  width: string; height: string; rotation: number; flipX: boolean; flipY: boolean;
  format: ImageFormat; quality: number; background: string;
  watermark: boolean; text: string; position: Position; fontSize: string; opacity: number; color: string;
}
export interface RenderOptions {
  crop: { x: number; y: number; width: number; height: number };
  width: number; height: number; rotation: number; flipX: boolean; flipY: boolean;
  format: ImageFormat; quality: number; background: string;
  watermark: null | { text: string; position: Position; fontSize: number; opacity: number; color: string };
}
export type EditorErrors = Partial<Record<keyof EditorDraft, string>>;

export function validSize(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= MAX_SIDE && height <= MAX_SIDE && width * height <= MAX_PIXELS;
}
export function createDraft(size: ImageSize): EditorDraft {
  return {
    x: '0', y: '0', cropWidth: String(size.width), cropHeight: String(size.height),
    width: String(size.width), height: String(size.height), rotation: 0, flipX: false, flipY: false,
    format: 'png', quality: 85, background: '#ffffff', watermark: false,
    text: builtinPresets[0], position: 'bottom-right', fontSize: String(Math.max(8, Math.min(200, Math.round(Math.min(size.width, size.height) * .045)))),
    opacity: 35, color: '#ffffff',
  };
}
const integer = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : NaN;
export function validateDraft(draft: EditorDraft, source: ImageSize): { options: RenderOptions | null; errors: EditorErrors } {
  const errors: EditorErrors = {};
  const left = integer(draft.x), top = integer(draft.y), cropWidth = integer(draft.cropWidth), cropHeight = integer(draft.cropHeight);
  const width = integer(draft.width), height = integer(draft.height), fontSize = integer(draft.fontSize);
  if (!(left >= 0 && left < source.width)) errors.x = '起点必须是原图宽度范围内的非负整数。';
  if (!(top >= 0 && top < source.height)) errors.y = '起点必须是原图高度范围内的非负整数。';
  if (!(cropWidth > 0 && cropWidth <= source.width - left)) errors.cropWidth = '裁剪宽度必须为正整数，且不能超出原图。';
  if (!(cropHeight > 0 && cropHeight <= source.height - top)) errors.cropHeight = '裁剪高度必须为正整数，且不能超出原图。';
  if (!(width > 0 && width <= MAX_SIDE)) errors.width = `宽度须为 1–${MAX_SIDE} 的整数。`;
  if (!(height > 0 && height <= MAX_SIDE)) errors.height = `高度须为 1–${MAX_SIDE} 的整数。`;
  if (width * height > MAX_PIXELS) errors.width = '输出最多 1600 万像素，请减小尺寸。';
  if (![0, 90, 180, 270].includes(draft.rotation)) errors.rotation = '请选择有效的旋转角度。';
  if (!Object.hasOwn(imageFormats, draft.format)) errors.format = '请选择 PNG、JPEG 或 WebP。';
  if (!Number.isInteger(draft.quality) || draft.quality < 1 || draft.quality > 100) errors.quality = '质量须为 1–100。';
  if (!/^#[\da-f]{6}$/i.test(draft.background)) errors.background = '请选择有效的背景颜色。';
  if (draft.watermark) {
    if (!draft.text.trim() || Array.from(draft.text.trim()).length > 80 || /[\r\n\t\u0000-\u001f\u007f]/.test(draft.text)) errors.text = '请填写 1–80 个字符的单行水印。';
    if (!(fontSize >= 8 && fontSize <= 200)) errors.fontSize = '字号须为 8–200 的整数。';
    if (!Number.isInteger(draft.opacity) || draft.opacity < 1 || draft.opacity > 100) errors.opacity = '透明度须为 1–100。';
    if (!positions.some(position => position.value === draft.position)) errors.position = '请选择有效的水印位置。';
    if (!/^#[\da-f]{6}$/i.test(draft.color)) errors.color = '请选择有效的水印颜色。';
  }
  if (Object.keys(errors).length) return { options: null, errors };
  return { errors, options: {
    crop: { x: left, y: top, width: cropWidth, height: cropHeight }, width, height, rotation: draft.rotation, flipX: draft.flipX, flipY: draft.flipY,
    format: draft.format, quality: draft.quality / 100, background: draft.background,
    watermark: draft.watermark ? { text: draft.text.trim(), position: draft.position, fontSize, opacity: draft.opacity / 100, color: draft.color } : null,
  } };
}
export function outputSize(options: Pick<RenderOptions, 'width' | 'height' | 'rotation'>): ImageSize {
  return options.rotation % 180 === 0 ? { width: options.width, height: options.height } : { width: options.height, height: options.width };
}
export function proportionalSize(value: string, ratio: number): string {
  const dimension = integer(value);
  return Number.isFinite(dimension) && dimension > 0 && Number.isFinite(ratio) && ratio > 0 ? String(Math.max(1, Math.round(dimension * ratio))) : '';
}
export function parsePresets(raw: string | null): string[] {
  try {
    const items: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(items)) return [];
    return [...new Set(items.filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && Array.from(item).length <= 80 && !/[\r\n\t\u0000-\u001f\u007f]/.test(item)).map(item => item.trim()))].slice(0, 10);
  } catch { return []; }
}
export function downloadName(original: string, format: ImageFormat): string {
  return `${original.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100) || 'image'}-已处理.${format === 'jpeg' ? 'jpg' : format}`;
}
