import { describe, expect, it } from 'vitest';
import { calculatePlan } from '../src/features/pension-calculator/domain/calculate';
import { createDefaultDraft, validateDraft } from '../src/features/pension-calculator/domain/validation';
import type { PlanDraft } from '../src/features/pension-calculator/domain/types';
import { resultToCsv } from '../src/lib/csv';
import { restorePlan, savePlan, STORAGE_KEY, type StoragePort } from '../src/lib/storage';

function ageDraft(overrides: Partial<PlanDraft> = {}): PlanDraft {
  return {
    ...createDefaultDraft(2030), timeBasis: 'age', startAge: '35', depositYears: '2',
    withdrawalStartAge: '38', withdrawalEndAge: '41', annualWithdrawal: '6000',
    scenarios: [{ id: 'A', name: '方案甲', annualRate: '0' }, { id: 'B', name: '方案乙', annualRate: '0' }],
    ...overrides,
  };
}

function calculate(draft: PlanDraft) {
  const validated = validateDraft(draft);
  if (!validated.ok) throw new Error(JSON.stringify(validated.errors));
  return calculatePlan(validated.value);
}

describe('按年龄规划', () => {
  it('按整岁逐年测算，包含领取结束年龄；等待期、最后不足额领取与年份模式一致', () => {
    const age = calculate(ageDraft());
    const years = calculate({ ...ageDraft(), timeBasis: 'year', startYear: '2030', withdrawalStartYear: '2033', mode: 'fixed', withdrawalYears: '4' });
    expect(age.startYear).toBe(35);
    expect(age.endYear).toBe(41);
    expect(age.scenarios[0].records.map(r => [r.year, r.phase, r.withdrawal])).toEqual([
      [35, '存入期', '0.00'], [36, '存入期', '0.00'], [37, '等待期', '0.00'],
      [38, '领取期', '6000.00'], [39, '领取期', '6000.00'], [40, '领取期', '6000.00'], [41, '领取期', '2000.00'],
    ]);
    for (const index of [0, 1]) {
      expect(age.scenarios[index].records.map(({ year: _year, ...r }) => r)).toEqual(years.scenarios[index].records.map(({ year: _year, ...r }) => r));
      expect(age.scenarios[index].summary).toMatchObject({ fullWithdrawalYears: 3, paidYears: 4, depletionYear: 41, firstShortfallYear: 41, totalShortfall: '4000.00' });
    }
  });

  it('允许 104 岁存一笔、105 岁领一笔，105 岁后不产生记录', () => {
    const result = calculate(ageDraft({ startAge: '104', depositYears: '1', withdrawalStartAge: '105', withdrawalEndAge: '105' }));
    expect(result.scenarios[0].records.map(r => r.year)).toEqual([104, 105]);
    expect(result.input.withdrawalYears).toBe(1);
  });

  it('允许从 0 岁开始，最大时间轴到 105 岁，提前耗尽仍完整记录计划', () => {
    const result = calculate(ageDraft({ startAge: '0', depositYears: '1', withdrawalStartAge: '1', withdrawalEndAge: '105' }));
    expect(result.scenarios[0].records).toHaveLength(106);
    expect(result.endYear).toBe(105);
    expect(result.scenarios[0].records.at(-1)?.withdrawal).toBe('0.00');
    expect(result.input.withdrawalYears).toBe(105);
    expect(result.horizonReached).toBe(false);
  });

  it.each([
    ['startAge', '-1'], ['startAge', '105'], ['startAge', '35.5'], ['startAge', ''],
    ['withdrawalStartAge', '106'], ['withdrawalStartAge', 'NaN'],
    ['withdrawalEndAge', '106'], ['withdrawalEndAge', '85.5'], ['withdrawalEndAge', '37'],
  ])('拒绝无效年龄 %s=%s', (field, value) => {
    const valid = validateDraft(ageDraft({ [field]: value }));
    expect(valid.ok).toBe(false);
    if (!valid.ok) expect(valid.errors[field]).toBeTruthy();
  });

  it('不允许存入与领取年龄重叠，允许无等待期', () => {
    const invalid = validateDraft(ageDraft({ withdrawalStartAge: '36' }));
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.errors.withdrawalStartAge).toBeTruthy();
    expect(validateDraft(ageDraft({ withdrawalStartAge: '37' })).ok).toBe(true);
  });

  it('按年龄忽略隐藏年份输入，并固定按结束年龄领取', () => {
    const result = calculate(ageDraft({ startYear: '', withdrawalStartYear: 'bad', withdrawalYears: '', mode: 'until-depleted' }));
    expect(result.input.mode).toBe('fixed');
    expect(result.input.withdrawalYears).toBe(4);
    expect(result.endYear).toBe(41);
  });

  it('按年份不校验未使用的年龄字段', () => {
    expect(validateDraft({ ...createDefaultDraft(2030), startAge: '', withdrawalEndAge: '106' }).ok).toBe(true);
  });

  it('年龄 CSV 使用明确年龄表头，可复现计划，年龄不冒充自然年份', () => {
    const csv = resultToCsv(calculate(ageDraft()));
    expect(csv).toContain('"年龄"');
    expect(csv).toContain('"开始存入年龄"');
    expect(csv).toContain('"领取结束年龄"');
    expect(csv).not.toContain('"年份"');
    expect(csv).toContain('"A","方案甲","0","35"');
    expect(csv).toContain('"38","6000.00","指定年数","4","41","按年龄"');
  });

  it('保存和恢复完整年龄计划，模型边界不变化', () => {
    const data = new Map<string, string>();
    const storage: StoragePort = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } };
    const result = calculate(ageDraft());
    expect(savePlan(storage, result.input, '2026-11-04')).toBe(true);
    expect(JSON.parse(data.get(STORAGE_KEY)!).modelVersion).toBe(2);
    const restored = restorePlan(storage);
    expect(restored.status).toBe('restored');
    if (restored.status === 'restored') {
      expect(restored.result).toEqual(result);
      expect(restored.draft).toMatchObject({ timeBasis: 'age', startAge: '35', withdrawalStartAge: '38', withdrawalEndAge: '41' });
    }
  });

  it('兼容旧版本保存的年份计划，不错误转换为年龄', () => {
    const { timeBasis: _basis, startAge: _a, withdrawalStartAge: _b, withdrawalEndAge: _c, ...oldInput } = createDefaultDraft(2030);
    const text = JSON.stringify({ storageVersion: 1, modelVersion: 1, savedAt: '2026-11-04', input: oldInput });
    const storage: StoragePort = { getItem: () => text, setItem() {}, removeItem() {} };
    const restored = restorePlan(storage);
    expect(restored.status).toBe('restored');
    if (restored.status === 'restored') {
      expect(restored.result.input.timeBasis).toBe('year');
      expect(restored.result).toEqual(calculate(createDefaultDraft(2030)));
    }
  });
});
