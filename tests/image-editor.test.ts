import { describe, expect, it, vi } from 'vitest';
import { createDraft, downloadName, MAX_PIXELS, outputSize, parsePresets, proportionalSize, validateDraft, validSize } from '../src/features/image-editor/domain';
import { encodeImage, loadImage } from '../src/features/image-editor/render';

const size = { width: 800, height: 600 };
describe('图片尺寸与编辑边界', () => {
  it('默认使用完整原图，不启用水印', () => {
    const result = validateDraft(createDraft(size), size);
    expect(result.errors).toEqual({});
    expect(result.options?.crop).toEqual({ x: 0, y: 0, ...size });
    expect(result.options?.watermark).toBeNull();
  });
  it('接受正好贴住原图右下边缘的裁剪，拒绝越界和空尺寸', () => {
    const draft = { ...createDraft(size), x: '799', y: '599', cropWidth: '1', cropHeight: '1' };
    expect(validateDraft(draft, size).options?.crop).toEqual({ x: 799, y: 599, width: 1, height: 1 });
    expect(validateDraft({ ...draft, cropWidth: '2' }, size).errors.cropWidth).toBeTruthy();
    expect(validateDraft({ ...draft, y: '600' }, size).errors.y).toBeTruthy();
    expect(validateDraft({ ...draft, cropHeight: '0' }, size).options).toBeNull();
  });
  it.each(['', '-1', '1.5', '1e2', 'NaN', 'Infinity', '9007199254740992'])('拒绝非法像素值 %s', value => {
    expect(validateDraft({ ...createDraft(size), width: value }, size).errors.width).toBeTruthy();
    expect(validateDraft({ ...createDraft(size), x: value }, size).errors.x).toBeTruthy();
  });
  it('限制单边与总像素，并接受准确上限', () => {
    expect(MAX_PIXELS).toBe(16_000_000);
    expect(validSize(4000, 4000)).toBe(true);
    expect(validSize(4001, 4000)).toBe(false);
    expect(validSize(8192, 1)).toBe(true);
    expect(validSize(8193, 1)).toBe(false);
    expect(validSize(0, 600)).toBe(false);
    expect(validateDraft({ ...createDraft(size), width: '4001', height: '4000' }, size).errors.width).toContain('1600');
    expect(validateDraft({ ...createDraft(size), width: '8193' }, size).errors.width).toBeTruthy();
  });
  it('旋转 90 / 270 度交换最终尺寸，180 度保留尺寸', () => {
    for (const rotation of [90, 270]) expect(outputSize({ ...size, rotation })).toEqual({ width: 600, height: 800 });
    expect(outputSize({ ...size, rotation: 180 })).toEqual(size);
  });
  it('比例缩放舍入到像素且不产生零；无效输入保持可校验状态', () => {
    expect(proportionalSize('333', .75)).toBe('250');
    expect(proportionalSize('1', .01)).toBe('1');
    expect(proportionalSize('', .75)).toBe('');
    expect(proportionalSize('800', NaN)).toBe('');
  });
});
describe('水印与预设', () => {
  it('关闭水印时忽略未完成的文字设置，开启后校验', () => {
    const draft = { ...createDraft(size), text: '', fontSize: '' };
    expect(validateDraft(draft, size).options).not.toBeNull();
    const result = validateDraft({ ...draft, watermark: true }, size);
    expect(result.options).toBeNull(); expect(result.errors.text).toBeTruthy(); expect(result.errors.fontSize).toBeTruthy();
  });
  it('水印接受 80 个 Unicode 字符，拒绝 81 个、换行和纯空白', () => {
    const draft = { ...createDraft(size), watermark: true };
    expect(validateDraft({ ...draft, text: '图'.repeat(80) }, size).errors.text).toBeUndefined();
    expect(validateDraft({ ...draft, text: '😀'.repeat(80) }, size).errors.text).toBeUndefined();
    for (const text of ['字'.repeat(81), '一\n二', '  ', '一\t二']) expect(validateDraft({ ...draft, text }, size).errors.text).toBeTruthy();
  });
  it('透明度与字号边界校验，比例统一在域层转换', () => {
    const draft = { ...createDraft(size), watermark: true, opacity: 100, fontSize: '200' };
    expect(validateDraft(draft, size).options?.watermark?.opacity).toBe(1);
    expect(validateDraft({ ...draft, opacity: 0 }, size).errors.opacity).toBeTruthy();
    expect(validateDraft({ ...draft, fontSize: '7' }, size).errors.fontSize).toBeTruthy();
  });
  it('损坏预设容错，过滤非法项、去重并限制 10 条', () => {
    expect(parsePresets('invalid')).toEqual([]);
    expect(parsePresets('{"text":"a"}')).toEqual([]);
    expect(parsePresets(JSON.stringify(['  自定义  ', '自定义', '', null, 12, '换\n行', '字'.repeat(81)]))).toEqual(['自定义']);
    expect(parsePresets(JSON.stringify(Array.from({ length: 12 }, (_, index) => `文案${index}`)))).toHaveLength(10);
  });
  it('按真实输出格式生成文件名并清理路径字符', () => {
    expect(downloadName('照片.v2.png', 'jpeg')).toBe('照片.v2-已处理.jpg');
    expect(downloadName('a/b.webp', 'webp')).toBe('a_b-已处理.webp');
  });
});
describe('解码和编码失败保护', () => {
  it('读取前拒绝不支持、空文件与超过 25 MB 的文件', async () => {
    await expect(loadImage(new File(['x'], 'x.svg', { type: 'image/svg+xml' }))).rejects.toThrow('PNG');
    await expect(loadImage(new File([], 'x.png', { type: 'image/png' }))).rejects.toThrow('25 MB');
    await expect(loadImage({ type: 'image/png', size: 25 * 1024 * 1024 + 1 } as File)).rejects.toThrow('25 MB');
  });
  it('拒绝 Canvas 空导出以及格式回退，避免扩展名与内容不符', async () => {
    const empty = { toBlob: vi.fn(callback => callback(null)) } as unknown as HTMLCanvasElement;
    await expect(encodeImage(empty, { format: 'png', quality: .8 })).rejects.toThrow('导出失败');
    const fallback = { toBlob: vi.fn(callback => callback(new Blob(['x'], { type: 'image/png' }))) } as unknown as HTMLCanvasElement;
    await expect(encodeImage(fallback, { format: 'webp', quality: .8 })).rejects.toThrow('不支持');
  });
});
