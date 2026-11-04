import { describe, expect, it } from 'vitest';
import { calculatePlan } from '../src/features/pension-calculator/domain/calculate';
import { createDefaultDraft, validateDraft } from '../src/features/pension-calculator/domain/validation';
import { clearPlan, restorePlan, savePlan, STORAGE_KEY, type StoragePort } from '../src/lib/storage';
import { csvFilename, resultToCsv } from '../src/lib/csv';
import { formatMoney } from '../src/lib/format';

function sample() {
  const result = validateDraft(createDefaultDraft(2030));
  if (!result.ok) throw new Error('测试输入无效');
  return calculatePlan(result.value);
}

function memoryStore() {
  const data = new Map<string, string>();
  const storage: StoragePort = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); },
  };
  return { storage, data };
}

describe('本地保存', () => {
  it('从已保存输入重新计算，起始年不随系统时间变更', () => {
    const { storage } = memoryStore();
    const result = sample();
    expect(savePlan(storage, result.input, '2030-01-01T00:00:00Z')).toBe(true);
    const restored = restorePlan(storage);
    expect(restored.status).toBe('restored');
    if (restored.status === 'restored') {
      expect(restored.draft.startYear).toBe('2030');
      expect(restored.result).toEqual(result);
    }
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).result).toBeUndefined();
  });
  it.each(['not json', '{}', '{"storageVersion":2}', JSON.stringify({ storageVersion: 1, modelVersion: 9, savedAt: '', input: createDefaultDraft(2030) })])('损坏或不兼容数据回退', value => {
    const { storage } = memoryStore();
    storage.setItem(STORAGE_KEY, value);
    expect(restorePlan(storage).status).toBe('invalid');
  });
  it('拒绝结构正确但违反模型的保存参数', () => {
    const { storage } = memoryStore();
    storage.setItem(STORAGE_KEY, JSON.stringify({ storageVersion: 1, modelVersion: 1, savedAt: '', input: { ...createDefaultDraft(2030), annualDeposit: 'NaN' } }));
    expect(restorePlan(storage).status).toBe('invalid');
  });
  it('存储权限失败返回明确状态', () => {
    const fail = () => { throw new Error('blocked'); };
    const storage: StoragePort = { getItem: fail, setItem: fail, removeItem: fail };
    expect(restorePlan(storage).status).toBe('invalid');
    expect(savePlan(storage, sample().input, '')).toBe(false);
    expect(clearPlan(storage)).toBe(false);
  });
  it('仅清除本工具保存键', () => {
    const { storage, data } = memoryStore();
    storage.setItem('other-tool', 'keep');
    savePlan(storage, sample().input, '2030');
    expect(clearPlan(storage)).toBe(true);
    expect(data.get('other-tool')).toBe('keep');
    expect(restorePlan(storage).status).toBe('empty');
  });
});

describe('明细导出与金额展示', () => {
  it('导出同时间轴双方案、复现参数、纯金额、BOM 与 CRLF', () => {
    const result = sample();
    const csv = resultToCsv(result);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const rows = csv.slice(1).trimEnd().split('\r\n');
    expect(rows).toHaveLength(1 + result.scenarios[0].records.length * 2);
    expect(rows[1]).toContain('"A","银行假设方案","2","2030"');
    expect(rows[2]).toContain('"B","保险假设方案","3","2030"');
    expect(rows[0]).toContain('"开始领取年份"');
    expect(rows[1]).toContain('"10000.00","10","2050","12000.00","指定年数","20","2069"');
    expect(csv).not.toContain('10,000.00');
  });
  it.each(['=1+1', '+SUM(1)', '-1', '@SUM(A1)', '\t=1', '  =1'])('防止方案名称作为公式 %s', name => {
    const result = sample();
    result.scenarios[0].scenario.name = name;
    expect(resultToCsv(result)).toContain(`"'${name}"`);
  });
  it('正确转义方案名称的逗号、引号和换行', () => {
    const result = sample();
    result.scenarios[0].scenario.name = '名称,"一"\n二';
    expect(resultToCsv(result)).toContain('"名称,""一""\n二"');
  });
  it('金额显示不损失大数的最后一分，负数符号明确', () => {
    expect(formatMoney('123456789012345678901234567890.01')).toBe('123,456,789,012,345,678,901,234,567,890.01');
    expect(formatMoney('-0.01')).toBe('−0.01');
    expect(formatMoney('12.30', true)).toBe('+12.30');
    expect(formatMoney('0.00', true)).toBe('0.00');
  });
  it('文件名使用传入时间的本地年月日时分秒', () => {
    expect(csvFilename(new Date(2030, 0, 2, 3, 4, 5))).toBe('tool-hub-养老金测算-20300102-030405.csv');
  });
});
