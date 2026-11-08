import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { ArrowDownToLine, ArrowLeft, ImagePlus, LockKeyhole, RotateCcw, RotateCw } from 'lucide-react';
import { builtinPresets, createDraft, downloadName, outputSize, parsePresets, positions, PRESETS_KEY, proportionalSize, validateDraft, type EditorDraft, type ImageFormat } from './domain';
import { encodeImage, loadImage, renderImage } from './render';
import styles from './ImageEditor.module.css';

const initialDraft = createDraft({ width: 1200, height: 800 });
const message = (error: unknown) => error instanceof Error ? error.message : '操作未完成，请重试。';
const fileSize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
function readPresets() {
  try { return parsePresets(localStorage.getItem(PRESETS_KEY)); } catch { return []; }
}

export default function ImageEditorPage() {
  const [source, setSource] = useState<{ image: HTMLImageElement; file: File } | null>(null);
  const [draft, setDraft] = useState<EditorDraft>(initialDraft);
  const [locked, setLocked] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; url: string; key: string; image: HTMLImageElement } | null>(null);
  const [problem, setProblem] = useState('');
  const [renderProblem, setRenderProblem] = useState('');
  const [notice, setNotice] = useState('');
  const [presets, setPresets] = useState(readPresets);
  const canvas = useRef<HTMLCanvasElement>(null);
  const request = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const watermarkInput = useRef<HTMLInputElement>(null);
  const size = useMemo(() => source ? { width: source.image.naturalWidth, height: source.image.naturalHeight } : null, [source]);
  const checked = useMemo(() => size ? validateDraft(draft, size) : null, [draft, size]);
  const key = JSON.stringify(draft);
  const ready = !!source && !!checked?.options && result?.key === key && result?.image === source.image && !loading && !renderProblem;
  const dimensions = checked?.options ? outputSize(checked.options) : null;

  useEffect(() => () => { request.current++; }, []);
  useEffect(() => {
    setResult(null); setRenderProblem('');
    if (!source || !checked?.options) return;
    let active = true;
    let url: string | undefined;
    const options = checked.options;
    const timeout = window.setTimeout(async () => {
      try {
        if (!canvas.current) return;
        renderImage(canvas.current, source.image, options);
        const blob = await encodeImage(canvas.current, options);
        if (!active) return;
        url = URL.createObjectURL(blob);
        setResult({ blob, url, key, image: source.image });
      } catch (error) { if (active) setRenderProblem(message(error)); }
    }, 160);
    return () => { active = false; window.clearTimeout(timeout); if (url) URL.revokeObjectURL(url); };
  }, [source, checked, key]);

  function change<K extends keyof EditorDraft>(field: K, value: EditorDraft[K]) {
    setDraft(current => ({ ...current, [field]: value })); setNotice('');
  }
  async function selectFile(file?: File) {
    if (!file) return;
    const token = ++request.current;
    setLoading(true); setProblem(''); setNotice('');
    try {
      const image = await loadImage(file);
      if (token !== request.current) return;
      setSource({ image, file }); setDraft(createDraft({ width: image.naturalWidth, height: image.naturalHeight })); setLocked(true);
    } catch (error) { if (token === request.current) setProblem(message(error)); }
    finally { if (token === request.current) setLoading(false); }
  }
  function fileChange(event: ChangeEvent<HTMLInputElement>) {
    void selectFile(event.target.files?.[0]); event.target.value = '';
  }
  function resize(field: 'width' | 'height', value: string) {
    setDraft(current => {
      const next = { ...current, [field]: value };
      const ratio = Number(current.cropHeight) / Number(current.cropWidth);
      if (locked) next[field === 'width' ? 'height' : 'width'] = proportionalSize(value, field === 'width' ? ratio : 1 / ratio);
      return next;
    }); setNotice('');
  }
  function crop(field: 'x' | 'y' | 'cropWidth' | 'cropHeight', value: string) {
    setDraft(current => {
      const next = { ...current, [field]: value };
      if (locked && (field === 'cropWidth' || field === 'cropHeight')) {
        next.width = next.cropWidth; next.height = next.cropHeight;
      }
      return next;
    }); setNotice('');
  }
  function toggleLock(enabled: boolean) {
    setLocked(enabled);
    if (enabled) setDraft(current => ({ ...current, height: proportionalSize(current.width, Number(current.cropHeight) / Number(current.cropWidth)) }));
    setNotice('');
  }
  function savePresets(next: string[]) {
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next)); setPresets(next);
      setProblem(''); setNotice('常用文案已更新，保存在当前浏览器。');
    } catch { setProblem('浏览器无法保存常用文案，仍可使用自定义水印。'); }
  }
  function savePreset() {
    const text = draft.text.trim();
    const valid = validateDraft({ ...draft, watermark: true }, size!).errors.text;
    if (valid) { setProblem(valid); return; }
    if ([...builtinPresets, ...presets].includes(text)) { setNotice('这条文案已在预设中。'); return; }
    if (presets.length >= 10) { setProblem('最多保存 10 条常用文案，请先删除一条。'); return; }
    savePresets([...presets, text]);
  }
  function numberField(field: keyof EditorDraft, label: string, onChange: (value: string) => void, min = 0, max = 8192) {
    return <label className={styles.field}>{label}<input aria-label={label} type="number" min={min} max={max} step="1" inputMode="numeric" value={String(draft[field])} onChange={event => onChange(event.target.value)} aria-invalid={!!checked?.errors[field]} aria-describedby={checked?.errors[field] ? `image-${field}-error` : undefined} />{checked?.errors[field] && <span id={`image-${field}-error`} className={styles.fieldError}>{checked.errors[field]}</span>}</label>;
  }
  function reset() {
    if (!size) return;
    setDraft(createDraft(size)); setLocked(true); setProblem(''); setNotice('已恢复原图和默认设置。');
  }

  return <div className={styles.page}>
    <Link className={styles.back} to="/"><ArrowLeft size={14} /> 返回工具首页</Link>
    <div className={styles.heading}><div><span className={styles.eyebrow}>MAKE IT YOURS</span><h1>图片处理</h1><p>裁剪、调整、加水印，让每一张图片恰到好处。</p></div><span className={styles.privacy}><LockKeyhole size={14} /> 图片仅在本地处理</span></div>
    <section className={styles.upload} aria-label="选择图片" onDragOver={event => { event.preventDefault(); }} onDrop={event => { event.preventDefault(); void selectFile(event.dataTransfer.files[0]); }}>
      <span className={styles.uploadIcon}><ImagePlus size={25} /></span>
      <div><strong>{source ? source.file.name : '从一张图片开始'}</strong><p>{source ? `${size!.width} × ${size!.height} 像素 · ${fileSize(source.file.size)} · 可拖入新图片替换` : '点击选择或拖入图片 · PNG / JPEG / WebP · 最大 25 MB'}</p><p>原图与输出均限每边 8192 像素、总计 1600 万像素。一次处理一张，动图仅导出静态画面。</p></div>
      <input ref={input} className={styles.fileInput} type="file" aria-label="上传图片" accept="image/png,image/jpeg,image/webp" onChange={fileChange} />
      <button className="button primary" disabled={loading} onClick={() => input.current?.click()}>{loading ? '正在读取…' : source ? '更换图片' : '选择图片'}</button>
    </section>
    {problem && <p role="alert" className={styles.error}>{problem}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {source ? <div className={styles.workspace}>
      <div className={styles.controls}>
        <fieldset disabled={loading} className={styles.settings}>
          <legend>编辑图片</legend>
          <section className={styles.panel} aria-labelledby="image-basic"><h2 id="image-basic"><span>01</span> 基础处理</h2>
            <h3>裁剪区域 <small>以原图左上角为起点，单位像素</small></h3>
            <div className={styles.grid}>{numberField('x', '左侧起点', value => crop('x', value))}{numberField('y', '顶部起点', value => crop('y', value))}{numberField('cropWidth', '裁剪宽度', value => crop('cropWidth', value), 1)}{numberField('cropHeight', '裁剪高度', value => crop('cropHeight', value), 1)}</div>
            <h3>调整尺寸 <small>旋转前，单位像素</small></h3>
            <div className={styles.grid}>{numberField('width', '输出宽度', value => resize('width', value), 1)}{numberField('height', '输出高度', value => resize('height', value), 1)}</div>
            <label className={styles.check}><input type="checkbox" checked={locked} onChange={event => toggleLock(event.target.checked)} /> 锁定裁剪比例</label>
            <div className={styles.actions}><button className="button secondary" onClick={() => change('rotation', (draft.rotation + 90) % 360)}><RotateCw size={14} /> 顺时针 90°</button><button className="button secondary" aria-pressed={draft.flipX} onClick={() => change('flipX', !draft.flipX)}>水平翻转</button><button className="button secondary" aria-pressed={draft.flipY} onClick={() => change('flipY', !draft.flipY)}>垂直翻转</button></div>
            <p className={styles.hint}>当前旋转 {draft.rotation}°；先裁剪、缩放，再按原图方向翻转、旋转。</p>
          </section>
          <section className={styles.panel} aria-labelledby="image-watermark"><div className={styles.panelTitle}><h2 id="image-watermark"><span>02</span> 文字水印</h2><label className={styles.check}><input type="checkbox" checked={draft.watermark} onChange={event => change('watermark', event.target.checked)} /> 启用水印</label></div>
            <fieldset className={styles.watermarkFields} disabled={!draft.watermark}><legend>水印设置</legend>
              <label className={styles.field}>预设文案<select aria-label="预设文案" value={[...builtinPresets, ...presets].includes(draft.text) ? draft.text : ''} onChange={event => { change('text', event.target.value); if (!event.target.value) watermarkInput.current?.focus(); }}><option value="">自定义文案</option><optgroup label="内置预设">{builtinPresets.map(text => <option key={text}>{text}</option>)}</optgroup>{presets.length > 0 && <optgroup label="我的常用文案">{presets.map(text => <option key={text}>{text}</option>)}</optgroup>}</select></label>
              <label className={styles.field}>水印内容<input ref={watermarkInput} aria-label="水印内容" type="text" value={draft.text} maxLength={160} onChange={event => change('text', event.target.value)} aria-invalid={!!checked?.errors.text} aria-describedby={checked?.errors.text ? 'image-text-error' : 'image-text-hint'} />{checked?.errors.text ? <span id="image-text-error" className={styles.fieldError}>{checked.errors.text}</span> : <small id="image-text-hint">最多 80 个字符，支持中文；过长时自动缩小以适应图片。</small>}</label>
              <div className={styles.actions}><button className="button secondary" onClick={savePreset}>保存为常用文案</button>{presets.includes(draft.text) && <button className="button secondary" onClick={() => savePresets(presets.filter(text => text !== draft.text))}>删除此常用文案</button>}</div>
              <p className={styles.hint}>仅主动保存的常用文案留在当前浏览器，图片和编辑记录不保存。</p>
              <div className={styles.grid}><label className={styles.field}>水印位置<select aria-label="水印位置" value={draft.position} onChange={event => change('position', event.target.value as EditorDraft['position'])}>{positions.map(position => <option key={position.value} value={position.value}>{position.label}</option>)}</select></label>{numberField('fontSize', '字号（像素）', value => change('fontSize', value), 8, 200)}<label className={styles.field}>水印颜色<input aria-label="水印颜色" type="color" value={draft.color} onChange={event => change('color', event.target.value)} /></label><label className={styles.field}>不透明度 {draft.opacity}%<input aria-label="不透明度" type="range" min="1" max="100" value={draft.opacity} onChange={event => change('opacity', Number(event.target.value))} /></label></div>
            </fieldset>
          </section>
          <section className={styles.panel} aria-labelledby="image-export"><h2 id="image-export"><span>03</span> 格式与质量</h2>
            <div className={styles.grid}><label className={styles.field}>输出格式<select aria-label="输出格式" value={draft.format} onChange={event => change('format', event.target.value as ImageFormat)}><option value="png">PNG · 无损 / 支持透明</option><option value="jpeg">JPEG · 适合照片</option><option value="webp">WebP · 兼顾体积与透明</option></select></label>{draft.format === 'jpeg' && <label className={styles.field}>透明区域填充<input aria-label="透明区域填充" type="color" value={draft.background} onChange={event => change('background', event.target.value)} /></label>}</div>
            {draft.format !== 'png' && <label className={styles.field}>图片质量 {draft.quality}%<input aria-label="图片质量" type="range" min="1" max="100" value={draft.quality} onChange={event => change('quality', Number(event.target.value))} /><small>降低质量可减小文件；实际大小取决于图片内容。</small></label>}
            <p className={styles.hint}>PNG 为无损格式。重新编码不保留原文件的 EXIF 等元数据。</p>
          </section>
        </fieldset>
      </div>
      <section className={styles.preview} aria-labelledby="image-preview"><div className={styles.previewHeader}><div><span className={styles.eyebrow}>LIVE PREVIEW</span><h2 id="image-preview">效果预览</h2></div><button className="button secondary" disabled={loading} onClick={reset}><RotateCcw size={14} /> 重置</button></div>
        <div className={styles.canvasWrap} aria-busy={!ready}><canvas ref={canvas} role="img" aria-label="处理后的图片预览" hidden />{ready ? <img className={styles.previewImage} src={result!.url} alt="处理后的图片效果" /> : <p role="status">{renderProblem ? '预览未完成' : checked?.options ? '正在生成预览…' : '请先修正左侧参数'}</p>}</div>
        {renderProblem && <p role="alert" className={styles.error}>{renderProblem}</p>}
        <div className={styles.outputInfo}><span>输出尺寸<strong>{dimensions ? `${dimensions.width} × ${dimensions.height} 像素` : '待修正'}</strong></span><span>预计文件大小<strong>{ready ? fileSize(result!.blob.size) : '等待预览'}</strong></span></div>
        {ready ? <a className={`button primary ${styles.download}`} href={result!.url} download={downloadName(source.file.name, draft.format)} onClick={() => setNotice('已发起图片下载，请在浏览器下载列表中查看。')}><ArrowDownToLine size={17} /> 下载图片</a> : <button className={`button primary ${styles.download}`} disabled><ArrowDownToLine size={17} /> 下载图片</button>}
        <p className={styles.hint}>下载文件与预览使用同一份图片。原文件保持不变，下载位置由浏览器设置决定。</p>
      </section>
    </div> : <div className={styles.empty}><ImagePlus size={45} strokeWidth={1} /><h2>你的图片，你来做主</h2><p>选择图片后即可调整尺寸、裁剪、旋转与添加水印。<br />实时查看效果，满意后下载。</p><div><span>裁剪与缩放</span><span>旋转与翻转</span><span>预设与自定义水印</span></div></div>}
  </div>;
}
