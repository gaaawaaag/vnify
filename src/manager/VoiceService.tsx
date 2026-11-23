import {useEffect, useState} from 'react';
import {elevenLookup, fishBalance, fishCreate, fishDesign, fishLookup, fishSpeak, geminiList, geminiLookup, loadVoices, saveSecret, saveVoices,
  type FoundVoice, type LibraryVoice, type VoiceLibrary, type VoiceProvider} from './api';
import {Hint, Row, Segmented} from './controls';
import {playAudio, stopAudio, usePlaying} from './audio';
import {text} from './text';

const t = text.voices;
const MODELS = {
  fish: ['s2.1-pro-free', 's2.1-pro'],
  elevenlabs: ['eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_v3'],
  gemini: ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'],
} as const;
const short = (ref: string) => ref.length > 12 ? `${ref.slice(0, 4)}…${ref.slice(-4)}` : ref;
const LANGS = ['zh', 'zh-Hant', 'yue', 'en', 'ja', 'ko'] as const;
const LANG_LABEL = (code: string) => code === 'zh-Hant' ? '繁体中文' : t.langs[code] ?? code;
// The language a sample line is in, for a voice designed to read it.
const langOf = (line: string) => /[぀-ヿ]/.test(line) ? 'ja' : /[가-힯]/.test(line) ? 'ko' : /\p{Script=Han}/u.test(line) ? 'zh'
  : /[A-Za-z]/.test(line) ? 'en' : undefined;
const tagList = (value: string) => [...new Set(value.split(/[,，、]/).map(tag => tag.trim()).filter(Boolean))].slice(0, 12);

/* A speech service in the services area: the key (kept in the user's folder), the model for previews, and its part of
 * the voice library every work chooses from. Fish Audio also shows the API balance and designs voices from a description;
 * ElevenLabs shares its key with music generation; Gemini shares its key with Lyria and browses its official catalog.
 * Changes are saved as they are made. */
