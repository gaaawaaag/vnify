import {useEffect, useRef, useState} from 'react';
import {audioUrl, editSounds, editTrack, fetchAudio, generateMusic, loadMusicPresets, removeAudio, restoreMusic, searchSounds, uploadAudio,
  type AudioKind, type BoundAudio, type MusicPreset, type SoundHit, type WorkDetail} from './api';
import {musicPresetName} from '../production/music-presets.js';
import {Hint} from './controls';
import {playSource, stopAudio, usePlaying} from './audio';
import {text} from './text';

const t = text.workAudio;
type Run = (action: Promise<WorkDetail>, done?: string) => Promise<boolean>;
export const PLACES = '__places';

// The sounds and tracks in the titles column: ambience first, then effects; each with whether it has a file.
export function AudioTitles({work, cat, current, pick}: {work: WorkDetail; cat: 'sound' | 'music'; current: string; pick: (key: string) => void}) {
  const audio = work.audio;
  const item = (key: string, label: string, sub: string, bound: boolean | null) => (
    <li key={key}><button aria-current={current === key ? 'true' : undefined} onClick={() => pick(key)}>
      {bound !== null && <span className={`dot${bound ? '' : ' missing'}`} />}
      <span className="label">{label}<span className="sub">{sub}</span></span>
    </button></li>
  );
  if (cat === 'music') return <>{(audio.music?.tracks ?? []).map(track => item(track.id, track.name,
    audio.bound.tracks[track.id]?.name ?? t.noFile, !!audio.bound.tracks[track.id]))}</>;
  const sounds = [...audio.sounds?.sounds ?? []].sort((a, b) => Number(a.kind === 'effect') - Number(b.kind === 'effect'));
  return <>
    {item(PLACES, t.places, Object.keys(audio.sounds?.places ?? {}).length + '/' + audio.locations.length, null)}
    {sounds.map(sound => item(sound.id, sound.name, `${sound.kind === 'ambience' ? t.ambience : t.effect} · ${audio.bound.sounds[sound.id]?.name ?? t.noFile}`,
      !!audio.bound.sounds[sound.id]))}
  </>;
}

/* A track's or a sound's file: play it, see where it came from, upload another (with its source) or take it away. */
function FilePart({work, kind, id, bound, run}: {work: WorkDetail; kind: AudioKind; id: string; bound: BoundAudio | undefined; run: Run}) {
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState({author: '', license: '', url: ''});
  const now = usePlaying(), key = `file:${bound?.fileId}`, on = now === key;
  const src = bound ? audioUrl(work.id, bound.fileId) : '';
  return (
    <section>
      <h2>{t.file}<Hint text={t.sourceHint} /></h2>
      {bound ? <div className="inline">
        <button className="play" aria-pressed={on} onClick={() => on ? stopAudio() : void playSource(key, src)}>{on ? '■' : '▶'}</button>
        <span>{bound.name}</span>
        <span className="tag">{Object.entries(bound.source ?? {}).filter(([k]) => k !== 'title').map(([, v]) => v).join(' · ')}</span>
        <span className="spacer" />
        <button className="ghost danger" onClick={() => run(removeAudio(work.id, kind, id), t.saved)}>{t.remove}</button>
      </div> : <p className="help">{t.noFile}</p>}
      <div className="inline top-gap">
        <input className="text" placeholder={t.author} value={source.author} onChange={e => setSource({...source, author: e.target.value})} />
        <input className="text" placeholder={t.license} value={source.license} onChange={e => setSource({...source, license: e.target.value})} />
        <input className="text" placeholder={t.link} value={source.url} onChange={e => setSource({...source, url: e.target.value})} />
        <button className="ghost" onClick={() => input.current?.click()}>{bound ? t.replace : t.upload}</button>
        <input ref={input} type="file" accept="audio/mpeg,audio/mp4,audio/ogg,.mp3,.m4a,.ogg" hidden onChange={e => {
          const file = e.target.files?.[0];e.target.value = '';
          if (file) void run(uploadAudio(work.id, kind, id, file, {title: file.name,
            ...Object.fromEntries(Object.entries(source).filter(([, v]) => v.trim()))}), t.saved);
        }} />
      </div>
    </section>
  );
}

