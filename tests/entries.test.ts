import { describe, expect, it } from 'vitest';
import { calculateEntry, emptyEntry, entryToDraft, isEmptyEntry, validateEntry, type EntryDraft, type SavedEntry } from '../src/features/pension-calculator/domain/entries';
import { decodeRecordFile, readRecordFile, writeRecordFile } from '../src/lib/record-files';
import { entriesToCsv } from '../src/lib/entry-csv';
import { fileFixture } from './file-fixture';

const draft = (changes: Partial<EntryDraft> = {}): EntryDraft => ({ type: 'bank', name: '养老金方案', start: '40', annualDeposit: '10000', depositYears: '2', rate: '10', withdrawalStart: '43', annualWithdrawal: '5000', end: '45', ...changes });
function result(changes: Partial<EntryDraft> = {}, basis: 'age' | 'year' = 'age') {
  const checked = validateEntry(draft(changes), basis);
  if (!checked.ok) throw new Error(JSON.stringify(checked.errors));
  return calculateEntry(checked.value);
}
const saved = (id = 'one'): SavedEntry => ({ id, createdAt: '2026-11-04T10:00:00.000Z', updatedAt: '2026-11-04T10:00:00.000Z', ruleVersion: 3, result: result() });

describe('独立列表方案与起息规则', () => {
  it('银行从第一年计息，存入当年计入本金', () => {
    const rows = result().records;
    expect(rows.slice(0, 4).map(r => [r.interest, r.closingBalance])).toEqual([
      ['1000.00', '11000.00'], ['2100.00', '23100.00'], ['2310.00', '25410.00'], ['2541.00', '22951.00'],
    ]);
  });
  it('保险存入期完全不计息，存完后的下一年对全部本金计息', () => {
    const rows = result({ type: 'insurance' }).records;
    expect(rows.slice(0, 4).map(r => [r.interest, r.closingBalance])).toEqual([
      ['0.00', '10000.00'], ['0.00', '20000.00'], ['2000.00', '22000.00'], ['2200.00', '19200.00'],
    ]);
  });
  it('保险无等待期时，领取当年先计息再领取', () => {
    const r = result({ type: 'insurance', depositYears: '1', withdrawalStart: '41', end: '41' });
    expect(r.records.at(-1)).toMatchObject({ interest: '1000.00', withdrawal: '5000.00', closingBalance: '6000.00' });
    expect(r.summary.beforeFirstWithdrawal).toBe('11000.00');
  });
  it('0% 时银行保险现金流相同，负利率仍只在起息后生效', () => {
    expect(result({ type: 'insurance', rate: '0' }).records).toEqual(result({ rate: '0' }).records);
    const r = result({ type: 'insurance', rate: '-100' });
    expect(r.records[1].closingBalance).toBe('20000.00');
    expect(r.records[2].closingBalance).toBe('0.00');
    expect(r.summary).toMatchObject({ depletionYear: 42, firstShortfallYear: 43, totalShortfall: '15000.00' });
  });
  it('模型边界验证不可绕过，年初金额按分舍入', () => {
    const r = result({ annualDeposit: '0.05', depositYears: '1', rate: '10', withdrawalStart: '41', annualWithdrawal: '0.01', end: '41' });
    expect(r.records[0].interest).toBe('0.01');
    expect(() => calculateEntry({ ...r.input, end: 106 })).toThrow();
  });
  it('年龄与年份等距方案逐年金额完全一致', () => {
    const a = result({ type: 'insurance' });
    const b = result({ type: 'insurance', start: '2030', withdrawalStart: '2033', end: '2035' }, 'year');
    expect(a.records.map(({ year: _year, ...r }) => r)).toEqual(b.records.map(({ year: _year, ...r }) => r));
  });
  it('允许 104 岁存一笔、105 岁领一笔，并含结束当年', () => {
    expect(result({ start: '104', depositYears: '1', withdrawalStart: '105', end: '105' }).records.map(r => r.year)).toEqual([104, 105]);
  });
  it.each([['end', '106'], ['end', '42'], ['start', '40.5'], ['withdrawalStart', '41'], ['type', ''], ['name', ''], ['rate', ''], ['annualDeposit', '0']])('不完整或错误字段 %s=%s 不能测算', (key, value) => {
    const valid = validateEntry(draft({ [key]: value }), 'age');
    expect(valid.ok).toBe(false);
    if (!valid.ok) expect(valid.errors[key]).toBeTruthy();
  });
  it('年份模式也要求有效结束年份和 120 年上限', () => {
    expect(validateEntry(draft({ start: '2030', withdrawalStart: '2033', end: '2150' }), 'year').ok).toBe(false);
    expect(validateEntry(draft({ start: '2030', withdrawalStart: '2033', end: '' }), 'year').ok).toBe(false);
  });
  it('空白行可辨识，类型选择也代表已经开始录入', () => {
    expect(isEmptyEntry(emptyEntry())).toBe(true);
    expect(isEmptyEntry({ ...emptyEntry(), type: 'bank' })).toBe(false);
  });
  it('旧版保险保留首年计息，编辑后应用新规则', () => {
    const input = result({ type: 'insurance' }).input;
    expect(calculateEntry(input, 2).records[0].interest).toBe('1000.00');
    expect(calculateEntry(input, 3).records[0].interest).toBe('0.00');
    expect(entryToDraft(input)).toEqual(draft({ type: 'insurance', annualDeposit: '10000.00', annualWithdrawal: '5000.00' }));
  });
});

