/**
 * The part of Strudel's `superdough` the app's sound uses. The package ships
 * no types. See `app/sound.ts`.
 */
declare module "superdough" {
  export function registerSynthSounds(): void;
  export function initAudio(options?: { disableWorklets?: boolean }): Promise<void>;
  export function getAudioContext(): AudioContext;
  export function superdough(value: Record<string, unknown>, t: number, duration: number): Promise<void>;
}
