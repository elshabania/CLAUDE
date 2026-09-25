// Campaign reachability proof (QA plan: no-softlock). Abstractly plays the story as a fixpoint:
// from a fresh save, repeatedly enter every reachable zone, talk to every visible NPC (first choice option),
// beat every visible trainer, solve every node whose register is unlocked (Steward fallback for mandatory nodes),
// and pick up everything — until nothing changes. The campaign must reach flag_game_cleared and every zone.
import { describe, expect, it } from 'vitest';
import { ZONES } from '../../src/data/zones';
import { DIALOGUE, TRAINERS, type Action } from '../../src/data/registry';
import { CONTENT } from '../../src/data/index';
import { evalExpr, REGISTER_UNLOCK } from '../../src/sim/world';
import { newGamePayload } from '../../src/sim/game';
import { storyOnWin } from '../../src/state/game';
import type { SavePayload } from '../../src/persistence/saveTypes';

function run() {
  let s: SavePayload = newGamePayload(CONTENT, 'Test', 'they', { build: 0, skin: 0, hair: 0 }, 1);
  s.flags.flag_starter_chosen = true; // StarterScreen
  s.player.starter = 'c01';
  const reached = new Set<string>(['town_1']);
  const log: string[] = [];
  const setFlag = (f: string) => { if (!s.flags[f]) { s.flags[f] = true; log.push(f); return true; } return false; };
  const give = (it: string) => { if (!(s.inventory[it] > 0)) { s.inventory[it] = 1; log.push(it); return true; } return false; };
  const win = (tid: string) => {
    if (s.defeatedTrainers.includes(tid)) return false;
    s.defeatedTrainers.push(tid);
    setFlag(`flag_${tid}_won`);
    const st = storyOnWin(tid);
    st.flags.forEach(setFlag);
    st.items.forEach(give);
    talk(`dlg_${tid}_post`);
    return true;
  };
  const apply = (acts: Action[] | undefined): boolean => {
    let ch = false;
    for (const a of acts ?? []) {
      if (a.set) ch = setFlag(a.set as string) || ch;
      if (a.give && ((a.n as number) ?? 1) > 0) ch = give(a.give as string) || ch;
      if (a.battle) { ch = win(a.battle as string) || ch; }
      if (a.steward) {
        const id = a.steward as string;
        if (!s.nodes.includes(id)) { s.nodes.push(id); ch = true; }
        const n = Object.values(ZONES).flatMap((z) => z.nodes).find((x) => x.id === id);
        if (n?.sets) ch = setFlag(n.sets) || ch;
      }
      if (a.talk) ch = talk(a.talk as string) || ch;
    }
    return ch;
  };
  const talked = new Set<string>();
  const talk = (id: string): boolean => {
    const d = DIALOGUE[id];
    if (!d) return false;
    const v = d.variants.find((x) => evalExpr(x.if, s));
    if (!v) return false;
    const key = id + ':' + d.variants.indexOf(v);
    const ch = apply(v.actions) || apply(v.choice?.options[0]?.actions);
    const first = !talked.has(key);
    talked.add(key);
    return ch || (first && false);
  };
  const visible = (o: { showIf?: string; hideIf?: string }) => (o.showIf ? evalExpr(o.showIf, s) : true) && !(o.hideIf ? evalExpr(o.hideIf, s) : false);
  const unlocked = (t: string) => { const k = REGISTER_UNLOCK[t]; return !k || (k.startsWith('i_') ? s.inventory[k] > 0 : !!s.flags[k]); };
  apply([]);
  talk('dlg_intro_wake');
  for (let iter = 0; iter < 400; iter++) {
    let changed = false;
    for (const zid of [...reached]) {
      const z = ZONES[zid];
      if (!z) continue;
      for (const n of z.npcs as { dialogue: string; showIf?: string; hideIf?: string }[]) if (visible(n)) changed = talk(n.dialogue) || changed;
      for (const t of z.trainers as { id: string; showIf?: string; hideIf?: string }[]) {
        if (!visible(t) || !TRAINERS[t.id]) continue;
        if (!s.defeatedTrainers.includes(t.id)) { talk(`dlg_${t.id}_pre`); changed = win(t.id) || changed; }
        else changed = talk(`dlg_${t.id}_after`) || changed;
      }
      for (const n of z.nodes) {
        if (s.nodes.includes(n.id) || !unlocked(n.type) || (n.showIf && !evalExpr(n.showIf, s))) continue;
        s.nodes.push(n.id);
        if (n.sets) setFlag(n.sets);
        changed = true;
      }
      for (const e of z.exits) {
        if (reached.has(e.to) || !ZONES[e.to]) continue;
        const g = e.gate;
        const ok = (!g?.flag || evalExpr(g.flag, s)) && (!g?.register || s.nodes.includes(g.register));
        const node = z.nodes.find((n) => n.opens === e.id);
        if (ok && (!node || s.nodes.includes(node.id))) { reached.add(e.to); log.push('> ' + e.to); changed = true; }
      }
    }
    if (!changed) break;
  }
  return { s, reached, log };
}

describe('campaign graph', () => {
  const r = run();
  it('every zone is reachable', () => {
    expect(Object.keys(ZONES).filter((z) => !r.reached.has(z))).toEqual([]);
  });
  it('all six Keynotes are earned', () => {
    expect([1, 2, 3, 4, 5, 6].filter((i) => !(r.s.inventory[`i_keynote_${i}`] > 0))).toEqual([]);
  });
  it('main story flags are all reachable, in order', () => {
    const need = ['flag_rival_1_done', 'flag_resonance_tutorial', 'flag_forest_rootgate_open', 'flag_trial_1_cleared', 'flag_rival_2_done', 'flag_trial_2_cleared', 'flag_cave_miners_saved', 'flag_fen_stone_restored', 'flag_rival_3_done', 'flag_trial_3_cleared', 'flag_trial_4_cleared', 'flag_leftover_rescued', 'flag_rival_4_done', 'flag_trial_5_cleared', 'flag_rival_5_done', 'flag_odile_revealed', 'flag_trial_6_cleared', 'flag_nullbell_broken', 'flag_rival_6_done', 'flag_champion_defeated', 'flag_game_cleared'];
    const missing = need.filter((f) => !r.s.flags[f]);
    expect(missing, 'log tail: ' + r.log.slice(-25).join(' ')).toEqual([]);
    const order = need.map((f) => r.log.indexOf(f));
    const outOfOrder = need.filter((f, i) => i > 0 && order[i] < order[i - 1] && !['flag_resonance_tutorial', 'flag_cave_miners_saved', 'flag_fen_stone_restored', 'flag_leftover_rescued'].includes(f));
    expect(outOfOrder).toEqual([]);
  });
  it('every mandatory trainer is beatable (placed and visible at some point)', () => {
    const miss = Object.values(TRAINERS).filter((t) => t.mandatory && !r.s.defeatedTrainers.includes(t.id)).map((t) => t.id);
    expect(miss).toEqual([]);
  });
});
