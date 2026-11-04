import type { CalculationResult } from '../features/pension-calculator/domain/types';

function csvCell(value: string | number, userText = false) {
  let text = String(value);
  if (userText && /^[\s\u0000-\u001f]*[=+@\-\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function resultToCsv(result: CalculationResult): string {
  const byAge = result.input.timeBasis === 'age';
  const header = ['方案标识', '方案名称', '假设年收益率(%)', byAge ? '年龄' : '年份', '阶段', '年初余额', '当年存入', '当年收益', '计划领取', '实际领取', '领取缺口', '年末余额', '累计存入', '累计领取', '累计收益', byAge ? '开始存入年龄' : '起始年份', '每年存入金额', '存入年数', byAge ? '开始领取年龄' : '开始领取年份', '每年计划领取金额', '领取模式', '指定领取年数', byAge ? '领取结束年龄' : '测算结束年份', '时间方式'];
  const rows = [header.map(v => csvCell(v)).join(',')];
  const p = result.input;
  for (let index = 0; index < result.scenarios[0].records.length; index++) {
    for (const s of result.scenarios) {
      const r = s.records[index];
      const cells: (string | number)[] = [s.scenario.id, s.scenario.name, s.scenario.annualRate, r.year, r.phase,
        r.openingBalance, r.deposit, r.interest, r.plannedWithdrawal, r.withdrawal, r.shortfall, r.closingBalance,
        r.cumulativeDeposit, r.cumulativeWithdrawal, r.cumulativeInterest, p.startYear, p.annualDeposit, p.depositYears,
        p.withdrawalStartYear, p.annualWithdrawal, p.mode === 'fixed' ? '指定年数' : '领至耗尽', p.withdrawalYears ?? '', result.endYear, byAge ? '按年龄' : '按年份'];
      rows.push(cells.map((value, i) => csvCell(value, i === 1)).join(','));
    }
  }
  return `\uFEFF${rows.join('\r\n')}\r\n`;
}

export function csvFilename(date: Date): string {
  const n = (v: number) => String(v).padStart(2, '0');
  return `tool-hub-养老金测算-${date.getFullYear()}${n(date.getMonth() + 1)}${n(date.getDate())}-${n(date.getHours())}${n(date.getMinutes())}${n(date.getSeconds())}.csv`;
}

export function downloadCsv(result: CalculationResult) {
  const url = URL.createObjectURL(new Blob([resultToCsv(result)], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = csvFilename(new Date());
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
