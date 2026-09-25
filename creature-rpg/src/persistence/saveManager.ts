// Atomic, versioned localStorage persistence (design/rendering_and_architecture.md §10).
// Storage is injected so the manager is unit-testable in node.
import { migrate } from './migrations';
import { SAVE_SCHEMA_VERSION, type SaveEnvelope, type SavePayload } from './saveTypes';
import { validatePayload } from './validate';

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export const KEYS = {
  main: 'crpg:save:main',
  backup: 'crpg:save:backup',
  tmp: 'crpg:save:tmp',
  corrupt: 'crpg:save:corrupt',
  settings: 'crpg:settings',
  probe: 'crpg:probe',
} as const;

export const GAME_VERSION = '1.0.0';

/** Canonical JSON with sorted object keys (stable checksums). */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function buildEnvelope(payload: SavePayload, now: string): string {
  const env: SaveEnvelope = {
    format: 'crpg-save',
    schemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion: GAME_VERSION,
    savedAt: now,
    checksum: fnv1a(canonical(payload)),
    payload,
  };
  return JSON.stringify(env);
}

export type ParseResult =
  | { ok: true; payload: SavePayload; env: SaveEnvelope; checksumOk: boolean; migratedFrom?: number }
  | { ok: false; error: string; newer?: boolean };

export function parseEnvelope(raw: string | null, opts: { allowBadChecksum?: boolean; knownIds?: KnownIds } = {}): ParseResult {
  if (!raw) return { ok: false, error: 'empty' };
  let env: SaveEnvelope;
  try {
    env = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'malformed JSON' };
  }
  if (!env || env.format !== 'crpg-save' || typeof env.schemaVersion !== 'number' || typeof env.payload !== 'object' || env.payload === null)
    return { ok: false, error: 'not a save file' };
  if (env.schemaVersion > SAVE_SCHEMA_VERSION) return { ok: false, error: 'save is from a newer version of the game', newer: true };
  const checksumOk = fnv1a(canonical(env.payload)) === env.checksum;
  if (!checksumOk && !opts.allowBadChecksum) return { ok: false, error: 'checksum mismatch' };
  let payload: unknown;
  try {
    payload = migrate(env.payload, env.schemaVersion);
  } catch (e) {
    return { ok: false, error: 'migration failed: ' + (e as Error).message };
  }
  const v = validatePayload(payload, opts.knownIds);
  if (!v.ok) return { ok: false, error: 'invalid save: ' + v.error };
  return { ok: true, payload: payload as SavePayload, env, checksumOk, migratedFrom: env.schemaVersion < SAVE_SCHEMA_VERSION ? env.schemaVersion : undefined };
}

export interface KnownIds {
  species: Set<string>;
  moves: Set<string>;
  items: Set<string>;
  zones: Set<string>;
}

export type CommitResult = { ok: true } | { ok: false; error: 'quota' | 'unavailable' | 'verify'; message: string };

function isQuota(e: unknown): boolean {
  const err = e as { name?: string; code?: number };
  return !!err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014);
}

export class SaveManager {
  /** In-memory envelope used in no-storage mode (and mirrors the last good write). */
  memory: string | null = null;
  constructor(public kv: KV | null, private knownIds?: KnownIds) {}

  static probe(kv: KV | null): boolean {
    if (!kv) return false;
    try {
      kv.setItem(KEYS.probe, '1');
      const ok = kv.getItem(KEYS.probe) === '1';
      kv.removeItem(KEYS.probe);
      return ok;
    } catch {
      return false;
    }
  }

  get available(): boolean {
    return !!this.kv;
  }

  private verify(key: string, expected: string): boolean {
    const got = this.kv!.getItem(key);
    if (got !== expected) return false;
    try {
      const env = JSON.parse(got) as SaveEnvelope;
      return fnv1a(canonical(env.payload)) === env.checksum;
    } catch {
      return false;
    }
  }

