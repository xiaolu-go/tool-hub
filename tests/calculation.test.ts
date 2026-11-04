import { describe, expect, it } from 'vitest';
import { calculatePlan } from '../src/features/pension-calculator/domain/calculate';
import { Money } from '../src/features/pension-calculator/domain/money';
import { createDefaultDraft, validateDraft } from '../src/features/pension-calculator/domain/validation';
import type { PlanDraft } from '../src/features/pension-calculator/domain/types';

export function plan(overrides: Partial<PlanDraft> = {}, rates: [string, string] = ['0', '0']) {
  const draft: PlanDraft = {
    ...createDefaultDraft(2030), annualDeposit: '10000', depositYears: '1',
    withdrawalStartYear: '2031', annualWithdrawal: '5000', mode: 'until-depleted',
    ...overrides,
    scenarios: [{ id: 'A', name: '测试 A', annualRate: rates[0] }, { id: 'B', name: '测试 B', annualRate: rates[1] }],
  };
  const valid = validateDraft(draft);
  if (!valid.ok) throw new Error(JSON.stringify(valid.errors));
  return calculatePlan(valid.value);
}

describe('计算规则与文档验收样例', () => {
  it('CASE-01：等待期、零收益和最后一笔不足额领取', () => {
    const result = plan({ depositYears: '2', withdrawalStartYear: '2033', annualWithdrawal: '6000' });
    const a = result.scenarios[0];
    expect(a.records.map(r => [r.year, r.phase, r.withdrawal, r.closingBalance])).toEqual([
      [2030, '存入期', '0.00', '10000.00'], [2031, '存入期', '0.00', '20000.00'],
      [2032, '等待期', '0.00', '20000.00'], [2033, '领取期', '6000.00', '14000.00'],
      [2034, '领取期', '6000.00', '8000.00'], [2035, '领取期', '6000.00', '2000.00'],
      [2036, '领取期', '2000.00', '0.00'],
    ]);
    expect(a.summary).toMatchObject({ totalDeposit: '20000.00', totalWithdrawal: '20000.00', fullWithdrawalYears: 3, paidYears: 4, depletionYear: 2036, firstShortfallYear: 2036 });
    expect(a.records.at(-1)?.shortfall).toBe('4000.00');
  });

  it('CASE-02：年初存入参与全年收益，年末领取，逐年舍入', () => {
    const a = plan({}, ['5', '5']).scenarios[0];
    expect(a.records.map(r => [r.interest, r.withdrawal, r.closingBalance])).toEqual([
      ['500.00', '0.00', '10500.00'], ['525.00', '5000.00', '6025.00'],
      ['301.25', '5000.00', '1326.25'], ['66.31', '1392.56', '0.00'],
    ]);
    expect(a.summary).toMatchObject({ beforeFirstWithdrawal: '11025.00', totalInterest: '1392.56', totalWithdrawal: '11392.56', depletionYear: 2033 });
  });

  it('CASE-03：固定计划结束时保留余额，不推算未来耗尽年份', () => {
    const result = plan({ mode: 'fixed', withdrawalYears: '2' }, ['5', '5']);
    expect(result.endYear).toBe(2032);
    expect(result.scenarios[0].records).toHaveLength(3);
    expect(result.scenarios[0].summary).toMatchObject({ totalWithdrawal: '10000.00', endingBalance: '1326.25', totalShortfall: '0.00', depletionYear: null, status: 'plan-ended' });
  });

  it('CASE-04：恰好足额支付后归零，不凭空新增不足额年份', () => {
    const result = plan({ annualDeposit: '12000', annualWithdrawal: '6000' });
    expect(result.endYear).toBe(2032);
    expect(result.scenarios[0].summary).toMatchObject({ fullWithdrawalYears: 2, paidYears: 2, depletionYear: 2032, firstShortfallYear: null });
  });

  it('CASE-05：固定模式耗尽后继续记录缺口', () => {
    const result = plan({ depositYears: '2', withdrawalStartYear: '2033', annualWithdrawal: '6000', mode: 'fixed', withdrawalYears: '6' });
    expect(result.endYear).toBe(2038);
    expect(result.scenarios[0].summary.totalShortfall).toBe('16000.00');
    expect(result.scenarios[0].records.at(-1)).toMatchObject({ withdrawal: '0.00', shortfall: '6000.00' });
  });

  it('CASE-06：有界测算，达到上限后不宣称无限领取', () => {
    const result = plan({ annualDeposit: '100000', annualWithdrawal: '1000' }, ['5', '5']);
    expect(result.endYear).toBe(2149);
    expect(result.horizonReached).toBe(true);
    expect(result.scenarios[0].records).toHaveLength(120);
    expect(result.scenarios[0].summary).toMatchObject({ fullWithdrawalYears: 119, depletionYear: null, status: 'horizon-reached' });
    expect(new Money(result.scenarios[0].summary.endingBalance).gt(0)).toBe(true);
  });

  it('CASE-07A：负收益', () => {
    const a = plan({ mode: 'fixed', withdrawalYears: '1' }, ['-10', '-10']).scenarios[0];
    expect(a.records.map(r => r.interest)).toEqual(['-1000.00', '-900.00']);
    expect(a.summary.endingBalance).toBe('3100.00');
  });

  it('CASE-07B：最后存入年已经耗尽，仍显示首次领取年', () => {
    const result = plan({}, ['-100', '-100']);
    expect(result.endYear).toBe(2031);
    expect(result.scenarios[0].summary).toMatchObject({ beforeFirstWithdrawal: '0.00', depletionYear: 2030, firstShortfallYear: 2031, fullWithdrawalYears: 0, paidYears: 0 });
  });

  it('CASE-08：共同时间轴和 B-A 差额', () => {
    const result = plan({}, ['0', '5']);
    expect(result.scenarios[0].records.map(r => r.year)).toEqual(result.scenarios[1].records.map(r => r.year));
    expect(result.endYear).toBe(2033);
    expect(result.scenarios[0].summary).toMatchObject({ depletionYear: 2032, firstShortfallYear: 2033 });
    expect(result.scenarios[0].records.at(-1)).toMatchObject({ withdrawal: '0.00', shortfall: '5000.00' });
    expect(result.difference).toEqual({ totalWithdrawal: '1392.56', endingBalance: '0.00', fullWithdrawalYears: 0 });
  });

  it('正负半分均远离零舍入，允许最小金额', () => {
    const result = plan({ annualDeposit: '0.01', annualWithdrawal: '0.01', mode: 'fixed', withdrawalYears: '1' }, ['50', '-50']);
    expect(result.scenarios[0].records[0].interest).toBe('0.01');
    expect(result.scenarios[1].records[0].interest).toBe('-0.01');
    expect(result.scenarios[1].summary.depletionYear).toBe(2030);
  });

  it('不把后续仍有存入时的暂时归零视为最终耗尽', () => {
    const result = plan({ annualDeposit: '0.01', depositYears: '3', withdrawalStartYear: '2034' }, ['-100', '-100']);
    expect(result.scenarios[0].summary.depletionYear).toBe(2032);
    expect(result.endYear).toBe(2034);
  });

  it('相同收益率产生完全相同的年度金额和汇总', () => {
    const result = plan({}, ['2.1234', '2.1234']);
    const withoutId = (index: number) => result.scenarios[index].records.map(({ scenarioId: _id, ...r }) => r);
    expect(withoutId(0)).toEqual(withoutId(1));
    expect(result.scenarios[0].summary).toEqual(result.scenarios[1].summary);
  });

  it('各种边界下逐年收支恒等、累计恒等且不透支', () => {
    for (const rate of ['-100', '-99.9999', '-12.3456', '0', '0.0001', '3.1234', '100']) {
      const result = plan({ annualDeposit: '1000000000', depositYears: '10', withdrawalStartYear: '2050', annualWithdrawal: '0.01', mode: 'fixed', withdrawalYears: '100' }, [rate, rate]);
      for (const s of result.scenarios) for (const r of s.records) {
        expect(new Money(r.openingBalance).plus(r.deposit).plus(r.interest).minus(r.withdrawal).toFixed(2)).toBe(r.closingBalance);
        expect(new Money(r.cumulativeDeposit).plus(r.cumulativeInterest).minus(r.cumulativeWithdrawal).toFixed(2)).toBe(r.closingBalance);
        expect(new Money(r.closingBalance).gte(0)).toBe(true);
        expect(new Money(r.withdrawal).gte(0)).toBe(true);
      }
    }
  });
});
