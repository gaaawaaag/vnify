import {useEffect, useRef, useState, type ReactNode} from 'react';
import {listModels, loadImagePresets, probe, saveImagePresets, saveSecret, type ImagePreset, type ImagePresetFile, type ImageUse, type WorkflowField, type WorkflowMap} from './api';
import {Hint, Row, Segmented, Switch} from './controls';
import {text} from './text';
import {VoiceService} from './VoiceService';
import {SoundService} from './SoundService';
import {MusicService} from './MusicService';
import {ImageSearchService} from './ImageSearchService';
import {newMusicPreset, musicPresetName} from '../production/music-presets.js';
import {loadMusicPresets, loadSoundServices, loadVoices, saveMusicPresets, type MusicPreset, type MusicPresetFile, type SoundServices, type VoiceLibrary} from './api';
import {IMAGE_SEARCH_SOURCES} from '../production/image-search.js';
import {
  API_SERVICES, DEFAULT_SIZES, FIELD_LABELS, IMAGE_USES, NAI_MODELS, apiBase, apiSecret, NAI_SAMPLERS, NAI_SCHEDULES, SHAPES, detectWorkflow, fieldKind, newPreset, parseWorkflow, presetName,
  workflowInputs, canEdit, referenceLimit,
} from '../production/image-presets.js';

const t = text.services;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const cutoutOnly = (p: ImagePreset) => p.uses.length === 1 && p.uses[0] === 'cutout';

/* Generation and search services. Images: presets for how each kind of picture is drawn (NovelAI, a ComfyUI workflow or
 * an OpenAI-compatible API), named from their settings, edited as a draft of image-presets.json; and photo libraries to
 * search (Pexels, Pixabay). Speech: the speech services and the voice library (VoiceService). Music and effects: audio
 * presets (ElevenLabs, ComfyUI, Lyria) and the libraries searched for existing files (Freesound, the local library). Speech,
 * audio and library settings are saved as they change. Keys are saved on their own and never come back to the page. */
