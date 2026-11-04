import { Money, money } from './money';
import { createDefaultDraft, validateDraft } from './validation';
import type { AnnualRecord, ScenarioSummary } from './types';

export type TimeBasis = 'age' | 'year';
export type ProductType = 'bank' | 'insurance';
export const productNames = { bank: '银行', insurance: '保险' };
export const ENTRY_MODEL_VERSION = 3;
export interface EntryDraft {
  type: '' | ProductType;
  name: string;
  start: string;
  annualDeposit: string;
  depositYears: string;
  rate: string;
  withdrawalStart: string;
  annualWithdrawal: string;
  end: string;
}
export interface EntryInput extends Omit<EntryDraft, 'type' | 'start' | 'depositYears' | 'withdrawalStart' | 'end'> {
  type: ProductType;
  timeBasis: TimeBasis;
  start: number;
  depositYears: number;
  withdrawalStart: number;
  end: number;
}
export interface EntryResult { input: EntryInput; records: AnnualRecord[]; summary: ScenarioSummary }
export interface SavedEntry {
  id: string;
  createdAt: string;
  updatedAt: string;
  ruleVersion: 2 | 3;
  result: EntryResult;
}
export const emptyEntry = (): EntryDraft => ({ type: '', name: '', start: '', annualDeposit: '', depositYears: '', rate: '', withdrawalStart: '', annualWithdrawal: '', end: '' });
export const isEmptyEntry = (entry: EntryDraft) => Object.values(entry).every(value => value.trim() === '');
export function entryToDraft(input: EntryInput): EntryDraft {
  return { type: input.type, name: input.name, start: String(input.start), annualDeposit: input.annualDeposit, depositYears: String(input.depositYears), rate: input.rate, withdrawalStart: String(input.withdrawalStart), annualWithdrawal: input.annualWithdrawal, end: String(input.end) };
}

export function validateEntry(raw: unknown, timeBasis: TimeBasis): { ok: true; value: EntryInput } | { ok: false; errors: Record<string, string> } {
  if (!raw || typeof raw !== 'object' || !Object.keys(emptyEntry()).every(key => typeof (raw as Record<string, unknown>)[key] === 'string')) {
    return { ok: false, errors: { name: '方案格式无效。' } };
  }
  const d = raw as EntryDraft;
  const end = Number(d.end.trim());
  const begin = Number(d.withdrawalStart.trim());
  const p = createDefaultDraft(2030);
  const checked = validateDraft({ ...p, timeBasis,
    startYear: d.start, startAge: d.start,
    annualDeposit: d.annualDeposit, depositYears: d.depositYears,
    withdrawalStartYear: d.withdrawalStart, withdrawalStartAge: d.withdrawalStart,
    annualWithdrawal: d.annualWithdrawal, withdrawalEndAge: d.end,
    mode: 'fixed', withdrawalYears: String(end - begin + 1),
    scenarios: [{ id: 'A', name: d.name, annualRate: d.rate }, { id: 'B', name: d.name, annualRate: d.rate }],
  });
  const errors: Record<string, string> = {};
  if (d.type !== 'bank' && d.type !== 'insurance') errors.type = '请选择银行或保险。';
  if (!/^\d+$/.test(d.end.trim()) || !Number.isSafeInteger(end) || (timeBasis === 'year' && (end < 1901 || end > 2319))) errors.end = timeBasis === 'age' ? '请输入 1～105 的整数。' : '请输入 1901～2319 的结束年份。';
  if (!checked.ok) {
    const mapping: Record<string, string> = { startYear: 'start', startAge: 'start', withdrawalStartYear: 'withdrawalStart', withdrawalStartAge: 'withdrawalStart', withdrawalEndAge: 'end', withdrawalYears: 'end', 'scenarios.0.name': 'name', 'scenarios.0.annualRate': 'rate' };
    for (const [key, value] of Object.entries(checked.errors)) {
      if (!key.startsWith('scenarios.1.')) errors[mapping[key] ?? key] = value;
    }
  }
  if (Object.keys(errors).length || !checked.ok) return { ok: false, errors };
  return { ok: true, value: { type: d.type as ProductType, timeBasis, name: checked.value.scenarios[0].name,
    start: checked.value.startYear, annualDeposit: checked.value.annualDeposit, depositYears: checked.value.depositYears,
    rate: checked.value.scenarios[0].annualRate, withdrawalStart: checked.value.withdrawalStartYear,
    annualWithdrawal: checked.value.annualWithdrawal, end } };
}

// Model 2 is retained only for explicitly imported legacy calculations.
export function calculateEntry(supplied: EntryInput, ruleVersion: 2 | 3 = ENTRY_MODEL_VERSION): EntryResult {
  const checked = validateEntry(entryToDraft(supplied), supplied.timeBasis);
  if (!checked.ok) throw new Error('方案参数无效，无法测算。');
  const input = checked.value;
  const lastDeposit = input.start + input.depositYears - 1;
  let balance = new Money(0), deposits = new Money(0), withdrawals = new Money(0), interests = new Money(0);
  let depletionYear: number | null = null, beforeFirstWithdrawal = '0.00';
  const records: AnnualRecord[] = [];
  for (let year = input.start; year <= input.end; year++) {
    const opening = balance;
    const deposit = new Money(year <= lastDeposit ? input.annualDeposit : 0);
    const principal = opening.plus(deposit);
    const accruing = ruleVersion === 2 || input.type === 'bank' || year > lastDeposit;
    const interest = accruing ? principal.times(new Money(input.rate).div(100)).toDecimalPlaces(2) : new Money(0);
    const available = principal.plus(interest);
    const planned = new Money(year >= input.withdrawalStart ? input.annualWithdrawal : 0);
    const withdrawal = Money.min(available, planned);
    balance = available.minus(withdrawal);
    deposits = deposits.plus(deposit); withdrawals = withdrawals.plus(withdrawal); interests = interests.plus(interest);
    if (year === input.withdrawalStart) beforeFirstWithdrawal = money(available);
    if (year >= lastDeposit && balance.isZero() && depletionYear === null) depletionYear = year;
    records.push({ scenarioId: 'A', year, phase: year <= lastDeposit ? '存入期' : year < input.withdrawalStart ? '等待期' : '领取期',
      openingBalance: money(opening), deposit: money(deposit), interest: money(interest), plannedWithdrawal: money(planned),
      withdrawal: money(withdrawal), shortfall: money(planned.minus(withdrawal)), closingBalance: money(balance),
      cumulativeDeposit: money(deposits), cumulativeWithdrawal: money(withdrawals), cumulativeInterest: money(interests) });
  }
  const paid = records.filter(r => r.year >= input.withdrawalStart);
  return { input, records, summary: { beforeFirstWithdrawal, totalDeposit: money(deposits), totalWithdrawal: money(withdrawals), totalInterest: money(interests),
    endingBalance: money(balance), totalShortfall: money(paid.reduce((n, r) => n.plus(r.shortfall), new Money(0))),
    fullWithdrawalYears: paid.filter(r => r.withdrawal === r.plannedWithdrawal).length, paidYears: paid.filter(r => new Money(r.withdrawal).gt(0)).length,
    depletionYear, firstShortfallYear: paid.find(r => new Money(r.shortfall).gt(0))?.year ?? null, status: balance.isZero() ? 'depleted' : 'plan-ended' } };
}