/* Searching the local folder and Freesound together (for music, the local music library and Freesound's Music category);
 * a hit plays from where it is and is taken with its source. */
function SearchPart({work, kind = 'sounds', id, initial, run, setStatus}: {
  work: WorkDetail; kind?: AudioKind; id: string; initial: string; run: Run; setStatus: (s: string) => void;
}) {
  const [query, setQuery] = useState(initial);
  const [hits, setHits] = useState<SoundHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const now = usePlaying();
  useEffect(() => {setQuery(initial);setHits(null);}, [id, initial]);
  const search = () => {
    setBusy(true);
    searchSounds(query, undefined, kind).then(r => {setHits(r.results);setStatus(r.notes.join('；') || (r.results.length ? '' : t.noResults));})
      .catch(error => setStatus(error.message)).finally(() => setBusy(false));
  };
  return (
    <section>
      <h2>{t.search}</h2>
      <div className="inline">
        <input className="text wide" value={query} placeholder={t.query} onChange={e => setQuery(e.target.value)} onKeyDown={e => {if (e.key === 'Enter' && query.trim()) search();}} />
        <button className="ghost" disabled={busy || !query.trim()} onClick={search}>{busy ? t.searching : t.search}</button>
      </div>
      {hits && <div className="sound-hits">{hits.map(hit => {
        const key = `hit:${hit.key}`, on = now === key;
        return (
          <div key={hit.key} className="sound-hit">
            <button className="play" aria-pressed={on} onClick={() => on ? stopAudio() : void playSource(key, hit.preview).catch(error => setStatus(error.message))}>{on ? '■' : '▶'}</button>
            <span className="hit-name" title={hit.name}>{hit.name}</span>
            <span className="tag" title={hit.notes}>{[hit.source === 'local' ? t.local : t.freesoundShort, hit.duration ? t.seconds(hit.duration) : '', hit.author, hit.license]
              .filter(Boolean).join(' · ')}</span>
            <button className="ghost" onClick={() => run(fetchAudio(work.id, kind, id, hit), t.bound)}>{t.use}</button>
          </div>
        );
      })}{!hits.length && <p className="help">{t.noResults}</p>}</div>}
    </section>
  );
}

/* A sound generated from a description by an effects preset and bound at once; ambience comes out loopable. */
function GeneratePart({work, id, name, initial, loop, run, setStatus}: {
  work: WorkDetail; id: string; name: string; initial: string; loop: boolean; run: Run; setStatus: (s: string) => void;
}) {
  const [prompt, setPrompt] = useState(initial);
  const [seconds, setSeconds] = useState('');
  const [busy, setBusy] = useState(false);
  const [presets, setPresets] = useState<MusicPreset[]>([]);
  const [preset, setPreset] = useState('');
  useEffect(() => {
    loadMusicPresets().then(file => {const fits = file.presets.filter(p => p.uses.includes('effects'));setPresets(fits);setPreset(old => old || fits[0]?.id || '');})
      .catch(() => {});
  }, []);
  useEffect(() => {setPrompt(initial);}, [id, initial]);
  const generate = () => {
    setBusy(true);setStatus(t.generatingSound);
    void run(fetchAudio(work.id, 'sounds', id, {source: 'generate', preset, name, prompt: prompt.trim(), loop, ...(Number(seconds) ? {seconds: Number(seconds)} : {})}),
      t.generatedSound).finally(() => setBusy(false));
  };
  return (
    <section>
      <h2>{t.soundPrompt}<Hint text={t.generateHint} /></h2>
      <textarea value={prompt} maxLength={450} placeholder={t.soundPromptPlaceholder} onChange={e => setPrompt(e.target.value)} />
      <div className="inline top-gap">
        <input className="text narrow" type="number" min="0.5" max="30" step="0.5" value={seconds} placeholder={t.secondsAuto} onChange={e => setSeconds(e.target.value)} />
        <span className="spacer" />
        {presets.length ? <>
          <select aria-label={text.sound.effectPreset} value={preset} onChange={e => setPreset(e.target.value)}>
            {presets.map(p => <option key={p.id} value={p.id}>{musicPresetName(p as never)}</option>)}
          </select>
          <button className="ghost" disabled={busy || !prompt.trim() || !preset} onClick={generate}>{busy ? t.generatingSound : t.generateSound}</button>
        </> : <span className="tag">{t.noEffectPreset}</span>}
      </div>
    </section>
  );
}

