import { Money, money } from './money';
import { MAX_YEARS, toDraft, validateDraft } from './validation';
import type { AnnualRecord, CalculationResult, PlanInput, ScenarioResult, ScenarioSummary } from './types';

export const MODEL_VERSION = 2;

export function calculatePlan(supplied: PlanInput): CalculationResult {
  // Normalize again at the public boundary; callers cannot bypass model constraints.
  const checked = validateDraft(toDraft(supplied));
  if (!checked.ok) throw new Error('无法测算：输入参数未通过校验。');
  const input = checked.value;
  const lastDepositYear = input.startYear + input.depositYears - 1;
  const maximumYear = input.startYear + MAX_YEARS - 1;
  const plannedEnd = input.mode === 'fixed' ? input.withdrawalStartYear + input.withdrawalYears! - 1 : maximumYear;
  const state = input.scenarios.map(scenario => ({
    scenario, balance: new Money(0), deposited: new Money(0), withdrawn: new Money(0), interest: new Money(0),
    records: [] as AnnualRecord[], depletionYear: null as number | null, beforeFirstWithdrawal: '0.00',
  }));
  let endYear = plannedEnd;
  for (let year = input.startYear; year <= plannedEnd; year++) {
    for (const s of state) {
      const opening = s.balance;
      const deposit = new Money(year <= lastDepositYear ? input.annualDeposit : 0);
      const principal = opening.plus(deposit);
      const interest = principal.times(new Money(s.scenario.annualRate).div(100)).toDecimalPlaces(2);
      const available = principal.plus(interest);
      const planned = new Money(year >= input.withdrawalStartYear ? input.annualWithdrawal : 0);
      const withdrawal = Money.min(planned, available);
      s.balance = available.minus(withdrawal);
      s.deposited = s.deposited.plus(deposit);
      s.withdrawn = s.withdrawn.plus(withdrawal);
      s.interest = s.interest.plus(interest);
      if (year === input.withdrawalStartYear) s.beforeFirstWithdrawal = money(available);
      if (year >= lastDepositYear && s.balance.isZero() && s.depletionYear === null) s.depletionYear = year;
      s.records.push({
        scenarioId: s.scenario.id, year,
        phase: year <= lastDepositYear ? '存入期' : year < input.withdrawalStartYear ? '等待期' : '领取期',
        openingBalance: money(opening), deposit: money(deposit), interest: money(interest),
        plannedWithdrawal: money(planned), withdrawal: money(withdrawal), shortfall: money(planned.minus(withdrawal)),
        closingBalance: money(s.balance), cumulativeDeposit: money(s.deposited),
        cumulativeWithdrawal: money(s.withdrawn), cumulativeInterest: money(s.interest),
      });
    }
    if (input.mode === 'until-depleted' && year >= input.withdrawalStartYear && state.every(s => s.balance.isZero())) {
      endYear = year;
      break;
    }
  }
  const scenarios = state.map((s): ScenarioResult => {
    const withdrawalRows = s.records.filter(r => r.year >= input.withdrawalStartYear);
    const firstShortfall = withdrawalRows.find(r => new Money(r.shortfall).gt(0));
    const summary: ScenarioSummary = {
      beforeFirstWithdrawal: s.beforeFirstWithdrawal, totalDeposit: money(s.deposited),
      totalWithdrawal: money(s.withdrawn), totalInterest: money(s.interest), endingBalance: money(s.balance),
      totalShortfall: input.mode === 'fixed' ? money(withdrawalRows.reduce((sum, row) => sum.plus(row.shortfall), new Money(0))) : null,
      fullWithdrawalYears: withdrawalRows.filter(r => r.withdrawal === r.plannedWithdrawal).length,
      paidYears: withdrawalRows.filter(r => new Money(r.withdrawal).gt(0)).length,
      depletionYear: s.depletionYear, firstShortfallYear: firstShortfall?.year ?? null,
      status: s.balance.isZero() ? 'depleted' : input.mode === 'fixed' ? 'plan-ended' : 'horizon-reached',
    };
    return { scenario: { ...s.scenario }, records: s.records, summary };
  }) as [ScenarioResult, ScenarioResult];
  return {
    input, startYear: input.startYear, endYear,
    horizonReached: input.mode === 'until-depleted' && scenarios.some(s => s.summary.status === 'horizon-reached'),
    scenarios,
    difference: {
      totalWithdrawal: money(new Money(scenarios[1].summary.totalWithdrawal).minus(scenarios[0].summary.totalWithdrawal)),
      endingBalance: money(new Money(scenarios[1].summary.endingBalance).minus(scenarios[0].summary.endingBalance)),
      fullWithdrawalYears: scenarios[1].summary.fullWithdrawalYears - scenarios[0].summary.fullWithdrawalYears,
    },
  };
}
