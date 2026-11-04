import { describe, expect, it } from 'vitest';
import { createDefaultDraft, validateDraft } from '../src/features/pension-calculator/domain/validation';
import type { PlanDraft } from '../src/features/pension-calculator/domain/types';

describe('参数校验', () => {
  it('规范化百分比与金额，但不静默修改年份', () => {
    const result = validateDraft(createDefaultDraft(2030));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.annualDeposit).toBe('10000.00');
      expect(result.value.scenarios[0].annualRate).toBe('2');
      expect(result.value.withdrawalStartYear).toBe(2050);
    }
  });
  it.each(['', '0', '-1', '1.001', 'Infinity', 'NaN', '1e6', '1,000', '1000000000.01'])('拒绝无效金额 %s', value => {
    const result = validateDraft({ ...createDefaultDraft(2030), annualDeposit: value });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.annualDeposit).toBeTruthy();
  });
  it.each(['', '2030.5', 'Infinity', 'NaN', '1899', '2201'])('拒绝无效起始年份 %s', value => {
    expect(validateDraft({ ...createDefaultDraft(2030), startYear: value }).ok).toBe(false);
  });
  it('不允许存入领取重叠，允许零等待年', () => {
    const draft = { ...createDefaultDraft(2030), depositYears: '2', withdrawalStartYear: '2031' };
    expect(validateDraft(draft).ok).toBe(false);
    expect(validateDraft({ ...draft, withdrawalStartYear: '2032' }).ok).toBe(true);
  });
  it('上限包含起始年，允许最后一年开始领取，但不能延伸到第121年', () => {
    const draft: PlanDraft = { ...createDefaultDraft(2030), withdrawalStartYear: '2149', withdrawalYears: '1' };
    expect(validateDraft(draft).ok).toBe(true);
    expect(validateDraft({ ...draft, withdrawalYears: '2' }).ok).toBe(false);
    expect(validateDraft({ ...draft, withdrawalStartYear: '2150', mode: 'until-depleted' }).ok).toBe(false);
  });
  it('领至耗尽不校验未使用的指定领取年数', () => {
    expect(validateDraft({ ...createDefaultDraft(2030), mode: 'until-depleted', withdrawalYears: '' }).ok).toBe(true);
  });
  it.each(['-100.0001', '100.0001', '2.12345', 'Infinity', 'NaN', '1e2', ''])('拒绝无效收益率 %s', annualRate => {
    const draft = createDefaultDraft(2030);
    draft.scenarios[0].annualRate = annualRate;
    expect(validateDraft(draft).ok).toBe(false);
  });
  it('名称校验允许相同名称，限制可见字符数量', () => {
    const draft = createDefaultDraft(2030);
    draft.scenarios[0].name = draft.scenarios[1].name = '同一个名字';
    expect(validateDraft(draft).ok).toBe(true);
    draft.scenarios[0].name = '  ';
    expect(validateDraft(draft).ok).toBe(false);
    draft.scenarios[0].name = '名'.repeat(31);
    expect(validateDraft(draft).ok).toBe(false);
  });
  it.each([null, {}, { scenarios: [] }, { ...createDefaultDraft(2030), mode: 'unexpected' }])('拒绝损坏的输入结构', raw => {
    expect(validateDraft(raw).ok).toBe(false);
  });
});