  commit(payload: SavePayload, now = new Date().toISOString()): CommitResult {
    const S = buildEnvelope(payload, now);
    this.memory = S;
    if (!this.kv) return { ok: false, error: 'unavailable', message: 'Storage unavailable: progress is kept in memory only. Export your save to keep it.' };
    const kv = this.kv;
    try {
      kv.setItem(KEYS.tmp, S);
      if (!this.verify(KEYS.tmp, S)) throw new Error('verify');
      const main = kv.getItem(KEYS.main);
      if (main) {
        const p = parseEnvelope(main, {});
        if (p.ok) kv.setItem(KEYS.backup, main);
      }
      kv.setItem(KEYS.main, S);
      if (!this.verify(KEYS.main, S)) throw new Error('verify');
      kv.removeItem(KEYS.tmp);
      return { ok: true };
    } catch (e) {
      try {
        kv.removeItem(KEYS.tmp);
      } catch {
        /* ignore */
      }
      if (isQuota(e)) return { ok: false, error: 'quota', message: 'Saving failed: storage is full. Export your save to keep your progress.' };
      if ((e as Error).message === 'verify') return { ok: false, error: 'verify', message: 'Saving failed: the written data could not be verified.' };
      return { ok: false, error: 'unavailable', message: 'Saving failed: storage is not available.' };
    }
  }

  /** Load with recovery order main -> tmp -> backup. */
  load(): { payload: SavePayload | null; source: 'main' | 'tmp' | 'backup' | 'memory' | null; notice?: string; newer?: boolean } {
    if (!this.kv) {
      const p = parseEnvelope(this.memory, { knownIds: this.knownIds });
      return p.ok ? { payload: p.payload, source: 'memory' } : { payload: null, source: null };
    }
    const kv = this.kv;
    const read = (k: string) => {
      try {
        return kv.getItem(k);
      } catch {
        return null;
      }
    };
    const mainRaw = read(KEYS.main);
    const main = parseEnvelope(mainRaw, { knownIds: this.knownIds });
    if (main.ok) return { payload: main.payload, source: 'main' };
    if (!main.ok && main.newer) return { payload: null, source: null, newer: true, notice: 'This save was made by a newer version of the game and cannot be loaded here. It has not been changed.' };
    const tmp = parseEnvelope(read(KEYS.tmp), { knownIds: this.knownIds });
    if (tmp.ok) return { payload: tmp.payload, source: 'tmp', notice: mainRaw ? 'Your last save was interrupted; the most recent progress was recovered.' : undefined };
    const backup = parseEnvelope(read(KEYS.backup), { knownIds: this.knownIds });
    if (backup.ok) {
      if (mainRaw) {
        try {
          kv.setItem(KEYS.corrupt, mainRaw);
        } catch {
          /* ignore */
        }
      }
      return { payload: backup.payload, source: 'backup', notice: `Your last save could not be read; restored from backup (saved ${backup.env.savedAt.slice(0, 16).replace('T', ' ')}).` };
    }
    if (mainRaw) return { payload: null, source: null, notice: 'No valid save could be read. You can export the damaged data or start a new game.' };
    return { payload: null, source: null };
  }

  hasSave(): boolean {
    return this.load().payload != null;
  }

  exportRaw(): string | null {
    if (this.kv) {
      try {
        return this.kv.getItem(KEYS.main) ?? this.kv.getItem(KEYS.corrupt) ?? this.memory;
      } catch {
        return this.memory;
      }
    }
    return this.memory;
  }

  /** Import validated text; rotates current main into backup through the atomic commit. */
  importRaw(text: string): { ok: true; payload: SavePayload; warning?: string } | { ok: false; error: string } {
    if (text.length > 2_000_000) return { ok: false, error: 'file too large' };
    const p = parseEnvelope(text, { allowBadChecksum: true, knownIds: this.knownIds });
    if (!p.ok) return { ok: false, error: p.error };
    const r = this.commit(p.payload);
    if (!r.ok && r.error !== 'unavailable') return { ok: false, error: r.message };
    return { ok: true, payload: p.payload, warning: p.checksumOk ? undefined : 'The file checksum did not match; it was imported because the contents are valid.' };
  }

  /** New game: rotate main to backup so the previous save survives until the next save. */
  startNewGame() {
    if (!this.kv) return;
    try {
      const main = this.kv.getItem(KEYS.main);
      if (main && parseEnvelope(main).ok) this.kv.setItem(KEYS.backup, main);
      this.kv.removeItem(KEYS.main);
    } catch {
      /* ignore; next commit reports errors */
    }
  }
}
