import {useEffect, useRef, useState} from 'react';
import {
  adjustPortrait, bindImage, editDescription, editStature, editStyles, exportWork, imageUrl, installSharp, loadWork, removeImage, setBookInfo, setPrompt,
  type Asset, type AssetImage, type Bound, type Category, type Crop, type Flip, type WorkDetail, type ExportImages,
} from './api';
import {Hint, Segmented, Switch} from './controls';
import {GenerateControls, GenerationBar, GenerationInfo, QueuePanel, presetOf} from './Generation';
import {loadImagePresets, type ImagePreset} from './api';
import {presetName} from '../production/image-presets.js';
import {chosenPrompt} from '../production/prompt-formats.js';
import {STATURE_RANGE} from '../core/variants.js';
import {isPortraitShape} from '../reader/portrait-shape.js';
import {text} from './text';

const CATS: Category[] = ['cover', 'ambient', 'location', 'character', 'cg', 'cutin'];
// People and places keep their names under the spoiler fog; scenes and objects may give the plot away.
const NAMED: Category[] = ['location', 'character'];
type Step = 'cats' | 'titles' | 'asset';
const shortChapter = (title: string) => title.split(/\s/)[0];
const ratioValue = (ratio: string) => {const [w, h] = ratio.split(':').map(Number);return w / h;};
// The avatar square the player cuts when none is saved, as portraitAvatarCrop in the reader: head and shoulders from a
// little above the hair to about the collarbone, a tall portrait taken as a standard cowboy shot (hair at 4%, head 20%
// of the height).
function avatarCrop({width, height, crop}: Bound): Crop {
  if (crop) return crop;
  if (height <= width) return {x: (width - height) / 2, y: 0, size: height};
  const span = .2 * height, size = Math.min(width, span * 5 / 3);
  return {x: (width - size) / 2, y: Math.max(0, .04 * height - span * .2), size};
}

/* One work's images, laid out like a file browser: categories, then the titles in one, then the picture with its
 * prompts. Changes go to the director project at once; text edits are saved with their own buttons. */
