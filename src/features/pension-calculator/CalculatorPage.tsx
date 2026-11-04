import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { ArrowDownToLine, ArrowLeft, Calculator, FolderOpen, Plus, Search, Trash2 } from 'lucide-react';
import { formatMoney } from '../../lib/format';
import { downloadEntries } from '../../lib/entry-csv';
import { readRecordFile, writeRecordFile, RECORD_FILENAME, type RecordFolder, type RecordFile } from '../../lib/record-files';
import { restorePlan, browserStorage } from '../../lib/storage';
import { calculateEntry, emptyEntry, entryToDraft, isEmptyEntry, productNames, validateEntry, type EntryDraft, type SavedEntry, type TimeBasis } from './domain/entries';
import styles from './Calculator.module.css';

const ResultCharts = lazy(() => import('./ResultCharts'));
const columns: { key: keyof EntryDraft; title: string; mode?: 'decimal' | 'numeric' | 'text' }[] = [
  { key: 'type', title: '类型' }, { key: 'name', title: '方案名称', mode: 'text' }, { key: 'start', title: '开始存入' },
  { key: 'annualDeposit', title: '年存入额（元）', mode: 'decimal' }, { key: 'depositYears', title: '存入年数' },
  { key: 'rate', title: '年化率（%）', mode: 'decimal' }, { key: 'withdrawalStart', title: '开始领取' },
  { key: 'annualWithdrawal', title: '年领取额（元）', mode: 'decimal' }, { key: 'end', title: '领取至' },
];
const detailColumns = [ ['openingBalance', '年初余额'], ['deposit', '当年存入'], ['interest', '当年收益'], ['plannedWithdrawal', '计划领取'], ['withdrawal', '实际领取'], ['shortfall', '领取缺口'], ['closingBalance', '年末余额'], ['cumulativeDeposit', '累计存入'], ['cumulativeWithdrawal', '累计领取'], ['cumulativeInterest', '累计收益'] ] as const;
const unit = (basis: TimeBasis) => basis === 'age' ? '岁' : '年';
function errorText(error: unknown) {
  if (error instanceof SyntaxError) return '记录文件内容损坏或不是有效 JSON，原文件未修改，请选择正确文件夹。';
  if (error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name)) return '未获得文件夹读写权限，请重新选择并授权。当前录入内容已保留。';
  if (error instanceof DOMException && ['NotReadableError', 'NoModificationAllowedError'].includes(error.name)) return '记录文件暂时无法读写，请检查文件是否被占用或文件夹是否可写。当前录入内容已保留。';
  return error instanceof Error ? error.message : '操作未完成，请重试。';
}

