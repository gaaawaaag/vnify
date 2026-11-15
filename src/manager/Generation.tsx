import {useState} from 'react';
import {
  controlQueue, imageUrl, restoreImage, saveScheme, setImageRatio, startQueue,
  type Asset, type AssetImage, type ImagePreset, type ImageUse, type QueueState, type Scheme, type WorkDetail,
} from './api';
import {Hint} from './controls';
import {text} from './text';
import {canEdit, presetName, referenceLimit} from '../production/image-presets.js';
import {chosenPrompt} from '../production/prompt-formats.js';
import {RATIOS} from '../production/presets.js';

const g = text.generation;
const SCHEME_USES: ImageUse[] = ['background', 'cg', 'cutin', 'cover', 'standing', 'variant'];
const CATEGORY_USE: Record<string, ImageUse> = {cover: 'cover', ambient: 'background', location: 'background', character: 'standing', cg: 'cg', cutin: 'cutin'};
// The use that draws an image: a character's variant is edited from the default; a place's variant is a background.
export const useOf = (asset: Asset, image: AssetImage): ImageUse => image.variantId && asset.cat === 'character' ? 'variant' : CATEGORY_USE[asset.cat];
export const presetOf = (presets: ImagePreset[], scheme: Scheme, asset: Asset, image: AssetImage) =>
  presets.find(p => p.id === (scheme.overrides[image.key] ?? scheme.uses[useOf(asset, image)])) ?? null;
const SCOPES = ['missing', 'categoryMissing', 'all', 'category'] as const;
type Scope = typeof SCOPES[number];
// Pictures drawn on the work's canvas; Cut-ins are square and portraits 2:3 whatever the screen.
const CANVAS_CATS = ['cover', 'ambient', 'location', 'cg'];
const ratioOf = (ratio: string) => {const [w, h] = ratio.split(':').map(Number);return w / h;};
// A CG's cast as the server sends it: in order, a portrait (the variant worn at the CG's start, or the default) for as
// many as the preset takes when the scheme sends them; the rest by their look alone.
const castPlan = (work: WorkDetail, asset: Asset, preset: ImagePreset) => {
  let left = work.scheme.cgReferences ? referenceLimit(preset) : 0;
  return (asset.cast ?? []).map(c => {
    const images = work.catalog.find(a => a.key === `character:${c.id}`)?.images ?? [];
    const portrait = !!((c.variantId && images.find(i => i.variantId === c.variantId)?.bound) || images[0]?.bound);
    const sent = portrait && left > 0;
    if (sent) left--;
    return `${c.label}（${sent ? g.castPicture : g.castLook}）`;
  });
};

/* The generation bar: the work's scheme (a preset for each use, and how portraits lose their background), the range
 * and the start button. Images with no preset or no prompt are left out and counted. */
