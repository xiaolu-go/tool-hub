import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Calculator, Check, ChevronDown, Info, LockKeyhole, RotateCcw, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Field, SectionHeading } from '../../components/Field';
import { formatMoney } from '../../lib/format';
import { downloadCsv } from '../../lib/csv';
import { browserStorage, clearPlan, restorePlan, savePlan } from '../../lib/storage';
import { calculatePlan } from './domain/calculate';
import { Money, money } from './domain/money';
import { createDefaultDraft, validateDraft } from './domain/validation';
import { timeLabel, timeUnit } from './domain/time';
import type { CalculationResult, PlanDraft, ScenarioResult } from './domain/types';
import styles from './Calculator.module.css';

const ResultCharts = lazy(() => import('./ResultCharts'));

function initialize() {
  const restored = restorePlan(browserStorage());
  return {
    draft: restored.status === 'restored' ? restored.draft : createDefaultDraft(new Date().getFullYear()),
    result: restored.status === 'restored' ? restored.result : null,
    notice: restored.status === 'invalid' ? '已保存的数据无法恢复，请重新设置。' : restored.status === 'restored' ? '已恢复最近一次成功测算的设置。' : '',
  };
}

function ScenarioCard({ item, result }: { item: ScenarioResult; result: CalculationResult }) {
  const { summary: s, scenario } = item;
  let status = '计划结束';
  if (s.depletionYear !== null) status = s.depletionYear < result.input.withdrawalStartYear ? '开始领取前资金已耗尽' : `${timeLabel(result.input, s.depletionYear)}资金耗尽`;
  else if (s.status === 'horizon-reached') status = `截至 ${timeLabel(result.input, result.endYear)}尚未耗尽`;
  const metrics = [
    ['首次领取前资金', s.beforeFirstWithdrawal], ['累计存入', s.totalDeposit],
    ['累计收益', s.totalInterest], ['期末余额', s.endingBalance],
  ];
  return <article className={`${styles.scenarioCard} ${scenario.id === 'B' ? styles.scenarioB : ''}`}>
    <div className={styles.scenarioCardHead}><span className={styles.scenarioLetter}>{scenario.id}</span><h3>{scenario.name}</h3><span>{scenario.annualRate}% <small>/ 年</small></span></div>
    <div className={styles.mainMetric}><span>累计实际领取 <small>元</small></span><strong title={formatMoney(s.totalWithdrawal)}>{formatMoney(s.totalWithdrawal)}</strong></div>
    <dl className={styles.metrics}>{metrics.map(([label, value]) => <div key={label}><dt>{label}<small> 元</small></dt><dd>{formatMoney(value)}</dd></div>)}</dl>
    <div className={styles.yearsMetric}><span>足额领取 <strong>{s.fullWithdrawalYears}</strong> 年</span><span>有领取 <strong>{s.paidYears}</strong> 年</span></div>
    <div className={styles.scenarioStatus}><span><i />{status}</span><p>首次不足额：{s.firstShortfallYear === null ? '测算期内未出现' : timeLabel(result.input, s.firstShortfallYear)}</p></div>
    {s.totalShortfall !== null && <div className={styles.planStatus}>{new Money(s.totalShortfall).isZero() ? <><Check size={13} /> 计划全部足额完成</> : <><Info size={13} /> 计划存在缺口：{formatMoney(s.totalShortfall)} 元</>}</div>}
  </article>;
}

const detailColumns = [
  ['openingBalance', '年初余额'], ['deposit', '当年存入'], ['interest', '当年收益'],
  ['plannedWithdrawal', '计划领取'], ['withdrawal', '实际领取'], ['shortfall', '领取缺口'],
  ['closingBalance', '年末余额'], ['cumulativeDeposit', '累计存入'],
  ['cumulativeWithdrawal', '累计领取'], ['cumulativeInterest', '累计收益'],
] as const;

