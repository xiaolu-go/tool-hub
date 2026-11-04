export type ScenarioId = 'A' | 'B';
export type WithdrawalMode = 'fixed' | 'until-depleted';
export type Phase = '存入期' | '等待期' | '领取期';

export interface ScenarioDraft {
  id: ScenarioId;
  name: string;
  annualRate: string;
}

export interface PlanDraft {
  timeBasis: 'year' | 'age';
  startAge: string;
  withdrawalStartAge: string;
  withdrawalEndAge: string;
  startYear: string;
  annualDeposit: string;
  depositYears: string;
  withdrawalStartYear: string;
  annualWithdrawal: string;
  mode: WithdrawalMode;
  withdrawalYears: string;
  scenarios: [ScenarioDraft, ScenarioDraft];
}

export interface PlanInput {
  timeBasis: 'year' | 'age';
  // Annual coordinates: calendar years in year mode; integer ages in age mode.
  startYear: number;
  annualDeposit: string;
  depositYears: number;
  withdrawalStartYear: number;
  annualWithdrawal: string;
  mode: WithdrawalMode;
  withdrawalYears: number | null;
  scenarios: [ScenarioDraft, ScenarioDraft];
}

export interface AnnualRecord {
  scenarioId: ScenarioId;
  year: number;
  phase: Phase;
  openingBalance: string;
  deposit: string;
  interest: string;
  plannedWithdrawal: string;
  withdrawal: string;
  shortfall: string;
  closingBalance: string;
  cumulativeDeposit: string;
  cumulativeWithdrawal: string;
  cumulativeInterest: string;
}

export interface ScenarioSummary {
  beforeFirstWithdrawal: string;
  totalDeposit: string;
  totalWithdrawal: string;
  totalInterest: string;
  endingBalance: string;
  totalShortfall: string | null;
  fullWithdrawalYears: number;
  paidYears: number;
  depletionYear: number | null;
  firstShortfallYear: number | null;
  status: 'plan-ended' | 'depleted' | 'horizon-reached';
}

export interface ScenarioResult {
  scenario: ScenarioDraft;
  records: AnnualRecord[];
  summary: ScenarioSummary;
}

export interface CalculationResult {
  input: PlanInput;
  startYear: number;
  endYear: number;
  horizonReached: boolean;
  scenarios: [ScenarioResult, ScenarioResult];
  difference: {
    totalWithdrawal: string;
    endingBalance: string;
    fullWithdrawalYears: number;
  };
}

export type FieldErrors = Record<string, string>;
export type ValidationResult = { ok: true; value: PlanInput } | { ok: false; errors: FieldErrors };
