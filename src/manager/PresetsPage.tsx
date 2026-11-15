import {useEffect, useState} from 'react';
import type {ImageKind, Preset, PresetFile} from '../types/production';
import {BUILT_IN_PRESETS, DENSITY_KINDS, IMAGE_KINDS, RATIOS} from '../production/presets.js';
import {presetName} from '../production/image-presets.js';
import {loadImagePresets, loadPresets, savePresets, type ImagePreset} from './api';
import {Row, Segmented, Switch} from './controls';
import {text} from './text';

// Variants need the images they vary.
const NEEDS: Partial<Record<ImageKind, ImageKind>> = {characterVariants: 'standing', locationVariants: 'location'};
// The use that draws each kind, as in Generation.tsx: every background kind shares one mount, so their selects move together.
const KIND_USE: Record<ImageKind, keyof Preset['drawing']['uses']> = {cover: 'cover', ambient: 'background', location: 'background', cg: 'cg', closeup: 'cutin',
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
  useEffect(() => {
    loadImagePresets().then(file => setImages(file.presets)).catch(() => {});
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
              <Segmented value={preset.delivery} options={['text', 'prompts', 'images'] as const} labels={text.options.delivery}
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
              <Segmented value={preset.orientation} options={['landscape', 'portrait'] as const} labels={text.options.orientation}
                onChange={v => change(p => {p.orientation = v;p.ratio = RATIOS[v][0];})} />
              <select className="inline" aria-label={text.fields.ratio} value={preset.ratio}
                onChange={event => change(p => {p.ratio = event.target.value;})}>
                {RATIOS[preset.orientation].map(ratio => <option key={ratio}>{ratio}</option>)}
              </select>
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