function Results({ result, dirty }: { result: CalculationResult; dirty: boolean }) {
  const [selected, setSelected] = useState(0);
  const item = result.scenarios[selected];
  const input = result.input;
  return <div className={styles.resultContent}>
    <div className={styles.resultTitle}><div><span className={styles.eyebrow}>YOUR PLAN, YEAR BY YEAR</span><h2>看看未来的不同可能</h2></div><button type="button" className="button secondary" disabled={dirty} onClick={() => downloadCsv(result)}><ArrowDownToLine size={15} />导出明细</button></div>
    {dirty && <div className={styles.dirtyNotice} role="status"><Info size={15} /> 参数已修改，请重新测算。下方仍为上次成功测算的结果。</div>}
    <section className={styles.overview} aria-label="本次测算计划">
      <div><span>存入计划总额</span><strong>{formatMoney(money(new Money(input.annualDeposit).times(input.depositYears)))}<small> 元</small></strong></div>
      <div><span>开始领取</span><strong>{input.withdrawalStartYear}<small> {timeUnit(input)}</small></strong></div>
      <div><span>{input.timeBasis === 'age' ? '测算年龄范围' : '测算时间范围'}</span><strong>{result.startYear} — {result.endYear}<small> {timeUnit(input)}</small></strong></div>
      <p>最后存入 {timeLabel(input, input.startYear + input.depositYears - 1)} · 等待 {input.withdrawalStartYear - input.startYear - input.depositYears} 年 · {input.mode === 'fixed' ? `计划领取 ${input.withdrawalYears} 年${input.timeBasis === 'age' ? '（含结束年龄当年）' : ''}` : '领至耗尽，最多测算 120 年'}</p>
    </section>
    <div className={styles.scenarioGrid}>{result.scenarios.map(s => <ScenarioCard key={s.scenario.id} item={s} result={result} />)}</div>
    <div className={styles.difference}><span>方案差额 <small>B − A</small></span><div>累计领取 <strong>{formatMoney(result.difference.totalWithdrawal, true)} 元</strong></div><div>期末余额 <strong>{formatMoney(result.difference.endingBalance, true)} 元</strong></div><div>足额领取 <strong>{result.difference.fullWithdrawalYears > 0 ? '+' : ''}{result.difference.fullWithdrawalYears} 年</strong></div></div>
    {result.horizonReached && <p className={styles.limitNotice}><Info size={14} /> 已达到 120 年测算上限，“尚未耗尽”不代表可以无限领取。</p>}
    <Suspense fallback={<div className={styles.chartFallback}>正在准备年度图表…</div>}><ResultCharts result={result} /></Suspense>
    <section className={styles.detailCard} aria-labelledby="detail-title">
      <div className={styles.detailHeader}><div><h2 id="detail-title">每一年的资金明细</h2><p>金额单位：元 · 共 {item.records.length} 年</p></div><div className={styles.scenarioSwitch} role="group" aria-label="选择明细方案">{result.scenarios.map((s, i) => <button key={s.scenario.id} type="button" aria-pressed={selected === i} onClick={() => setSelected(i)}>方案 {s.scenario.id}</button>)}</div></div>
      <div className={styles.tableLabel}>当前查看：方案 {item.scenario.id} · {item.scenario.name}</div>
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="年度明细，可横向滚动"><table><caption className={styles.srOnly}>方案 {item.scenario.id} {item.scenario.name} 的年度资金明细，金额单位元</caption><thead><tr><th scope="col">{input.timeBasis === 'age' ? '年龄' : '年份'}</th><th scope="col">阶段</th>{detailColumns.map(([key, title]) => <th scope="col" key={key}>{title}</th>)}</tr></thead><tbody>{item.records.map(r => <tr key={r.year}><th scope="row">{r.year}{input.timeBasis === 'age' ? ' 岁' : ''}</th><td><span className={`${styles.phaseTag} ${r.phase === '领取期' ? styles.withdrawalTag : ''}`}>{r.phase}</span></td>{detailColumns.map(([key]) => <td key={key} className={key === 'closingBalance' ? styles.balanceCell : key === 'shortfall' && new Money(r.shortfall).gt(0) ? styles.shortfallCell : undefined}>{formatMoney(r[key])}</td>)}</tr>)}</tbody></table></div>
      <p className={styles.tableHint}>左右滚动查看全部字段。表格、图表与导出均使用同一组测算结果。</p>
    </section>
  </div>;
}