export function VoiceService({provider = 'fish', setStatus, onLibrary}: {
  provider?: VoiceProvider; setStatus: (s: string) => void; onLibrary: (library: VoiceLibrary) => void;
}) {
  const [library, setLibrary] = useState<VoiceLibrary | null>(null);
  const [credit, setCredit] = useState('');
  const [sample, setSample] = useState<string>(t.sampleDefault);
  const [adding, setAdding] = useState('');
  useEffect(() => {loadVoices().then(next => {setLibrary(next);onLibrary(next);}).catch(error => setStatus(error.message));}, []);
  if (!library) return <div className="form" />;
  const fish = provider === 'fish', gemini = provider === 'gemini';
  const p = fish ? t : gemini ? {...t, ...text.voices.gemini} : {...t, ...text.voices.eleven};
  const hasKey = !!library.secrets?.[provider], mine = library.voices.filter(v => v.provider === provider);
  const keep = (next: VoiceLibrary) => {setLibrary(next);onLibrary(next);};
  const save = (next: VoiceLibrary) => {
    keep(next);
    saveVoices(next).then(saved => {keep({...saved, secrets: next.secrets});setStatus(t.saved);}).catch(error => setStatus(error.message));
  };
  const setKey = () => {
    const value = window.prompt(p.keyPrompt);
    if (value === null) return;
    saveSecret(provider, value).then(r => {
      keep({...library, secrets: {fish: !!r.secrets.fish, elevenlabs: !!r.secrets.elevenlabs, gemini: !!r.secrets.gemini}});
      setStatus(value ? t.keySaved : t.keyRemoved);
    }).catch(error => setStatus(error.message));
  };
  const check = () => fishBalance().then(b => setCredit(t.credit(b.credit) + (b.freeCredit ? t.freeCredit : ''))).catch(error => setStatus(error.message));
  const addFound = (found: FoundVoice) => {
    if (library.voices.some(v => v.provider === provider && v.ref === found.ref)) {setStatus(t.exists);return;}
    const voice: LibraryVoice = {provider, ref: found.ref, label: found.title.slice(0, 200), tags: found.tags, origin: found.mine ? 'designed' : 'public',
      ...(found.lang ? {lang: found.lang} : {}), ...(found.description ? {note: found.description} : {})};
    save({...library, voices: [...library.voices, voice]});
    setStatus(t.added(found.title));
  };
  const add = () => {
    if (!hasKey) {setStatus(p.needKey);return;}
    const lookup = fish ? fishLookup : gemini ? geminiLookup : elevenLookup;
    lookup(adding).then(found => {addFound(found);setAdding('');}).catch(error => setStatus(error.message));
  };
  const edit = (voice: LibraryVoice, change: Partial<LibraryVoice>) =>
    save({...library, voices: library.voices.map(v => v.provider === voice.provider && v.ref === voice.ref ? {...v, ...change} : v)});
  return (
    <div className="form">
      <div className="title"><h1>{p.title}</h1><span className="tag">{p.subtitle}</span></div>
      <section>
        <h2>{t.connection}</h2>
        <Row name={t.key} help={p.keyHint}>
          <div className="inline"><span className={hasKey ? 'status-dot ok' : 'status-dot'}><i />{hasKey ? t.keySet : t.keyUnset}</span>
            <button className="ghost" onClick={setKey}>{hasKey ? t.changeKey : t.setKey}</button></div>
        </Row>
        <Row name={t.model} help={p.modelHint}>
          <Segmented small value={library[provider].model} options={MODELS[provider] as readonly string[]} labels={t.models}
            onChange={model => save({...library, [provider]: {model}})} />
        </Row>
        {fish && <Row name={t.balance}><div className="inline">{credit && <span>{credit}</span>}<button className="ghost" disabled={!hasKey} onClick={check}>{t.refresh}</button></div></Row>}
      </section>
      <section>
        <h2>{t.library}<Hint text={t.libraryHint} /></h2>
        <Row name={t.sample}><input className="text wide" value={sample} onChange={e => setSample(e.target.value)} /></Row>
        <div className="voice-list">
          {mine.map(voice => (
            <VoiceRow key={voice.ref} voice={voice} sample={sample} setStatus={setStatus} edit={change => edit(voice, change)}
              remove={() => save({...library, voices: library.voices.filter(v => v !== voice)})} />
          ))}
          {!mine.length && <p className="help">{p.empty}</p>}
        </div>
        <Row name={t.add}>
          <div className="inline"><input className="text narrow" value={adding} placeholder={p.addPlaceholder} onChange={e => setAdding(e.target.value)}
            onKeyDown={e => {if (e.key === 'Enter' && adding.trim()) add();}} />
            <button className="ghost" disabled={!adding.trim()} onClick={add}>{t.add}</button></div>
        </Row>
        {fish && <VoiceDesign hasKey={hasKey} sample={sample} setStatus={setStatus} onKept={next => keep({...next, secrets: library.secrets})} />}
      </section>
      {gemini && <GeminiCatalog hasKey={hasKey} sample={sample} savedRefs={new Set(mine.map(v => v.ref))} onAdd={addFound} setStatus={setStatus} />}
    </div>
  );
}

