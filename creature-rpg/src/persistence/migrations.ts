import { SAVE_SCHEMA_VERSION } from './saveTypes';

/** migrations[n] converts a vN payload into v(N+1). Pure; never throws on valid input. */
export const migrations: Record<number, (p: any) => any> = {
  // v1 -> v2: v1 had no `waystones`/`pickups` arrays and stored `lastHeal` instead of `lastHearth`.
  1: (p) => {
    const { lastHeal, ...rest } = p;
    return {
      ...rest,
      lastHearth: lastHeal ?? rest.lastHearth ?? { zone: 'town_1', spawn: 'home' },
      waystones: rest.waystones ?? [],
      pickups: rest.pickups ?? [],
    };
  },
};

export function migrate(payload: unknown, fromVersion: number): unknown {
  let p = payload;
  for (let v = fromVersion; v < SAVE_SCHEMA_VERSION; v++) {
    const m = migrations[v];
    if (!m) throw new Error(`no migration from v${v}`);
    p = m(structuredClone(p));
  }
  return p;
}
