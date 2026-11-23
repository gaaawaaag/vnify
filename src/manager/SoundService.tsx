import {useEffect, useState} from 'react';
import {loadSoundServices, saveSecret, saveSoundServices, type SoundServices} from './api';
import {Row} from './controls';
import {text} from './text';

const t = text.sounds;
const LICENSES = ['cc0', 'by', 'nc'] as const;

/* Where existing music and sound effects are found: Freesound (its token kept in the user's folder, the licences it may
 * use; effects and its Music category) or the local library, one folder for effects and one for music, searched by file
 * name and credits notes. Changes are saved as they are made. */
export function SoundService({which, setStatus, onServices}: {
  which: 'freesound' | 'local'; setStatus: (s: string) => void; onServices: (services: SoundServices) => void;
}) {
  const [services, setServices] = useState<SoundServices | null>(null);
  const [folders, setFolders] = useState({local: '', music: ''});
  useEffect(() => {
    loadSoundServices().then(next => {setServices(next);setFolders({local: next.local.folder, music: next.music.folder});onServices(next);})
      .catch(error => setStatus(error.message));
  }, []);
  if (!services) return <div className="form" />;
  const keep = (next: SoundServices) => {setServices(next);onServices(next);};
  const save = (next: SoundServices) => saveSoundServices(next).then(saved => {keep(saved);setStatus(t.saved);}).catch(error => setStatus(error.message));
  if (which === 'local') return (
    <div className="form">
      <div className="title"><h1>{t.local}</h1><span className="tag">{t.localSub}</span></div>
      <section>
        {(['local', 'music'] as const).map(library => (
          <Row key={library} name={library === 'music' ? t.musicFolder : t.effectsFolder} help={t.folderHint}>
            <div className="inline"><input className="text wide" value={folders[library]} placeholder={t.folderPlaceholder}
              onChange={e => setFolders({...folders, [library]: e.target.value})} />
              <button className="ghost" onClick={() => save({...services, [library]: {folder: folders[library]}})}>{t.scan}</button>
              <span className="tag">{t.count((library === 'music' ? services.musicCount : services.localCount) ?? null)}</span></div>
          </Row>
        ))}
        <Row name={t.creditsFile} help={t.creditsHint} block>
          <pre className="code-sample">{t.creditsSample}</pre>
        </Row>
      </section>
    </div>
  );
  const hasToken = !!services.secrets?.freesound;
  const setToken = () => {
    const value = window.prompt(t.tokenPrompt);
    if (value === null) return;
    saveSecret('freesound', value).then(r => {keep({...services, secrets: {freesound: !!r.secrets.freesound, elevenlabs: !!r.secrets.elevenlabs}});setStatus(value ? t.tokenSaved : t.tokenRemoved);})
      .catch(error => setStatus(error.message));
  };
  const toggle = (code: string) => {
    const licenses = services.freesound.licenses.includes(code) ? services.freesound.licenses.filter(c => c !== code) : [...services.freesound.licenses, code];
    if (licenses.length) void save({...services, freesound: {licenses}});
  };
  return (
    <div className="form">
      <div className="title"><h1>{t.freesound}</h1><span className="tag">{t.freesoundSub}</span></div>
      <section>
        <Row name={t.token} help={t.tokenHint}>
          <div className="inline"><span className={hasToken ? 'status-dot ok' : 'status-dot'}><i />{hasToken ? text.voices.keySet : text.voices.keyUnset}</span>
            <button className="ghost" onClick={setToken}>{hasToken ? text.voices.changeKey : text.voices.setKey}</button></div>
        </Row>
        <Row name={t.licenses} help={t.licenseHint}>
          <div className="chips">{LICENSES.map(code => (
            <button key={code} className="chip" aria-pressed={services.freesound.licenses.includes(code)} onClick={() => toggle(code)}>{t.licenseLabels[code]}</button>
          ))}</div>
        </Row>
      </section>
    </div>
  );
}
