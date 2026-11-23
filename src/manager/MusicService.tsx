import {useRef, useState} from 'react';
import {saveSecret, type AudioUse, type MusicField, type MusicPreset, type MusicPresetFile} from './api';
import {Hint, Row, Segmented, Switch} from './controls';
import {text} from './text';
import {detectMusicWorkflow, ELEVEN_MUSIC_MODELS, LYRIA_CLIP, LYRIA_MODELS, MUSIC_FIELDS, SOURCE_USES, musicPresetName} from '../production/music-presets.js';
import {parseWorkflow, workflowInputs} from '../production/image-presets.js';

const t = text.music;
const SECRET = {elevenlabs: 'elevenlabs', lyria: 'gemini', comfyui: 'comfyui'} as const;

/* One audio generation preset: what it is used for (music, sound effects or both), then its source's settings —
 * ElevenLabs (key; for music the model and instrumental switch, for effects how closely to follow the description),
 * Lyria through the Gemini API (key, model, instrumental) or a ComfyUI workflow (address, the uploaded API workflow and
 * which node input each field goes to) — and the length of a track. Changes are saved as they are made. */
export function MusicService({file, preset, save, setStatus}: {
  file: MusicPresetFile; preset: MusicPreset; save: (next: MusicPresetFile) => void; setStatus: (s: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [influence, setInfluence] = useState(preset.elevenlabs?.influence ?? 0.3);
  const change = (edit: (p: MusicPreset) => void) => {
    const next = structuredClone(file), p = next.presets.find(x => x.id === preset.id);
    if (p) {edit(p);save(next);}
  };
  const secret = SECRET[preset.source], hasKey = !!file.secrets?.[secret];
  const setKey = () => {
    const value = window.prompt(preset.source === 'lyria' ? t.geminiPrompt : t.keyPrompt);
    if (value === null) return;
    saveSecret(secret, value).then(r => {
      save({...file, secrets: {elevenlabs: !!r.secrets.elevenlabs, comfyui: !!r.secrets.comfyui, gemini: !!r.secrets.gemini}});
      setStatus(value ? t.keySaved : t.keyRemoved);
    }).catch(error => setStatus(error.message));
  };
  const comfy = preset.comfyui, music = preset.uses.includes('music'), effects = preset.uses.includes('effects');
  const clip = preset.lyria?.model === LYRIA_CLIP;
  let inputs: {node: string; input: string; title: string}[] = [];
  try {if (comfy?.workflow) inputs = workflowInputs(parseWorkflow(comfy.workflow));} catch {}
  const upload = (picked: File) => picked.text().then(workflow => {
    const map = detectMusicWorkflow(parseWorkflow(workflow));
    change(p => {p.comfyui = {...p.comfyui!, workflow, map};});setStatus(t.loaded(picked.name));
  }).catch(error => setStatus(error.message));
  const toggle = (use: AudioUse) => change(p => {
    p.uses = p.uses.includes(use) ? p.uses.filter(u => u !== use) : (['music', 'effects'] as const).filter(u => u === use || p.uses.includes(u));
  });
  return (
    <div className="form">
      <div className="title"><h1>{musicPresetName(preset as never)}</h1><Hint text={text.services.nameHint} /><span className="spacer" />
        <button className="ghost danger" onClick={() => save({...file, presets: file.presets.filter(p => p.id !== preset.id)})}>{t.remove}</button></div>
      <section>
        <h2>{text.services.basic}</h2>
        <Row name={text.services.source}><span className="tag">{t.sources[preset.source]}</span></Row>
        <Row name={text.services.uses} help={t.usesHint}>
          <div className="chips">{SOURCE_USES[preset.source].map(use => (
            <button key={use} className="chip" aria-pressed={preset.uses.includes(use as AudioUse)} onClick={() => toggle(use as AudioUse)}>{t.uses[use]}</button>
          ))}</div>
        </Row>
        <Row name={t.name}><input className="text narrow" value={preset.custom} placeholder={t.namePlaceholder} onChange={e => change(p => {p.custom = e.target.value;})} /></Row>
      </section>
      <section>
        <h2>{text.services.connection}</h2>
        {comfy ? <>
          <Row name={t.url}><input className="text narrow" value={comfy.url} onChange={e => change(p => {p.comfyui!.url = e.target.value;})} /></Row>
          <Row name={t.header} help={t.headerHint}>
            <span className={hasKey ? 'status-dot ok' : 'status-dot'}><i />{hasKey ? text.voices.keySet : text.services.headerUnset}</span>
          </Row>
        </> : <Row name={t.key} help={preset.source === 'lyria' ? t.geminiHint : t.keyHint}>
          <div className="inline"><span className={hasKey ? 'status-dot ok' : 'status-dot'}><i />{hasKey ? text.voices.keySet : text.voices.keyUnset}</span>
            <button className="ghost" onClick={setKey}>{hasKey ? text.voices.changeKey : text.voices.setKey}</button></div>
        </Row>}
      </section>
      {music && <section>
        <h2>{t.uses.music}</h2>
        {preset.elevenlabs && <Row name={t.model}>
          <Segmented small value={preset.elevenlabs.model} options={ELEVEN_MUSIC_MODELS} labels={Object.fromEntries(ELEVEN_MUSIC_MODELS.map(m => [m, m]))}
            onChange={model => change(p => {p.elevenlabs!.model = model;})} />
        </Row>}
        {preset.lyria && <Row name={t.model} help={t.lyriaHint}>
          <Segmented small value={preset.lyria.model} options={LYRIA_MODELS} labels={t.lyriaModels} onChange={model => change(p => {p.lyria!.model = model;})} />
        </Row>}
        {(preset.elevenlabs || preset.lyria) && <Row name={t.instrumental}>
          <Switch checked={(preset.elevenlabs ?? preset.lyria)!.instrumental} label={t.instrumental}
            onChange={v => change(p => {(p.elevenlabs ?? p.lyria)!.instrumental = v;})} />
        </Row>}
        <Row name={t.seconds} help={preset.lyria ? t.lyriaSecondsHint : undefined}>{clip ? <span className="tag">{t.clipSeconds}</span>
          : <input className="num" type="number" min={10} max={600} value={preset.seconds}
            onChange={e => change(p => {p.seconds = Math.min(600, Math.max(10, Math.round(Number(e.target.value) || 90)));})} />}</Row>
        {comfy && <Row name={t.workflow} help={t.workflowHint} block>
          <div className="inline"><span className="tag">{comfy.workflow ? `${Math.round(comfy.workflow.length / 1024)} KB` : t.noWorkflow}</span>
            <button className="ghost" onClick={() => input.current?.click()}>{comfy.workflow ? t.replace : t.upload}</button>
            <input ref={input} type="file" accept=".json,application/json" hidden onChange={e => {const f = e.target.files?.[0];e.target.value = '';if (f) void upload(f);}} /></div>
          {comfy.workflow && <div className="mapping top-gap">{(MUSIC_FIELDS as MusicField[]).map(field => (
            <label key={field}><span>{t.fields[field]}</span>
              <select value={comfy.map[field]?.join('|') ?? ''} onChange={e => change(p => {
                const value = e.target.value;
                if (value) p.comfyui!.map[field] = value.split('|') as [string, string];else delete p.comfyui!.map[field];
              })}>
                <option value="">{t.notFilled}</option>
                {inputs.map(i => <option key={`${i.node}|${i.input}`} value={`${i.node}|${i.input}`}>{`${i.title} · ${i.input}（#${i.node}）`}</option>)}
              </select>
            </label>
          ))}</div>}
        </Row>}
      </section>}
      {effects && preset.elevenlabs && <section>
        <h2>{t.uses.effects}</h2>
        <Row name={text.sounds.influence} help={text.sounds.influenceHint}>
          <div className="inline"><input type="range" min="0" max="1" step="0.1" value={influence} onChange={e => setInfluence(Number(e.target.value))}
            onPointerUp={() => change(p => {p.elevenlabs!.influence = influence;})} onKeyUp={() => change(p => {p.elevenlabs!.influence = influence;})} />
            <span>{influence.toFixed(1)}</span></div>
        </Row>
      </section>}
    </div>
  );
}
