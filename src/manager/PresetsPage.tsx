import {useEffect, useState} from 'react';
import type {ImageKind, Preset, PresetFile} from '../types/production';
import {BUILT_IN_PRESETS, DENSITY_KINDS, IMAGE_KINDS, RATIOS} from '../production/presets.js';
import {SEARCH_KINDS} from '../production/image-search.js';
import {presetName} from '../production/image-presets.js';
import {loadImagePresets, loadMusicPresets, loadPresets, savePresets, type ImagePreset, type MusicPreset} from './api';
import {musicPresetName} from '../production/music-presets.js';
import {Row, Segmented, Switch} from './controls';
import {text} from './text';

// Variants need the images they vary.
const NEEDS: Partial<Record<ImageKind, ImageKind>> = {endCard: 'cover', characterVariants: 'standing', locationVariants: 'location'};
// The use that draws each kind, as in Generation.tsx: every background kind shares one mount, so their selects move together.
const KIND_USE: Record<ImageKind, keyof Preset['drawing']['uses']> = {cover: 'cover', endCard: 'cover', ambient: 'background', location: 'background', cg: 'cg', closeup: 'cutin',
  standing: 'standing', characterVariants: 'variant', locationVariants: 'background'};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* Production presets: chosen before a work is made and read by the agent from presets.json. The page edits a draft of
 * the whole file; saving writes it at once, undo returns to what was saved. */
