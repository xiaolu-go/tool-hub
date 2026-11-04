import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function noPageOverflow(page: Page) {
  const size = await page.evaluate(() => ({ full: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(size.full).toBeLessThanOrEqual(size.viewport);
}

async function setCaseOne(page: Page) {
  await page.getByLabel('测算起始年份', { exact: true }).fill('2030');
  await page.getByLabel('存入年数', { exact: true }).fill('2');
  await page.getByLabel('每年存入金额', { exact: true }).fill('10000');
  await page.getByLabel('开始领取年份', { exact: true }).fill('2033');
  await page.getByLabel('每年计划领取金额', { exact: true }).fill('6000');
  await page.getByLabel('领至耗尽', { exact: true }).check();
  await page.getByLabel('方案 A 假设年收益率').fill('0');
  await page.getByLabel('方案 B 假设年收益率').fill('0');
}

test('首页、测算、图表、导出、恢复及响应式布局', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '你的工具箱' })).toBeVisible();
  await expect(page.getByText('规划中', { exact: true })).toBeVisible();
  await noPageOverflow(page);
  await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
  await page.getByRole('link', { name: /养老金资金计算器/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('养老金资金计算器');
  await setCaseOne(page);
  await page.getByRole('button', { name: '开始测算' }).click();
  await expect(page.getByRole('heading', { name: '看看未来的不同可能' })).toBeVisible();
  await expect(page.getByRole('img', { name: /年末余额，看见积累与消耗/ }).locator('svg')).toBeVisible();
  await expect(page.getByRole('img', { name: /年度领取，看见每一年的支持/ }).locator('svg')).toBeVisible();
  await expect(page.getByText('图表暂时无法显示', { exact: false })).toHaveCount(0);
  const last = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: '2036', exact: true }) });
  await expect(last).toContainText('2,000.00');
  await noPageOverflow(page);
  await page.screenshot({ path: info.outputPath('calculation.png'), fullPage: true });
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出明细' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^tool-hub-养老金测算-\d{8}-\d{6}\.csv$/);
  expect(await download.failure()).toBeNull();
  await page.getByLabel('每年存入金额', { exact: true }).fill('');
  await expect(page.getByRole('button', { name: '导出明细' })).toBeDisabled();
  await page.getByRole('button', { name: '开始测算' }).click();
  await expect(page.getByLabel('每年存入金额', { exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByLabel('测算起始年份', { exact: true })).toHaveValue('2030');
  await expect(page.getByLabel('每年存入金额', { exact: true })).toHaveValue('10000.00');
  await expect(page.getByRole('button', { name: '导出明细' })).toBeEnabled();
  await page.getByRole('button', { name: '方案 B', exact: true }).click();
  await expect(page.getByText('当前查看：方案 B · 保险假设方案')).toBeVisible();
  const tableRegion = page.getByRole('region', { name: '年度明细，可横向滚动' });
  const scrollable = await tableRegion.evaluate(element => element.scrollWidth > element.clientWidth);
  expect(scrollable).toBe(true);
  await noPageOverflow(page);
  expect(errors).toEqual([]);
});

test('直接访问、前进后退、404 和恢复默认确认', async ({ page }) => {
  await page.goto('/#/tools/pension-calculator');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('养老金资金计算器');
  await page.getByRole('button', { name: '开始测算' }).click();
  await page.getByRole('button', { name: '恢复默认', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: '导出明细' })).toBeEnabled();
  await page.getByRole('button', { name: '恢复默认', exact: true }).click();
  await page.getByRole('button', { name: '确认恢复' }).click();
  await expect(page.getByText('未来，从一份计划开始')).toBeVisible();
  await page.getByRole('link', { name: '返回工具首页' }).click();
  await expect(page.getByRole('heading', { name: '你的工具箱' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('养老金资金计算器');
  await page.goForward();
  await expect(page.getByRole('heading', { name: '你的工具箱' })).toBeVisible();
  await page.goto('/#/unknown-tool');
  await expect(page.getByRole('heading', { name: '这个工具还不在工具箱里' })).toBeVisible();
  await page.getByRole('link', { name: '返回首页', exact: true }).click();
  await expect(page.getByRole('heading', { name: '你的工具箱' })).toBeVisible();
});

test('共用精简表单与年龄计划，上限 105 岁、年龄图表、保存及导出', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#/tools/pension-calculator');
  await expect(page.getByLabel('每年存入金额', { exact: true })).toHaveCount(1);
  await expect(page.getByLabel('每年计划领取金额', { exact: true })).toHaveCount(1);
  await page.getByRole('radio', { name: '按年龄', exact: true }).check();
  await expect(page.getByLabel('测算起始年份')).toHaveCount(0);
  await page.getByLabel('开始存入年龄').fill('35');
  await page.getByLabel('存入年数', { exact: true }).fill('2');
  await page.getByLabel('开始领取年龄').fill('38');
  await page.getByLabel('领取结束年龄').fill('106');
  await page.getByRole('button', { name: '开始测算' }).click();
  await expect(page.getByLabel('领取结束年龄')).toBeFocused();
  await page.getByLabel('领取结束年龄').fill('105');
  await page.getByRole('button', { name: '开始测算' }).click();
  await expect(page.getByRole('columnheader', { name: '年龄', exact: true })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: '105 岁', exact: true })).toBeAttached();
  await expect(page.getByRole('rowheader', { name: '106 岁', exact: true })).toHaveCount(0);
  await expect(page.getByRole('img', { name: /35 至 105 岁/ }).first().locator('svg')).toBeVisible();
  await noPageOverflow(page);
  await page.screenshot({ path: info.outputPath('age-plan.png'), fullPage: true });
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出明细' }).click();
  expect(await (await downloading).failure()).toBeNull();
  await page.reload();
  await expect(page.getByRole('radio', { name: '按年龄', exact: true })).toBeChecked();
  await expect(page.getByLabel('领取结束年龄')).toHaveValue('105');
  await expect(page.getByRole('columnheader', { name: '年龄', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: '按年份', exact: true }).check();
  await expect(page.getByRole('button', { name: '导出明细' })).toBeDisabled();
  await page.getByRole('button', { name: '开始测算' }).click();
  await expect(page.getByRole('columnheader', { name: '年份', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