export function SoundPane({work, id, run, setStatus}: {work: WorkDetail; id: string; run: Run; setStatus: (s: string) => void}) {
  const record = work.audio.sounds, sound = record?.sounds.find(s => s.id === id);
  const [name, setName] = useState(sound?.name ?? '');
  const [query, setQuery] = useState(sound?.query ?? '');
  useEffect(() => {setName(sound?.name ?? '');setQuery(sound?.query ?? '');}, [id, sound?.name, sound?.query]);
  if (!record || !sound) return <div className="voice-pane"><p className="help">{t.empty}</p></div>;
  const places = Object.entries(record.places).filter(([, s]) => s === id).map(([place]) => work.audio.locations.find(l => l.id === place)?.label ?? place);
  const blocks = Object.values(record.blocks).filter(s => s === id).length, effects = record.effects.filter(e => e.sound === id).length;
  const changed = name.trim() !== sound.name || query.trim() !== (sound.query ?? '');
  return (
    <div className="voice-pane">
      <div className="asset-head"><span className="name">{sound.name}</span>
        <span className="tag">{sound.kind === 'ambience' ? t.ambience : t.effect} · {t.uses(places, blocks, effects)}</span></div>
      <section>
        <div className="inline">
          <input className="text" value={name} placeholder={t.name} onChange={e => setName(e.target.value)} />
          <input className="text wide" value={query} placeholder={t.query} onChange={e => setQuery(e.target.value)} />
          <button className="ghost" disabled={!changed || !name.trim()} onClick={() => run(editSounds(work.id, {edit: {id, name: name.trim(), query}}), t.saved)}>{t.save}</button>
        </div>
        {sound.prompt && <p className="help top-gap">{sound.prompt}</p>}
      </section>
      <FilePart work={work} kind="sounds" id={id} bound={work.audio.bound.sounds[id]} run={run} />
      <SearchPart work={work} id={id} initial={sound.query || sound.name} run={run} setStatus={setStatus} />
      <GeneratePart work={work} id={id} name={sound.name} initial={sound.prompt || sound.query || ''} loop={sound.kind === 'ambience'} run={run} setStatus={setStatus} />
    </div>
  );
}

// The ambience of each place: one of the ambience sounds, or none; a new ambience can be made here.
export function PlacesPane({work, run}: {work: WorkDetail; run: Run}) {
  const record = work.audio.sounds, ambience = (record?.sounds ?? []).filter(s => s.kind === 'ambience');
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const add = () => {
    const id = `ambience-${Date.now().toString(36)}`;
    void run(editSounds(work.id, {add: [{id, name: name.trim(), kind: 'ambience', ...(query.trim() ? {query: query.trim()} : {})}]}), t.saved)
      .then(ok => {if (ok) {setName('');setQuery('');}});
  };
  return (
    <div className="voice-pane">
      <div className="asset-head"><span className="name">{t.places}</span></div>
      <section className="place-list">
        {work.audio.locations.map(place => (
          <label key={place.id} className="row"><span className="name">{place.label}</span>
            <select value={record?.places[place.id] ?? ''} onChange={e => run(editSounds(work.id, {places: {[place.id]: e.target.value || null}}), t.saved)}>
              <option value="">{t.placeNone}</option>
              {ambience.map(sound => <option key={sound.id} value={sound.id}>{sound.name}</option>)}
            </select>
          </label>
        ))}
      </section>
      <section>
        <h2>{t.newAmbience}</h2>
        <div className="inline">
          <input className="text" value={name} placeholder={t.newName} onChange={e => setName(e.target.value)} />
          <input className="text wide" value={query} placeholder={t.newQuery} onChange={e => setQuery(e.target.value)} />
          <button className="ghost" disabled={!name.trim()} onClick={add}>{t.save}</button>
        </div>
      </section>
    </div>
  );
}

