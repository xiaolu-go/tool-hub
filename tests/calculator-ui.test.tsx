// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import CalculatorPage from '../src/features/pension-calculator/CalculatorPage';
import { fileFixture } from './file-fixture';
import { createDefaultDraft } from '../src/features/pension-calculator/domain/validation';
import { STORAGE_KEY } from '../src/lib/storage';
import { RECORD_FILENAME } from '../src/lib/record-files';

vi.mock('../src/features/pension-calculator/ResultCharts', () => ({ default: () => <div>年度图表</div> }));
let files: ReturnType<typeof fileFixture>;
beforeEach(() => {
  cleanup(); vi.restoreAllMocks(); window.localStorage.clear();
  files = fileFixture(); window.showDirectoryPicker = vi.fn(async () => files.folder);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
function open() { return render(<MemoryRouter><CalculatorPage /></MemoryRouter>); }
function fill(index = 1, name = '银行计划', type = 'bank') {
  const values: Record<string, string> = { '类型': type, '方案名称': name, '开始存入': '40', '年存入额（元）': '10000', '存入年数': '2', '年化率（%）': '10', '开始领取': '43', '年领取额（元）': '5000', '领取至': '45' };
  for (const [label, value] of Object.entries(values)) fireEvent.change(screen.getByLabelText(`第 ${index} 行${label}`, { exact: true }), { target: { value } });
}
async function choose() { await userEvent.click(screen.getByRole('button', { name: '选择记录文件夹' })); }
async function submit() { await userEvent.click(screen.getByRole('button', { name: '测算并保存' })); }
const history = () => within(screen.getByRole('region', { name: '测算记录' }));

describe('文件夹与独立方案录入', () => {
  it('默认年龄、两个空行，空表提示；部分行缺项定位，不能部分保存', async () => {
    open(); expect(screen.getByRole('radio', { name: '按年龄' })).toBeChecked();
    expect(screen.getByLabelText('第 1 行方案名称')).toHaveValue('');
    expect(screen.getByLabelText('第 2 行方案名称')).toHaveValue('');
    await submit(); expect(screen.getByRole('alert')).toHaveTextContent('至少完整填写一行');
    await choose(); fill();
    fireEvent.change(screen.getByLabelText('第 2 行方案名称'), { target: { value: '未填完' } });
    await submit(); expect(screen.getByRole('alert')).toHaveTextContent('尚未填写完整');
    expect(screen.getByLabelText('第 2 行类型')).toHaveFocus(); expect(files.read()).toBeNull();
  });
  it('成功写文件才清空两行，独立银行保险计息，并且不写浏览器记录', async () => {
    open(); await choose(); fill(); fill(2, '保险计划', 'insurance');
    const writing = vi.spyOn(Storage.prototype, 'setItem');
    await submit();
    await waitFor(() => expect(screen.getByLabelText('第 1 行方案名称')).toHaveValue(''));
    const saved = JSON.parse(files.read()!);
    expect(saved.records).toHaveLength(2);
    expect(saved.records[0].result.records[0].interest).toBe('1000.00');
    expect(saved.records[1].result.records[0].interest).toBe('0.00');
    expect(writing).not.toHaveBeenCalled();
    expect(screen.getByLabelText('第 2 行方案名称')).toHaveValue('');
    expect(history().getByRole('rowheader', { name: '保险计划' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '测算结果' })).toBeInTheDocument();
  });
  it('未选文件夹或保存失败均保留录入；旧文件不受影响', async () => {
    open(); fill(); await submit(); expect(screen.getByRole('alert')).toHaveTextContent('请先选择记录文件夹');
    expect(screen.getByLabelText('第 1 行方案名称')).toHaveValue('银行计划');
    await choose(); files.fail(); await submit();
    expect(screen.getByRole('alert')).toHaveTextContent('保存失败');
    expect(screen.getByLabelText('第 1 行方案名称')).toHaveValue('银行计划');
    expect(screen.queryByRole('region', { name: '测算结果' })).not.toBeInTheDocument();
  });
  it('查询、查看、编辑更新原记录、取消及确认删除都反映在文件中', async () => {
    open(); await choose(); fill(); fill(2, '保险计划', 'insurance'); await submit();
    await userEvent.type(screen.getByRole('textbox', { name: '搜索记录' }), '保险');
    expect(history().queryByRole('rowheader', { name: '银行计划' })).not.toBeInTheDocument();
    await userEvent.click(history().getByRole('button', { name: '查看' }));
    expect(screen.getByRole('combobox', { name: '查看方案明细' })).toHaveTextContent('保险计划');
    const before = JSON.parse(files.read()!).records.find((e: { result: { input: { name: string } } }) => e.result.input.name === '保险计划');
    await userEvent.click(history().getByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByLabelText('第 1 行方案名称'), { target: { value: '保险新计划' } });
    await userEvent.click(screen.getByRole('button', { name: '重新测算并保存' }));
    const after = JSON.parse(files.read()!).records.find((e: { id: string }) => e.id === before.id);
    expect(after.result.input.name).toBe('保险新计划'); expect(after.createdAt).toBe(before.createdAt);
    expect(JSON.parse(files.read()!).records).toHaveLength(2);
    await userEvent.click(history().getByRole('button', { name: '删除' }));
    await userEvent.click(screen.getByRole('button', { name: '保留记录' }));
    expect(JSON.parse(files.read()!).records).toHaveLength(2);
    await userEvent.click(history().getByRole('button', { name: '删除' }));
    await userEvent.click(screen.getByRole('button', { name: '确认删除' }));
    expect(JSON.parse(files.read()!).records).toHaveLength(1);
  }, 10000);
  it('刷新后表单仍空，重新选择文件夹可读记录；新增行与时间切换有明确边界', async () => {
    const view = open(); await choose(); fill(); await submit(); view.unmount(); open();
    expect(screen.getByRole('radio', { name: '按年龄' })).toBeChecked();
    expect(screen.getByLabelText('第 1 行方案名称')).toHaveValue('');
    await choose(); expect(history().getByRole('rowheader', { name: '银行计划' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '添加方案' }));
    expect(screen.getByLabelText('第 3 行方案名称')).toHaveValue('');
    fill(); await userEvent.click(screen.getByRole('radio', { name: '按年份' }));
    expect(screen.getByLabelText('第 1 行开始存入')).toHaveValue('');
    expect(screen.getByLabelText('第 1 行方案名称')).toHaveValue('银行计划');
    expect(screen.getByRole('columnheader', { name: '开始领取（年份）' })).toBeInTheDocument();
  }, 10000);
  it('显式导入旧版设置写成文件，保险保留旧计息规则，编辑才更新版本', async () => {
    const draft = createDefaultDraft(2030);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ storageVersion: 1, modelVersion: 2, savedAt: '2026-11-04', input: draft }));
    open(); await choose();
    await userEvent.click(screen.getByRole('button', { name: '导入旧版测算' }));
    const saved = JSON.parse(files.read()!).records;
    expect(saved).toHaveLength(2); expect(saved[1].ruleVersion).toBe(2);
    expect(saved[1].result.records[0].interest).toBe('300.00');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    await userEvent.click(history().getAllByRole('button', { name: '编辑' })[0]);
    await userEvent.click(screen.getByRole('button', { name: '重新测算并保存' }));
    expect(JSON.parse(files.read()!).records.find((e: { id: string }) => e.id === saved[1].id).ruleVersion).toBe(3);
  }, 10000);
  it('年龄不超过 105；文件取消、损坏和不支持时不丢录入', async () => {
    open(); await choose(); fill();
    fireEvent.change(screen.getByLabelText('第 1 行领取至'), { target: { value: '106' } });
    await submit(); expect(screen.getByLabelText('第 1 行领取至')).toHaveFocus();
    files.replace('broken json'); await userEvent.click(screen.getByRole('button', { name: '重新读取' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('第 1 行方案名称')).toHaveValue('银行计划');
    window.showDirectoryPicker = vi.fn(async () => { throw new DOMException('cancel', 'AbortError'); });
    await userEvent.click(screen.getByRole('button', { name: '切换文件夹' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    window.showDirectoryPicker = undefined;
    await userEvent.click(screen.getByRole('button', { name: '切换文件夹' }));
    expect(screen.getByRole('alert')).toHaveTextContent('暂不支持');
    expect(screen.getByText(new RegExp(RECORD_FILENAME))).toBeInTheDocument();
  });
});
