import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function fixture(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 120, 160);
    ctx.fillStyle = '#0000ff'; ctx.fillRect(120, 0, 120, 80);
    return canvas.toDataURL('image/png').split(',')[1];
  });
}
async function upload(page: Page) {
  await page.getByLabel('上传图片').setInputFiles({ name: '测试图片.png', mimeType: 'image/png', buffer: Buffer.from(await fixture(page), 'base64') });
  await expect(page.getByRole('link', { name: '下载图片', exact: true })).toBeVisible();
}
async function download(page: Page) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载图片', exact: true }).click();
  const file = await waiting;
  expect(await file.failure()).toBeNull();
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}
async function inspect(page: Page, bytes: Buffer, mime = 'image/png') {
  return page.evaluate(async ({ base64, mime }) => {
    const image = new Image(); image.src = `data:${mime};base64,${base64}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
    const sample = (horizontal: number, vertical: number) => Array.from(ctx.getImageData(horizontal, vertical, 1, 1).data);
    return { width: canvas.width, height: canvas.height, corners: [sample(5, 5), sample(canvas.width - 6, 5), sample(5, canvas.height - 6), sample(canvas.width - 6, canvas.height - 6)] };
  }, { base64: bytes.toString('base64'), mime });
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test('首页入口、裁剪缩放旋转、真实 PNG 下载与重置', async ({ page }, info: TestInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('link', { name: /图片处理.*本地处理/ }).click();
  await expect(page.getByRole('heading', { name: '图片处理', exact: true })).toBeVisible();
  await upload(page);
  await page.getByLabel('裁剪宽度', { exact: true }).fill('120');
  await page.getByLabel('输出宽度', { exact: true }).fill('60');
  await expect(page.getByLabel('输出高度', { exact: true })).toHaveValue('80');
  await page.getByRole('button', { name: '顺时针 90°' }).click();
  const file = await download(page);
  expect(file.name).toBe('测试图片-已处理.png');
  const image = await inspect(page, file.bytes);
  expect([image.width, image.height]).toEqual([80, 60]);
  expect(image.corners).toEqual(Array.from({ length: 4 }, () => [255, 0, 0, 255]));
  await noOverflow(page);
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await expect(page.getByLabel('裁剪宽度', { exact: true })).toHaveValue('240');
  await expect(page.getByRole('checkbox', { name: '启用水印' })).not.toBeChecked();
  await page.getByRole('button', { name: '水平翻转', exact: true }).click();
  await page.getByRole('button', { name: '垂直翻转', exact: true }).click();
  const flipped = await inspect(page, (await download(page)).bytes);
  expect(flipped.corners[0][3]).toBe(0);
  expect(flipped.corners[1]).toEqual([255, 0, 0, 255]);
  expect(flipped.corners[2]).toEqual([0, 0, 255, 255]);
  await page.screenshot({ path: info.outputPath('image-editor-basic.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('自定义水印实际绘制、平铺、常用文案保存读取与删除', async ({ page }, info) => {
  await page.goto('/#/tools/image-editor'); await upload(page);
  const original = (await download(page)).bytes;
  await page.getByRole('checkbox', { name: '启用水印' }).check();
  await page.getByLabel('预设文案', { exact: true }).selectOption('未经许可 请勿转载');
  await expect(page.getByLabel('水印内容', { exact: true })).toHaveValue('未经许可 请勿转载');
  await page.getByLabel('预设文案', { exact: true }).selectOption('');
  await expect(page.getByLabel('水印内容', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('水印内容', { exact: true })).toBeFocused();
  await page.getByLabel('水印内容', { exact: true }).fill('小鹿专用');
  await page.getByLabel('水印位置', { exact: true }).selectOption('center');
  await page.getByLabel('字号（像素）', { exact: true }).fill('30');
  await page.getByLabel('水印颜色', { exact: true }).fill('#000000');
  await page.getByRole('slider', { name: '不透明度' }).fill('100');
  const marked = (await download(page)).bytes;
  expect(marked.equals(original)).toBe(false);
  const darkPixels = await page.locator('canvas[aria-label="处理后的图片预览"]').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let index = 0; index < pixels.length; index += 4) if (pixels[index] < 50 && pixels[index + 1] < 50 && pixels[index + 2] < 50 && pixels[index + 3] > 200) dark++;
    return dark;
  });
  expect(darkPixels).toBeGreaterThan(20);
  await page.getByLabel('水印位置', { exact: true }).selectOption('tile');
  expect((await download(page)).bytes.equals(marked)).toBe(false);
  await page.getByRole('button', { name: '保存为常用文案' }).click();
  await expect(page.getByRole('status')).toContainText('常用文案已更新');
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['tool-hub-image-watermarks-v1']);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath('image-editor-watermark.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: '你的图片，你来做主' })).toBeVisible();
  await upload(page); await page.getByRole('checkbox', { name: '启用水印' }).check();
  await page.getByLabel('预设文案', { exact: true }).selectOption('小鹿专用');
  await expect(page.getByLabel('水印内容', { exact: true })).toHaveValue('小鹿专用');
  await page.getByRole('button', { name: '删除此常用文案' }).click();
  await expect(page.getByRole('option', { name: '小鹿专用', exact: true })).toHaveCount(0);
});

test('非法参数禁用下载、比例锁定恢复、坏图与不支持格式保留当前图片', async ({ page }) => {
  await page.goto('/#/tools/image-editor'); await upload(page);
  await page.getByLabel('左侧起点', { exact: true }).fill('240');
  await expect(page.getByRole('button', { name: '下载图片', exact: true })).toBeDisabled();
  await expect(page.getByLabel('左侧起点', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await page.getByRole('checkbox', { name: '锁定裁剪比例' }).uncheck();
  await page.getByLabel('输出高度', { exact: true }).fill('200');
  await page.getByRole('checkbox', { name: '锁定裁剪比例' }).check();
  await expect(page.getByLabel('输出高度', { exact: true })).toHaveValue('160');
  await page.getByLabel('输出宽度', { exact: true }).fill('8192');
  await expect(page.getByRole('button', { name: '下载图片', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await page.getByRole('checkbox', { name: '启用水印' }).check();
  await page.getByLabel('水印内容', { exact: true }).fill('');
  await expect(page.getByRole('button', { name: '下载图片', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: '启用水印' }).uncheck();
  await expect(page.getByRole('link', { name: '下载图片', exact: true })).toBeVisible();
  await page.getByLabel('上传图片').setInputFiles({ name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.getByRole('alert')).toContainText('PNG、JPEG 或 WebP');
  await expect(page.getByRole('link', { name: '下载图片', exact: true })).toBeVisible();
  await page.getByLabel('上传图片').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken') });
  await expect(page.getByRole('alert')).toContainText('图片无法读取');
  await expect(page.getByRole('link', { name: '下载图片', exact: true })).toBeVisible();
  await noOverflow(page);
});

test('真实 JPEG 和 WebP 编码，JPEG 将透明区填成所选背景色', async ({ page }) => {
  await page.goto('/#/tools/image-editor'); await upload(page);
  await page.getByLabel('输出格式', { exact: true }).selectOption('jpeg');
  await page.getByLabel('透明区域填充', { exact: true }).fill('#ff00ff');
  await page.getByRole('slider', { name: '图片质量' }).fill('95');
  const jpeg = await download(page);
  expect(jpeg.name).toMatch(/\.jpg$/); expect(jpeg.bytes.subarray(0, 2)).toEqual(Buffer.from([255, 216]));
  const image = await inspect(page, jpeg.bytes, 'image/jpeg');
  expect([image.width, image.height]).toEqual([240, 160]);
  expect(image.corners[3][0]).toBeGreaterThan(240); expect(image.corners[3][1]).toBeLessThan(15); expect(image.corners[3][2]).toBeGreaterThan(240); expect(image.corners[3][3]).toBe(255);
  await page.getByLabel('输出格式', { exact: true }).selectOption('webp');
  const webp = await download(page);
  expect(webp.name).toMatch(/\.webp$/); expect(webp.bytes.toString('ascii', 8, 12)).toBe('WEBP');
  expect((await inspect(page, webp.bytes, 'image/webp')).corners[3][3]).toBe(0);
});

test('浏览器禁止存储时给出说明且图片仍可下载', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('blocked', 'SecurityError'); }; });
  await page.goto('/#/tools/image-editor'); await upload(page);
  await page.getByRole('checkbox', { name: '启用水印' }).check();
  await page.getByLabel('水印内容', { exact: true }).fill('自定义常用');
  await page.getByRole('button', { name: '保存为常用文案' }).click();
  await expect(page.getByRole('alert')).toContainText('浏览器无法保存常用文案');
  expect((await download(page)).bytes.length).toBeGreaterThan(0);
});
