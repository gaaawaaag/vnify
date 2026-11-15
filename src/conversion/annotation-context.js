import {renderPrompt} from '../prompts/library.js';
// This is a retrieval aid for batch input; the registry, not this list, decides which are notes.
// The model decides whether a candidate is a note and which phrase it explains.
const NOTE_MARKS={
  // Chinese in either script.
  zh:/(?:[（(](?:[译譯]者[注註]|[译譯][注註]|作者[注註]|[编編]者[注註]|[注註])\s*[：:]|^\s*(?:(?:[译譯]者[注註]|[译譯][注註]|作者[注註]|[编編]者[注註]|[注註][释釋]|[注註])\s*[：:]|[①-⑳]|\[\d{1,3}\]|【\d{1,3}】|\d{1,3}[.．、)）]))/mu,
  ja:/(?:[（(](?:訳者?[注註]|原[注註]|編者?[注註]|作者[注註]|[注註])\s*[：:\d０-９]|^\s*(?:(?:訳者?[注註]|原[注註]|[注註])\s*[：:]|[①-⑳]|\[\d{1,3}\]|[＊※]\s*[\d０-９]{1,3}|\d{1,3}[.．)）]))/mu,
  en:/(?:[(\[](?:(?:translator|author|editor)[’']?s\s+)?note\s*:|^\s*(?:(?:(?:translator|author|editor)[’']?s\s+)?notes?\s*:|\[\d{1,3}\]|\*{1,3}\s|†|‡|\d{1,3}[.)]\s))/imu,
};
export function annotationCandidates(map) {
  const marks=NOTE_MARKS[map.lang]??NOTE_MARKS.zh;
  return map.paragraphs.filter(p=>marks.test(p.text));
}

export function annotationPacket(paragraphs,targets) {
  const own=new Set(targets.map(p=>p.id)),extra=paragraphs.filter(p=>!own.has(p.id));
  if(!extra.length)return '';
  return renderPrompt('source.annotations', {source: extra.map(p=>`[${p.id}]\n${p.text}`).join('\n\n')});
}