function GeminiCatalog({hasKey, sample, savedRefs, onAdd, setStatus}: {
  hasKey: boolean; sample: string; savedRefs: Set<string>; onAdd: (voice: FoundVoice) => void; setStatus: (s: string) => void;
}) {
  const g = text.voices.gemini;
  const [lang, setLang] = useState('');
  const [gender, setGender] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<FoundVoice[] | null>(null);
  const [nextPage, setNextPage] = useState('');
  const [busy, setBusy] = useState(false);
  const now = usePlaying();
  const run = (pageToken?: string) => {
    if (!hasKey) {setStatus(g.needKey);return;}
    setBusy(true);setStatus(g.searching);
    geminiList({lang: lang || undefined, gender: gender || undefined, search: query.trim() || undefined, pageSize: 30, pageToken})
      .then(r => {setItems(pageToken && items ? [...items, ...r.voices] : r.voices);setNextPage(r.nextPageToken);setStatus('');})
      .catch(error => setStatus(error.message)).finally(() => setBusy(false));
  };
  return (
    <section>
      <h2>{g.catalog}</h2>
      <div className="inline top-gap">
        <select value={lang} aria-label={t.lang} onChange={e => setLang(e.target.value)}>
          <option value="">{g.catalogLangAll}</option>
          {LANGS.map(code => <option key={code} value={code}>{LANG_LABEL(code)}</option>)}
        </select>
        <select value={gender} aria-label={g.catalogGenderAll} onChange={e => setGender(e.target.value)}>
          <option value="">{g.catalogGenderAll}</option>
          {(['female', 'male', 'neutral'] as const).map(item => <option key={item} value={item}>{g.genders[item]}</option>)}
        </select>
        <input className="text narrow" value={query} placeholder={g.searchPlaceholder} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {if (e.key === 'Enter') run();}} />
        <button className="ghost" disabled={busy || !hasKey} onClick={() => run()}>{g.search}</button>
      </div>
      {items && <div className="voice-list top-gap">
        {items.map(voice => {
          const id = `catalog:gemini:${voice.ref}:${sample}`, on = now === id, saved = savedRefs.has(voice.ref);
          const play = () => {
            if (on) {stopAudio();return;}
            playAudio(id, () => fishSpeak(voice.ref, sample, undefined, 'gemini')).catch(error => setStatus(error.message));
          };
          const meta = [voice.ref, voice.languageCode, voice.tags.join('、')].filter(Boolean).join(' · ');
          return (
            <div key={voice.ref} className="voice-catalog-row">
              <button className="play" aria-label={on ? t.stop : t.play} aria-pressed={on} onClick={play}>{on ? '■' : '▶'}</button>
              <div className="voice-name">
                <span>{voice.title}</span>
                <small>{meta}</small>
                {voice.description && <small>{voice.description}</small>}
              </div>
              <button className="ghost" disabled={saved} onClick={() => onAdd(voice)}>{saved ? g.inLibrary : g.addToLibrary}</button>
            </div>
          );
        })}
        {!items.length && <p className="help">{g.catalogEmpty}</p>}
      </div>}
      {nextPage && <div className="inline top-gap"><button className="ghost" disabled={busy} onClick={() => run(nextPage)}>{g.nextPage}</button></div>}
    </section>
  );
}

function VoiceRow({voice, sample, setStatus, edit, remove}: {
  voice: LibraryVoice; sample: string; setStatus: (s: string) => void; edit: (change: Partial<LibraryVoice>) => void; remove: () => void;
}) {
  const [label, setLabel] = useState(voice.label);
  const [tags, setTags] = useState(voice.tags.join('、'));
  const [note, setNote] = useState(voice.note ?? '');
  const [noting, setNoting] = useState(false);
  const id = `library:${voice.provider}:${voice.ref}:${sample}`, on = usePlaying() === id;
  const play = () => {
    if (on) {stopAudio();return;}
    playAudio(id, () => fishSpeak(voice.ref, sample, undefined, voice.provider)).catch(error => setStatus(error.message));
  };
  return (
    <div className="voice-row">
      <button className="play" aria-label={on ? t.stop : t.play} aria-pressed={on} onClick={play}>{on ? '■' : '▶'}</button>
      <div className="voice-name">
        <input className="text" value={label} onChange={e => setLabel(e.target.value)} onBlur={() => label.trim() && label !== voice.label && edit({label: label.trim()})} />
        <small>{t.origins[voice.origin]} · {short(voice.ref)}</small>
      </div>
      <select value={voice.lang ?? ''} aria-label={t.lang} onChange={e => edit({lang: e.target.value || undefined})}>
        <option value="">{t.langUnset}</option>
        {[...LANGS, ...(voice.lang && !(LANGS as readonly string[]).includes(voice.lang) ? [voice.lang] : [])].map(code =>
          <option key={code} value={code}>{t.langs[code] ?? code}</option>)}
      </select>
      <input className="text" value={tags} placeholder={t.tagsPlaceholder} onChange={e => setTags(e.target.value)}
        onBlur={() => {const next = tagList(tags);if (next.join() !== voice.tags.join()) edit({tags: next});}} />
      <div className="icon-actions">
        <button className={voice.note ? 'icon filled' : 'icon'} aria-label={t.note} aria-pressed={noting} title={voice.note || t.note} onClick={() => setNoting(!noting)}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h7l3 3v8H3z M10 2.5v3h3 M5.5 8h5 M5.5 10.5h5" /></svg>
        </button>
        <button className="icon danger" aria-label={t.remove} title={t.remove} onClick={remove}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11 M6 4V2.5h4V4 M4 4l.7 9.5h6.6L12 4 M6.7 6.5v4.5 M9.3 6.5v4.5" /></svg>
        </button>
      </div>
      {noting && <input className="text voice-note" autoFocus value={note} maxLength={500} placeholder={t.notePlaceholder} onChange={e => setNote(e.target.value)}
        onBlur={() => note.trim() !== (voice.note ?? '') && edit({note: note.trim() || undefined})} />}
    </div>
  );
}