const FISH = 'fish', ELEVEN_VOICE = 'elevenlabs-voice', GEMINI_VOICE = 'gemini-voice', SOUND_PAGES = ['freesound', 'local'] as const, FOLD_KEY = 'vn-manager-services-folded';
const AUDIO_SOURCES = ['elevenlabs', 'comfyui', 'lyria'] as const;
type Kind = 'image' | 'voice' | 'audio';
export function ServicesPage() {
  const [saved, setSaved] = useState<ImagePresetFile | null>(null);
  const [draft, setDraft] = useState<ImagePresetFile | null>(null);
  const [current, setCurrent] = useState('');
  const [secrets, setSecrets] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState('');
  // The voice library's summary for the list; the Fish Audio page loads and saves the library itself.
  const [voices, setVoices] = useState<VoiceLibrary | null>(null);
  const [sounds, setSounds] = useState<SoundServices | null>(null);
  const [music, setMusic] = useState<MusicPresetFile | null>(null);
  // Each kind of service folds away in the list; remembered on this machine.
  const [folded, setFolded] = useState<Set<Kind>>(() => {
    try {const list = JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]');return new Set(Array.isArray(list) ? list : []);} catch {return new Set();}
  });
  const fold = (kind: Kind) => setFolded(old => {
    const next = new Set(old);if (!next.delete(kind)) next.add(kind);
    try {localStorage.setItem(FOLD_KEY, JSON.stringify([...next]));} catch {/* not kept */}
    return next;
  });
  // A kind's heading: the name folds it (with a count while folded); a quiet menu beside it adds a preset of the kind.
  const head = (kind: Kind, count: number | null, menu?: ReactNode) => (
    <div className="kind-row">
      <button className="kind-group" aria-expanded={!folded.has(kind)} onClick={() => fold(kind)}>
        {t.kinds[kind]}{folded.has(kind) && count !== null && <small>{count}</small>}
      </button>
      {menu}
    </div>
  );
  useEffect(() => {
    loadImagePresets().then(file => {setSaved(file);setDraft(file);setSecrets(file.secrets ?? {});setCurrent(old => old || (file.presets[0]?.id ?? ''));})
      .catch(error => setStatus(t.loadFailed + error.message));
    loadVoices().then(setVoices).catch(() => {});
    loadSoundServices().then(setSounds).catch(() => {});
    loadMusicPresets().then(setMusic).catch(() => {});
  }, []);
  if (!draft || !saved) return <main><p className="status">{status}</p></main>;
  const preset = draft.presets.find(p => p.id === current) ?? null;
  // Functional updates, so quick successive edits all land.
  const change = (edit: (p: ImagePreset) => void) => {
    setDraft(old => {const next = structuredClone(old!), p = next.presets.find(x => x.id === current);if (p) edit(p);return next;});setStatus('');
  };
  const add = (source: string) => {
    const id = `p${Date.now().toString(36)}`;
    setDraft({...draft, presets: [...draft.presets, newPreset(source, id) as unknown as ImagePreset]});setCurrent(id);
  };
  // Music presets save as they change; the newest copy wins when two saves cross.
  const saveMusic = (next: MusicPresetFile) => {
    setMusic(next);
    saveMusicPresets(next).then(saved => {setMusic(old => old === next ? {...saved, secrets: next.secrets} : old);setStatus(text.music.saved);}).catch(error => setStatus(error.message));
  };
  const save = () => saveImagePresets(draft).then(file => {setSaved(file);setDraft(file);setStatus(t.saved);}).catch(error => setStatus(error.message));
  const dirty = !same(draft, saved);
  return (
    <>
      <main className="services-main">
        <div className="services">
          <div className="plist">
            {head('image', draft.presets.length + IMAGE_SEARCH_SOURCES.length,
              <select className="add-menu" value="" aria-label={t.add} onChange={event => event.target.value && add(event.target.value)}>
                <option value="">{t.add}</option><option value="novelai">NovelAI</option><option value="comfyui">ComfyUI</option>
                <option value="openai">{t.sources.openai}</option>
              </select>)}
            {!folded.has('image') && (['novelai', 'comfyui', 'openai'] as const).map(source => {
              const list = draft.presets.filter(p => p.source === source);
              return list.length ? (
                <div key={source}>
                  <div className="group">{t.sources[source]}</div>
                  {list.map(p => (
                    <button key={p.id} className="p" aria-current={p.id === current ? 'true' : undefined} onClick={() => setCurrent(p.id)}>
                      {presetName(p)}
                      <small>{p.uses.map(u => text.uses[u]).join('、') || t.noUse}{p.transparent && !cutoutOnly(p) ? ` · ${t.transparentShort}` : ''}</small>
                    </button>
                  ))}
                </div>
              ) : null;
            })}
            {!folded.has('image') && !draft.presets.length && <p className="help pad">{t.empty}</p>}
            {!folded.has('image') && <div>
              <div className="group">{t.searchGroup}</div>
              {IMAGE_SEARCH_SOURCES.map(source => (
                <button key={source} className="p" aria-current={current === `search:${source}` ? 'true' : undefined} onClick={() => setCurrent(`search:${source}`)}>
                  {text.imageSearch.names[source]}<small>{text.sounds.summary(!!secrets[source])}</small>
                </button>
              ))}
            </div>}
            {head('voice', voices?.voices.length ?? null)}
            {!folded.has('voice') && ([[FISH, 'fish', text.voices.title], [ELEVEN_VOICE, 'elevenlabs', text.voices.eleven.title],
              [GEMINI_VOICE, 'gemini', text.voices.gemini.title]] as const).map(([page, provider, title]) => (
              <button key={page} className="p" aria-current={current === page ? 'true' : undefined} onClick={() => setCurrent(page)}>
                {title}
                <small>{voices ? text.voices.summary(voices.voices.filter(v => v.provider === provider).length,
                  text.voices.models[voices[provider].model] ?? voices[provider].model) : text.voices.subtitle}</small>
              </button>
            ))}
            {head('audio', music?.presets.length ?? null,
              <select className="add-menu" value="" aria-label={t.add} onChange={event => {
                if (!music || !event.target.value) return;
                const preset = newMusicPreset(event.target.value, `m${Date.now().toString(36)}`) as unknown as MusicPreset;
                saveMusic({...music, presets: [...music.presets, preset]});setCurrent(`music:${preset.id}`);
              }}><option value="">{t.add}</option>
                {AUDIO_SOURCES.map(source => <option key={source} value={source}>{text.music.sources[source]}</option>)}</select>)}
            {!folded.has('audio') && AUDIO_SOURCES.map(source => {
              const list = music?.presets.filter(p => p.source === source) ?? [];
              return list.length ? (
                <div key={source}>
                  <div className="group">{text.music.sources[source]}</div>
                  {list.map(p => (
                    <button key={p.id} className="p" aria-current={current === `music:${p.id}` ? 'true' : undefined} onClick={() => setCurrent(`music:${p.id}`)}>
                      {musicPresetName(p as never)}<small>{p.uses.map(u => text.music.uses[u]).join('、') || t.noUse}</small>
                    </button>
                  ))}
                </div>
              ) : null;
            })}
            {!folded.has('audio') && music && !music.presets.length && <p className="help pad">{text.music.empty}</p>}
            {!folded.has('audio') && <div>
              <div className="group">{text.sounds.libraries}</div>
              {SOUND_PAGES.map(page => (
                <button key={page} className="p" aria-current={current === page ? 'true' : undefined} onClick={() => setCurrent(page)}>
                  {text.sounds[page]}
                  <small>{page === 'freesound' ? text.sounds.summary(!!sounds?.secrets?.freesound)
                    : text.sounds.localSummary(sounds?.localCount ?? null, sounds?.musicCount ?? null)}</small>
                </button>
              ))}
            </div>}
          </div>
          {current === FISH || current === ELEVEN_VOICE || current === GEMINI_VOICE
            ? <VoiceService key={current} provider={current === FISH ? 'fish' : current === ELEVEN_VOICE ? 'elevenlabs' : 'gemini'} setStatus={setStatus} onLibrary={setVoices} />
            : current.startsWith('music:') && music?.presets.some(p => `music:${p.id}` === current)
              ? <MusicService key={current} file={music} preset={music.presets.find(p => `music:${p.id}` === current)!} save={saveMusic} setStatus={setStatus} />
            : (SOUND_PAGES as readonly string[]).includes(current)
              ? <SoundService key={current} which={current as typeof SOUND_PAGES[number]} setStatus={setStatus} onServices={setSounds} />
            : current.startsWith('search:')
              ? <ImageSearchService key={current} source={current.slice('search:'.length) as typeof IMAGE_SEARCH_SOURCES[number]} secrets={secrets}
                setSecrets={setSecrets} setStatus={setStatus} />
            : preset ? <PresetForm key={preset.id} preset={preset} change={change} secrets={secrets} setSecrets={setSecrets} setStatus={setStatus}
            copy={() => {const id = `p${Date.now().toString(36)}`;setDraft({...draft, presets: [...draft.presets, {...structuredClone(preset), id, custom: `${preset.custom} ${t.copySuffix}`.trim()}]});setCurrent(id);}}
            remove={() => {const presets = draft.presets.filter(p => p.id !== preset.id);setDraft({...draft, presets});setCurrent(presets[0]?.id ?? '');}} />
            : <div className="form"><p className="help">{t.pick}</p><Help /></div>}
        </div>
      </main>
      <div className="bar">
        <output>{status || (dirty ? text.bar.unsaved : '')}</output>
        <button disabled={!dirty} onClick={() => {setDraft(saved);if (!saved.presets.some(p => p.id === current)) setCurrent(saved.presets[0]?.id ?? '');}}>{text.bar.undo}</button>
        <button className="primary" disabled={!dirty} onClick={save}>{text.bar.save}</button>
      </div>
    </>
  );
}