/* A track: its prompt (editable, copyable for generating elsewhere), generation with a music preset (bound at once), the
 * file it has, and earlier results to switch back to. */
export function MusicPane({work, id, run, setStatus}: {work: WorkDetail; id: string; run: Run; setStatus: (s: string) => void}) {
  const music = work.audio.music, track = music?.tracks.find(tr => tr.id === id);
  const [prompt, setPrompt] = useState(track?.prompt ?? '');
  const [presets, setPresets] = useState<MusicPreset[]>([]);
  const [preset, setPreset] = useState('');
  const [busy, setBusy] = useState(false);
  const now = usePlaying();
  useEffect(() => {
    loadMusicPresets().then(file => {const fits = file.presets.filter(p => p.uses.includes('music'));setPresets(fits);setPreset(old => old || fits[0]?.id || '');})
      .catch(() => {});
  }, []);
  useEffect(() => {setPrompt(track?.prompt ?? '');}, [id, track?.prompt]);
  if (!music || !track) return <div className="voice-pane"><p className="help">{t.noMusic}</p></div>;
  const bound = work.audio.bound.tracks[id], history = work.audio.log.filter(e => e.track === id).reverse();
  const generate = () => {
    setBusy(true);setStatus(t.generating);
    void run(generateMusic(work.id, id, preset, prompt.trim() !== (track.prompt ?? '') ? prompt : undefined), t.generated).finally(() => setBusy(false));
  };
  return (
    <div className="voice-pane">
      <div className="asset-head"><span className="name">{track.name}</span>
        <span className="tag">{t.cues(music.cues.filter(c => c.track === id).length)}</span></div>
      <section>
        <h2>{t.prompt}</h2>
        <textarea value={prompt} placeholder={t.promptPlaceholder} onChange={e => setPrompt(e.target.value)} />
        <div className="inline top-gap">
          <button className="ghost" disabled={!prompt.trim()} onClick={() => navigator.clipboard.writeText(prompt).then(() => setStatus(t.copied))}>{t.copy}</button>
          <button className="ghost" disabled={prompt.trim() === (track.prompt ?? '')} onClick={() => run(editTrack(work.id, id, {prompt}), t.saved)}>{t.save}</button>
          <span className="spacer" />
          {presets.length ? <>
            <select aria-label={t.preset} value={preset} onChange={e => setPreset(e.target.value)}>
              {presets.map(p => <option key={p.id} value={p.id}>{musicPresetName(p as never)}</option>)}
            </select>
            <button className="primary-small" disabled={busy || !prompt.trim() || !preset} onClick={generate}>{busy ? t.generating : t.generate}</button>
          </> : <span className="tag">{t.noPreset}</span>}
        </div>
      </section>
      <FilePart work={work} kind="music" id={id} bound={bound} run={run} />
      <SearchPart work={work} kind="music" id={id} initial={track.name} run={run} setStatus={setStatus} />
      {history.length > 0 && <section>
        <h2>{t.history}</h2>
        <div className="sound-hits">{history.map(entry => {
          const fileId = entry.file.replace(/^audio\//, '').replace(/\.\w+$/, ''), key = `log:${entry.file}`, on = now === key, current = bound?.fileId === fileId;
          return (
            <div key={entry.file} className="sound-hit">
              <button className="play" aria-pressed={on} onClick={() => on ? stopAudio() : void playSource(key, audioUrl(work.id, fileId)).catch(error => setStatus(error.message))}>{on ? '■' : '▶'}</button>
              <span className="hit-name" title={entry.prompt}>{entry.preset}</span>
              <span className="tag">{new Date(entry.time).toLocaleString()} · {entry.seconds} s</span>
              {current ? <span className="tag">{t.current}</span>
                : <button className="ghost" onClick={() => run(restoreMusic(work.id, id, entry.file), t.restored)}>{t.restore}</button>}
            </div>
          );
        })}</div>
      </section>}
    </div>
  );
}
