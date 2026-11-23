import type {PresetFile} from '../types/production';

// The manager's local routes; a refusal carries the server's reason.
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/manager${path}`, {...init, headers: {'Content-Type': 'application/json'}});
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
  return body as T;
}
export const loadPresets = () => call<PresetFile>('/presets');
export const savePresets = (file: PresetFile) => call<PresetFile>('/presets', {method: 'PUT', body: JSON.stringify(file)});
// sharp converts exported images to WebP; installing runs npm in the production folder.
export const installSharp = () => call<{available: boolean}>('/sharp', {method: 'POST'});

// Works under works/ and their images.
export type Category = 'cover' | 'ambient' | 'location' | 'character' | 'cg' | 'cutin';
export type Target = {purpose: string; refs?: {scope: string; id: string}[]; characterId?: string; variantId?: string};
export type Description = {kind: 'prompt'; prompt: string} | {kind: 'look'; face: string; body: string};
export interface Crop {x: number; y: number; size: number}
export type Flip = 'none' | 'left' | 'right';
// background: a portrait still on a solid colour (null when it cannot be told).
export interface Bound {imageId: string; type: string; width: number; height: number; crop?: Crop; flip?: Flip; background?: boolean | null}
export interface AssetImage {
  key: string; name: string; variantId?: string; target: Target; bound: Bound | null; description: Description | null; edit: unknown;
  prompt: string | null; editPrompt?: string; sent: string | null; sentEdit?: string | null; aspectRatio: string; side: 'background' | 'character';
  history?: HistoryEntry[];
  // Characters and their variants with a director design; null when none is written.
  stature?: number | null;
  formatted?: Record<string, {format: string; prompt?: {text: string; source: string}; edit?: {text: string; source: string}}>;
}
export interface Asset {
  key: string; cat: Category; name: string; chapterId: string; chapterTitle: string; entityId?: string; locations?: string[];
  shared?: string[]; uses?: string[]; noDirector?: boolean; images: AssetImage[];
  cast?: {id: string; label: string; look: string; variantId: string | null}[];
}
export interface WorkSummary {
  id: string; updated: number; title?: string; author?: string | null; chapters?: number; ratio?: string; bound?: number; total?: number; cover?: string | null;
  directors?: {saved: number; total: number}; textOnly?: boolean; input?: string; error?: string;
}
export interface WorkDetail extends WorkSummary {
  chapterList: {chapterId: string; title: string; saved: boolean}[];
  styles: {background: string; character: string}; fixedStyles: string[]; catalog: Asset[];
  scheme: Scheme; queue: QueueState | null; exportImages: ExportImages;
  voices: {roles: VoiceRole[]; record: VoiceRecord | null};
  audio: WorkAudio;
  credits: {settings: CreditSettings; sections: {key: string; items: {text: string; meta?: string; url?: string}[]}[]; unsigned: number};
}
// Who speaks in a work (narrator, other characters, each character with lines) and the voices the work gives them.
export interface VoiceRole {key: string; label: string; count: number; lines: {text: string; chapter: string; place: string; thought: boolean}[]}
export interface VoiceRecord {labels: Record<string, string>; cast: {narrator?: string; other?: string; characters: Record<string, string>}; portraits: Record<string, string>}
const work = (id: string) => `/works/${encodeURIComponent(id)}`;
export const imageUrl = (id: string, imageId: string) => `/api/manager${work(id)}/images/${imageId}`;
export const listWorks = () => call<WorkSummary[]>('/works');
export const openWork = (id: string) => call<{id: string}>(`${work(id)}/open`, {method: 'POST'});
export const loadWork = (id: string) => call<WorkDetail>(work(id));
const post = <T>(id: string, action: string, body: unknown) => call<T>(`${work(id)}/${action}`, {method: 'POST', body: JSON.stringify(body)});
export const removeImage = (id: string, target: Target) => post<WorkDetail>(id, 'remove', {target});
export const adjustPortrait = (id: string, target: Target, settings: {crop?: Crop; flip?: Flip}) =>
  post<WorkDetail>(id, 'adjust', {target, ...settings});
export const editDescription = (id: string, edit: unknown, value: {prompt?: string; face?: string; body?: string}) =>
  post<WorkDetail>(id, 'description', {edit, value});
export const editStature = (id: string, edit: unknown, value: number | null) => post<WorkDetail>(id, 'stature', {edit, value});
export const setPrompt = (id: string, key: string, text: string | null) => post<WorkDetail>(id, 'prompt', {key, text});
export const setBookInfo = (id: string, info: {title: string; author: string | null}) => post<WorkDetail>(id, 'book', info);
export const editStyles = (id: string, styles: {background?: string; character?: string}) => post<WorkDetail>(id, 'styles', styles);
export const setWorkVoices = (id: string, record: VoiceRecord) => post<WorkDetail>(id, 'voices', record);
export interface CreditSettings {notice: string; signature: boolean; agents: string[]}
export const setCredits = (id: string, settings: CreditSettings) => post<WorkDetail>(id, 'credits', settings);
export interface ExportImages {format: 'webp' | 'original'; quality: number}
export interface ExportResult {file: string; solid: number; images: {converted: number; kept: number; saved: number; unavailable: boolean}; detail: WorkDetail}
export const exportWork = (id: string, images: ExportImages) => post<ExportResult>(id, 'export', {images});
// Pictures and packages go up as raw bytes.
async function upload<T>(path: string, file: Blob, headers: Record<string, string>): Promise<T> {
  const response = await fetch(`/api/manager${path}`, {method: 'POST', body: file, headers: {'Content-Type': 'application/octet-stream', ...headers}});
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
  return body as T;
}
export const bindImage = (id: string, target: Target, file: Blob) =>
  upload<WorkDetail>(`${work(id)}/bind`, file, {'X-Target': encodeURIComponent(JSON.stringify(target))});
// Photo libraries (Pexels, Pixabay) searched for backgrounds; a chosen hit is downloaded and bound on the server.
export interface ImageHit {
  source: 'pexels' | 'pixabay'; key: string; id: string; name: string; author: string; license: string; url: string;
  width: number; height: number; thumb: string; download: string;
}
export const searchImages = (query: string, orientation: 'landscape' | 'portrait', sources?: string[]) =>
  call<{results: ImageHit[]; notes: string[]}>('/images/search', {method: 'POST', body: JSON.stringify({query, orientation, sources})});
export const bindImageHit = (id: string, target: Target, hit: ImageHit) => post<WorkDetail>(id, 'image/fetch', {target, hit});
export const importPackage = (file: File) => upload<{id: string}>('/works/import', file, {'X-File-Name': encodeURIComponent(file.name)});

// Image service presets, the work's scheme and its generation queue (A7).
export type ImageUse = 'background' | 'cg' | 'cutin' | 'cover' | 'standing' | 'variant' | 'cutout';
export interface ImagePreset {
  id: string; source: 'novelai' | 'comfyui' | 'openai'; model: string; uses: ImageUse[]; custom: string; positive: string; positiveAt: 'before' | 'after';
  negative: string; seed: 'random' | number; sizes: Record<string, [number, number]>; transparent: boolean;
  format: {notes: string; edit: 'instruction' | 'full'; refLabel: string; transparent: string};
  novelai?: {sampler: string; schedule: string; steps: number; scale: number; rescale: number; free: boolean; variantMode: 'img2img' | 'generate'; strength: number; noise: number};
  comfyui?: {url: string; generate: string | null; edit: string | null; reference?: string | null; generateMap: WorkflowMap; editMap: WorkflowMap; referenceMap?: WorkflowMap};
  openai?: {url: string; protocol: 'images' | 'chat'; edit: boolean};
}
export type WorkflowField = 'prompt' | 'negative' | 'seed' | 'width' | 'height' | 'image' | 'image2' | 'image3';
export type WorkflowMap = Partial<Record<WorkflowField, [string, string]>>;
export interface ImagePresetFile {version: 1; presets: ImagePreset[]; secrets?: Record<string, boolean>}
export interface Scheme {uses: Partial<Record<ImageUse, string>>; cutout: string; overrides: Record<string, string>; cgReferences: boolean}
export interface QueueItem {key: string; name: string; preset: string; size: string; note: string; state: 'waiting' | 'running' | 'done' | 'failed' | 'skipped'; error: string}
export interface QueueState {running: boolean; paused: boolean; items: QueueItem[]}
export interface HistoryEntry {imageId: string; file: string; preset: string; mode: string; seed: number | null; prompt: string; negative: string; width: number; height: number; cutout: string | null; references?: string[]; time: string}
export const loadImagePresets = () => call<ImagePresetFile>('/image-presets');
export const saveImagePresets = (file: ImagePresetFile) => call<ImagePresetFile>('/image-presets', {method: 'PUT', body: JSON.stringify({version: 1, presets: file.presets})});
export const saveSecret = (name: string, value: string) => call<{secrets: Record<string, boolean>}>('/secrets', {method: 'PUT', body: JSON.stringify({name, value})});
export const probe = (source: string, url?: string) => call<Record<string, string | boolean>>('/probe', {method: 'POST', body: JSON.stringify({source, url})});
export const listModels = (url: string) => call<{models: {id: string; name: string}[]; filtered: boolean}>('/models', {method: 'POST', body: JSON.stringify({url})});
export const setImageRatio = (id: string, ratio: string) => post<WorkDetail>(id, 'ratio', {ratio});
export const saveScheme = (id: string, scheme: Scheme) => post<WorkDetail>(id, 'scheme', scheme);
export const startQueue = (id: string, keys: string[], task: 'draw' | 'cutout' = 'draw', method?: string) =>
  post<{queue: QueueState}>(id, 'generate', {keys, task, method});
export const controlQueue = (id: string, action: 'pause' | 'resume' | 'retry' | 'cancel' | 'close') => post<{queue: QueueState | null}>(id, `queue/${action}`, {});
export const queueState = (id: string) => call<{queue: QueueState | null}>(`${work(id)}/queue`);
export const restoreImage = (id: string, key: string, imageId: string) => post<WorkDetail>(id, 'restore', {key, imageId});

// The voice library (voices.json) and speech services for previews, lookup and design; keys stay in the user's folder.
export type VoiceProvider = 'fish' | 'elevenlabs' | 'gemini';
export interface LibraryVoice {provider: VoiceProvider; ref: string; label: string; tags: string[]; origin: 'public' | 'designed'; lang?: string; note?: string}
export interface VoiceLibrary {
  version: 1; fish: {model: string}; elevenlabs: {model: string}; gemini: {model: string}; voices: LibraryVoice[];
  secrets?: {fish: boolean; elevenlabs: boolean; gemini: boolean};
}
export const loadVoices = () => call<VoiceLibrary>('/voices');
export const saveVoices = (library: VoiceLibrary) =>
  call<VoiceLibrary>('/voices', {method: 'PUT', body: JSON.stringify({
    version: 1, fish: library.fish, elevenlabs: library.elevenlabs, gemini: library.gemini, voices: library.voices,
  })});
const fishCall = <T>(action: string, body: unknown = {}) => call<T>(`/voices/fish/${action}`, {method: 'POST', body: JSON.stringify(body)});
export const fishBalance = () => fishCall<{credit: number; freeCredit: boolean | null}>('balance');
export interface FoundVoice {ref: string; title: string; tags: string[]; mine: boolean; lang?: string; languageCode?: string; gender?: string; description?: string}
export const fishLookup = (ref: string) => fishCall<FoundVoice>('lookup', {ref});
export const elevenLookup = (ref: string) =>
  call<FoundVoice>('/voices/elevenlabs/lookup', {method: 'POST', body: JSON.stringify({ref})});
export const geminiLookup = (ref: string) =>
  call<FoundVoice>('/voices/gemini/lookup', {method: 'POST', body: JSON.stringify({ref})});
export const geminiList = (filter: {lang?: string; gender?: string; pitch?: string; search?: string; pageSize?: number; pageToken?: string}) =>
  call<{voices: FoundVoice[]; nextPageToken: string}>('/voices/gemini/list', {method: 'POST', body: JSON.stringify(filter)});
export const fishDesign = (instruction: string, text: string, language?: string) =>
  fishCall<{candidates: string[]}>('design', {instruction, text: text || undefined, language});
export const fishCreate = (label: string, audio: string, text: string, tags: string[], lang?: string, note?: string) =>
  fishCall<{voice: LibraryVoice; library: VoiceLibrary}>('create', {label, audio, text, tags, lang, note});
// A line in a library voice, as playable audio.
export async function fishSpeak(ref: string, text: string, language?: string, provider: VoiceProvider = 'fish'): Promise<Blob> {
  const response = await fetch(`/api/manager/voices/${provider}/speak`,
    {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ref, text, language})});
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? `HTTP ${response.status}`);
  return response.blob();
}

// Sound effect services (sound-services.json): Freesound's licences and the local sound folder; the token stays in the user's folder.
export interface SoundServices {
  version: 1; freesound: {licenses: string[]}; local: {folder: string}; music: {folder: string};
  secrets?: {freesound: boolean; elevenlabs: boolean}; localCount?: number | string | null; musicCount?: number | string | null;
}
export const loadSoundServices = () => call<SoundServices>('/sound-services');
export const saveSoundServices = (services: SoundServices) =>
  call<SoundServices>('/sound-services', {method: 'PUT', body: JSON.stringify({version: 1, freesound: services.freesound, local: services.local, music: services.music})});
export interface SoundHit {
  source: 'freesound' | 'local'; key: string; name: string; author: string; license: string; duration: number | null; preview: string;
  url?: string; path?: string; id?: number; library?: 'sounds' | 'music'; notes?: string;
}
export const searchSounds = (query: string, maxDuration?: number, kind: AudioKind = 'sounds') =>
  call<{results: SoundHit[]; notes: string[]}>('/sounds/search', {method: 'POST', body: JSON.stringify({query, maxDuration, kind})});

// A work's music and sounds, with the file each has.
export interface BoundAudio {fileId: string; name: string; type: string; source?: Record<string, string>}
export interface SoundDefinition {id: string; name: string; kind: 'ambience' | 'effect'; query?: string; prompt?: string}
export interface WorkAudio {
  music: {tracks: {id: string; name: string; prompt?: string}[]; cues: {from: string; track: string | null}[]} | null;
  sounds: {sounds: SoundDefinition[]; places: Record<string, string>; blocks: Record<string, string | null>; effects: {at: string; sound: string; phase: string}[]} | null;
  bound: {tracks: Record<string, BoundAudio>; sounds: Record<string, BoundAudio>};
  locations: {id: string; label: string}[];
  log: MusicLogEntry[];
}
export type AudioKind = 'music' | 'sounds';
export const audioUrl = (id: string, fileId: string) => `/api/manager${work(id)}/audio/${fileId}`;
export type GeneratedSound = {source: 'generate'; preset: string; name: string; prompt: string; seconds?: number; loop?: boolean};
export const fetchAudio = (id: string, kind: AudioKind, entry: string, from: SoundHit | GeneratedSound) => post<WorkDetail>(id, 'audio/fetch', {kind, id: entry, from});
export const removeAudio = (id: string, kind: AudioKind, entry: string) => post<WorkDetail>(id, 'audio/remove', {kind, id: entry});
export const uploadAudio = (id: string, kind: AudioKind, entry: string, file: Blob, source: Record<string, string>) =>
  upload<WorkDetail>(`${work(id)}/audio/upload`, file, {'X-Kind': kind, 'X-Id': encodeURIComponent(entry), 'X-Source': encodeURIComponent(JSON.stringify(source))});
export const editSounds = (id: string, change: {edit?: {id: string; name?: string; query?: string}; add?: SoundDefinition[]; places?: Record<string, string | null>}) =>
  post<WorkDetail>(id, 'sounds', change);

// Audio generation presets for music and effects (music-presets.json) and a work's music generation.
export type MusicField = 'prompt' | 'lyrics' | 'duration' | 'seed';
export type AudioUse = 'music' | 'effects';
export interface MusicPreset {
  id: string; source: 'elevenlabs' | 'comfyui' | 'lyria'; uses: AudioUse[]; custom: string; seconds: number;
  elevenlabs?: {model: string; instrumental: boolean; influence: number};
  lyria?: {model: string; instrumental: boolean};
  comfyui?: {url: string; workflow: string | null; map: Partial<Record<MusicField, [string, string]>>};
}
export interface MusicPresetFile {version: 1; presets: MusicPreset[]; secrets?: {elevenlabs: boolean; comfyui: boolean; gemini: boolean}}
export const loadMusicPresets = () => call<MusicPresetFile>('/music-presets');
export const saveMusicPresets = (file: MusicPresetFile) => call<MusicPresetFile>('/music-presets', {method: 'PUT', body: JSON.stringify({version: 1, presets: file.presets})});
export interface MusicLogEntry {track: string; file: string; preset: string; prompt: string; seconds: number; seed: number | null; time: string}
export const editTrack = (id: string, track: string, change: {name?: string; prompt?: string}) => post<WorkDetail>(id, 'music/edit', {id: track, ...change});
export const generateMusic = (id: string, track: string, preset: string, prompt?: string) => post<WorkDetail>(id, 'music/generate', {track, preset, prompt});
export const restoreMusic = (id: string, track: string, file: string) => post<WorkDetail>(id, 'music/restore', {id: track, file});