describe('文件夹记录', () => {
  it('创建文件，读取、新增、修改、删除、重新打开空记录均可往返', async () => {
    const f = fileFixture();
    expect(await readRecordFile(f.folder)).toEqual({ revision: null, records: [] });
    const a = await writeRecordFile(f.folder, [saved()], null);
    expect((await readRecordFile(f.folder)).records).toEqual([saved()]);
    const changed = { ...saved(), result: result({ name: '修改后的方案' }) };
    const b = await writeRecordFile(f.folder, [changed, saved('two')], a.revision);
    expect((await readRecordFile(f.folder)).records[0].result.input.name).toBe('修改后的方案');
    await writeRecordFile(f.folder, [], b.revision);
    expect((await readRecordFile(f.folder)).records).toEqual([]);
  });
  it('发现外部修改后拒绝覆盖，原始文件不变', async () => {
    const f = fileFixture();
    const first = await writeRecordFile(f.folder, [saved()], null);
    await writeRecordFile(f.folder, [saved('other')], first.revision);
    const before = f.read();
    await expect(writeRecordFile(f.folder, [], first.revision)).rejects.toThrow('重新读取');
    expect(f.read()).toBe(before);
  });
  it('手工编辑且未修改版本号时也拒绝覆盖', async () => {
    const f = fileFixture();
    const first = await writeRecordFile(f.folder, [saved()], null);
    const parsed = JSON.parse(f.read()!); parsed.records[0].result.input.name = '文件内手动修改';
    f.replace(JSON.stringify(parsed));
    await expect(writeRecordFile(f.folder, [], first.revision)).rejects.toThrow('重新读取');
  });
  it('首次写入中断遗留的空文件可以重新保存', async () => {
    const f = fileFixture('');
    const loaded = await readRecordFile(f.folder);
    await writeRecordFile(f.folder, [saved()], loaded.revision);
    expect((await readRecordFile(f.folder)).records).toHaveLength(1);
  });
  it('写入失败保留之前完整文件', async () => {
    const f = fileFixture();
    const first = await writeRecordFile(f.folder, [saved()], null);
    const before = f.read(); f.fail();
    await expect(writeRecordFile(f.folder, [], first.revision)).rejects.toThrow('保存失败');
    expect(f.read()).toBe(before);
  });
  it('损坏、未知版本、重复编号、无效参数不能覆盖', async () => {
    const f = fileFixture();
    await writeRecordFile(f.folder, [saved()], null);
    const valid = JSON.parse(f.read()!);
    expect(() => decodeRecordFile('invalid')).toThrow();
    expect(() => decodeRecordFile(JSON.stringify({ ...valid, version: 99 }))).toThrow();
    expect(() => decodeRecordFile(JSON.stringify({ ...valid, records: [saved(), saved()] }))).toThrow();
    expect(() => decodeRecordFile(JSON.stringify({ ...valid, records: [{ ...saved(), result: { input: { ...saved().result.input, end: 106 } } }] }))).toThrow();
  });
  it('读取时用版本规则重建快照，不信任文件中被篡改的余额', async () => {
    const f = fileFixture();
    await writeRecordFile(f.folder, [saved()], null);
    const parsed = JSON.parse(f.read()!); parsed.records[0].result.summary.endingBalance = '9999999';
    const decoded = decodeRecordFile(JSON.stringify(parsed));
    expect(decoded.records[0].result).toEqual(saved().result);
  });
  it('导出每个方案自身时间轴、类别、规则及起息时间，并防止名称公式注入', () => {
    const r = { ...saved(), result: result({ type: 'insurance', name: '=ABC' }) };
    const csv = entriesToCsv([r]);
    expect(csv).toContain('"保险","\'=ABC","年龄","40"');
    expect(csv).toContain('"45","42","3"');
    expect(csv.split('\r\n')).toHaveLength(8);
  });
});