export function GenerationBar({work, presets, current, setWork, setStatus}: {
  work: WorkDetail; presets: ImagePreset[]; current: {asset: Asset; image: AssetImage} | null;
  setWork: (w: WorkDetail) => void; setStatus: (s: string) => void;
}) {
  const [open, setOpen] = useState(!Object.keys(work.scheme.uses).length);
  const [scope, setScope] = useState<Scope>('missing');
  const scheme = work.scheme, running = !!work.queue?.running;
  const pairs = work.catalog.flatMap(asset => asset.images.map(image => ({asset, image})));
  const inScope = pairs.filter(({asset, image}) => (scope === 'all' || scope === 'missing' || asset.cat === current?.asset.cat)
    && (scope === 'all' || scope === 'category' || !image.bound));
  const ready = inScope.filter(({asset, image}) => image.prompt !== null && presetOf(presets, scheme, asset, image));
  const noPreset = inScope.filter(({asset, image}) => image.prompt !== null && !presetOf(presets, scheme, asset, image)).length;
  // Counted by entity: the director picks which entities and variants get prompts.
  const noPrompt = new Set(inScope.filter(({image}) => image.prompt === null).map(({asset}) => asset.key)).size;
  // Images whose preset rewrites prompts but that have no rewrite yet: they are sent as composed.
  const unformatted = ready.filter(({asset, image}) => {
    const preset = presetOf(presets, scheme, asset, image)!;
    return chosenPrompt(preset, image, !!image.variantId && !!asset.images[0].bound && canEdit(preset)).pending;
  }).length;
  const change = (next: Scheme) => saveScheme(work.id, next).then(setWork).catch(error => setStatus(error.message));
  // Portraits still on a solid colour, cleared in one go with the scheme's method (the program when it says none).
  const solid = pairs.filter(({asset, image}) => asset.cat === 'character' && image.bound?.background);
  const clearAll = () => startQueue(work.id, solid.map(({image}) => image.key), 'cutout', scheme.cutout === 'none' ? 'program' : scheme.cutout)
    .then(({queue}) => {setWork({...work, queue});setStatus('');}).catch(error => setStatus(error.message));
  const start = () => startQueue(work.id, ready.map(({image}) => image.key))
    .then(({queue}) => {setWork({...work, queue});setStatus('');}).catch(error => setStatus(error.message));
  const options = (use: ImageUse) => presets.filter(p => p.uses.includes(use));
  const offRatio = pairs.filter(({asset, image}) => CANVAS_CATS.includes(asset.cat) && image.bound
    && Math.abs(image.bound.width / image.bound.height - ratioOf(image.aspectRatio)) / ratioOf(image.aspectRatio) > .03).length;
  const changeRatio = (ratio: string) => setImageRatio(work.id, ratio).then(setWork).catch(error => setStatus(error.message));
  return (
    <div className="gen-bar">
      <button className="ghost" onClick={() => setOpen(!open)}>{open ? g.foldScheme : g.scheme}</button>{open && <Hint text={g.schemeHint} />}
      <span className="label">{g.scope}</span>
      <select value={scope} onChange={e => setScope(e.target.value as Scope)}>
        {SCOPES.map(s => <option key={s} value={s}>{g.scopes[s]}</option>)}
      </select>
      <span className="count">{g.count(ready.length)}{noPreset ? <span className="warn-text"> · {g.noPreset(noPreset)}</span> : null}
        {noPrompt ? <> · {g.noPrompt(noPrompt)}<Hint text={g.noPromptHint} /></> : null}{unformatted ? <span className="warn-text"> · {g.unformatted(unformatted)}</span> : null}</span>
      <span className="spacer" />
      {solid.length > 0 && <button className="ghost" disabled={running} onClick={clearAll}>{g.clearAll(solid.length)}</button>}
      <button className="primary" disabled={!ready.length || running} onClick={start}>{running ? g.running : g.start}</button>
      {open && (
        <div className="scheme">
          {SCHEME_USES.map(use => {
            const list = options(use), value = scheme.uses[use] ?? '';
            return (
              <label key={use}><span>{text.uses[use]}</span>
                <select className={value ? '' : 'unset'} value={value}
                  onChange={e => {const uses = {...scheme.uses};if (e.target.value) uses[use] = e.target.value;else delete uses[use];change({...scheme, uses});}}>
                  <option value="">{list.length ? g.none : g.noSuchPreset}</option>
                  {list.map(p => <option key={p.id} value={p.id}>{presetName(p)}</option>)}
                </select>
              </label>
            );
          })}
          <label><span>{g.cutout}</span>
            <select value={scheme.cutout} onChange={e => change({...scheme, cutout: e.target.value})}>
              <option value="program">{g.program}</option>
              <option value="none">{g.noCutout}</option>
              {options('cutout').map(p => <option key={p.id} value={p.id}>{g.modelCutout(presetName(p))}</option>)}
            </select>
          </label>
          <label><span>{g.ratio}<Hint text={g.ratioHint} /></span>
            <select value={work.ratio ?? '16:9'} disabled={running} onChange={e => changeRatio(e.target.value)}>
              {(['landscape', 'portrait'] as const).map(o => (
                <optgroup key={o} label={g.ratioGroups[o]}>{RATIOS[o].map(r => <option key={r} value={r}>{g.ratioGroups[o]} {r}</option>)}</optgroup>
              ))}
            </select>
          </label>
          {offRatio > 0 && <span className="warn-text ratio-note">{g.offRatio(offRatio)}</span>}
          <label className="check"><input type="checkbox" checked={scheme.cgReferences}
            onChange={e => change({...scheme, cgReferences: e.target.checked})} /><span>{g.cgReferences}</span>
            {scheme.cgReferences && !presets.some(p => p.id === scheme.uses.cg && referenceLimit(p)) && <span className="warn-text">{g.cgReferencesNone}</span>}</label>
        </div>
      )}
    </div>
  );
}