const num = (value: string, fallback: number) => {const n = Number(value);return Number.isFinite(n) ? n : fallback;};

function PresetForm({preset: p, change, secrets, setSecrets, setStatus, copy, remove}: {
  preset: ImagePreset; change: (edit: (p: ImagePreset) => void) => void; secrets: Record<string, boolean>;
  setSecrets: (s: Record<string, boolean>) => void; setStatus: (s: string) => void; copy: () => void; remove: () => void;
}) {
  const only = cutoutOnly(p), nai = p.source === 'novelai', api = p.source === 'openai', v5 = p.model.startsWith('nai-diffusion-5');
  const portrait = p.uses.includes('standing') || p.uses.includes('variant'), images = api && p.openai!.protocol === 'images', comfy = p.source === 'comfyui';
  const check = () => probe(p.source, api ? p.openai!.url : p.comfyui?.url)
    .then(result => setStatus(nai ? t.probeNai(String(result.tier)) : api ? t.probeApi(String(result.service), String(result.credit ?? ''), String(result.models ?? ''))
      : t.probeComfy(String(result.version), String(result.device))))
    .catch(error => setStatus(error.message));
  const key = (name: string) => {
    const value = window.prompt(name === 'novelai' ? t.keyPrompt : name === 'comfyui' ? t.headerPrompt : t.apiKeyPrompt(apiBase(p.openai!.url)));
    if (value === null) return;
    saveSecret(name, value).then(r => {setSecrets(r.secrets);setStatus(value ? t.keySaved : t.keyRemoved);}).catch(error => setStatus(error.message));
  };
  return (
    <div className="form">
      <div className="title">
        <h1>{presetName(p)}</h1><Hint text={t.nameHint} /><span className="spacer" />
        <button className="ghost" onClick={copy}>{t.copy}</button><button className="ghost danger" onClick={remove}>{t.remove}</button>
      </div>
      <section>
        <h2>{t.basic}</h2>
        <Row name={t.source}><span className="tag">{t.sources[p.source]}</span></Row>
        {!(nai && only) && <Row name={t.model}>{nai
          ? <select value={p.model} onChange={e => change(x => {x.model = e.target.value;if (!x.model.startsWith('nai-diffusion-5')) x.transparent = false;})}>
            {Object.entries(NAI_MODELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          : api ? <ApiModel preset={p} change={change} setStatus={setStatus} />
          : <input className="text wide" value={p.model} placeholder={t.modelPlaceholder} onChange={e => change(x => {x.model = e.target.value;})} />}</Row>}
        <Row name={t.uses} help={t.usesHint} block>
          <div className="chips">{IMAGE_USES.filter(use => !(api && use === 'cutout')).map(use => (
            <button key={use} className="chip" aria-pressed={p.uses.includes(use)}
              onClick={() => change(x => {x.uses = x.uses.includes(use) ? x.uses.filter(u => u !== use) : [...x.uses, use as ImageUse];})}>{text.uses[use]}</button>
          ))}</div>
        </Row>
        <Row name={t.custom}><input className="text narrow" value={p.custom} placeholder={t.customPlaceholder} onChange={e => change(x => {x.custom = e.target.value;})} /></Row>
      </section>
      <section>
        <h2>{t.connection}</h2>
        {nai ? <Row name={t.key} help={t.keyHint}>
          <div className="inline"><span className={secrets.novelai ? 'status-dot ok' : 'status-dot'}><i />{secrets.novelai ? t.keySet : t.keyUnset}</span>
            <button className="ghost" onClick={() => key('novelai')}>{secrets.novelai ? t.changeKey : t.setKey}</button>
            <button className="ghost" disabled={!secrets.novelai} onClick={check}>{t.probe}</button></div>
        </Row> : api ? <ApiConnection preset={p} change={change} secrets={secrets} setKey={() => key(apiSecret(p.openai!.url))} check={check} />
        : <>
          <Row name={t.url}>
            <div className="inline"><input className="text narrow" value={p.comfyui!.url} onChange={e => change(x => {x.comfyui!.url = e.target.value;})} />
              <button className="ghost" onClick={check}>{t.probe}</button></div>
          </Row>
          <Row name={t.header} help={t.headerHint}>
            <div className="inline"><span className={secrets.comfyui ? 'status-dot ok' : 'status-dot'}><i />{secrets.comfyui ? t.keySet : t.headerUnset}</span>
              <button className="ghost" onClick={() => key('comfyui')}>{secrets.comfyui ? t.changeKey : t.setHeader}</button></div>
          </Row>
        </>}
      </section>
      {p.source === 'comfyui' && <WorkflowSection preset={p} change={change} only={only} setStatus={setStatus} />}
      {only ? <section><h2>{t.cutoutTitle}<Hint text={nai ? t.cutoutNai : t.cutoutComfy} /></h2></section> : <>
        <section>
          <h2>{t.prompts}</h2>
          <Row name={t.positive} block>
            <textarea value={p.positive} placeholder={t.positivePlaceholder} onChange={e => change(x => {x.positive = e.target.value;})} />
            <div className="inline top-gap"><span className="tag">{t.position}</span>
              <Segmented small value={p.positiveAt} options={['before', 'after'] as const} labels={t.positions} onChange={v => change(x => {x.positiveAt = v;})} /></div>
          </Row>
          {!api && <Row name={t.negative} block><textarea value={p.negative} placeholder={t.negativePlaceholder} onChange={e => change(x => {x.negative = e.target.value;})} /></Row>}
          <Row name={t.format} block><textarea value={p.format.notes} placeholder={t.formatPlaceholder} onChange={e => change(x => {x.format.notes = e.target.value;})} /></Row>
          {(api ? p.openai!.edit : !nai) && <Row name={t.refLabel}>
            <input className="text narrow" value={p.format.refLabel} placeholder={t.refLabelPlaceholder} onChange={e => change(x => {x.format.refLabel = e.target.value;})} />
          </Row>}
          {canEdit(p) && <Row name={t.formatEdit}>
            <Segmented small value={p.format.edit} options={['instruction', 'full'] as const} labels={t.formatEdits} onChange={v => change(x => {x.format.edit = v;})} />
          </Row>}
        </section>
        <section>
          <h2>{t.params}{api && <Hint text={t.apiParams} />}</h2>
          {nai && <Row name={t.sampler}><div className="inline">
            <select value={p.novelai!.sampler} onChange={e => change(x => {x.novelai!.sampler = e.target.value;})}>{NAI_SAMPLERS.map(s => <option key={s}>{s}</option>)}</select>
            <select value={p.novelai!.schedule} onChange={e => change(x => {x.novelai!.schedule = e.target.value;})}>{NAI_SCHEDULES.map(s => <option key={s}>{s}</option>)}</select>
          </div></Row>}
          {nai && <Row name={t.stepsCfg}>
            <div className="inline">
              <label>{t.steps} <input className="num" type="number" value={p.novelai!.steps} onChange={e => change(x => {x.novelai!.steps = num(e.target.value, 28);})} /></label>
              <label>CFG <input className="num" type="number" step="0.5" value={p.novelai!.scale} onChange={e => change(x => {x.novelai!.scale = num(e.target.value, 5);})} /></label>
              <label>CFG Rescale <input className="num" type="number" step="0.02" value={p.novelai!.rescale}
                onChange={e => change(x => {x.novelai!.rescale = num(e.target.value, 0);})} /></label>
            </div>
          </Row>}
          {!api && <Row name={t.seed} help={t.seedHint}>
            <div className="inline">
              <Segmented small value={p.seed === 'random' ? 'random' : 'fixed'} options={['random', 'fixed'] as const} labels={t.seeds}
                onChange={v => change(x => {x.seed = v === 'random' ? 'random' : 1;})} />
              {p.seed !== 'random' && <input className="num wide-num" type="number" value={p.seed} onChange={e => change(x => {x.seed = Math.max(0, Math.floor(num(e.target.value, 1)));})} />}
            </div>
          </Row>}
          {(!api || images) && <Row name={t.sizes} help={api ? t.apiSizesHint : t.sizesHint} block>
            <div className="sizes">{SHAPES.map(shape => (
              <label key={shape}><b>{shape}</b>
                {[0, 1].map(i => <input key={i} type="number" value={p.sizes[shape]?.[i] ?? DEFAULT_SIZES[shape as keyof typeof DEFAULT_SIZES][i]}
                  onChange={e => change(x => {const size = [...(x.sizes[shape] ?? DEFAULT_SIZES[shape as keyof typeof DEFAULT_SIZES])] as [number, number];size[i] = Math.round(num(e.target.value, size[i]));x.sizes[shape] = size;})} />)
                  .reduce<React.ReactNode[]>((all, input, i) => i ? [...all, '×', input] : [input], [])}
              </label>
            ))}</div>
          </Row>}
          {nai && <Row name={t.free} help={t.freeHint}>
            <Switch checked={p.novelai!.free} label={t.free} onChange={v => change(x => {x.novelai!.free = v;})} /></Row>}
        </section>
        {(nai || images || portrait) && <section>
          <h2>{t.output}{portrait && <Hint text={t.afterCutout} />}</h2>
          {images && <Row name={t.background} help={t.transparentApi}>
            <Segmented small value={p.transparent ? 'yes' : 'no'} options={['no', 'yes'] as const} labels={t.transparency2}
              onChange={v => change(x => {x.transparent = v === 'yes';})} />
          </Row>}
          {nai && <Row name={t.background} help={v5 ? t.transparentV5 : t.transparentNeedsV5}>
            <Segmented small value={p.transparent ? 'yes' : 'no'} options={['no', 'yes'] as const} labels={t.transparency}
              onChange={v => change(x => {x.transparent = v === 'yes';})} />
          </Row>}
          {comfy && portrait && <Row name={t.background} help={t.transparentComfy}>
            <Segmented small value={p.transparent ? 'yes' : 'no'} options={['no', 'yes'] as const} labels={t.transparencyComfy}
              onChange={v => change(x => {x.transparent = v === 'yes';})} />
          </Row>}
          {p.transparent && portrait && <Row name={t.transparentWrap} help={t.transparentWrapHint} block>
            <textarea value={p.format.transparent} placeholder={t.transparentWrapPlaceholder} onChange={e => change(x => {x.format.transparent = e.target.value;})} />
          </Row>}
        </section>}
        {portrait && <section>
          <h2>{t.variants}</h2>
          {nai ? <>
            <Row name={t.variantMode} help={t.img2imgHint}>
              <Segmented small value={p.novelai!.variantMode} options={['img2img', 'generate'] as const} labels={t.variantModes}
                onChange={v => change(x => {x.novelai!.variantMode = v;})} />
            </Row>
            {p.novelai!.variantMode === 'img2img' && <Row name={t.strengthNoise}><div className="inline">
              <label>{t.strength} <input className="num" type="number" step="0.05" value={p.novelai!.strength} onChange={e => change(x => {x.novelai!.strength = num(e.target.value, .55);})} /></label>
              <label>{t.noise} <input className="num" type="number" step="0.05" value={p.novelai!.noise} onChange={e => change(x => {x.novelai!.noise = num(e.target.value, .1);})} /></label>
            </div></Row>}
          </> : api ? <Row name={t.variantMode} help={t.apiEditHint}>
            <Segmented small value={p.openai!.edit ? 'edit' : 'generate'} options={['edit', 'generate'] as const} labels={t.apiVariantModes}
              onChange={v => change(x => {x.openai!.edit = v === 'edit';})} />
          </Row> : <Row name={t.variantMode}><span className="tag">{p.comfyui!.edit ? t.comfyEdit : t.comfyRegenerate}</span></Row>}
        </section>}
      </>}
      <Help />
    </div>
  );
}

type Change = (edit: (p: ImagePreset) => void) => void;

// The service (a known one or another address), how it is called, and its key, kept per address.
function ApiConnection({preset: p, change, secrets, setKey, check}: {preset: ImagePreset; change: Change; secrets: Record<string, boolean>; setKey: () => void; check: () => void}) {
  const o = p.openai!, known = API_SERVICES.find(s => s.url === apiBase(o.url)), has = !!secrets[apiSecret(o.url)];
  const pick = (url: string) => {
    const s = API_SERVICES.find(x => x.url === url);
    change(x => {if (s) {x.openai!.url = s.url;x.openai!.protocol = s.protocol as 'images' | 'chat';if (s.protocol === 'chat') x.transparent = false;} else x.openai!.url = '';});
  };
  return <>
    <Row name={t.service} help={t.apiUrlHint}>
      <div className="inline">
        <select value={known?.url ?? ''} onChange={e => pick(e.target.value)}>
          {API_SERVICES.map(s => <option key={s.url} value={s.url}>{s.label}</option>)}<option value="">{t.serviceCustom}</option>
        </select>
        <input className="text narrow" value={o.url} placeholder="https://…/v1" onChange={e => change(x => {x.openai!.url = e.target.value;})} />
      </div>
    </Row>
    <Row name={t.protocol} help={t.protocolHint[o.protocol]}>
      <Segmented small value={o.protocol} options={['chat', 'images'] as const} labels={t.protocols}
        onChange={v => change(x => {x.openai!.protocol = v;if (v === 'chat') x.transparent = false;})} />
    </Row>
    <Row name={t.key} help={t.apiKeyHint}>
      <div className="inline"><span className={has ? 'status-dot ok' : 'status-dot'}><i />{has ? t.keySet : t.keyUnset}</span>
        <button className="ghost" disabled={!o.url} onClick={setKey}>{has ? t.changeKey : t.setKey}</button>
        <button className="ghost" disabled={!o.url} onClick={check}>{t.probe}</button></div>
    </Row>
  </>;
}

// The model: typed, or picked from the list the service gives (fetched on request, kept while the form is open).
function ApiModel({preset: p, change, setStatus}: {preset: ImagePreset; change: Change; setStatus: (s: string) => void}) {
  const [models, setModels] = useState<{id: string; name: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const load = () => {
    setLoading(true);
    listModels(p.openai!.url).then(r => {setModels(r.models);setStatus(t.modelsLoaded(r.models.length, r.filtered));})
      .catch(error => setStatus(error.message)).finally(() => setLoading(false));
  };
  return (
    <div className="inline">
      <input className="text wide" list={`models-${p.id}`} value={p.model} placeholder={t.modelIdPlaceholder} onChange={e => change(x => {x.model = e.target.value.trim();})} />
      <datalist id={`models-${p.id}`}>{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</datalist>
      <button className="ghost" disabled={!p.openai!.url || loading} onClick={load}>{loading ? t.loadingModels : t.loadModels}</button>
    </div>
  );
}

function WorkflowSection({preset: p, change, only, setStatus}: {preset: ImagePreset; change: (edit: (p: ImagePreset) => void) => void; only: boolean; setStatus: (s: string) => void}) {
  type Kind = 'generate' | 'edit' | 'reference';
  const file = useRef<HTMLInputElement>(null), target = useRef<Kind>('generate');
  const pick = (kind: Kind) => {target.current = kind;file.current?.click();};
  const mapKey = (kind: Kind) => kind === 'generate' ? 'generateMap' : kind === 'edit' ? 'editMap' : 'referenceMap';
  // A picture workflow is read for its image loader; a reference workflow for its size and its loaders in order.
  const detectAs = (kind: Kind) => kind === 'edit' ? true : kind === 'reference' ? 'reference' as const : false;
  const load = (picked: File | undefined) => {
    if (!picked) return;
    const kind = target.current;
    picked.text().then(content => {
      let data: Record<string, unknown>;
      try {data = parseWorkflow(content);} catch (error) {setStatus((error as Error).message);return;}
      change(x => {x.comfyui![kind] = content;x.comfyui![mapKey(kind)] = detectWorkflow(data, detectAs(kind));});setStatus(t.workflowLoaded(picked.name));
    });
  };
  // Generating fills the prompt, seed and size; a picture workflow gets the picture (and, for edits, the prompt).
  const fields = (kind: Kind): WorkflowField[] =>
    kind === 'generate' ? ['prompt', 'negative', 'seed', 'width', 'height'] : kind === 'reference' ? ['prompt', 'negative', 'seed', 'width', 'height', 'image', 'image2', 'image3']
      : only ? ['image'] : ['image', 'prompt', 'negative', 'seed'];
  const slot = (kind: Kind, label: string, help?: string) => {
    const workflow = p.comfyui![kind], map: WorkflowMap = p.comfyui![mapKey(kind)] ?? {};
    let inputs: ReturnType<typeof workflowInputs> = [];
    try {inputs = workflow ? workflowInputs(parseWorkflow(workflow)) : [];} catch {/* shown as a save error */}
    const choose = (field: WorkflowField, value: string) => change(x => {
      const next = {...x.comfyui![mapKey(kind)]};
      if (value) next[field] = JSON.parse(value);else delete next[field];
      x.comfyui![mapKey(kind)] = next;
    });
    return (
      <Row name={label} help={help} block>
        <div className="drop">
          {workflow ? <>
            <div className="file"><b>{t.workflowSize(Math.round(workflow.length / 1024))}</b>
              <button className="ghost" onClick={() => pick(kind)}>{t.replaceWorkflow}</button>
              <button className="ghost" onClick={() => change(x => {x.comfyui![mapKey(kind)] = detectWorkflow(parseWorkflow(workflow), detectAs(kind));})}>{t.redetect}</button>
              <button className="ghost danger" onClick={() => change(x => {x.comfyui![kind] = null;x.comfyui![mapKey(kind)] = {};})}>{t.remove}</button></div>
            <div className="mapping">{fields(kind).map(field => (
              <label key={field}><span>{FIELD_LABELS[field]}</span>
                <select value={map[field] ? JSON.stringify(map[field]) : ''} onChange={e => choose(field, e.target.value)}>
                  <option value="">{t.notFilled}</option>
                  {inputs.filter(i => i.kind === fieldKind(field)).map(i => (
                    <option key={`${i.node}/${i.input}`} value={JSON.stringify([i.node, i.input])}>{inputLabel(i)}</option>
                  ))}
                </select>
              </label>
            ))}</div>
            {kind !== 'generate' && !map.image && <p className="warn">{t.needImage}</p>}
            {kind !== 'edit' && !map.prompt && <p className="warn">{t.needPrompt}</p>}
          </> : <div className="file"><span className="tag">{t.noWorkflow}</span><button className="ghost" onClick={() => pick(kind)}>{t.uploadWorkflow}</button></div>}
        </div>
      </Row>
    );
  };
  return (
    <section>
      <h2>{t.workflows}<Hint text={only ? t.cutoutWorkflowHint : t.workflowHint} /></h2>
      {only ? slot('edit', t.cutoutWorkflow) : <>{slot('generate', t.generateWorkflow)}{slot('edit', t.editWorkflow)}
        {p.uses.includes('cg') && slot('reference', t.referenceWorkflow, t.referenceWorkflowHint)}</>}
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => {load(e.target.files?.[0]);e.target.value = '';}} />
    </section>
  );
}

// “#30:6 直接编码提示词 · text：a girl…” — the node, its title, the input and what it holds now.
function inputLabel(i: {node: string; input: string; title: string; value: unknown}) {
  const value = String(i.value), shown = value.length > 24 ? `${value.slice(0, 24)}…` : value;
  return `#${i.node} ${i.title} · ${i.input}${shown ? `：${shown}` : ''}`;
}

function Help() {
  return (
    <details className="help-box">
      <summary>{t.helpTitle}</summary>
      {t.help.map((line, i) => <p key={i}>{line}</p>)}
    </details>
  );
}
