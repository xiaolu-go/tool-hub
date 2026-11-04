import { productNames, type SavedEntry } from '../features/pension-calculator/domain/entries';
import { csvFilename } from './csv';

function cell(value: string | number, text = false) {
  let s = String(value);
  if (text && /^[\s\u0000-\u001f]*[=+@\-\t\r\n]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export function entriesToCsv(entries: SavedEntry[]): string {
  const rows = [['记录编号', '类型', '方案名称', '时间方式', '年龄或年份', '阶段', '年初余额', '当年存入', '当年收益', '计划领取', '实际领取', '领取缺口', '年末余额', '累计存入', '累计领取', '累计收益', '开始存入', '年存入额', '存入年数', '年化率(%)', '开始领取', '年领取额', '领取至', '起息时间', '规则版本', '保存时间'].map(v => cell(v)).join(',')];
  for (const entry of entries) {
    const p = entry.result.input;
    for (const r of entry.result.records) {
      const values = [entry.id, productNames[p.type], p.name, p.timeBasis === 'age' ? '年龄' : '年份', r.year, r.phase,
        r.openingBalance, r.deposit, r.interest, r.plannedWithdrawal, r.withdrawal, r.shortfall, r.closingBalance,
        r.cumulativeDeposit, r.cumulativeWithdrawal, r.cumulativeInterest, p.start, p.annualDeposit, p.depositYears, p.rate,
        p.withdrawalStart, p.annualWithdrawal, p.end, entry.ruleVersion === 2 || p.type === 'bank' ? p.start : p.start + p.depositYears,
        entry.ruleVersion, entry.updatedAt];
      rows.push(values.map((v, index) => cell(v, index === 2)).join(','));
    }
  }
  return `\uFEFF${rows.join('\r\n')}\r\n`;
}
export function downloadEntries(entries: SavedEntry[]) {
  const url = URL.createObjectURL(new Blob([entriesToCsv(entries)], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url; a.download = csvFilename(new Date()); a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
