import { Money } from './money';
import type { FieldErrors, PlanDraft, PlanInput, ScenarioDraft, ValidationResult } from './types';

export const MAX_YEARS = 120;
export const MAX_AGE = 105;

export function createDefaultDraft(year: number): PlanDraft {
  return {
    timeBasis: 'year', startAge: '35', withdrawalStartAge: '60', withdrawalEndAge: '85',
    startYear: String(year), annualDeposit: '10000', depositYears: '10',
    withdrawalStartYear: String(year + 20), annualWithdrawal: '12000',
    mode: 'fixed', withdrawalYears: '20',
    scenarios: [
      { id: 'A', name: '银行假设方案', annualRate: '2' },
      { id: 'B', name: '保险假设方案', annualRate: '3' },
    ],
  };
}

export function isDraft(value: unknown): value is PlanDraft {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const fields = ['startYear', 'annualDeposit', 'depositYears', 'withdrawalStartYear', 'annualWithdrawal', 'withdrawalYears', 'startAge', 'withdrawalStartAge', 'withdrawalEndAge'];
  return fields.every(key => typeof v[key] === 'string')
    && (v.timeBasis === 'year' || v.timeBasis === 'age')
    && (v.mode === 'fixed' || v.mode === 'until-depleted')
    && Array.isArray(v.scenarios) && v.scenarios.length === 2
    && v.scenarios.every((s: unknown, index: number) => {
      if (!s || typeof s !== 'object') return false;
      const item = s as Record<string, unknown>;
      return item.id === (index === 0 ? 'A' : 'B') && typeof item.name === 'string' && typeof item.annualRate === 'string';
    });
}

export function validateDraft(raw: unknown): ValidationResult {
  if (!isDraft(raw)) return { ok: false, errors: { form: '参数格式无效，请恢复默认后重新设置。' } };
  const errors: FieldErrors = {};
  function integer(key: string, value: string, min: number, max: number) {
    const text = value.trim();
    const n = Number(text);
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(n) || n < min || n > max) {
      errors[key] = `请输入 ${min}～${max} 的整数。`;
      return null;
    }
    return n;
  }
  function amount(key: string, value: string) {
    const text = value.trim();
    if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(text) || text.length > 32) {
      errors[key] = '请输入有效金额，最多两位小数。';
      return '';
    }
    const n = new Money(text);
    if (n.lte(0) || n.gt('1000000000')) {
      errors[key] = '金额须大于 0 且不超过 1,000,000,000 元。';
      return '';
    }
    return n.toFixed(2);
  }
  const byAge = raw.timeBasis === 'age';
  const startYear = byAge ? integer('startAge', raw.startAge, 0, 104) : integer('startYear', raw.startYear, 1900, 2200);
  const depositYears = integer('depositYears', raw.depositYears, 1, 100);
  const withdrawalStartYear = byAge ? integer('withdrawalStartAge', raw.withdrawalStartAge, 1, MAX_AGE) : integer('withdrawalStartYear', raw.withdrawalStartYear, 1901, 2319);
  const endAge = byAge ? integer('withdrawalEndAge', raw.withdrawalEndAge, 1, MAX_AGE) : null;
  const annualDeposit = amount('annualDeposit', raw.annualDeposit);
  const annualWithdrawal = amount('annualWithdrawal', raw.annualWithdrawal);
  const mode = byAge ? 'fixed' : raw.mode;
  const withdrawalYears = byAge
    ? endAge !== null && withdrawalStartYear !== null ? endAge - withdrawalStartYear + 1 : null
    : mode === 'fixed' ? integer('withdrawalYears', raw.withdrawalYears, 1, 120) : null;
  if (byAge && endAge !== null && withdrawalStartYear !== null && endAge < withdrawalStartYear) {
    errors.withdrawalEndAge = '领取结束年龄不能小于开始领取年龄（包含结束年龄当年）。';
  }
  if (startYear !== null && depositYears !== null && withdrawalStartYear !== null) {
    if (withdrawalStartYear <= startYear + depositYears - 1) {
      errors[byAge ? 'withdrawalStartAge' : 'withdrawalStartYear'] = byAge
        ? `开始领取年龄须大于最后存入年龄 ${startYear + depositYears - 1} 岁。`
        : `开始领取年份须晚于最后存入年份 ${startYear + depositYears - 1}。`;
    } else if (withdrawalStartYear > startYear + MAX_YEARS - 1) {
      errors.withdrawalStartYear = `开始领取年份不能超过 ${startYear + MAX_YEARS - 1}。`;
    }
    if (!byAge && mode === 'fixed' && withdrawalYears !== null && withdrawalStartYear + withdrawalYears - 1 > startYear + MAX_YEARS - 1) {
      errors.withdrawalYears = `计划结束年份不能超过 ${startYear + MAX_YEARS - 1}。`;
    }
  }
  const scenarios = raw.scenarios.map((s, i): ScenarioDraft => {
    const name = s.name.trim();
    if (name.length < 1 || [...name].length > 30) errors[`scenarios.${i}.name`] = '方案名称须为 1～30 个字符。';
    const rate = s.annualRate.trim();
    if (!/^-?(?:\d+(?:\.\d{1,4})?|\.\d{1,4})$/.test(rate) || rate.length > 32) {
      errors[`scenarios.${i}.annualRate`] = '请输入有效收益率，最多四位小数。';
    } else if (new Money(rate).lt(-100) || new Money(rate).gt(100)) {
      errors[`scenarios.${i}.annualRate`] = '假设年收益率须在 −100%～100% 之间。';
    }
    return { id: s.id, name, annualRate: errors[`scenarios.${i}.annualRate`] ? rate : new Money(rate).toString() };
  }) as [ScenarioDraft, ScenarioDraft];
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: {
    timeBasis: raw.timeBasis,
    startYear: startYear!, depositYears: depositYears!, withdrawalStartYear: withdrawalStartYear!,
    annualDeposit, annualWithdrawal, withdrawalYears, mode, scenarios,
  } };
}

export function toDraft(input: PlanInput): PlanDraft {
  return {
    timeBasis: input.timeBasis,
    startAge: input.timeBasis === 'age' ? String(input.startYear) : '35',
    withdrawalStartAge: input.timeBasis === 'age' ? String(input.withdrawalStartYear) : '60',
    withdrawalEndAge: input.timeBasis === 'age' ? String(input.withdrawalStartYear + input.withdrawalYears! - 1) : '85',
    startYear: input.timeBasis === 'year' ? String(input.startYear) : '', annualDeposit: input.annualDeposit,
    depositYears: String(input.depositYears), withdrawalStartYear: input.timeBasis === 'year' ? String(input.withdrawalStartYear) : '',
    annualWithdrawal: input.annualWithdrawal, mode: input.mode,
    withdrawalYears: input.withdrawalYears === null ? '' : String(input.withdrawalYears),
    scenarios: input.scenarios.map(s => ({ ...s })) as PlanDraft['scenarios'],
  };
}
