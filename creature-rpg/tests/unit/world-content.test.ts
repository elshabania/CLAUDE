// Cross-reference validation of zones, dialogue, trainers and shops (content contract: design/CONTENT_FORMATS.md).
import { describe, expect, it } from 'vitest';
import { ZONES, ZONE_ERRORS } from '../../src/data/zones';
import { DIALOGUE, TRAINERS, SHOPS } from '../../src/data/registry';
import { LOOKS } from '../../src/data/looks';
import { CONTENT } from '../../src/data/index';

const PROP_KINDS = new Set('house house2 hearth chordstone lamp sign well stall bridge hall_root hall_stone hall_mere hall_vane hall_forge hall_rime spire windmill tent stilthouse crate wall tree blossom pine snowpine hollowtree willow deadtree bush rock boulder crystal basalt icerock mushroom fence grass flowers reeds'.split(' '));
const ACTIONS = new Set('set unset heal shop give n money kin lv battle starter quest step questDone warp spawn fosterage recall steward ledger healHint ending take talk speaker'.split(' '));

describe('world content', () => {
  it('all zones parse', () => expect(ZONE_ERRORS).toEqual([]));

  it('exits link to existing spawns with a return exit', () => {
    const errs: string[] = [];
    for (const z of Object.values(ZONES)) {
      for (const e of z.exits) {
        const t = ZONES[e.to];
        if (!t) continue; // target zone not authored yet is reported by the campaign completeness test
        if (!t.spawns.some((s) => s.id === e.spawn)) errs.push(`${z.id}.${e.id} -> ${e.to}:${e.spawn} missing spawn`);
        if (!t.exits.some((b) => b.to === z.id)) errs.push(`${e.to} has no exit back to ${z.id}`);
      }
      const ids = new Set(z.spawns.map((s) => s.id));
      if (z.hearthSpawn && !ids.has(z.hearthSpawn)) errs.push(`${z.id} hearthSpawn ${z.hearthSpawn} missing`);
    }
    expect(errs).toEqual([]);
  });

  it('props, npcs, trainers, pickups reference valid ids', () => {
    const errs: string[] = [];
    const pickupIds = new Set<string>();
    for (const z of Object.values(ZONES)) {
      for (const p of z.props) if (!PROP_KINDS.has(p.kind)) errs.push(`${z.id} prop kind ${p.kind}`);
      for (const s of z.scatter) if (!PROP_KINDS.has(s.kind)) errs.push(`${z.id} scatter kind ${s.kind}`);
      for (const n of z.npcs) {
        if (!LOOKS[n.look]) errs.push(`${z.id} npc ${n.id} look ${n.look}`);
        if (!DIALOGUE[n.dialogue]) errs.push(`${z.id} npc ${n.id} dialogue ${n.dialogue} missing`);
      }
      for (const t of z.trainers) if (!TRAINERS[t.id]) errs.push(`${z.id} trainer ${t.id} not in trainers.json`);
      for (const p of z.pickups) {
        if (p.item !== 'money' && !CONTENT.items[p.item]) errs.push(`${z.id} pickup ${p.id} item ${p.item}`);
        if (pickupIds.has(p.id)) errs.push(`duplicate pickup ${p.id}`);
        pickupIds.add(p.id);
      }
    }
    expect(errs).toEqual([]);
  });

  it('dialogue actions reference valid content', () => {
    const errs: string[] = [];
    for (const [id, d] of Object.entries(DIALOGUE)) {
      if (!d.variants?.length) errs.push(`${id} has no variants`);
      for (const v of d.variants ?? []) {
        const acts = [...(v.actions ?? []), ...(v.choice?.options.flatMap((o) => o.actions) ?? [])];
        for (const a of acts) {
          for (const k of Object.keys(a)) if (!ACTIONS.has(k)) errs.push(`${id} unknown action key ${k}`);
          if (a.talk && !DIALOGUE[a.talk as string]) errs.push(`${id} talk ${a.talk}`);
          if (a.battle && !TRAINERS[a.battle as string]) errs.push(`${id} battle ${a.battle}`);
          if (a.give && !CONTENT.items[a.give as string]) errs.push(`${id} give ${a.give}`);
          if (a.kin && !['leftover', 'rival_line'].includes(a.kin as string) && !CONTENT.species[a.kin as string]) errs.push(`${id} kin ${a.kin}`);
          if (a.shop && !SHOPS[a.shop as string]) errs.push(`${id} shop ${a.shop}`);
          if (a.warp && ZONES[a.warp as string] && !ZONES[a.warp as string].spawns.some((s) => s.id === a.spawn)) errs.push(`${id} warp spawn ${a.warp}:${a.spawn}`);
        }
        if (!v.lines?.length && !acts.length) errs.push(`${id} empty variant`);
      }
    }
    expect(errs).toEqual([]);
  });

  it('every mandatory trainer is placed in its zone (for authored zones)', () => {
    const missing: string[] = [];
    for (const t of Object.values(TRAINERS)) {
      const z = ZONES[t.zone];
      if (!z || !t.mandatory) continue;
      const placed = z.trainers.some((p) => p.id === t.id) || Object.values(DIALOGUE).some((d) => d.variants.some((v) => [...(v.actions ?? []), ...(v.choice?.options.flatMap((o) => o.actions) ?? [])].some((a) => a.battle === t.id)));
      if (!placed) missing.push(`${t.zone}:${t.id}`);
    }
    expect(missing).toEqual([]);
  });
});
