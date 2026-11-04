import { Suspense, useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router';
import { ArrowLeft, ArrowUpRight, BarChart3, Check, ChevronRight, Leaf, LockKeyhole, Sparkles } from 'lucide-react';
import { tools } from '../features/registry';
import styles from './App.module.css';

function HomePage() {
  return <div className={styles.home}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}><span /> 为未来，多想一步</span>
        <h1>把生活的计划，<br />变成<span>看得见的未来。</span></h1>
        <p>简单、专注的个人工具。梳理当下，测算未来，<br className={styles.desktopBreak} />让每一个关于资金的决定，都多一份清晰。</p>
        <Link to={tools[0].path!} className="button primary">开始养老金测算 <ArrowUpRight size={17} /></Link>
        <span className={styles.heroNote}><LockKeyhole size={13} /> 无需注册 · 设置保存在当前浏览器</span>
      </div>
      <div className={styles.illustration} aria-label="年度资金规划示意图">
        <div className={styles.miniTop}><span className={styles.miniIcon}><BarChart3 size={20} /></span><div><strong>为从容的退休生活</strong><span>从一份清晰的计划开始</span></div><span className={styles.demoTag}>规划示意</span></div>
        <div className={styles.miniLegend}><span><i /> 持续积累</span><span><i /> 按年领取</span></div>
        <svg viewBox="0 0 380 170" fill="none" role="img" aria-label="资金先积累、后逐年领取的示意曲线">
          <defs><linearGradient id="home-area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#78a58a" stopOpacity=".25" /><stop offset="1" stopColor="#78a58a" stopOpacity="0" /></linearGradient></defs>
          {[35, 80, 125].map(y => <path key={y} d={`M5 ${y}H375`} stroke="#e2e9df" strokeDasharray="4 5" />)}
          <path d="M8 139L45 128L83 111L121 89L159 61L197 27L235 44L273 65L311 89L370 127V155H8Z" fill="url(#home-area)" />
          <path d="M8 139L45 128L83 111L121 89L159 61L197 27" stroke="#23644e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M197 27L235 44L273 65L311 89L370 127" stroke="#bc9158" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="197" cy="27" r="6" fill="#23644e" stroke="white" strokeWidth="3" />
          <text x="5" y="168" fill="#7a877e" fontSize="10">开始存入</text><text x="170" y="168" fill="#7a877e" fontSize="10">开始领取</text><text x="328" y="168" fill="#7a877e" fontSize="10">未来年份</text>
        </svg>
        <div className={styles.miniBottom}><Check size={14} /> 每一年，都有迹可循 <span>存入 → 等待 → 领取</span></div>
        <div className={styles.floatingLeaf}><Leaf size={22} /></div>
      </div>
    </section>
    <section className={styles.toolsSection} aria-labelledby="tools-title">
      <div className={styles.toolsHeading}><div><span className={styles.smallLabel}>YOUR EVERYDAY TOOLS</span><h2 id="tools-title">你的工具箱</h2></div><p>从一个小工具，开始一份好计划</p></div>
      <div className={styles.toolGrid}>{tools.map(tool => {
        const Icon = tool.icon;
        const content = <><div className={styles.cardTop}><span className={`${styles.toolIcon} ${tool.status === 'planned' ? styles.plannedIcon : ''}`}><Icon size={25} strokeWidth={1.6} /></span><span className={`${styles.badge} ${tool.status === 'planned' ? styles.plannedBadge : ''}`}>{tool.status === 'available' ? '可使用' : '规划中'}</span></div><h3>{tool.name}</h3><p>{tool.description}</p><div className={styles.cardBottom}><div>{tool.tags.map(tag => <span key={tag}>{tag}</span>)}</div>{tool.status === 'available' ? <span className={styles.openTool}>打开工具 <ArrowUpRight size={16} /></span> : <span className={styles.soon}>敬请期待</span>}</div></>;
        return tool.status === 'available' ? <Link className={`${styles.toolCard} ${styles.availableCard}`} key={tool.id} to={tool.path!}>{content}</Link> : <article className={styles.toolCard} key={tool.id}>{content}</article>;
      })}</div>
    </section>
    <section className={styles.principles} aria-label="使用步骤">
      {[['01', '设定你的计划', '从真实的目标和自己的节奏出发'], ['02', '比较不同可能', '让假设变得直观，让选择更清晰'], ['03', '看清每一年', '用年度明细，理解资金如何变化']].map(([number, title, text]) => <div key={number}><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></div>)}
    </section>
  </div>;
}

function NotFoundPage() {
  return <section className={styles.notFound}><span className={styles.eyebrow}>404 · 页面未找到</span><h1>这个工具还不在工具箱里</h1><p>回到首页，看看已经准备好的工具。</p><Link className="button primary" to="/"><ArrowLeft size={16} /> 返回首页</Link></section>;
}

export function App() {
  const location = useLocation();
  useEffect(() => {
    const tool = tools.find(t => t.path === location.pathname);
    document.title = `${tool?.name ?? (location.pathname === '/' ? '个人工具集' : '页面未找到')} · tool-hub`;
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return <>
    <a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>跳至主要内容</a>
    <header className={styles.header}><div className={styles.headerInner}>
      <Link className={styles.brand} to="/" aria-label="tool-hub 首页"><span className={styles.brandMark}><BarChart3 size={21} /></span><strong>tool-hub</strong><span className={styles.brandDivider} /><span className={styles.brandCaption}>个人工具集</span></Link>
      <nav aria-label="主导航"><NavLink end to="/" className={({ isActive }) => isActive ? styles.activeNav : ''}>工具首页</NavLink><NavLink to={tools[0].path!} className={({ isActive }) => isActive ? styles.activeNav : ''}>养老金测算 <ChevronRight size={12} /></NavLink></nav>
    </div></header>
    <main id="main-content" tabIndex={-1} className={styles.main}><Suspense fallback={<div className={styles.loading} role="status"><Sparkles size={20} /> 正在打开工具…</div>}><Routes>
      <Route path="/" element={<HomePage />} />
      {tools.filter(t => t.status === 'available').map(tool => {
        const Component = tool.component!;
        return <Route key={tool.id} path={tool.path!} element={<Component />} />;
      })}
      <Route path="*" element={<NotFoundPage />} />
    </Routes></Suspense></main>
    <footer className={styles.footer}><span><Leaf size={14} /> 小工具，让生活更有计划。</span><span>tool-hub <i /> 为自己的未来，认真做打算</span></footer>
  </>;
}
