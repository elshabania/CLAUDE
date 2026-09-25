// Thin facade so gameplay code can request sounds without importing Tone.js directly.
// The audio engine (audio/engine.ts) registers the real players after the first user gesture.
type Player = (id: string, opts?: Record<string, unknown>) => void;
type CryPlayer = (species: string, opts?: { faint?: boolean; happy?: boolean }) => void;
let player: Player | null = null;
let cryPlayer: CryPlayer | null = null;
export function registerSfxPlayer(p: Player, c: CryPlayer) {
  player = p;
  cryPlayer = c;
}
export function sfx(id: string, opts?: Record<string, unknown>) {
  try {
    player?.(id, opts);
  } catch {
    /* audio must never break gameplay */
  }
}
export function cry(species: string, opts?: { faint?: boolean; happy?: boolean }) {
  try {
    cryPlayer?.(species, opts);
  } catch {
    /* ignore */
  }
}
