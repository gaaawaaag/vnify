import {useEffect, useRef, useState} from 'react';
import {imageUrl, importPackage, listWorks, openWork, type WorkSummary} from './api';
import {Hint} from './controls';
import {text} from './text';
import {RATIOS} from '../production/presets.js';

/* The works in this workspace (works/<work>/). A work with only its text gets a director project when opened, so its
 * characters and places can still take pictures. */
export function WorksPage({onOpen}: {onOpen: (id: string) => void}) {
  const [works, setWorks] = useState<WorkSummary[] | null>(null);
  const [status, setStatus] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => listWorks().then(setWorks).catch(error => setStatus(text.works.loadFailed + error.message));
  useEffect(() => {refresh();}, []);
  const open = (work: WorkSummary) => {
    if (work.error) return;
    (work.textOnly ? openWork(work.id) : Promise.resolve()).then(() => onOpen(work.id)).catch(error => setStatus(error.message));
  };
  const upload = (picked: File | undefined) => {
    if (!picked) return;
    setStatus(`${text.works.importPackage.replace('…', '')}：${picked.name}`);
    importPackage(picked).then(({id}) => {setStatus(text.works.imported);return refresh().then(() => onOpen(id));})
      .catch(error => setStatus(error.message));
  };
  return (
    <main>
      <div className="list-head">
        <h1>{text.works.title}</h1>
        <Hint text={text.works.hint} /><span className="spacer" />
        <button className="ghost" onClick={() => {setStatus('');refresh();}}>{text.works.refresh}</button>
        <button className="ghost" onClick={() => file.current?.click()}>{text.works.importPackage}</button>
        <input ref={file} type="file" accept=".zip" hidden onChange={event => {upload(event.target.files?.[0]);event.target.value = '';}} />
      </div>
      {status && <p className="status">{status}</p>}
      {works && !works.length && <p className="status">{text.works.empty}</p>}
      <div className="works">
        {works?.map(work => (
          <button key={work.id} className={work.textOnly || work.error ? 'work text-only' : 'work'} onClick={() => open(work)} disabled={!!work.error}>
            <div className="cover">
              {work.cover ? <img src={imageUrl(work.id, work.cover)} alt="" />
                : <span>{work.error ? text.works.failed : work.textOnly ? text.works.textOnly : text.works.noCover}</span>}
            </div>
            <div className="info">
              <div className="title">{work.title ?? work.id}</div>
              {work.error ? <div className="state error-text">{work.error}</div> : (
                <>
                  <div className="meta">
                    {text.works.chapters(work.chapters ?? 0)}
                    {work.ratio && ` · ${RATIOS.portrait.includes(work.ratio) ? text.works.portrait : text.works.landscape} ${work.ratio}`}
                    {` · ${new Date(work.updated).toLocaleString()}`}
                  </div>
                  {work.textOnly ? <div className="state">{text.works.textOnlyHint}</div> : (
                    <>
                      <div className="progress"><i style={{width: `${100 * (work.bound ?? 0) / Math.max(1, work.total ?? 0)}%`}} /></div>
                      <div className="state">
                        {text.works.images(work.bound ?? 0, work.total ?? 0)} · {text.works.directors(work.directors?.saved ?? 0, work.directors?.total ?? 0)}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}
