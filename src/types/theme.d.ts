// Interface sounds a theme may provide (registry `sounds`), read by src/reader/ui-sound-recipe.js and played by src/ui/ui-sounds.js.

export type UiSoundEvent = 'open' | 'close' | 'select' | 'chapter';

interface LayerTiming {
  /** Seconds from the start of the sound. */
  at: number;
  /** Seconds the layer lasts. */
  dur: number;
  /** 0–1 sent to the shared room reverb. */
  wet: number;
}

/** A pitched blip; f glides to f2 when given. */
export interface ToneLayer extends LayerTiming {
  type: 'tone';
  f: number;
  f2?: number;
  wave: OscillatorType;
  /** Attack in seconds. */
  a: number;
  /** Peak level 0–1. */
  g: number;
}

/** Filtered white noise; the filter sweeps from f to f2 when given. */
export interface NoiseLayer extends LayerTiming {
  type: 'noise';
  filter: 'lowpass' | 'highpass' | 'bandpass';
  f: number;
  f2?: number;
  q: number;
  a: number;
  g: number;
}

/** Sine partials at f × ratios, each with its level; higher partials fade sooner. */
export interface BellLayer extends LayerTiming {
  type: 'bell';
  f: number;
  ratios: number[];
  gains: number[];
}

export type UiSoundLayer = ToneLayer | NoiseLayer | BellLayer;

export interface UiSound {
  /** Overall level of the sound, so events of different themes sit at a similar loudness. */
  gain: number;
  layers: UiSoundLayer[];
}

export type UiSounds = Partial<Record<UiSoundEvent, UiSound>>;