function Timeline({ draft, endYear }: { draft: PlanDraft; endYear?: number }) {
  const checked = validateDraft(draft);
  if (!checked.ok) return <div className={styles.timelinePlaceholder}>完善参数后，即可预览存入与领取时间线。</div>;
  const p = checked.value;
  const lastDeposit = p.startYear + p.depositYears - 1;
  const wait = p.withdrawalStartYear - lastDeposit - 1;
  const end = p.mode === 'fixed' ? p.withdrawalStartYear + p.withdrawalYears! - 1 : endYear;
  return <div className={styles.timeline} aria-label="计划时间线">
    <div><i /><span>存入 {p.depositYears} 年</span><strong>{p.startYear}—{lastDeposit} {timeUnit(p)}</strong></div>
    <div><i /><span>{wait === 0 ? '无等待期' : `等待 ${wait} 年`}</span><strong>{wait === 0 ? '衔接领取' : `${lastDeposit + 1}—${p.withdrawalStartYear - 1} ${timeUnit(p)}`}</strong></div>
    <div><i /><span>按年领取</span><strong>{p.withdrawalStartYear}—{end ?? '耗尽或上限'} {end ? timeUnit(p) : ''}</strong></div>
  </div>;
}

export default function CalculatorPage() {
  const [initial] = useState(initialize);
  const [draft, setDraft] = useState(initial.draft);
  const [result, setResult] = useState<CalculationResult | null>(initial.result);
  const [notice, setNotice] = useState(initial.notice);
  const [dirty, setDirty] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const resetDialogRef = useRef<HTMLDialogElement>(null);
  const resetButtonRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const validated = useMemo(() => validateDraft(draft), [draft]);
  const errors = attempted && !validated.ok ? validated.errors : {};

  function edit(key: keyof Omit<PlanDraft, 'scenarios'>, value: string) {
    setDraft(previous => ({ ...previous, [key]: value }));
    setDirty(true);
  }
  function editScenario(index: number, key: 'name' | 'annualRate', value: string) {
    setDraft(previous => ({ ...previous, scenarios: previous.scenarios.map((s, i) => i === index ? { ...s, [key]: value } : s) as PlanDraft['scenarios'] }));
    setDirty(true);
  }
  function switchTimeBasis(timeBasis: PlanDraft['timeBasis']) {
    setDraft(previous => {
      const defaults = createDefaultDraft(new Date().getFullYear());
      return {
        ...previous, timeBasis,
        startYear: previous.startYear || defaults.startYear,
        withdrawalStartYear: previous.withdrawalStartYear || defaults.withdrawalStartYear,
        withdrawalYears: previous.withdrawalYears || defaults.withdrawalYears,
      };
    });
    setDirty(true);
    setAttempted(false);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (!validated.ok) {
      const element = formRef.current?.elements.namedItem(Object.keys(validated.errors)[0]);
      if (element instanceof HTMLElement) element.focus();
      return;
    }
    try {
      const calculated = calculatePlan(validated.value);
      setResult(calculated);
      setDirty(false);
      const saved = savePlan(browserStorage(), calculated.input, new Date().toISOString());
      setNotice(saved ? '测算已更新，设置已保存在当前浏览器。' : '测算已完成。本次设置未能保存到浏览器。');
      if (window.matchMedia('(max-width: 900px)').matches) {
        requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }));
      }
    } catch {
      setDirty(true);
      setNotice('本次测算未能完成，请检查参数后重试。上次成功结果已保留。');
    }
  }
  function closeReset() {
    resetDialogRef.current?.close();
    setResetOpen(false);
    resetButtonRef.current?.focus();
  }
  function reset() {
    const cleared = clearPlan(browserStorage());
    setDraft(createDefaultDraft(new Date().getFullYear()));
    setResult(null); setDirty(false); setAttempted(false);
    setNotice(cleared ? '已恢复默认设置。' : '已恢复默认输入，但浏览器保存的数据未能清除，刷新后可能恢复旧设置。');
    closeReset();
  }
  function openReset() {
    setResetOpen(true);
    resetDialogRef.current?.showModal();
  }
  return <div className={styles.page}>
    <Link className={styles.backLink} to="/"><ArrowLeft size={13} />返回工具首页</Link>
    <div className={styles.pageHeading}><div><span className={styles.eyebrow}><span /> PENSION PLANNER</span><h1>养老金资金计算器</h1><p>用同一份存领计划，比较两种收益假设。让未来每一年的资金安排更清晰。</p></div><span className={styles.modelBadge}><Calculator size={14} />年度假设测算</span></div>
    <div className={styles.workspace}>
      <aside className={styles.inputPanel} aria-label="测算参数"><form ref={formRef} onSubmit={submit} noValidate>
        <div className={styles.inputHeading}><SlidersHorizontal size={16} /><h2>设定你的计划</h2><span>两方案共用</span></div>
        <section className={styles.formSection}>
          <fieldset className={styles.basisField}><legend className={styles.srOnly}>计划时间方式</legend><div className={styles.modeOptions}>
            <label><input type="radio" name="timeBasis" value="year" checked={draft.timeBasis === 'year'} onChange={() => switchTimeBasis('year')} /><span>按年份</span></label>
            <label><input type="radio" name="timeBasis" value="age" checked={draft.timeBasis === 'age'} onChange={() => switchTimeBasis('age')} /><span>按年龄</span></label>
          </div></fieldset>
          <div className={styles.formGrid}>
            <Field name="annualDeposit" label="每年存入金额" value={draft.annualDeposit} onChange={v => edit('annualDeposit', v)} unit="元" inputMode="decimal" error={errors.annualDeposit} />
            <Field name="annualWithdrawal" label="每年计划领取金额" value={draft.annualWithdrawal} onChange={v => edit('annualWithdrawal', v)} unit="元" inputMode="decimal" error={errors.annualWithdrawal} />
            {draft.timeBasis === 'age'
              ? <Field name="startAge" label="开始存入年龄" value={draft.startAge} onChange={v => edit('startAge', v)} unit="岁" error={errors.startAge} />
              : <Field name="startYear" label="测算起始年份" value={draft.startYear} onChange={v => edit('startYear', v)} unit="年" error={errors.startYear} />}
            <Field name="depositYears" label="存入年数" value={draft.depositYears} onChange={v => edit('depositYears', v)} unit="年" error={errors.depositYears} />
            {draft.timeBasis === 'age' ? <>
              <Field name="withdrawalStartAge" label="开始领取年龄" value={draft.withdrawalStartAge} onChange={v => edit('withdrawalStartAge', v)} unit="岁" error={errors.withdrawalStartAge} />
              <Field name="withdrawalEndAge" label="领取结束年龄" value={draft.withdrawalEndAge} onChange={v => edit('withdrawalEndAge', v)} unit="岁" error={errors.withdrawalEndAge} />
            </> : <>
              <Field name="withdrawalStartYear" label="开始领取年份" value={draft.withdrawalStartYear} onChange={v => edit('withdrawalStartYear', v)} unit="年" error={errors.withdrawalStartYear} />
              {draft.mode === 'fixed' && <Field name="withdrawalYears" label="计划领取年数" value={draft.withdrawalYears} onChange={v => edit('withdrawalYears', v)} unit="年" error={errors.withdrawalYears} />}
            </>}
          </div>
          {draft.timeBasis === 'year' && <fieldset className={styles.modeField}><legend className={styles.srOnly}>领取方式</legend><div className={styles.modeOptions}>
            <label><input type="radio" name="mode" value="fixed" checked={draft.mode === 'fixed'} onChange={() => edit('mode', 'fixed')} /><span>指定年数</span></label>
            <label><input type="radio" name="mode" value="until-depleted" checked={draft.mode === 'until-depleted'} onChange={() => edit('mode', 'until-depleted')} /><span>领至耗尽</span></label>
          </div></fieldset>}
          <p className={styles.sharedHint}>年初存入 · 年末领取 · {draft.timeBasis === 'age' ? '含结束年龄当年，最高 105 岁' : draft.mode === 'fixed' ? '存入与领取分年进行' : '最多测算 120 年'}</p>
        </section>
        <section className={`${styles.formSection} ${styles.compareSection}`}>
          <SectionHeading title="方案对比" /><p className={styles.scenarioIntro}>上方计划只填一次，下面仅设置名称和利率</p>
          {draft.scenarios.map((s, i) => <div key={s.id} className={`${styles.scenarioRow} ${i === 1 ? styles.scenarioRowB : ''}`}>
            <span className={styles.rowLetter} aria-hidden="true">{s.id}</span>
            <Field name={`scenarios.${i}.name`} label={`方案 ${s.id} 名称`} shortLabel="名称" value={s.name} inputMode="text" onChange={v => editScenario(i, 'name', v)} error={errors[`scenarios.${i}.name`]} />
            <Field name={`scenarios.${i}.annualRate`} label={`方案 ${s.id} 假设年收益率`} shortLabel="年收益率" value={s.annualRate} inputMode="decimal" unit="%" onChange={v => editScenario(i, 'annualRate', v)} error={errors[`scenarios.${i}.annualRate`]} />
          </div>)}
          <p className={styles.inlineHelp}><Info size={12} /> 利率为固定假设，默认值仅用于演示。</p>
        </section>
        <div className={styles.formBottom}><Timeline draft={draft} endYear={!dirty ? result?.endYear : undefined} />
          {attempted && !validated.ok && <p role="alert" className={styles.formError}>{errors.form ?? '请修正上方参数后再测算。'}</p>}
          <button type="submit" className={`button primary ${styles.calculateButton}`}><Sparkles size={16} />开始测算<ArrowRight size={16} /></button>
          <button type="button" ref={resetButtonRef} onClick={openReset} className={styles.resetButton}><RotateCcw size={12} />恢复默认</button>
          <span className={styles.storageNote}><LockKeyhole size={11} /> 设置保存在当前浏览器，清理后可能丢失</span>
        </div>
      </form></aside>
      <div ref={resultRef} className={styles.results} aria-label="测算结果">
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        {result ? <Results result={result} dirty={dirty} /> : <div className={styles.emptyState}><span className={styles.emptyIcon}><Calculator size={32} strokeWidth={1.4} /></span><span className={styles.eyebrow}>A CLEARER TOMORROW</span><h2>未来，从一份计划开始</h2><p>设置参数后开始测算。<br />这里会呈现两种方案的资金变化与年度明细。</p><div><span><Check size={13} /> 同条件对比</span><span><Check size={13} /> 精确到分</span><span><Check size={13} /> 逐年看明细</span></div><span className={styles.emptyLine} /><p className={styles.emptyFootnote}>先设定每年的存入与领取，再看看不同收益假设会带来怎样的变化。</p></div>}
        <details className={styles.rules}><summary><span><Info size={15} />了解本工具的计算规则</span><ChevronDown size={15} /></summary><div><p>每年按“年初余额 → 年初存入 → 当年收益 → 年末领取 → 年末余额”的顺序计算。初始余额为 0，存入与领取不在同一年发生，等待期间继续计算收益。</p><p>年度收益按分舍入，正负恰好半分时均远离 0 舍入。余额不足时领取剩余金额，不透支；“足额领取年数”不包含最后一笔不足额领取。</p><p>每个方案全程使用固定的假设年收益率。银行与保险仅是方案名称，本工具不模拟真实保险合同现金价值、终身年金或保证利益，也未计入通胀、税费和手续费。</p><p>按年龄模式将整岁视为年度周期，最高 105 岁，包含结束年龄当年的领取。存入与领取年龄不能重叠。按年份的领至耗尽模式最多测算 120 年。首次不足额年份仅描述本次共同时间轴中已计算的年份；到达上限尚未耗尽，不代表可以无限领取。</p></div></details>
      </div>
    </div>
    <dialog ref={resetDialogRef} className={styles.dialog} aria-labelledby="reset-title" aria-describedby="reset-description" onCancel={e => { e.preventDefault(); closeReset(); }} onClose={() => setResetOpen(false)}><h2 id="reset-title">恢复默认设置？</h2><p id="reset-description">将清除本工具保存的测算设置和当前结果。其他工具的数据不受影响。</p><div><button type="button" className="button secondary" autoFocus onClick={closeReset}>保留设置</button><button type="button" className="button primary" onClick={reset}>确认恢复</button></div>{resetOpen && <span className={styles.srOnly}>按 Escape 可取消</span>}</dialog>
  </div>;
}
