// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import CalculatorPage from '../src/features/pension-calculator/CalculatorPage';
import { STORAGE_KEY } from '../src/lib/storage';

vi.mock('../src/features/pension-calculator/ResultCharts', () => ({ default: () => <div>年度图表</div> }));

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

function open() { return render(<MemoryRouter><CalculatorPage /></MemoryRouter>); }

describe('计算器关键交互', () => {
  it('共用计划只出现一组，切换年龄后可测算与恢复，年龄错误定位到对应字段', async () => {
    const view = open();
    expect(screen.getAllByLabelText('每年存入金额')).toHaveLength(1);
    expect(screen.getAllByLabelText('每年计划领取金额')).toHaveLength(1);
    await userEvent.click(screen.getByRole('radio', { name: '按年龄' }));
    expect(screen.queryByLabelText('测算起始年份')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('领取结束年龄'), { target: { value: '106' } });
    await userEvent.click(screen.getByRole('button', { name: '开始测算' }));
    expect(screen.getByLabelText('领取结束年龄')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('领取结束年龄'), { target: { value: '85' } });
    await userEvent.click(screen.getByRole('button', { name: '开始测算' }));
    expect(screen.getByRole('columnheader', { name: '年龄' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: '85 岁' })).toBeInTheDocument();
    view.unmount();
    open();
    expect(screen.getByRole('radio', { name: '按年龄' })).toBeChecked();
    expect(screen.getByLabelText('领取结束年龄')).toHaveValue('85');
    await userEvent.click(screen.getByRole('radio', { name: '按年份' }));
    expect(screen.getByLabelText('测算起始年份')).not.toHaveValue('35');
    expect(screen.getByRole('button', { name: '导出明细' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '开始测算' }));
    expect(screen.getByRole('columnheader', { name: '年份' })).toBeInTheDocument();
  });

  it('首次不显示虚构结果，提交后生成双方案结果与可用导出', async () => {
    open();
    expect(screen.getByText('未来，从一份计划开始')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '导出明细' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '开始测算' }));
    expect(await screen.findByText('看看未来的不同可能')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出明细' })).toBeEnabled();
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).input.annualDeposit).toBe('10000.00');
    await userEvent.click(screen.getByRole('button', { name: '方案 B' }));
    expect(screen.getByText('当前查看：方案 B · 保险假设方案')).toBeInTheDocument();
  });

  it('编辑后禁用旧结果导出，无效提交聚焦错误并保留上次保存', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: '开始测算' }));
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const amount = screen.getByLabelText('每年存入金额');
    fireEvent.change(amount, { target: { value: '' } });
    expect(screen.getByRole('button', { name: '导出明细' })).toBeDisabled();
    expect(screen.getByText(/参数已修改，请重新测算/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '开始测算' }));
    expect(amount).toHaveFocus();
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(saved);
    expect(screen.getByText('看看未来的不同可能')).toBeInTheDocument();
    fireEvent.change(amount, { target: { value: '20000' } });
    await userEvent.click(screen.getByRole('button', { name: '开始测算' }));
    expect(screen.getByRole('button', { name: '导出明细' })).toBeEnabled();
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).input.annualDeposit).toBe('20000.00');
  });

  it('重新挂载恢复最后成功参数，忽略未提交的编辑', async () => {
    const view = open();
    fireEvent.change(screen.getByLabelText('每年存入金额'), { target: { value: '12345.67' } });
    await userEvent.click(screen.getByRole('button', { name: '开始测算' }));
    fireEvent.change(screen.getByLabelText('每年存入金额'), { target: { value: '9' } });
    view.unmount();
    open();
    expect(screen.getByLabelText('每年存入金额')).toHaveValue('12345.67');
    expect(screen.getByText('看看未来的不同可能')).toBeInTheDocument();
  });

  it('恢复默认需确认，取消不更改数据，确认仅清除当前工具', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: '开始测算' }));
    window.localStorage.setItem('other-tool', 'keep');
    await userEvent.click(screen.getByRole('button', { name: '恢复默认' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '保留设置' }));
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '恢复默认' }));
    await userEvent.click(screen.getByRole('button', { name: '确认恢复' }));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem('other-tool')).toBe('keep');
    expect(screen.getByText('未来，从一份计划开始')).toBeInTheDocument();
  });

  it('写入失败时仍显示可用结果与导出', async () => {
    open();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await userEvent.click(screen.getByRole('button', { name: '开始测算' }));
    expect(screen.getByText('测算已完成。本次设置未能保存到浏览器。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出明细' })).toBeEnabled();
  });
});
