import {useEffect, useState} from 'react';
import {fishSpeak, imageUrl, loadVoices, setWorkVoices, type LibraryVoice, type VoiceLibrary, type VoiceRecord, type VoiceRole, type WorkDetail} from './api';
import {Hint} from './controls';
import {playAudio, stopAudio, usePlaying} from './audio';
import {VoiceDesign} from './VoiceService';
import {text} from './text';

const t = text.workVoices;
type Run = (action: Promise<WorkDetail>, done?: string) => Promise<boolean>;
const empty = (): VoiceRecord => ({labels: {}, cast: {characters: {}}, portraits: {}});
const keyOf = (voice: LibraryVoice) => `${voice.provider}:${voice.ref}`;
const refOf = (key: string) => key.replace(/^(fish|elevenlabs|gemini):/, '');
const providerOf = (key: string) => key.startsWith('elevenlabs:') ? 'elevenlabs' as const : key.startsWith('gemini:') ? 'gemini' as const : 'fish' as const;

/** The voice a role has in the work's record, or ''. */
export function assigned(record: VoiceRecord | null, role: string): string {
  if (!record) return '';
  return (role === 'narrator' ? record.cast.narrator : role === 'other' ? record.cast.other : record.cast.characters[role]) ?? '';
}
// The record with a role's voice set ('' clears it); labels follow from the library.
function withVoice(record: VoiceRecord, role: string, key: string, library: VoiceLibrary | null): VoiceRecord {
  const next = structuredClone(record);
  if (role === 'narrator' || role === 'other') {if (key) next.cast[role] = key;else delete next.cast[role];}
  else if (key) next.cast.characters[role] = key;else delete next.cast.characters[role];
  const voice = library?.voices.find(v => keyOf(v) === key);
  if (key && voice) next.labels[key] = voice.label;
  return next;
}

/** The roles in the titles column: who speaks, and the voice each has. */
export function VoiceTitles({work, current, pick}: {work: WorkDetail; current: string; pick: (key: string) => void}) {
  const record = work.voices.record;
  return <>{work.voices.roles.map(role => {
    const key = assigned(record, role.key);
    return (
      <li key={role.key}><button aria-current={current === role.key ? 'true' : undefined} onClick={() => pick(role.key)}>
        <span className={`dot${key ? '' : ' missing'}`} />
        <span className="label">{role.key === 'narrator' ? t.narrator : role.key === 'other' ? t.other : role.label}
          <span className="sub">{key ? record?.labels[key] ?? refOf(key) : role.key === 'other' || role.key === 'narrator' ? t.unset : t.followOther}
            {role.count ? ` · ${t.lines(role.count)}` : ''}</span></span>
      </button></li>
    );
  })}</>;
}

/* One role's voice: the portrait wanted (written by the director, editable), the voice from the library (or one designed
 * from the portrait), and a preview with the role's own lines. */