export function PresetsPage() {
  const [saved, setSaved] = useState<PresetFile | null>(null);
  const [draft, setDraft] = useState<PresetFile | null>(null);
  const [current, setCurrent] = useState('');
  const [status, setStatus] = useState('');
  const [images, setImages] = useState<ImagePreset[]>([]);
  const [audioPresets, setAudioPresets] = useState<MusicPreset[]>([]);
  useEffect(() => {
    loadImagePresets().then(file => setImages(file.presets)).catch(() => {});
    loadMusicPresets().then(file => setAudioPresets(file.presets)).catch(() => {});
    loadPresets().then(file => {setSaved(file); setDraft(file); setCurrent(file.default);})
      .catch(error => setStatus(text.bar.loadFailed + error.message));
  }, []);
  if (!draft || !saved) return <main><p className="status">{status}</p></main>;

  const preset = draft.presets[current];
  const builtIn = current in BUILT_IN_PRESETS;
  const dirty = !same(draft, saved);
  const change = (edit: (preset: Preset) => void) => {
    const next = structuredClone(draft);edit(next.presets[current]);setDraft(next);setStatus('');
  };
  const setFile = (next: PresetFile, name = current) => {setDraft(next);setCurrent(name);setStatus('');};
  const saveAs = () => {
    const name = window.prompt(text.presets.newName, text.presets.copyOf(current))?.trim();
    if (!name) return;
    if (draft.presets[name]) {setStatus(text.presets.nameTaken);return;}
    setFile({...draft, presets: {...draft.presets, [name]: structuredClone(preset)}}, name);
  };
  const remove = () => {
    const presets = {...draft.presets};delete presets[current];
    const fallback = draft.default === current ? Object.keys(BUILT_IN_PRESETS)[0] : draft.default;
    setFile({...draft, default: fallback, presets}, fallback);
  };
  const save = () => savePresets(draft).then(file => {setSaved(file);setDraft(file);setStatus(text.bar.saved);})
    .catch(error => setStatus(error.message));

  return (
    <>
      <main>
        <div className="presets">
          <select aria-label={text.presets.label} value={current} onChange={event => setCurrent(event.target.value)}>
            {Object.keys(draft.presets).map(name => (
              <option key={name} value={name}>{name}{name === draft.default ? text.presets.isDefault : ''}</option>
            ))}
          </select>
          <span className="tag">{builtIn ? text.presets.builtIn : text.presets.custom}</span>
          <button className="ghost" disabled={current === draft.default} onClick={() => setFile({...draft, default: current})}>
            {text.presets.makeDefault}</button>
          <button className="ghost" onClick={saveAs}>{text.presets.saveAs}</button>
          {builtIn
            ? <button className="ghost" disabled={same(preset, BUILT_IN_PRESETS[current])}
              onClick={() => change(p => Object.assign(p, structuredClone(BUILT_IN_PRESETS[current])))}>{text.presets.restore}</button>
            : <button className="ghost danger" onClick={remove}>{text.presets.remove}</button>}
        </div>

        <div className="grid">
          <section>
            <h2>{text.sections.text}</h2>
            <Row name={text.fields.delivery}>
              <Segmented vertical value={preset.delivery} options={['text', 'prompts', 'images'] as const} labels={text.options.delivery}
                onChange={v => change(p => {p.delivery = v;})} />
            </Row>
            <Row name={text.fields.style}>
              <Segmented value={preset.style} options={['style', 'style-no-tags', 'style-original'] as const} labels={text.options.style}
                onChange={v => change(p => {p.style = v;})} />
            </Row>
            <Row name={text.fields.dossier}>
              <Segmented value={preset.dossier} options={['off', 'simple', 'detailed'] as const} labels={text.options.dossier}
                onChange={v => change(p => {p.dossier = v;if (v === 'off') p.terms = false;})} />
            </Row>
            <Row name={text.fields.terms}>
              <Switch checked={preset.terms} label={text.fields.terms} disabled={preset.dossier === 'off'}
                onChange={v => change(p => {p.terms = v;})} />
            </Row>
            <Row name={text.fields.textNotes} block>
              <textarea value={preset.textNotes} placeholder={text.placeholders.textNotes}
                onChange={event => change(p => {p.textNotes = event.target.value;})} />
            </Row>
          </section>

          <section>
            <h2>{text.sections.picture}</h2>
            <Row name={text.fields.orientation}>
              <div className="inline">
                <Segmented value={preset.orientation} options={['landscape', 'portrait'] as const} labels={text.options.orientation}
                  onChange={v => change(p => {p.orientation = v;p.ratio = RATIOS[v][0];})} />
                <select aria-label={text.fields.ratio} value={preset.ratio} onChange={event => change(p => {p.ratio = event.target.value;})}>
                  {RATIOS[preset.orientation].map(ratio => <option key={ratio}>{ratio}</option>)}
                </select>
              </div>
            </Row>
            {(['background', 'character'] as const).map(which => (
              <Row key={which} name={text.fields[which]} block>
                <div className="style-field">
                  <Segmented value={preset.styles[which].mode} options={['model', 'expand', 'fixed'] as const}
                    labels={text.options.styleMode} label={text.fields[which]}
                    onChange={v => change(p => {p.styles[which].mode = v;})} />
                  {preset.styles[which].mode !== 'model' && (
                    <textarea value={preset.styles[which].text} placeholder={text.placeholders[which]}
                      onChange={event => change(p => {p.styles[which].text = event.target.value;})} />
                  )}
                </div>
              </Row>
            ))}
            {preset.kinds.standing.on && (
              <Row name={text.fields.transparency}>
                <Segmented value={preset.transparency} options={['native', 'cutout'] as const} labels={text.options.transparency}
                  onChange={v => change(p => {p.transparency = v;})} />
              </Row>
            )}
            <Row name={text.fields.limit}>
              <input className="number" type="number" min={1} placeholder={text.placeholders.limit} aria-label={text.fields.limit}
                value={preset.limit ?? ''}
                onChange={event => change(p => {const n = Number(event.target.value);p.limit = event.target.value && n > 0 ? Math.floor(n) : null;})} />
            </Row>
          </section>

          <section className="wide">
            <h2>{text.sections.kinds}</h2>
            <Row name={text.fields.drawing} block>
              <div className="style-field">
                <Segmented value={preset.drawing.mode} options={['agent', 'presets'] as const} labels={text.options.drawing} label={text.fields.drawing}
                  onChange={v => change(p => {p.drawing.mode = v;})} />
                {preset.drawing.mode === 'agent' && (
                  <textarea value={preset.drawing.notes} placeholder={text.placeholders.drawingNotes}
                    onChange={event => change(p => {p.drawing.notes = event.target.value;})} />
                )}
              </div>
            </Row>
            <div className="kinds">
              {IMAGE_KINDS.map(kind => <KindRow key={kind} kind={kind} preset={preset} images={images} change={change} />)}
            </div>
          </section>

          <section className="wide">
            <h2>{text.sections.sound}</h2>
            <Row name={text.fields.voice} help={text.sound.voiceHint}>
              <Segmented value={preset.sound.voice} options={['off', 'portraits', 'assign'] as const} labels={text.options.voice}
                onChange={v => change(p => {p.sound.voice = v;})} />
            </Row>
            {preset.sound.voice === 'assign' && <Row name={text.sound.voiceSources} help={text.sound.voiceSourcesHint} block>
              <SourceList value={preset.sound.voiceSources} labels={text.sound.voiceSourceLabels}
                onChange={list => change(p => {p.sound.voiceSources = list;})} />
            </Row>}
            <Row name={text.fields.music} help={text.sound.musicHint}>
              <div className="inline">
                <Segmented value={preset.sound.music} options={['off', 'prompts', 'full'] as const} labels={text.options.music}
                  onChange={v => change(p => {p.sound.music = v;})} />
                {preset.sound.music !== 'off' && <Segmented small value={preset.sound.musicDensity} options={['few', 'medium', 'rich'] as const}
                  labels={text.options.density} label={text.fields.music} onChange={v => change(p => {p.sound.musicDensity = v;})} />}
              </div>
            </Row>
            {preset.sound.music === 'full' && <Row name={text.sound.musicSources} help={text.sound.musicSourcesHint} block>
              <SourceList value={preset.sound.musicSources} onChange={list => change(p => {p.sound.musicSources = list;})}
                generate={<select value={preset.sound.musicPreset} aria-label={text.sound.musicPreset}
                  onChange={e => change(p => {p.sound.musicPreset = e.target.value;})}>
                  <option value="">{text.sound.pickPreset}</option>
                  {audioPresets.filter(m => m.uses.includes('music')).map(m => <option key={m.id} value={m.id}>{musicPresetName(m as never)}</option>)}
                </select>} />
            </Row>}
            <Row name={text.fields.effects} help={text.sound.effectsHint}>
              <div className="inline">
                <Segmented value={preset.sound.effects} options={['off', 'full'] as const} labels={text.options.effects}
                  onChange={v => change(p => {p.sound.effects = v;})} />
                {preset.sound.effects !== 'off' && <Segmented small value={preset.sound.density} options={['few', 'medium', 'rich'] as const} labels={text.options.density}
                  label={text.fields.effects} onChange={v => change(p => {p.sound.density = v;})} />}
              </div>
            </Row>
            {preset.sound.effects === 'full' && <Row name={text.sound.effectSources} help={text.sound.effectSourcesHint} block>
              <SourceList value={preset.sound.effectSources} onChange={list => change(p => {p.sound.effectSources = list;})}
                generate={<>
                  <select value={preset.sound.effectPreset} aria-label={text.sound.effectPreset} onChange={e => change(p => {p.sound.effectPreset = e.target.value;})}>
                    <option value="">{text.sound.pickPreset}</option>
                    {audioPresets.filter(m => m.uses.includes('effects')).map(m => <option key={m.id} value={m.id}>{musicPresetName(m as never)}</option>)}
                  </select>
                  <label className="inline">{text.sound.generateLimit}
                    <input className="text tiny" type="number" min="0" max="200" value={preset.sound.generateLimit}
                      onChange={e => change(p => {p.sound.generateLimit = Math.max(0, Math.min(200, Math.round(Number(e.target.value) || 0)));})} /></label>
                </>} />
            </Row>}
            {(preset.sound.voice !== 'off' || preset.sound.effects !== 'off' || preset.sound.music !== 'off') && <Row name={text.fields.soundNotes} block>
              <textarea value={preset.sound.notes} placeholder={text.placeholders.soundNotes}
                onChange={event => change(p => {p.sound.notes = event.target.value;})} />
            </Row>}
          </section>
        </div>
      </main>

      <div className="bar">
        <output>{dirty ? text.bar.unsaved : status}</output>
        <button disabled={!dirty} onClick={() => {setDraft(saved);if (!saved.presets[current]) setCurrent(saved.default);}}>{text.bar.undo}</button>
        <button className="primary" disabled={!dirty} onClick={save}>{text.bar.save}</button>
      </div>
    </>
  );
}