/* Designing a voice from a description: three candidates read the sample, one is kept as a private voice in the user's
 * Fish Audio account and added to the library. */
export function VoiceDesign({hasKey, sample, setStatus, onKept, initial = '', name = '', open: startOpen = false}: {
  hasKey: boolean; sample: string; setStatus: (s: string) => void; onKept: (library: VoiceLibrary, voice: LibraryVoice) => void;
  initial?: string; name?: string; open?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [instruction, setInstruction] = useState(initial);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [chosen, setChosen] = useState(0);
  const [label, setLabel] = useState(name);
  const [busy, setBusy] = useState(false);
  const now = usePlaying();
  useEffect(() => {setInstruction(initial);}, [initial]);
  if (!open) return <div className="inline top-gap"><button className="ghost" onClick={() => setOpen(true)}>{t.design}</button></div>;
  const generate = () => {
    if (!hasKey) {setStatus(t.needKey);return;}
    setBusy(true);setStatus(t.generating);
    fishDesign(instruction, sample.slice(0, 150)).then(r => {setCandidates(r.candidates);setChosen(0);setStatus('');})
      .catch(error => setStatus(error.message)).finally(() => setBusy(false));
  };
  const keep = () => {
    setBusy(true);setStatus(t.keeping);
    fishCreate(label.trim(), candidates[chosen], sample.slice(0, 150), [], langOf(sample), instruction.trim().slice(0, 500)).then(r => {
      onKept(r.library, r.voice);setStatus(t.kept(r.voice.label));setCandidates([]);
    }).catch(error => setStatus(error.message)).finally(() => setBusy(false));
  };
  return (
    <div className="voice-design">
      <textarea value={instruction} placeholder={t.instructionPlaceholder} onChange={e => setInstruction(e.target.value)} />
      <div className="inline">
        <button className="ghost" disabled={busy || !instruction.trim()} onClick={generate}>{t.generate}</button>
        <span className="spacer" /><button className="ghost" onClick={() => setOpen(false)}>{t.foldDesign}</button>
      </div>
      {candidates.length > 0 && <>
        <div className="candidates">{candidates.map((audio, i) => {
          const id = `candidate:${i}:${audio.slice(-24)}`, on = now === id;
          return (
            <div key={i} className="candidate" aria-pressed={i === chosen} onClick={() => setChosen(i)}>
              <button className="play" aria-pressed={on} onClick={event => {
                event.stopPropagation();setChosen(i);
                if (on) stopAudio(); else void playAudio(id, async () => new Blob([Uint8Array.from(atob(audio), c => c.charCodeAt(0))], {type: 'audio/wav'}));
              }}>{on ? '■' : '▶'}</button>{t.candidate(i + 1)}
            </div>
          );
        })}</div>
        <div className="inline">
          <input className="text narrow" value={label} placeholder={t.namePlaceholder} onChange={e => setLabel(e.target.value)} />
          <button className="primary-small" disabled={busy || !label.trim()} onClick={keep}>{t.keep}</button>
          <Hint text={t.keepHint} />
        </div>
      </>}
    </div>
  );
}
