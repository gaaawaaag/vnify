import {useSyncExternalStore} from 'react';

/* One sound at a time across the manager: a voice preview, a design candidate. Each has an id, so its button can show
 * that it is playing; starting another stops the one before. Fetched audio is kept for a few plays. */
let current: {id: string; audio: HTMLAudioElement} | null = null, token = 0;
const listeners = new Set<() => void>();
const cache = new Map<string, Promise<string>>();
const notify = () => listeners.forEach(listener => listener());

export const playing = () => current?.id ?? null;
export const usePlaying = () => useSyncExternalStore(listener => {listeners.add(listener);return () => listeners.delete(listener);}, playing);

export function stopAudio() {
  token++;
  if (!current) return;
  current.audio.pause();current = null;notify();
}

// Plays an address directly (a library's preview elsewhere, which may not allow fetching).
export async function playSource(id: string, src: string) {
  stopAudio();
  const audio = new Audio(src);
  current = {id, audio};notify();
  audio.onended = () => {if (current?.audio === audio) {current = null;notify();}};
  await audio.play();
}

export async function playAudio(id: string, load: () => Promise<Blob>) {
  stopAudio();
  const own = token;
  let url = cache.get(id);
  if (!url) {
    url = load().then(blob => URL.createObjectURL(blob));
    url.catch(() => cache.delete(id));
    cache.set(id, url);
    if (cache.size > 20) {const [oldest, gone] = cache.entries().next().value!;cache.delete(oldest);void gone.then(URL.revokeObjectURL, () => {});}
  }
  const src = await url;
  if (own !== token) return;
  const audio = new Audio(src);
  current = {id, audio};notify();
  audio.onended = () => {if (current?.audio === audio) {current = null;notify();}};
  await audio.play();
}