export function WorkPage({id, onBack}: {id: string; onBack: () => void}) {
  const [work, setWork] = useState<WorkDetail | null>(null);
  const [cat, setCat] = useState<Category | 'design'>('cover');
  const [designPart, setDesignPart] = useState<'info' | 'styles'>('info');
  const [assetKey, setAssetKey] = useState<string | null>(null);
  const [imageKey, setImageKey] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('cats');
  const [fog, setFog] = useState(true);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('');
  const [presets, setPresets] = useState<ImagePreset[]>([]);
  // The image setting beside the export button, saved with the work when exporting.
  const [exportDraft, setExportDraft] = useState<ExportImages | null>(null);
  // Offered after an export that found no sharp; null while not needed, true while npm runs.
  const [sharpInstall, setSharpInstall] = useState<boolean | null>(null);
  useEffect(() => {loadWork(id).then(setWork).catch(error => setStatus(text.works.loadFailed + error.message));}, [id]);
  useEffect(() => {loadImagePresets().then(file => setPresets(file.presets)).catch(() => {});}, []);
  // While the queue runs, the work is read again so finished pictures show up.
  const running = !!work?.queue?.running;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => loadWork(id).then(setWork).catch(() => {}), 1500);
    return () => clearInterval(timer);
  }, [id, running]);
  if (!work) return <main><p className="status">{status}</p></main>;

  const assets = work.catalog.filter(a => a.cat === cat);
  const asset = work.catalog.find(a => a.key === assetKey && a.cat === cat) ?? assets[0] ?? null;
  const image = asset?.images.find(i => i.key === imageKey) ?? asset?.images[0] ?? null;
  const fogged = (a: Asset) => fog && !opened.has(a.key);
  const run = (action: Promise<WorkDetail>, done = '') => {
    setStatus(text.work.saving);
    return action.then(next => {setWork(next);setStatus(done);return true;}).catch(error => {setStatus(error.message);return false;});
  };
  const pickCat = (next: Category | 'design') => {setCat(next);setAssetKey(null);setImageKey(null);setStep(next === 'design' ? 'asset' : 'titles');};
  const doExport = () => {
    setStatus(text.work.exporting);
    exportWork(id, exportImages).then(({file, solid, images, detail}) => {
      setWork(detail);setSharpInstall(images.unavailable ? false : null);
      setStatus(text.work.exported(file) + text.work.imagesExported(images) + (solid ? text.generation.solidOnExport(solid) : ''));
    }).catch(error => setStatus(error.message));
  };
  const doInstallSharp = () => {
    setSharpInstall(true);setStatus(text.work.installingSharp);
    installSharp().then(() => {setSharpInstall(null);setStatus(text.work.sharpInstalled);})
      .catch(error => {setSharpInstall(false);setStatus(error.message);});
  };
  const exportImages = exportDraft ?? work.exportImages;
  const count = (c: Category) => {const images = work.catalog.filter(a => a.cat === c).flatMap(a => a.images);return `${images.filter(i => i.bound).length}/${images.length}`;};

  return (
    <main className="work-main">
      <div className="work-head">
        <button className="back" onClick={onBack}>{text.work.back}</button>
        <h1>{work.title}</h1>
        <span className="tag">
          {text.works.chapters(work.chapters ?? 0)} · {work.ratio} · {text.works.directors(work.directors?.saved ?? 0, work.directors?.total ?? 0)}
        </span>
        <span className="spacer" />
        <span className="fog-toggle">{text.work.fog}<Switch checked={fog} label={text.work.fog} onChange={v => {setFog(v);setOpened(new Set());}} /></span>
        <span className="export-images">
          <select aria-label={text.work.exportFormat} value={exportImages.format}
            onChange={e => setExportDraft({...exportImages, format: e.target.value as ExportImages['format']})}>
            <option value="webp">WebP</option><option value="original">{text.work.originalImages}</option>
          </select>
          {exportImages.format === 'webp' && <input className="num" type="number" min={50} max={100} aria-label={text.work.quality} title={text.work.quality}
            value={exportImages.quality} onChange={e => setExportDraft({...exportImages, quality: Math.min(100, Math.max(50, Math.round(Number(e.target.value) || 88)))})} />}
        </span>
        <button className="primary" onClick={doExport}>{text.work.exportPackage}</button>
      </div>
      <GenerationBar work={work} presets={presets} current={asset && image ? {asset, image} : null} setWork={setWork} setStatus={setStatus} />
      {status && <p className="status work-status">{status}
        {sharpInstall !== null && <> <button onClick={doInstallSharp} disabled={sharpInstall}>{text.work.installSharp}</button></>}</p>}
      <div className={work.queue ? 'browser with-queue' : 'browser'} data-step={step}>
        <div className="col cats-col">
          <ul className="cats">
            {CATS.map(c => (
              <li key={c}><button aria-current={cat === c ? 'page' : undefined} onClick={() => pickCat(c)}>
                {text.work.cats[c]}<span className="n">{count(c)}</span></button></li>
            ))}
            <li className="sep" />
            <li><button aria-current={cat === 'design' ? 'page' : undefined} onClick={() => pickCat('design')}>{text.work.design}</button></li>
          </ul>
        </div>
        <div className="col titles-col">
          <button className="step-back" onClick={() => setStep('cats')}>{text.work.backTo.cats}</button>
          <ul className="titles">
            {cat === 'design' ? (['info', 'styles'] as const).map(part => (
              <li key={part}><button aria-current={designPart === part ? 'true' : undefined} onClick={() => {setDesignPart(part);setStep('asset');}}>
                <span className="label">{part === 'info' ? text.work.bookInfo : text.work.styles}</span></button></li>
            ))
              : assets.map(a => {
                const all = a.images.every(i => i.bound), some = !!a.images[0].bound;
                const hidden = fogged(a) && !NAMED.includes(a.cat);
                return (
                  <li key={a.key}><button aria-current={asset?.key === a.key ? 'true' : undefined}
                    onClick={() => {setAssetKey(a.key);setImageKey(null);setStep('asset');}}>
                    <span className={`dot${all ? '' : some ? ' held' : ' missing'}`} />
                    <span className="label">{hidden ? text.work.hiddenName(shortChapter(a.chapterTitle), text.work.cats[a.cat]) : a.name}
                      <span className="sub">{shortChapter(a.chapterTitle)}{a.images.length > 1 ? ` · ${text.work.variants(a.images.length - 1)}` : ''}
                        {a.noDirector ? ` · ${text.work.noDirector}` : ''}</span></span>
                  </button></li>
                );
              })}
          </ul>
        </div>
        <div className="col asset-col">
          <button className="step-back" onClick={() => setStep(cat === 'design' ? 'cats' : 'titles')}>
            {cat === 'design' ? text.work.backTo.cats : text.work.backTo.titles}</button>
          {cat === 'design' ? designPart === 'info' ? <BookInfoPane work={work} run={run} /> : <DesignPane work={work} run={run} />
            : asset && image ? <AssetPane key={`${asset.key}|${image.key}`} work={work} asset={asset} image={image} fogged={fogged(asset)}
              open={() => setOpened(new Set([...opened, asset.key]))} pickImage={setImageKey} run={run}
              toDesign={() => pickCat('design')} setStatus={setStatus} presets={presets} setWork={setWork} />
              : <div className="empty">{text.work.emptyCat}</div>}
        </div>
      </div>
      {work.queue && <QueuePanel work={work} setWork={setWork} setStatus={setStatus} />}
    </main>
  );
}

