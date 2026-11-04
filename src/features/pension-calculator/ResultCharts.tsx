import { useEffect, useRef, useState } from 'react';
import { init, use } from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { compactAmount, formatMoney } from '../../lib/format';
import type { CalculationResult } from './domain/types';
import { timeLabel, timeUnit } from './domain/time';
import styles from './Calculator.module.css';

use([BarChart, LineChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

function AnnualChart({ result, kind }: { result: CalculationResult; kind: 'balance' | 'withdrawal' }) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const balance = kind === 'balance';
  const title = balance ? '年末余额，看见积累与消耗' : '年度领取，看见每一年的支持';
  const description = `${title}，${result.startYear} 至 ${result.endYear} ${timeUnit(result.input)}，精确数据见年度明细`;
  useEffect(() => {
    let instance: ReturnType<typeof init> | undefined;
    let observer: ResizeObserver | undefined;
    setFailed(false);
    try {
      instance = init(container.current!, undefined, { renderer: 'svg' });
      const records = result.scenarios[0].records;
      const names = result.scenarios.map(s => `方案 ${s.scenario.id} · ${s.scenario.name}`);
      const series = result.scenarios.map((s, i) => ({
        name: names[i], type: balance ? 'line' : 'bar',
        data: s.records.map(r => Number(balance ? r.closingBalance : r.withdrawal)),
        smooth: false, symbol: 'none', barMaxWidth: 16,
        lineStyle: { width: 2.5, type: i === 0 ? 'solid' : 'dashed' },
        itemStyle: { color: i === 0 ? '#28634e' : '#b68c54', borderRadius: [3, 3, 0, 0] },
        areaStyle: balance && i === 0 ? { opacity: .035 } : undefined,
      }));
      instance.setOption({
        animation: false, color: ['#28634e', '#b68c54', '#a2a99f'],
        aria: { enabled: true, description },
        grid: { left: 12, right: 20, top: 48, bottom: 10, containLabel: true },
        legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 7, textStyle: { color: '#7a857e', fontSize: 10, width: 150, overflow: 'truncate' } },
        tooltip: {
          trigger: 'axis', confine: true, renderMode: 'richText',
          formatter: (raw: unknown) => {
            const point = Array.isArray(raw) ? raw[0] as { dataIndex: number } | undefined : undefined;
            if (!point || !records[point.dataIndex]) return '';
            const index = point.dataIndex;
            const row = records[index];
            const lines = result.scenarios.map((s, i) => `${names[i]}：${formatMoney(balance ? s.records[index].closingBalance : s.records[index].withdrawal)} 元`);
            if (!balance) lines.push(`计划领取：${formatMoney(row.plannedWithdrawal)} 元`);
            return `${timeLabel(result.input, row.year)} · ${row.phase}\n${lines.join('\n')}`;
          },
        },
        xAxis: { type: 'category', data: records.map(r => result.input.timeBasis === 'age' ? `${r.year}岁` : String(r.year)), boundaryGap: !balance, axisTick: { show: false }, axisLine: { lineStyle: { color: '#e4e8df' } }, axisLabel: { color: '#899285', fontSize: 10, hideOverlap: true } },
        yAxis: { type: 'value', min: 0, splitNumber: 4, axisLabel: { color: '#899285', fontSize: 10, formatter: compactAmount }, splitLine: { lineStyle: { color: '#edf0e9', type: 'dashed' } } },
        series: balance ? series : [...series, { name: '计划领取', type: 'line', data: records.map(r => Number(r.plannedWithdrawal)), symbol: 'none', lineStyle: { color: '#929a8e', width: 1.5, type: 'dotted' }, itemStyle: { color: '#929a8e' } }],
      });
      observer = new ResizeObserver(() => instance?.resize());
      observer.observe(container.current!);
    } catch { setFailed(true); }
    return () => { observer?.disconnect(); instance?.dispose(); };
  }, [result, balance, title, description]);
  return <section className={styles.chartCard}><div className={styles.chartHeading}><h2>{title}</h2><span>单位：元 · {result.input.timeBasis === 'age' ? '按年龄' : '按年份'}</span></div><div className={styles.chart} ref={container} role="img" aria-label={description} hidden={failed} />{failed && <p className={styles.chartFallback}>图表暂时无法显示，可继续查看下方年度明细。</p>}</section>;
}

export default function ResultCharts({ result }: { result: CalculationResult }) {
  return <><AnnualChart result={result} kind="balance" /><AnnualChart result={result} kind="withdrawal" /></>;
}
