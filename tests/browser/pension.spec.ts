import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}
async function mountFolder(page: Page, info: TestInfo) {
  const directory = info.outputPath('record-folder');
  const path = join(directory, 'tool-hub-pension-records.json');
  await mkdir(directory, { recursive: true });
  let failWrite = false;
  await page.exposeBinding('testReadRecords', async () => {
    try { return await readFile(path, 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
  });
  await page.exposeBinding('testWriteRecords', async (_source, text: string) => {
    if (failWrite) throw new Error('测试文件写入失败');
    await writeFile(path, text, 'utf8');
  });
  await page.addInitScript(() => {
    const port = window as unknown as { testReadRecords(): Promise<string | null>; testWriteRecords(text: string): Promise<void> };
    Object.assign(window, { showDirectoryPicker: async () => ({
      name: '养老金记录',
      getFileHandle: async (_name: string, options?: { create?: boolean }) => {
        if (await port.testReadRecords() === null && !options?.create) throw new DOMException('missing', 'NotFoundError');
        return {
          getFile: async () => ({ text: async () => await port.testReadRecords() ?? '' }),
          createWritable: async () => {
            let pending = '';
            return { write: async (text: string) => { pending = text; }, close: async () => port.testWriteRecords(pending), abort: async () => {} };
          },
        };
      },
    }) });
  });
  return { read: async () => JSON.parse(await readFile(path, 'utf8')), fail: () => { failWrite = true; }, path };
}
async function fill(page: Page, index = 1, type = 'bank', name = '银行计划', start = '40', withdrawalStart = '43', end = '45') {
  const values: Record<string, string> = { '方案名称': name, '开始存入': start, '年存入额（元）': '10000', '存入年数': '2', '年化率（%）': '10', '开始领取': withdrawalStart, '年领取额（元）': '5000', '领取至': end };
  await page.getByLabel(`第 ${index} 行类型`, { exact: true }).selectOption(type);
  for (const [label, value] of Object.entries(values)) await page.getByLabel(`第 ${index} 行${label}`, { exact: true }).fill(value);
}

test('独立方案、真实记录文件、起息差异、导出与刷新读取', async ({ page }, info) => {
  const files = await mountFolder(page, info);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '你的工具箱' })).toBeVisible();
  await page.getByRole('link', { name: /养老金资金计算器/ }).click();
  await expect(page.getByRole('radio', { name: '按年龄' })).toBeChecked();
  await page.getByRole('button', { name: '选择记录文件夹', exact: true }).click();
  await fill(page); await fill(page, 2, 'insurance', '保险计划');
  await noOverflow(page);
  await page.getByRole('button', { name: '测算并保存', exact: true }).click();
  await expect(page.getByRole('region', { name: '测算结果', exact: true })).toBeVisible();
  await expect(page.getByLabel('第 1 行方案名称')).toHaveValue('');
  await expect(page.getByLabel('第 2 行方案名称')).toHaveValue('');
  expect(await page.getByRole('region', { name: '方案录入列表，可横向滚动' }).evaluate(el => el.scrollLeft)).toBe(0);
  const saved = await files.read();
  expect(saved.records).toHaveLength(2);
  expect(saved.records[0].result.records[0].interest).toBe('1000.00');
  expect(saved.records[1].result.records[0].interest).toBe('0.00');
  await expect(page.getByRole('img', { name: /银行计划，年末余额，40 至 45 岁/ }).locator('svg')).toBeVisible();
  const summary = page.getByRole('region', { name: '方案测算汇总，可横向滚动' });
  await expect(summary).toContainText('银行计划'); await expect(summary).toContainText('保险计划');
  await page.getByRole('combobox', { name: '查看方案明细' }).selectOption({ label: '保险计划 · 保险' });
  await expect(page.getByRole('img', { name: /保险计划，年度领取/ }).locator('svg')).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath('list-results.png'), fullPage: true });
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出明细' }).click();
  const download = await downloading; expect(await download.failure()).toBeNull();
  const csvPath = await download.path(); const csv = await readFile(csvPath!, 'utf8');
  expect(csv).toContain('"保险"'); expect(csv).toContain('"银行"'); expect(csv).toContain('"42","3"');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.reload();
  await expect(page.getByLabel('第 1 行方案名称')).toHaveValue('');
  await page.getByRole('button', { name: '选择记录文件夹', exact: true }).click();
  const history = page.getByRole('region', { name: '测算记录', exact: true });
  await expect(history.getByRole('rowheader', { name: '保险计划' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('文件记录查询、编辑、取消与确认删除及写入失败保护', async ({ page }, info) => {
  const files = await mountFolder(page, info);
  await page.goto('/#/tools/pension-calculator');
  await page.getByRole('button', { name: '选择记录文件夹', exact: true }).click();
  await fill(page); await page.getByRole('button', { name: '测算并保存', exact: true }).click();
  await expect(page.getByLabel('第 1 行方案名称')).toHaveValue('');
  const original = (await files.read()).records[0];
  const history = page.getByRole('region', { name: '测算记录', exact: true });
  await page.getByRole('textbox', { name: '搜索记录' }).fill('不存在');
  await expect(history).toContainText('没有匹配的记录');
  await page.getByRole('textbox', { name: '搜索记录' }).fill('银行');
  await history.getByRole('button', { name: '查看', exact: true }).click();
  await history.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('第 1 行方案名称').fill('银行新计划');
  await page.getByRole('button', { name: '重新测算并保存' }).click();
  await expect(history.getByRole('rowheader', { name: '银行新计划' })).toBeVisible();
  const updated = (await files.read()).records;
  expect(updated).toHaveLength(1); expect(updated[0].id).toBe(original.id); expect(updated[0].createdAt).toBe(original.createdAt);
  await history.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '保留记录' }).click();
  expect((await files.read()).records).toHaveLength(1);
  await history.getByRole('button', { name: '删除', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await history.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(history).toContainText('你的下一份计划');
  expect((await files.read()).records).toHaveLength(0);
  await fill(page); files.fail();
  await page.getByRole('button', { name: '测算并保存', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('写入失败');
  await expect(page.getByLabel('第 1 行方案名称')).toHaveValue('银行计划');
  expect((await files.read()).records).toHaveLength(0);
  await noOverflow(page);
});

test('不完整行、105 岁边界、空行跳过、年份模式和路由', async ({ page }, info) => {
  const files = await mountFolder(page, info);
  await page.goto('/#/tools/pension-calculator');
  await page.getByRole('button', { name: '选择记录文件夹', exact: true }).click();
  await fill(page, 1, 'bank', '年龄上限方案', '40', '43', '106');
  await page.getByRole('button', { name: '测算并保存', exact: true }).click();
  await expect(page.getByLabel('第 1 行领取至')).toBeFocused();
  await page.getByLabel('第 1 行领取至').fill('105');
  await page.getByLabel('第 2 行方案名称').fill('未填完');
  await page.getByRole('button', { name: '测算并保存', exact: true }).click();
  await expect(page.getByLabel('第 2 行类型')).toBeFocused();
  await page.getByLabel('第 2 行方案名称').fill('');
  await page.getByRole('button', { name: '测算并保存', exact: true }).click();
  await expect(page.getByRole('rowheader', { name: '105 岁', exact: true })).toBeAttached();
  await expect(page.getByRole('rowheader', { name: '106 岁', exact: true })).toHaveCount(0);
  await page.getByRole('radio', { name: '按年份' }).check();
  await fill(page, 1, 'insurance', '年份方案', '2030', '2033', '2035');
  await page.getByRole('button', { name: '测算并保存', exact: true }).click();
  await expect(page.getByRole('region', { name: '年度明细，可横向滚动' }).getByRole('columnheader', { name: '年份', exact: true })).toBeVisible();
  expect((await files.read()).records).toHaveLength(2);
  await noOverflow(page);
  await page.getByRole('link', { name: '返回工具首页' }).click();
  await page.goBack(); await expect(page.getByRole('heading', { level: 1 })).toHaveText('养老金资金计算器');
  await page.goto('/#/unknown'); await expect(page.getByRole('heading', { name: '这个工具还不在工具箱里' })).toBeVisible();
});