function ResultView({ entries }: { entries: SavedEntry[] }) {
  const [selected, setSelected] = useState(entries[0].id);
  const entry = entries.find(e => e.id === selected) ?? entries[0];
  const { input: p, summary: s, records } = entry.result;
  return <section className={styles.results} aria-label="测算结果">
    <div className={styles.sectionTitle}><div><span className={styles.eyebrow}>YOUR PLAN, YEAR BY YEAR</span><h2>测算结果</h2></div><button className="button secondary" onClick={() => downloadEntries(entries)}><ArrowDownToLine size={15} />导出明细</button></div>
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="方案测算汇总，可横向滚动"><table className={styles.summaryTable}><caption className={styles.srOnly}>各独立方案的测算汇总，金额单位元</caption><thead><tr>{['方案名称', '类型', '时间范围', '存入总额', '累计收益', '累计领取', '期末余额', '足额领取', '首次不足额'].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{entries.map(e => {
      const i = e.result.input, x = e.result.summary;
      return <tr key={e.id}><th scope="row">{i.name}{e.ruleVersion === 2 && <small className={styles.legacy}>旧版规则</small>}</th><td>{productNames[i.type]}</td><td>{i.start}—{i.end} {unit(i.timeBasis)}</td><td>{formatMoney(x.totalDeposit)}</td><td>{formatMoney(x.totalInterest)}</td><td>{formatMoney(x.totalWithdrawal)}</td><td>{formatMoney(x.endingBalance)}</td><td>{x.fullWithdrawalYears} 年</td><td>{x.firstShortfallYear === null ? '无' : `${x.firstShortfallYear} ${unit(i.timeBasis)}`}</td></tr>;
    })}</tbody></table></div>
    <div className={styles.detailHeading}><label>查看方案明细 <select aria-label="查看方案明细" value={entry.id} onChange={e => setSelected(e.target.value)}>{entries.map(e => <option key={e.id} value={e.id}>{e.result.input.name} · {productNames[e.result.input.type]}</option>)}</select></label><p>{p.start} {unit(p.timeBasis)}开始存入 · {p.withdrawalStart} {unit(p.timeBasis)}开始领取 · 领至 {p.end} {unit(p.timeBasis)}（含当年）</p></div>
    <p className={styles.resultNote}>首次领取前资金 {formatMoney(s.beforeFirstWithdrawal)} 元 · {s.depletionYear === null ? '测算结束时仍有余额' : `${s.depletionYear} ${unit(p.timeBasis)}资金耗尽`} · 计划领取缺口 {formatMoney(s.totalShortfall ?? '0.00')} 元</p>
    {entry.ruleVersion === 2 && <p className={styles.notice}>此记录使用旧版规则：银行与保险均从第一年计息。编辑后重算将应用当前规则。</p>}
    <Suspense fallback={<p>正在准备年度图表…</p>}><ResultCharts result={entry.result} /></Suspense>
    <div className={styles.sectionTitle}><h3>每一年的资金明细</h3><span>金额单位：元 · 共 {records.length} 年</span></div>
    <div className={`${styles.tableScroll} ${styles.annualScroll}`} tabIndex={0} role="region" aria-label="年度明细，可横向滚动"><table><caption className={styles.srOnly}>{p.name} 的年度资金明细</caption><thead><tr><th>{p.timeBasis === 'age' ? '年龄' : '年份'}</th><th>阶段</th>{detailColumns.map(([key, title]) => <th key={key}>{title}</th>)}</tr></thead><tbody>{records.map(r => <tr key={r.year}><th scope="row">{r.year}{p.timeBasis === 'age' ? ' 岁' : ''}</th><td>{r.phase}</td>{detailColumns.map(([key]) => <td key={key}>{formatMoney(r[key])}</td>)}</tr>)}</tbody></table></div>
    <p className={styles.hint}>左右滚动查看全部字段。汇总、图表与导出使用同一份结果；各方案按自身的起止时间测算。</p>
  </section>;
}

export default function CalculatorPage() {
  const [basis, setBasis] = useState<TimeBasis>('age');
  const [rows, setRows] = useState<EntryDraft[]>([emptyEntry(), emptyEntry()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [folder, setFolder] = useState<RecordFolder | null>(null);
  const [file, setFile] = useState<RecordFile>({ revision: null, records: [] });
  const [shown, setShown] = useState<SavedEntry[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [deleting, setDeleting] = useState<SavedEntry | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const entryScroll = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const records = useMemo(() => file.records.filter(e => (filter === 'all' || e.result.input.type === filter) && `${e.result.input.name} ${productNames[e.result.input.type]}`.toLowerCase().includes(query.trim().toLowerCase())).slice().reverse(), [file.records, filter, query]);

  async function action(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setProblem('');
    try { await work(); } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setProblem(errorText(error));
    } finally { lock.current = false; setBusy(false); }
  }
  async function pickFolder() {
    if (!window.showDirectoryPicker) { setProblem('此浏览器暂不支持直接保存文件夹。请使用电脑上的 Microsoft Edge 或 Chrome 打开本工具。'); return; }
    await action(async () => {
      const picked = await window.showDirectoryPicker!({ mode: 'readwrite', id: 'tool-hub-pension' });
      const loaded = await readRecordFile(picked);
      setFolder(picked); setFile(loaded); setShown([]); setEditing(null); setErrors({});
      setNotice(`已打开文件夹“${picked.name}”，读取 ${loaded.records.length} 条记录。`);
    });
  }
  async function save(recordsToSave: SavedEntry[]) {
    if (!folder) throw new Error('请先选择记录文件夹，再进行测算。录入内容已保留。');
    const next = await writeRecordFile(folder, recordsToSave, file.revision);
    setFile(next);
  }
  function editCell(index: number, key: keyof EntryDraft, value: string) {
    setRows(previous => previous.map((r, i) => i === index ? { ...r, [key]: value } : r));
    setErrors(previous => { const next = { ...previous }; delete next[`${index}.${key}`]; return next; });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const issues: Record<string, string> = {};
    const prepared: SavedEntry[] = [];
    rows.forEach((row, index) => {
      if (isEmptyEntry(row)) return;
      const checked = validateEntry(row, basis);
      if (!checked.ok) for (const [key, value] of Object.entries(checked.errors)) issues[`${index}.${key}`] = value;
      else {
        const previous = editing ? file.records.find(e => e.id === editing) : undefined;
        const now = new Date().toISOString();
        prepared.push({ id: previous?.id ?? crypto.randomUUID(), createdAt: previous?.createdAt ?? now, updatedAt: now, ruleVersion: 3, result: calculateEntry(checked.value) });
      }
    });
    setErrors(issues); setProblem('');
    if (Object.keys(issues).length) {
      setProblem('部分方案尚未填写完整或参数无效，请检查标出的单元格。');
      requestAnimationFrame(() => { const element = form.current?.elements.namedItem(Object.keys(issues)[0]); if (element instanceof HTMLElement) element.focus(); });
      return;
    }
    if (!prepared.length) { setProblem('请至少完整填写一行方案后再测算。'); return; }
    await action(async () => {
      if (editing && !file.records.some(e => e.id === editing)) throw new Error('正在编辑的记录已不存在，请取消编辑后重试。');
      await save(editing ? file.records.map(e => e.id === editing ? prepared[0] : e) : [...file.records, ...prepared]);
      setShown(prepared); setRows([emptyEntry(), emptyEntry()]); setEditing(null); setErrors({});
      if (entryScroll.current) entryScroll.current.scrollLeft = 0;
      setNotice(`已完成测算并保存 ${prepared.length} 条记录，录入区已清空。`);
    });
  }
  function beginEdit(entry: SavedEntry) {
    setEditing(entry.id); setBasis(entry.result.input.timeBasis); setRows([entryToDraft(entry.result.input)]); setErrors({}); setProblem('');
    if (entryScroll.current) entryScroll.current.scrollLeft = 0;
    form.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function reload() {
    await action(async () => {
      if (!folder) return;
      const loaded = await readRecordFile(folder); setFile(loaded);
      setShown(previous => previous.map(e => loaded.records.find(x => x.id === e.id)).filter((e): e is SavedEntry => Boolean(e)));
      setNotice(`已重新读取 ${loaded.records.length} 条记录，当前录入内容已保留。`);
    });
  }
  async function removeRecord() {
    if (!deleting) return;
    await action(async () => {
      await save(file.records.filter(e => e.id !== deleting.id));
      setShown(previous => previous.filter(e => e.id !== deleting.id));
      if (editing === deleting.id) { setEditing(null); setRows([emptyEntry(), emptyEntry()]); setErrors({}); }
      setNotice('记录已从文件中删除。'); dialog.current?.close(); setDeleting(null);
    });
  }
  async function importLegacy() {
    await action(async () => {
      const legacy = restorePlan(browserStorage());
      if (legacy.status !== 'restored') throw new Error('没有可导入的旧版测算设置。');
      const p = legacy.result.input;
      const now = new Date().toISOString();
      const imported = p.scenarios.map((s, index): SavedEntry => {
        const input = { timeBasis: p.timeBasis, type: index === 0 ? 'bank' as const : 'insurance' as const, name: s.name, rate: s.annualRate,
          start: p.startYear, annualDeposit: p.annualDeposit, depositYears: p.depositYears, withdrawalStart: p.withdrawalStartYear,
          annualWithdrawal: p.annualWithdrawal, end: legacy.result.endYear };
        return { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ruleVersion: 2, result: calculateEntry(input, 2) };
      });
      await save([...file.records, ...imported]); setShown(imported); setNotice('旧版设置已导入文件，保留原来的首年计息规则。');
    });
  }
  return <div className={styles.page}>
    <Link className={styles.backLink} to="/"><ArrowLeft size={14} />返回工具首页</Link>
    <div className={styles.pageHeading}><div><span className={styles.eyebrow}>PENSION PLANNER</span><h1>养老金资金计算器</h1><p>一行一个方案，按自己的节奏存入与领取。把每一次规划，留在自己的文件夹里。</p></div><span className={styles.badge}><Calculator size={15} />年度假设测算</span></div>
    <section className={styles.folderBar} aria-label="记录文件夹"><FolderOpen size={23} /><div><strong>{folder ? `记录文件夹：${folder.name}` : '为测算记录选择一个文件夹'}</strong><p>{folder ? `记录文件：${RECORD_FILENAME} · 刷新页面后重新选择此文件夹即可读取` : '记录以文件保存。首次测算前请选择文件夹，已有记录会自动读取。'}</p></div><button type="button" className="button secondary" disabled={busy} onClick={pickFolder}>{folder ? '切换文件夹' : '选择记录文件夹'}</button>{folder && <button className={styles.textButton} disabled={busy} onClick={reload}>重新读取</button>}</section>
    <section className={styles.inputPanel} aria-label="方案录入">
      <div className={styles.sectionTitle}><div><h2>{editing ? '编辑已保存方案' : '设定你的计划'}</h2><p>每行一个方案，空行跳过；左右滚动可填写全部字段。</p></div><fieldset className={styles.modeSwitch} disabled={busy}><legend className={styles.srOnly}>录入时间方式</legend>{(['age', 'year'] as const).map(value => <label key={value}><input type="radio" name="timeBasis" value={value} checked={basis === value} onChange={() => { setBasis(value); setRows(previous => previous.map(r => ({ ...r, start: '', withdrawalStart: '', end: '' }))); setErrors({}); setProblem(''); }} /><span>{value === 'age' ? '按年龄' : '按年份'}</span></label>)}</fieldset></div>
      <form ref={form} onSubmit={submit} noValidate>
        <fieldset className={styles.editFieldset} disabled={busy}>
          <div ref={entryScroll} className={styles.tableScroll} tabIndex={0} role="region" aria-label="方案录入列表，可横向滚动"><table className={styles.entryTable}><caption className={styles.srOnly}>养老金方案录入，时间单位{unit(basis)}，金额单位元</caption><thead><tr><th>序号</th>{columns.map(c => <th key={c.key}>{c.title}{['start', 'withdrawalStart', 'end'].includes(c.key) ? `（${basis === 'age' ? '年龄' : '年份'}）` : ''}</th>)}<th>操作</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}><th scope="row">{index + 1}</th>{columns.map(c => {
            const id = `${index}.${c.key}`, error = errors[id];
            return <td key={c.key}><label className={styles.srOnly} htmlFor={id}>{`第 ${index + 1} 行${c.title}`}</label>{c.key === 'type'
              ? <select id={id} name={id} value={row.type} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={e => editCell(index, c.key, e.target.value)}><option value="">请选择</option><option value="bank">银行</option><option value="insurance">保险</option></select>
              : <input id={id} name={id} value={row[c.key]} inputMode={c.mode ?? 'numeric'} autoComplete="off" placeholder={c.key === 'end' && basis === 'age' ? '≤105' : undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={e => editCell(index, c.key, e.target.value)} />}{error && <span id={`${id}-error`} className={styles.cellError}>{error}</span>}</td>;
          })}<td><button type="button" className={styles.iconButton} aria-label={`删除第 ${index + 1} 行`} disabled={rows.length <= 1 || Boolean(editing)} onClick={() => { setRows(previous => previous.filter((_, i) => i !== index)); setErrors({}); }}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>
          <div className={styles.formActions}><button type="button" className={styles.textButton} disabled={Boolean(editing)} onClick={() => setRows(previous => [...previous, emptyEntry()])}><Plus size={15} />添加方案</button><p>年初存入 · 年末领取 · 含结束当年{basis === 'age' ? ' · 最高 105 岁' : ' · 最多 120 年'}</p>{editing && <button type="button" className="button secondary" onClick={() => { setEditing(null); setRows([emptyEntry(), emptyEntry()]); setErrors({}); setProblem(''); }}>取消编辑</button>}<button type="submit" className="button primary">{busy ? '正在保存…' : editing ? '重新测算并保存' : '测算并保存'}</button></div>
        </fieldset>
      </form>
      <div className={styles.rulesStrip}><span><b>银行</b> 从存入第一年起按年复利</span><span><b>保险</b> 存入期不计息，最后存入的下一年起按年复利</span></div>
    </section>
    {problem && !deleting && <p role="alert" className={styles.error}>{problem}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    {shown.length > 0 && <ResultView entries={shown} />}
    <section className={styles.history} aria-label="测算记录"><div className={styles.sectionTitle}><div><span className={styles.eyebrow}>SAVED PLANS</span><h2>测算记录 <small>{file.records.length} 条</small></h2></div><button className={styles.textButton} disabled={busy || !folder} onClick={importLegacy}>导入旧版测算</button></div>
      <div className={styles.searchBar}><label><Search size={16} /><span className={styles.srOnly}>搜索记录</span><input placeholder="搜索方案名称" value={query} onChange={e => setQuery(e.target.value)} /></label><select aria-label="筛选记录类型" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部类型</option><option value="bank">银行</option><option value="insurance">保险</option></select></div>
      {records.length ? <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="测算记录列表，可横向滚动"><table className={styles.historyTable}><caption className={styles.srOnly}>保存在当前文件夹的测算记录</caption><thead><tr>{['类型', '方案名称', '开始存入', '年存入额（元）', '存入年数', '年化率', '领取安排', '保存时间', '操作'].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{records.map(e => {
        const p = e.result.input;
        return <tr key={e.id}><td><span className={p.type === 'bank' ? styles.bankTag : styles.insuranceTag}>{productNames[p.type]}</span></td><th scope="row">{p.name}{e.ruleVersion === 2 && <small className={styles.legacy}>旧版规则</small>}</th><td>{p.start} {unit(p.timeBasis)}</td><td>{formatMoney(p.annualDeposit)}</td><td>{p.depositYears} 年</td><td>{p.rate}%</td><td>{p.withdrawalStart}—{p.end} {unit(p.timeBasis)}<small className={styles.subtext}>每年 {formatMoney(p.annualWithdrawal)} 元</small></td><td>{new Date(e.updatedAt).toLocaleString('zh-CN', { hour12: false })}</td><td><div className={styles.recordActions}><button disabled={busy} onClick={() => setShown([e])}>查看</button><button disabled={busy} onClick={() => beginEdit(e)}>编辑</button><button disabled={busy} onClick={() => { setProblem(''); setDeleting(e); dialog.current?.showModal(); }}>删除</button></div></td></tr>;
      })}</tbody></table></div> : <div className={styles.emptyState}><FolderOpen size={28} /><h3>{file.records.length ? '没有匹配的记录' : '你的下一份计划，从这里开始'}</h3><p>{file.records.length ? '试试其他名称或类型。' : folder ? '填写上方列表并测算，记录会保存在所选文件夹。' : '选择记录文件夹，查看已有方案或保存新的测算。'}</p></div>}
    </section>
    <details className={styles.rules}><summary>了解计算与文件保存规则</summary><p>每年依次计算：年初存入、当年收益、年末领取、年末余额。银行从首年计息；保险存入期间不计息，存完后的下一年对全部本金开始计息，此后收益计入本金逐年复利。存入与领取不在同一年发生。</p><p>年龄按整岁年度周期计算，最高 105 岁；领取包含结束年龄或年份当年。余额不足时仅领取剩余资金，不透支，计划缺口继续记录至结束。年度收益保留到分，正负恰好半分均远离 0 舍入。</p><p>测算成功且文件写入完成后才清空录入区，恢复两个空行。编辑记录会更新原记录；切换时间方式会清空当前行的时间字段，请重新填写。删除记录需要确认。</p><p>记录只写入你选择的文件夹，本工具不会将新记录存入浏览器。刷新后重新选择文件夹读取。备份或跨设备使用时复制记录文件即可。文件夹被撤销访问或文件保存失败时会保留当前录入内容。请使用电脑上的 Edge 或 Chrome 选择文件夹。</p><p>利率均为固定假设。此处的银行和保险仅按指定起息规则模拟，不代表真实保险合同利益，未计入通胀、税费和手续费。</p></details>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="delete-title" onCancel={event => { if (busy) event.preventDefault(); else setDeleting(null); }}><h2 id="delete-title">删除这条测算记录？</h2><p>“{deleting?.result.input.name}”将从记录文件中删除。</p>{problem && <p role="alert" className={styles.error}>{problem}</p>}<div><button className="button secondary" disabled={busy} onClick={() => { dialog.current?.close(); setDeleting(null); }}>保留记录</button><button className="button primary" disabled={busy} onClick={removeRecord}>确认删除</button></div></dialog>
  </div>;
}
