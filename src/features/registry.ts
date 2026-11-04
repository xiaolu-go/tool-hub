import { lazy } from 'react';
import { ChartNoAxesCombined, NotebookPen } from 'lucide-react';

export const tools = [
  {
    id: 'pension-calculator', name: '养老金资金计算器',
    description: '把今天的积累，变成明天的从容。比较不同收益假设，看清每一年的存入、领取与余额。',
    icon: ChartNoAxesCombined, status: 'available' as const, path: '/tools/pension-calculator',
    component: lazy(() => import('./pension-calculator/CalculatorPage')),
    tags: ['年度测算', '方案记录'],
  },
  {
    id: 'income-planner', name: '收支规划',
    description: '梳理收入与支出，记录生活的每一份收获，为未来的资金安排留出空间。',
    icon: NotebookPen, status: 'planned' as const, path: null, component: null,
    tags: ['年度收支', '未来规划'],
  },
];