// One kind of image: whether it is made, how often, what to add to its prompts, and the image service preset that draws it.
function KindRow({kind, preset, images, change}: {
  kind: ImageKind; preset: Preset; images: ImagePreset[]; change: (edit: (preset: Preset) => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const choice = preset.kinds[kind], needs = NEEDS[kind], blocked = !!needs && !preset.kinds[needs].on;
  const label = text.kinds[kind], on = choice.on && !blocked;
  const notes = choice.notes;
  const use = KIND_USE[kind], mounted = preset.drawing.uses[use] ?? '', fits = images.filter(p => p.uses.includes(use));
  return (
    <div className={on ? 'kind' : 'kind off'}>
      <div className="kind-head">
        <Switch checked={on} label={label} disabled={blocked} onChange={v => change(p => {p.kinds[kind].on = v;})} />
        <span className="label">{label}</span>
      </div>
      <div className="kind-body">
        {DENSITY_KINDS.has(kind)
          ? <Segmented small value={choice.density} options={['few', 'medium', 'rich'] as const} labels={text.options.density}
            label={label} onChange={v => change(p => {p.kinds[kind].density = v;})} />
          : <span className="fixed">{text.kind.asNeeded}</span>}
        {SEARCH_KINDS.has(kind) && <button type="button" role="checkbox" className="check small" aria-checked={!!choice.search} title={text.kind.searchHint}
          onClick={() => change(p => {if (p.kinds[kind].search) delete p.kinds[kind].search;else p.kinds[kind].search = true;})}>
          <span className="box" aria-hidden="true" />{text.kind.search}</button>}
        <button type="button" className={notes ? 'more filled' : 'more'} onClick={() => setOpen(!open)}>
          {open ? text.kind.fold : notes ? `${text.kind.notes}${notes.length > 24 ? `${notes.slice(0, 24)}…` : notes}` : text.kind.addNotes}
        </button>
        {preset.drawing.mode === 'presets' && (
          <select className="kind-mount" aria-label={`${label} ${text.fields.drawing}`} value={mounted} onChange={event => change(p => {
            if (event.target.value) p.drawing.uses[use] = event.target.value; else delete p.drawing.uses[use];
          })}>
            <option value="">{text.drawing.none}</option>
            {fits.map(p => <option key={p.id} value={p.id}>{presetName(p)}</option>)}
            {mounted && !fits.some(p => p.id === mounted) && <option value={mounted}>{text.drawing.missing}</option>}
          </select>
        )}
        {open && (
          <textarea autoFocus value={notes} placeholder={text.placeholders.kindNotes(label)}
            onChange={event => change(p => {p.kinds[kind].notes = event.target.value;})} />
        )}
      </div>
    </div>
  );
}

/* Where the agent looks for files or voices: every source in the order it tries them, each ticked or not. Rows are
 * dragged up or down (or moved with the arrow keys on the handle); the generating row holds its preset and limit. */
function SourceList<T extends string>({value, onChange, labels = text.sound.sourceLabels, generate}: {
  value: {id: T; on: boolean}[]; onChange: (list: {id: T; on: boolean}[]) => void; labels?: Record<string, string>; generate?: React.ReactNode;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length || to === from) return;
    const next = [...value], [item] = next.splice(from, 1);next.splice(to, 0, item);onChange(next);
  };
  return (
    <ol className="source-list">
      {value.map((source, i) => (
        <li key={source.id} className={dragging === i ? 'dragging' : undefined} draggable
          onDragStart={event => {setDragging(i);event.dataTransfer.effectAllowed = 'move';event.dataTransfer.setData('text/plain', source.id);}}
          onDragOver={event => {event.preventDefault();if (dragging !== null && dragging !== i) {move(dragging, i);setDragging(i);}}}
          onDragEnd={() => setDragging(null)} onDrop={event => {event.preventDefault();setDragging(null);}}>
          <button type="button" role="checkbox" className="check" aria-checked={source.on}
            onClick={() => onChange(value.map(s => s.id === source.id ? {...s, on: !s.on} : s))}>
            <span className="box" aria-hidden="true" />{labels[source.id]}
          </button>
          {generate && source.id === 'generate' && source.on && <div className="inline">{generate}</div>}
          <button type="button" className="handle" aria-label={text.sound.reorder(labels[source.id])} title={text.sound.dragHint}
            onKeyDown={event => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {event.preventDefault();move(i, i + (event.key === 'ArrowUp' ? -1 : 1));}
            }}>⋮⋮</button>
        </li>
      ))}
    </ol>
  );
}
