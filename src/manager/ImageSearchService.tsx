import {useEffect, useState} from 'react';
import {bindImageHit, saveSecret, searchImages, type AssetImage, type ImageHit, type WorkDetail} from './api';
import {Row} from './controls';
import {text} from './text';
import {IMAGE_SEARCH_SOURCES} from '../production/image-search.js';

const t = text.imageSearch;
type Source = typeof IMAGE_SEARCH_SOURCES[number];

/* A photo library in the services area: its API key (kept in the user's folder) and a test search. */
export function ImageSearchService({source, secrets, setSecrets, setStatus}: {
  source: Source; secrets: Record<string, boolean>; setSecrets: (s: Record<string, boolean>) => void; setStatus: (s: string) => void;
}) {
  const hasKey = !!secrets[source];
  const setKey = () => {
    const value = window.prompt(t.keyPrompt(t.names[source]));
    if (value === null) return;
    saveSecret(source, value).then(r => {setSecrets(r.secrets);setStatus(value ? text.voices.keySaved : text.voices.keyRemoved);}).catch(error => setStatus(error.message));
  };
  const check = () => searchImages('forest', 'landscape', [source])
    .then(r => setStatus(r.notes.join('；') || t.probe(t.names[source], r.results.length))).catch(error => setStatus(error.message));
  return (
    <div className="form">
      <div className="title"><h1>{t.names[source]}</h1><span className="tag">{t.subtitles[source]}</span></div>
      <section>
        <Row name={text.voices.key} help={`${t.keyHints[source]}${t.usage}`}>
          <div className="inline"><span className={hasKey ? 'status-dot ok' : 'status-dot'}><i />{hasKey ? text.voices.keySet : text.voices.keyUnset}</span>
            <button className="ghost" onClick={setKey}>{hasKey ? text.voices.changeKey : text.voices.setKey}</button>
            <button className="ghost" disabled={!hasKey} onClick={check}>{text.services.probe}</button></div>
        </Row>
      </section>
    </div>
  );
}

/* Searching the photo libraries for a background in the work's orientation; a picked result is downloaded and bound,
 * credited by library and author. */
export function ImageSearchPanel({work, image, initial, portrait, run, setStatus}: {
  work: WorkDetail; image: AssetImage; initial: string; portrait: boolean; run: (action: Promise<WorkDetail>, done?: string) => Promise<boolean>;
  setStatus: (s: string) => void;
}) {
  const [query, setQuery] = useState(initial);
  const [hits, setHits] = useState<ImageHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [taking, setTaking] = useState('');
  useEffect(() => {setQuery(initial);setHits(null);}, [image.key, initial]);
  const search = () => {
    setBusy(true);
    searchImages(query, portrait ? 'portrait' : 'landscape').then(r => {setHits(r.results);setStatus(r.notes.join('；') || (r.results.length ? '' : t.noResults));})
      .catch(error => setStatus(error.message)).finally(() => setBusy(false));
  };
  const take = (hit: ImageHit) => {
    setTaking(hit.key);
    void run(bindImageHit(work.id, image.target, hit), t.bound).finally(() => setTaking(''));
  };
  return (
    <div className="image-search">
      <div className="inline">
        <input className="text wide" value={query} placeholder={t.query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {if (e.key === 'Enter' && query.trim()) search();}} />
        <button className="ghost" disabled={busy || !query.trim()} onClick={search}>{busy ? t.searching : t.search}</button>
      </div>
      {hits && (hits.length ? <div className="image-hits">{hits.map(hit => (
        <figure key={hit.key} className={taking === hit.key ? 'busy' : undefined}>
          <button type="button" title={t.use} disabled={!!taking} onClick={() => take(hit)}>
            <img src={hit.thumb} alt={hit.name} loading="lazy" referrerPolicy="no-referrer" />
          </button>
          <figcaption title={hit.name}>{t.names[hit.source]} · {hit.author} · {hit.width}×{hit.height}</figcaption>
        </figure>
      ))}</div> : <p className="help">{t.noResults}</p>)}
    </div>
  );
}