type Run = (action: Promise<WorkDetail>, done?: string) => Promise<boolean>;

function Picture({work, bound, className, ratio}: {work: WorkDetail; bound: Bound | null; className: string; ratio: string}) {
  return (
    <div className={className} style={{aspectRatio: ratio.replace(':', ' / ')}}>
      {bound ? <img src={imageUrl(work.id, bound.imageId)} alt="" draggable={false} /> : <div className="slot" />}
    </div>
  );
}

function AssetPane({work, asset, image, fogged, open, pickImage, run, toDesign, setStatus, presets, setWork}: {
  work: WorkDetail; asset: Asset; image: AssetImage; fogged: boolean; open: () => void; pickImage: (key: string) => void;
  run: Run; toDesign: () => void; setStatus: (status: string) => void; presets: ImagePreset[]; setWork: (w: WorkDetail) => void;
}) {
  const [tab, setTab] = useState<'desc' | 'sent' | 'gen'>('desc');
  const [tool, setTool] = useState<'crop' | null>(null);
  const [warning, setWarning] = useState<{text: string; file: File; blocking: boolean} | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const bound = image.bound, portrait = asset.cat === 'character', ratio = image.aspectRatio;
  const defaultBound = asset.images[0].bound, held = !!image.variantId && !defaultBound && !bound;
  const upload = (picked: File) => run(bindImage(work.id, image.target, picked), text.work.bound).then(ok => ok && setWarning(null));
  // Check the picture's shape and size before it is bound.
  const check = (picked: File | undefined) => {
    if (!picked) return;
    const url = URL.createObjectURL(picked), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth, h = img.naturalHeight, notes = [];
      if (portrait && (!isPortraitShape(w, h) || picked.type === 'image/jpeg')) {setWarning({text: text.work.checks.portrait, file: picked, blocking: true});return;}
      if (Math.abs(w / h - ratioValue(ratio)) / ratioValue(ratio) > .03) notes.push(text.work.checks.ratio(w, h, ratio));
      if (Math.min(w, h) < 768) notes.push(text.work.checks.small(Math.min(w, h)));
      if (notes.length) setWarning({text: notes.join('；'), file: picked, blocking: false});else upload(picked);
    };
    img.onerror = () => {URL.revokeObjectURL(url);setStatus('无法读取这张图片。');};
    img.src = url;
  };
  const adjust = (settings: {crop?: Crop; flip?: Flip}) => run(adjustPortrait(work.id, image.target, settings), text.work.saved);
  const names = NAMED.includes(asset.cat);
  return (
    <div className="asset">
      <div className="asset-head">
        <span className={fogged && !names ? 'name fogged-text' : 'name'}>{asset.name}{image.variantId ? ` · ${image.name}` : ''}</span>
        <span className="tag">{text.work.cats[asset.cat]} · {text.work.since(asset.chapterTitle)} · {ratio}{asset.noDirector ? ` · ${text.work.noDirector}` : ''}</span>
      </div>
      <div className="viewer">
        <div className={`stage${portrait ? ' tall' : ''}${portrait && bound ? ' checker' : ''}`} style={{aspectRatio: ratio.replace(':', ' / ')}}>
          {bound ? <img src={imageUrl(work.id, bound.imageId)} alt="" draggable={false} />
            : <div className="slot">{held ? text.work.heldHelp : ''}</div>}
          {bound && !fogged && tool === 'crop' && <CropBox bound={bound} onDone={crop => adjust({crop})} />}
          {fogged && <button className="fog" onClick={open}>{text.work.open}</button>}
        </div>
        {names && (
          <div className="variants">
            {asset.images.map(v => (
              <button key={v.key} className="variant" aria-current={v.key === image.key ? 'true' : undefined} onClick={() => pickImage(v.key)}>
                <Picture work={work} bound={v.bound} ratio={v.aspectRatio} className={`thumb${fogged ? ' fogged-thumb' : ''}${portrait && v.bound ? ' checker' : ''}`} />
                <span>{v.variantId ? v.name : text.work.defaultLook}</span>
              </button>
            ))}
          </div>
        )}
        <div className="actions">
          <button className={bound ? 'ghost' : 'primary'} onClick={() => file.current?.click()}>{bound ? text.work.replace : text.work.upload}</button>
          {bound && <button className="ghost danger" onClick={() => run(removeImage(work.id, image.target), text.work.removed)}>{text.work.remove}</button>}
          {bound && portrait && <>
            <button className="ghost" aria-pressed={tool === 'crop'} onClick={() => setTool(tool === 'crop' ? null : 'crop')}>{text.work.crop}</button>
            <Segmented small value={bound.flip ?? 'right'} options={['right', 'left', 'none'] as const} labels={text.work.facings}
              label={text.work.facing} onChange={flip => adjust({flip})} />
          </>}
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden
            onChange={event => {check(event.target.files?.[0]);event.target.value = '';}} />
        </div>
        <GenerateControls work={work} presets={presets} asset={asset} image={image} setWork={setWork} setStatus={setStatus} />
        {warning && (
          <div className="warn">{warning.text}
            <div className="actions">
              {!warning.blocking && <button className="ghost" onClick={() => upload(warning.file)}>{text.work.keep}</button>}
              <button className="ghost" onClick={() => {setWarning(null);file.current?.click();}}>{text.work.another}</button>
            </div>
          </div>
        )}
        {(tool === 'crop' || portrait) && <div className="hints">
          {tool === 'crop' && <Hint text={text.work.cropHelp} />}{portrait && <Hint text={text.work.transparentHelp} />}</div>}
      </div>
      <div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'desc'} onClick={() => setTab('desc')}>{text.work.tabs.desc}</button>
          <button role="tab" aria-selected={tab === 'sent'} onClick={() => setTab('sent')}>{text.work.tabs.sent}</button>
          <button role="tab" aria-selected={tab === 'gen'} onClick={() => setTab('gen')}>{text.generation.tab}</button>
        </div>
        <div className={fogged ? 'fogged-text' : ''}>
          {tab === 'desc' ? <DescriptionTab work={work} asset={asset} image={image} run={run} toDesign={toDesign} />
            : tab === 'sent' ? <SentTab work={work} asset={asset} image={image} run={run} preset={presetOf(presets, work.scheme, asset, image)} />
              : <GenerationInfo work={work} presets={presets} asset={asset} image={image} />}
        </div>
        {(asset.uses?.length || asset.shared?.length) ? (
          <div className={`field${fogged ? ' fogged-text' : ''}`}>
            <div className="label">{text.work.uses}</div>
            <ul className="uses">
              {asset.shared?.length ? <li>{text.work.sharedWith(asset.shared.join('、'))}</li> : null}
              {asset.uses?.map(use => <li key={use}>{use}</li>)}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// A text field with its own save and undo.
function EditField({label, help, hint, value, onSave, mono = false, rows}: {
  label: string; help?: string; hint?: React.ReactNode; value: string; onSave: (value: string) => Promise<boolean>; mono?: boolean; rows?: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const dirty = draft !== value;
  return (
    <div className="field">
      <div className="label">{label}{help && <Hint text={help} />}{hint && <span className="tag">{hint}</span>}</div>
      <textarea className={mono ? 'mono' : undefined} rows={rows} value={draft} onChange={event => setDraft(event.target.value)} />
      {dirty && (
        <div className="actions field-actions">
          <button className="primary" disabled={!draft.trim()} onClick={() => onSave(draft)}>{text.work.save}</button>
          <button className="ghost" onClick={() => setDraft(value)}>{text.work.undo}</button>
        </div>
      )}
    </div>
  );
}

// How tall a look stands on stage. Empty means none is written: an ordinary adult, or the default look's on a variant.
function StatureField({work, image, inherited, run}: {work: WorkDetail; image: AssetImage; inherited: number | null; run: Run}) {
  const value = image.stature == null ? '' : String(image.stature);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const [min, max] = STATURE_RANGE, number = Number(draft);
  const valid = draft === '' || (number >= min && number <= max);
  return (
    <div className="field">
      <div className="label">{text.work.stature}<Hint text={text.work.statureHint(min, max)} />
        {draft === '' && <span className="tag">{image.variantId ? text.work.statureInherited : text.work.statureAdult}</span>}</div>
      <input className="num" type="number" min={min} max={max} step={0.05} aria-label={text.work.stature} aria-invalid={!valid}
        placeholder={String(inherited ?? 1)} value={draft} onChange={event => setDraft(event.target.value)} />
      {draft !== value && (
        <div className="actions field-actions">
          <button className="primary" disabled={!valid} onClick={() => run(editStature(work.id, image.edit, draft === '' ? null : number), text.work.saved)}>{text.work.save}</button>
          <button className="ghost" onClick={() => setDraft(value)}>{text.work.undo}</button>
        </div>
      )}
    </div>
  );
}

function DescriptionTab({work, asset, image, run, toDesign}: {work: WorkDetail; asset: Asset; image: AssetImage; run: Run; toDesign: () => void}) {
  const d = image.description;
  const save = (value: {prompt?: string; face?: string; body?: string}) => run(editDescription(work.id, image.edit, value), text.work.saved);
  return (
    <>
      {!d ? <p className="help">{text.work.noDirectorHint}</p>
        : d.kind === 'prompt' ? <EditField label={image.variantId ? text.work.variantDesign : text.work.prompt} help={text.work.descHint}
          value={d.prompt} onSave={prompt => save({prompt})} />
          : <>
            <EditField label={text.work.face} help={text.work.descHint} value={d.face} onSave={face => save({face, body: d.body})} rows={4} />
            <EditField label={text.work.body} value={d.body} onSave={body => save({face: d.face, body})} rows={4} />
          </>}
      {image.stature !== undefined && <StatureField work={work} image={image} run={run}
        inherited={image.variantId ? asset.images[0].stature ?? null : null} />}
      <div className="field">
        <div className="label">{text.work.styleOf[image.side]}<span className="tag"><button className="link" onClick={toDesign}>{text.work.editInDesign}</button></span></div>
        <div className="readonly">{work.styles[image.side] || text.work.none}</div>
      </div>
    </>
  );
}

function SentTab({work, asset, image, run, preset}: {work: WorkDetail; asset: Asset; image: AssetImage; run: Run; preset: ImagePreset | null}) {
  const save = (key: string, value: string | null) => run(setPrompt(work.id, key, value), text.work.saved);
  // What the selected preset would send: the user's rewrite, the agent's rewrite for this preset, or the composed prompt.
  const sent = (edit: boolean) => preset ? chosenPrompt(preset, image, edit) : (() => {
    const manual = edit ? image.sentEdit : image.sent;
    return {prompt: manual ?? (edit ? image.editPrompt : image.prompt), source: manual != null ? 'manual' : 'composed', pending: false};
  })();
  const hint = (choice: {source: string; pending: boolean}, key: string) => choice.source === 'manual'
    ? <>{text.work.manual} · <button className="link" onClick={() => save(key, null)}>
      {preset && chosenPrompt(preset, {...image, sent: null, sentEdit: null}, key.endsWith('#edit')).source === 'formatted' ? text.work.resetToFormatted : text.work.resetSent}</button></>
    : choice.source === 'formatted' ? text.work.formatted : choice.pending ? text.work.pending : text.work.auto;
  const instruction = image.editPrompt !== undefined && (!preset || preset.format.edit === 'instruction');
  const edit = sent(true), full = sent(false);
  return (
    <>
      {image.prompt === null ? <p className="help">{text.work.noDirectorHint}</p> : <>
        {instruction && (
          <EditField label={text.work.editPrompt} mono hint={hint(edit, `${image.key}#edit`)}
            value={edit.prompt ?? ''} onSave={value => save(`${image.key}#edit`, value)} />
        )}
        <EditField label={text.work.positive} mono hint={hint(full, image.key)} value={full.prompt ?? ''}
          onSave={value => save(image.key, value)} />
      </>}
      <div className="field"><div className="label">{text.work.negative}</div>
        <div className={preset?.negative ? 'readonly mono' : 'readonly none'}>{preset?.negative || text.work.none}</div></div>
      <div className="field"><div className="label">{text.work.service}<span className="tag">{preset ? presetName(preset) : text.work.serviceHint}</span></div>
        <div className={preset ? 'readonly' : 'readonly none'}>{preset ? text.generation.fixed(preset.positive, preset.negative) : text.work.none}</div></div>
      {image.variantId && (
        <div className="field"><div className="label">{text.work.reference}</div>
          <div className={asset.images[0].bound ? 'readonly' : 'readonly none'}>{asset.images[0].bound ? text.work.referenceReady : text.work.referenceMissing}</div></div>
      )}
      <div className="field"><div className="label">{text.work.size}</div>
        <div className="readonly">{image.aspectRatio}{asset.cat === 'character' ? ` · ${text.work.transparent}` : ''}</div></div>
    </>
  );
}

// The title and author the exported package carries; the input text keeps its own.
function BookInfoPane({work, run}: {work: WorkDetail; run: Run}) {
  const title = work.title ?? '', author = work.author ?? '';
  const [draft, setDraft] = useState({title, author});
  useEffect(() => setDraft({title, author}), [title, author]);
  const dirty = draft.title !== title || draft.author !== author;
  return (
    <div className="design">
      <h2>{text.work.design} · {text.work.bookInfo}<Hint text={text.work.bookInfoHint} /></h2>
      <label className="field"><span className="label">{text.work.bookTitle}</span>
        <input className="text wide" type="text" maxLength={200} value={draft.title} onChange={e => setDraft({...draft, title: e.target.value})} /></label>
      <label className="field"><span className="label">{text.work.bookAuthor}</span>
        <input className="text wide" type="text" maxLength={200} value={draft.author} onChange={e => setDraft({...draft, author: e.target.value})} /></label>
      {dirty && (
        <div className="actions field-actions">
          <button className="primary" disabled={!draft.title.trim()}
            onClick={() => run(setBookInfo(work.id, {title: draft.title, author: draft.author.trim() || null}), text.work.saved)}>{text.work.save}</button>
          <button className="ghost" onClick={() => setDraft({title, author})}>{text.work.undo}</button>
        </div>
      )}
    </div>
  );
}

function DesignPane({work, run}: {work: WorkDetail; run: Run}) {
  return (
    <div className="design">
      <h2>{text.work.design} · {text.work.styles}<Hint text={text.work.designHint + text.work.designNote} /></h2>
      {(['background', 'character'] as const).map(side => (
        <EditField key={side} label={text.work.styleOf[side]} value={work.styles[side]}
          hint={work.fixedStyles.includes(side) ? text.work.fixedStyle : text.work.modelStyle}
          onSave={value => run(editStyles(work.id, {[side]: value}), text.work.saved)} />
      ))}
    </div>
  );
}

// Dragging inside a box that follows the picture; positions are fractions of its size.
function useDrag(onMove: (dx: number, dy: number, box: DOMRect) => void, onEnd: () => void) {
  return (event: React.PointerEvent) => {
    event.preventDefault();event.stopPropagation();
    const box = ((event.currentTarget as HTMLElement).closest('.stage') as HTMLElement).getBoundingClientRect(), x = event.clientX, y = event.clientY;
    const move = (m: PointerEvent) => onMove((m.clientX - x) / box.width, (m.clientY - y) / box.height, box);
    const up = () => {removeEventListener('pointermove', move);removeEventListener('pointerup', up);onEnd();};
    addEventListener('pointermove', move);addEventListener('pointerup', up);
  };
}

function CropBox({bound, onDone}: {bound: Bound; onDone: (crop: Crop) => void}) {
  const [crop, setCrop] = useState<Crop>(() => avatarCrop(bound));
  const latest = useRef(crop);latest.current = crop;
  const start = useRef(crop);
  const {width, height} = bound;
  const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);
  const done = () => onDone({x: Math.round(latest.current.x), y: Math.round(latest.current.y), size: Math.round(latest.current.size)});
  const moveBox = useDrag((dx, dy) => {
    const s = start.current;setCrop({...s, x: clamp(s.x + dx * width, width - s.size), y: clamp(s.y + dy * height, height - s.size)});
  }, done);
  const resize = useDrag(dx => {
    const s = start.current, size = Math.max(32, Math.min(s.size + dx * width, width - s.x, height - s.y));setCrop({...s, size});
  }, done);
  return (
    <div className="crop" style={{left: `${crop.x / width * 100}%`, top: `${crop.y / height * 100}%`, width: `${crop.size / width * 100}%`}}
      onPointerDown={event => {start.current = crop;moveBox(event);}}>
      <span className="crop-handle" onPointerDown={event => {start.current = crop;resize(event as unknown as React.PointerEvent);}} />
    </div>
  );
}