// The queue, docked at the bottom: folded to one line or open to its list.
export function QueuePanel({work, setWork, setStatus}: {work: WorkDetail; setWork: (w: WorkDetail) => void; setStatus: (s: string) => void}) {
  const [open, setOpen] = useState(true);
  const queue = work.queue as QueueState;
  const done = queue.items.filter(i => ['done', 'failed', 'skipped'].includes(i.state)).length, failed = queue.items.filter(i => i.state === 'failed').length;
  const act = (action: 'pause' | 'resume' | 'retry' | 'cancel' | 'close') =>
    controlQueue(work.id, action).then(({queue: next}) => setWork({...work, queue: next})).catch(error => setStatus(error.message));
  return (
    <div className="queue">
      <div className="qhead">
        <span className="title">{g.queue}</span>
        <span className="tag">{done}／{queue.items.length}{failed ? ` · ${g.failedCount(failed)}` : ''}{queue.paused ? ` · ${g.paused}` : ''}</span>
        <div className="progress"><i style={{width: `${100 * done / queue.items.length}%`}} /></div>
        {queue.running && !queue.paused ? <button className="ghost" onClick={() => act('pause')}>{g.pause}</button>
          : done < queue.items.length ? <button className="ghost" onClick={() => act('resume')}>{g.resume}</button> : null}
        {queue.running && <button className="ghost danger" onClick={() => act('cancel')}>{g.cancel}</button>}
        <button className="ghost" disabled={!failed || queue.running} onClick={() => act('retry')}>{g.retry}</button>
        <button className="ghost" onClick={() => setOpen(!open)}>{open ? g.fold : g.unfold}</button>
        <button className="ghost" disabled={queue.running} onClick={() => act('close')}>{g.close}</button>
      </div>
      {open && (
        <div className="qlist">
          {queue.items.map(item => (
            <div key={item.key} className={`item ${item.state}`}>
              <span className={`dot ${item.state === 'running' ? 'running' : item.state === 'done' ? '' : item.state === 'waiting' ? 'queued' : 'missing'}`} />
              <span className="what"><b>{item.name}</b> · {item.size} · {item.preset}{item.note ? ` · ${item.note}` : ''}</span>
              <span className="state">{g.states[item.state]}{item.error ? `：${item.error}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// One image: draw it with the scheme's preset or another for this image, and put back an earlier result.
export function GenerateControls({work, presets, asset, image, setWork, setStatus}: {
  work: WorkDetail; presets: ImagePreset[]; asset: Asset; image: AssetImage; setWork: (w: WorkDetail) => void; setStatus: (s: string) => void;
}) {
  const use = useOf(asset, image), scheme = work.scheme, schemePreset = presets.find(p => p.id === scheme.uses[use]) ?? null;
  const preset = presetOf(presets, scheme, asset, image), usable = presets.filter(p => p.uses.includes(use) && p !== schemePreset);
  const queued = work.queue?.items.find(i => i.key === image.key && ['waiting', 'running'].includes(i.state));
  const waiting = !!image.variantId && !asset.images[0].bound && use === 'variant';
  const override = (id: string) => {
    const overrides = {...scheme.overrides};if (id) overrides[image.key] = id;else delete overrides[image.key];
    saveScheme(work.id, {...scheme, overrides}).then(setWork).catch(error => setStatus(error.message));
  };
  const draw = () => startQueue(work.id, [image.key]).then(({queue}) => setWork({...work, queue})).catch(error => setStatus(error.message));
  const history = image.history ?? [];
  const removers = presets.filter(p => p.uses.includes('cutout'));
  const clear = (method: string) => startQueue(work.id, [image.key], 'cutout', method).then(({queue}) => setWork({...work, queue})).catch(error => setStatus(error.message));
  return (
    <>
      {asset.cat === 'character' && image.bound?.background && (
        <div className="warn">{g.solidHere}
          <div className="actions">
            <button className="ghost" disabled={!!work.queue?.running} onClick={() => clear('program')}>{g.program}</button>
            {removers.map(p => <button key={p.id} className="ghost" disabled={!!work.queue?.running} onClick={() => clear(p.id)}>{g.modelCutout(presetName(p))}</button>)}
          </div>
        </div>
      )}
      {image.prompt !== null && (
        <div className="actions">
          <select value={scheme.overrides[image.key] ?? ''} onChange={e => override(e.target.value)} aria-label={g.presetForImage}>
            <option value="">{schemePreset ? g.byScheme(presetName(schemePreset)) : g.schemeMissing}</option>
            {usable.map(p => <option key={p.id} value={p.id}>{g.thisOne(presetName(p))}</option>)}
          </select>
          <button className="primary" disabled={!preset || !!queued || !!work.queue?.running} onClick={draw}>
            {queued ? g.states[queued.state] : image.bound ? g.regenerate : g.generate}</button>
        </div>
      )}
      {waiting && <p className="help">{g.waitDefault}</p>}
      {history.length > 0 && (
        <div>
          <div className="tag history-title">{g.history}</div>
          <div className="history">
            {history.slice().reverse().map(entry => (
              <button key={entry.imageId + entry.time} aria-current={entry.imageId === image.bound?.imageId ? 'true' : undefined}
                title={`${entry.preset} · ${entry.width}×${entry.height}`}
                onClick={() => entry.imageId !== image.bound?.imageId && restoreImage(work.id, image.key, entry.imageId).then(setWork).catch(error => setStatus(error.message))}>
                <div className={`thumb${asset.cat === 'character' ? ' checker' : ''}`} style={{aspectRatio: image.aspectRatio.replace(':', ' / ')}}>
                  <img src={imageUrl(work.id, entry.imageId)} alt="" loading="lazy" /></div>
                <span>{entry.seed == null ? '—' : g.seedOf(entry.seed)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// 生成信息: how the bound picture was made, and what the next drawing will use.
export function GenerationInfo({work, presets, asset, image}: {work: WorkDetail; presets: ImagePreset[]; asset: Asset; image: AssetImage}) {
  const made = image.history?.findLast(e => e.imageId === image.bound?.imageId) ?? null;
  const preset = presetOf(presets, work.scheme, asset, image), portrait = asset.cat === 'character';
  const cutout = work.scheme.cutout === 'program' ? g.program : work.scheme.cutout === 'none' ? g.noCutout
    : g.modelCutout(presetName(presets.find(p => p.id === work.scheme.cutout) ?? {source: '', uses: [], custom: ''}));
  return (
    <>
      <div className="field"><div className="label">{g.thisPicture}</div>
        {made ? <div className="kv">
          <span>{g.preset}</span><b>{made.preset}</b><span>{g.seedLabel}</span><b>{made.seed ?? '—'}</b><span>{g.size}</span><b>{made.width}×{made.height}</b>
          <span>{g.mode}</span><b>{g.modes[made.mode as keyof typeof g.modes] ?? made.mode}</b>{made.cutout && <><span>{g.cutoutLabel}</span><b>{made.cutout === 'program' ? g.program : made.cutout}</b></>}
          {made.references?.length ? <><span>{g.references}</span><b>{made.references.join('、')}</b></> : null}
          <span>{g.time}</span><b>{new Date(made.time).toLocaleString()}</b>
        </div> : <div className="readonly none">{image.bound ? g.uploaded : g.nothing}</div>}
      </div>
      <div className="field"><div className="label">{g.next}<span className="tag">{preset ? presetName(preset) : g.schemeMissing}</span></div>
        {preset && <div className="kv">
          <span>{g.size}</span><b>{preset.openai?.protocol === 'chat' ? image.aspectRatio : (preset.sizes[image.aspectRatio] ?? []).join('×')}{preset.source === 'novelai' && preset.novelai?.free ? ` ${g.freeNote}` : ''}</b>
          {preset.source !== 'openai' && <><span>{g.seedLabel}</span><b>{preset.seed === 'random' ? g.randomSeed : preset.seed}</b></>}
          {portrait && <><span>{g.background}</span><b>{preset.transparent ? `${g.transparent} · ` : ''}{g.thenCutout(cutout)}</b></>}
          {asset.cat === 'cg' && <><span>{g.cast}</span><b>{asset.cast?.length ? castPlan(work, asset, preset).join('、') : g.noCast}</b></>}
          {image.variantId && <><span>{g.mode}</span><b>{(preset.source === 'novelai' ? preset.novelai?.variantMode === 'img2img' : preset.source === 'openai' ? preset.openai!.edit : !!preset.comfyui?.edit) ? g.modes.edit : g.modes.generate}</b></>}
        </div>}
      </div>
      {made && <>
        <div className="field"><div className="label">{g.sentPositive}</div><div className="readonly mono">{made.prompt}</div></div>
        <div className="field"><div className="label">{g.sentNegative}</div><div className={made.negative ? 'readonly mono' : 'readonly none'}>{made.negative || text.work.none}</div></div>
      </>}
    </>
  );
}
