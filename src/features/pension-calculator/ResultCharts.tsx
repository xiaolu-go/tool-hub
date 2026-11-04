import { useEffect, useRef, useState } from 'react';
import { init, use } from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { compactAmount, formatMoney } from '../../lib/format';
import type { EntryResult } from './domain/entries';
import styles from './Calculator.module.css';

use([BarChart, LineChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);
function AnnualChart({ result, balance }: { result: EntryResult; balance: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const title = balance ? '年末余额' : '年度领取';
  const unit = result.input.timeBasis === 'age' ? '岁' : '年';
  const description = `${result.input.name}，${title}，${result.input.start} 至 ${result.input.end} ${unit}，精确数据见年度明细`;
  useEffect(() => {
    let chart: ReturnType<typeof init> | undefined;
    let observer: ResizeObserver | undefined;
    setFailed(false);
    try {
      chart = init(container.current!, undefined, { renderer: 'svg' });
      const records = result.records;
      chart.setOption({
        animation: false, color: ['#28634e', '#b68c54'], aria: { enabled: true, description },
        grid: { left: 12, right: 18, top: 35, bottom: 12, containLabel: true },
        legend: { top: 0, textStyle: { color: '#7a857e', fontSize: 11 } },
        tooltip: { trigger: 'axis', confine: true, renderMode: 'richText', formatter: (raw: unknown) => {
          const index = Array.isArray(raw) ? (raw[0] as { dataIndex: number } | undefined)?.dataIndex : undefined;
          if (index === undefined || !records[index]) return '';
          const r = records[index];
          return `${r.year} ${unit} · ${r.phase}\n${balance ? '年末余额' : '实际领取'}：${formatMoney(balance ? r.closingBalance : r.withdrawal)} 元${balance ? '' : `\n计划领取：${formatMoney(r.plannedWithdrawal)} 元`}`;
        } },
        xAxis: { type: 'category', data: records.map(r => `${r.year}${unit}`), boundaryGap: !balance, axisTick: { show: false }, axisLabel: { hideOverlap: true, color: '#899285', fontSize: 10 } },
        yAxis: { type: 'value', min: 0, axisLabel: { formatter: compactAmount, color: '#899285', fontSize: 10 }, splitLine: { lineStyle: { color: '#edf0e9', type: 'dashed' } } },
        series: [{ name: balance ? '年末余额' : '实际领取', type: balance ? 'line' : 'bar', symbol: 'none', barMaxWidth: 18, data: records.map(r => Number(balance ? r.closingBalance : r.withdrawal)) },
          ...(balance ? [] : [{ name: '计划领取', type: 'line', symbol: 'none', data: records.map(r => Number(r.plannedWithdrawal)), lineStyle: { type: 'dotted', width: 1.5 } }])],
      });
      observer = new ResizeObserver(() => chart?.resize()); observer.observe(container.current!);
    } catch { setFailed(true); }
    return () => { observer?.disconnect(); chart?.dispose(); };
  }, [result, balance, description, unit]);
  return <section className={styles.chartCard}><div className={styles.sectionTitle}><h3>{title}</h3><span>单位：元 · {result.input.timeBasis === 'age' ? '按年龄' : '按年份'}</span></div><div className={styles.chart} ref={container} role="img" aria-label={description} hidden={failed} />{failed && <p>图表暂时无法显示，可继续查看年度明细。</p>}</section>;
}
export default function ResultCharts({ result }: { result: EntryResult }) {
  return <div className={styles.charts}><AnnualChart result={result} balance /><AnnualChart result={result} balance={false} /></div>;
}
