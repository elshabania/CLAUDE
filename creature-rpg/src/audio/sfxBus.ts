// Thin facade so gameplay code can request sounds without importing Tone.js directly.
// The audio engine (audio/engine.ts) registers the real player after the first user gesture.
type Player = (id: string, opts?: Record<string, unknown>) => void;
let player: Player | null = null;
export function registerSfxPlayer(p: Player) {
  player = p;
}
export function sfx(id: string, opts?: Record<string, unknown>) {
  player?.(id, opts);
}
