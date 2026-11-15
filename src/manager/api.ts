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
}
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
