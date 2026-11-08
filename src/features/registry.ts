import { lazy } from 'react';
import { ChartNoAxesCombined, ImagePlus, NotebookPen } from 'lucide-react';

export const tools = [
  {
    id: 'pension-calculator', name: '养老金资金计算器',
    description: '把今天的积累，变成明天的从容。比较不同收益假设，看清每一年的存入、领取与余额。',
    icon: ChartNoAxesCombined, status: 'available' as const, path: '/tools/pension-calculator',
    component: lazy(() => import('./pension-calculator/CalculatorPage')),
    tags: ['年度测算', '方案记录'],
  },
  {
    id: 'image-editor', name: '图片处理',
    description: '裁剪、缩放、旋转和转换图片格式，添加预设或自定义水印。本地处理，轻松下载。',
    icon: ImagePlus, status: 'available' as const, path: '/tools/image-editor',
    component: lazy(() => import('./image-editor/ImageEditorPage')),
    tags: ['基础编辑', '文字水印'],
  },
  {
    id: 'income-planner', name: '收支规划',
    description: '梳理收入与支出，记录生活的每一份收获，为未来的资金安排留出空间。',
    icon: NotebookPen, status: 'planned' as const, path: null, component: null,
    tags: ['年度收支', '未来规划'],
  },
];