export function VoicePane({work, role, run, setStatus, fogged, open}: {
  work: WorkDetail; role: VoiceRole; run: Run; setStatus: (s: string) => void; fogged: boolean; open: () => void;
}) {
  const [library, setLibrary] = useState<VoiceLibrary | null>(null);
  const record = work.voices.record ?? empty();
  const [portrait, setPortrait] = useState(record.portraits[role.key] ?? '');
  const [line, setLine] = useState(0);
  const now = usePlaying();
  useEffect(() => {loadVoices().then(setLibrary).catch(error => setStatus(error.message));}, []);
  useEffect(() => {setPortrait(record.portraits[role.key] ?? '');setLine(0);}, [role.key, work.voices.record]);
  const key = assigned(record, role.key), name = role.key === 'narrator' ? t.narrator : role.key === 'other' ? t.other : role.label;
  const save = (next: VoiceRecord, done: string) => run(setWorkVoices(work.id, next), done);
  const choose = (value: string) => save(withVoice(record, role.key, value, library), t.saved);
  const savePortrait = () => {
    const next = structuredClone(record);
    if (portrait.trim()) next.portraits[role.key] = portrait.trim();else delete next.portraits[role.key];
    void save(next, t.saved);
  };
  const sample = role.lines[line]?.text ?? '';
  // The character's standing portrait beside the portrait and voice, for reference: the default look, else any bound look.
  const figure = role.key === 'narrator' || role.key === 'other' ? null : (() => {
    const images = work.catalog.find(a => a.cat === 'character' && a.entityId === role.key)?.images ?? [];
    return {bound: (images.find(i => !i.variantId && i.bound) ?? images.find(i => i.bound))?.bound ?? null};
  })();
  const listed = new Set(library?.voices.map(keyOf));
  const id = `role:${key}:${sample}`, playing = now === id;
  const preview = () => {
    if (playing) {stopAudio();return;}
    if (!key) {setStatus(t.pickFirst);return;}
    playAudio(id, () => fishSpeak(refOf(key), sample, undefined, providerOf(key))).catch(error => setStatus(error.message));
  };
  return (
    <div className="voice-pane">
      <div className="asset-head"><span className="name">{name}</span>
        <span className="tag">{role.count ? t.lines(role.count) : t.noLines}{role.key === 'other' ? ` · ${t.otherHint}` : ''}</span></div>
      <div className={figure ? 'voice-top' : undefined}><div>
      <section>
        <h2>{t.portrait}<Hint text={t.portraitHint} /></h2>
        <textarea value={portrait} placeholder={t.portraitPlaceholder} onChange={e => setPortrait(e.target.value)} />
        <div className="inline top-gap"><span className="spacer" />
          <button className="ghost" disabled={portrait.trim() === (record.portraits[role.key] ?? '')} onClick={savePortrait}>{t.save}</button></div>
      </section>
      <section>
        <h2>{t.voice}</h2>
        <div className="inline">
          <select value={key} onChange={e => choose(e.target.value)}>
            <option value="">{role.key === 'narrator' || role.key === 'other' ? t.none : t.followOtherOption}</option>
            {(['fish', 'elevenlabs', 'gemini'] as const).map(provider => {
              const voices = library?.voices.filter(v => v.provider === provider) ?? [];
              const label = provider === 'fish' ? text.voices.title : provider === 'elevenlabs' ? text.voices.eleven.title : text.voices.gemini.title;
              return voices.length ? <optgroup key={provider} label={label}>
                {voices.map(v => <option key={keyOf(v)} value={keyOf(v)} title={v.note}>
                  {v.lang ? `${v.label} · ${v.lang === 'zh-Hant' ? '繁体中文' : text.voices.langs[v.lang] ?? v.lang}` : v.label}</option>)}</optgroup> : null;
            })}
            {key && !listed.has(key) && <option value={key}>{record.labels[key] ?? refOf(key)}</option>}
          </select>
          {library && !library.voices.length && <span className="tag">{t.emptyLibrary}</span>}
        </div>
        <VoiceDesign key={role.key} hasKey={!!library?.secrets?.fish} sample={sample || t.sampleFallback} setStatus={setStatus} initial={portrait} name={name}
          onKept={(next, voice) => {setLibrary(next);void save(withVoice(record, role.key, keyOf(voice), next), t.designed(voice.label));}} />
      </section>
      </div>
      {figure && <div className={`voice-figure${figure.bound ? ' checker' : ''}${fogged && figure.bound ? ' fogged-thumb' : ''}`} onClick={fogged ? open : undefined}>
        {figure.bound ? <img src={imageUrl(work.id, figure.bound.imageId)} alt="" draggable={false} /> : <span>{t.noFigure}</span>}
      </div>}
      </div>
      <section>
        <h2>{t.preview}</h2>
        {role.lines.length ? <div className={`sample-lines${fogged ? ' fogged-text' : ''}`} onClick={fogged ? open : undefined}>
          {role.lines.map((l, i) => (
            <label key={i}><input type="radio" name="sample-line" checked={i === line} onChange={() => setLine(i)} />
              <span>{l.thought ? `（${l.text}）` : l.text}<small>{[l.chapter, l.place].filter(Boolean).join(' · ')}</small></span></label>
          ))}
        </div> : <p className="help">{t.noLines}</p>}
        <div className="inline top-gap">
          <button className="play" aria-pressed={playing} disabled={!sample} onClick={preview}>{playing ? '■' : '▶'}</button>
          <span className="tag">{key ? record.labels[key] ?? refOf(key) : t.pickFirst}</span>
        </div>
      </section>
    </div>
  );
}
