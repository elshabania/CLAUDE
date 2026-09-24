// TEMPORARY runtime probe (deleted after verification).
import * as Tone from 'tone';
import * as E from './engine';
import { sfx, cry } from './sfxBus';
import { SONGS } from './songs';
import { CONTENT } from '../data/index';

export async function probe(which: string) {
  await E.startAudio();
  const meter = new Tone.Meter({ normalRange: true, smoothing: 0 });
  Tone.getDestination().connect(meter);
  const out: Record<string, number> = {};
  const sample = async (ms: number) => {
    let max = 0;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      await new Promise((r) => setTimeout(r, 25));
      const v = meter.getValue() as number;
      if (v > max) max = v;
    }
    return +max.toFixed(3);
  };
  out.ctxRunning = Tone.getContext().state === 'running' ? 1 : 0;
  if (which === 'zones') {
    for (const z of [...Object.keys(SONGS), 'forest@night', 'mystery_zone']) {
      E.setZoneMusic(z);
      out['zone:' + z] = await sample(2200);
    }
  }
  if (which === 'battle') {
    E.setZoneMusic('route_1');
    await sample(500);
    for (const k of ['wild', 'trainer', 'rival', 'cantor', 'admin', 'stillmark', 'odile', 'odile_b', 'champion']) {
      E.setBattleMusic(k, 'fire');
      out['battle:' + k] = await sample(1500);
    }
    E.setBattleIntensity(true);
    out['battle:intense'] = await sample(2500);
    E.endBattleMusic('victory');
    out['end:victory'] = await sample(3500);
    out['zone-resumed'] = await sample(1500);
    E.setBattleMusic('wild');
    await sample(800);
    E.endBattleMusic('capture');
    out['end:capture'] = await sample(2500);
  }
  if (which === 'stingers') {
    E.setZoneMusic(null);
    await sample(1800);
    for (const s of ['victory', 'capture', 'evolution', 'keynote', 'keynote_4', 'level_up', 'heal', 'item', 'great_chord', 'crescendo_finish', 'weird']) {
      E.playStinger(s);
      out['stinger:' + s] = await sample(s === 'evolution' ? 6500 : s === 'great_chord' ? 5000 : 1500);
    }
  }
  if (which === 'sfx') {
    E.setZoneMusic(null);
    await sample(1800);
    const ids: [string, Record<string, unknown>?][] = [
      ['ui_move'], ['ui_back'], ['ui_confirm'], ['menu_move'], ['menu_select'], ['menu_back'], ['step'], ['step', { surface: 'snow' }], ['res_trigger', { type: 'frost' }],
      ['item_pickup'], ['res_waystone_register'], ['battle_start_trainer'], ['battle_start_wild'], ['send_out'], ['hit_crit'], ['hit_resounding'], ['hit_muffled'], ['hit_normal'],
      ['faint'], ['level_up'], ['chime_throw'], ['chime_ring', { n: 1 }], ['chime_ring', { n: 3 }], ['chime_break'], ['chime_bond'], ['chime_click'], ['stone_rehum'],
      ['dialogue_blip'], ['door'], ['warp'], ['encounter_start'], ['status_apply_burn'], ['stat_up'], ['miss_whiff'], ['stillbell_toll'], ['coil_siphon_hum'], ['totally_unknown_id'],
    ];
    for (const t of ['fire', 'water', 'electric', 'verdant', 'stone', 'frost', 'gale', 'toxin', 'shade', 'lumen', 'none'])
      for (const a of ['melee_lunge', 'beam', 'burst_area', 'heal_glow', 'multi_hit_flurry']) ids.push(['move', { type: t, anim: a }]);
    for (const [id, o] of ids) {
      sfx(id, o);
      out['sfx:' + id + (o ? JSON.stringify(o) : '')] = await sample(350);
    }
  }
  if (which === 'cries') {
    E.setZoneMusic(null);
    await sample(1800);
    for (const sp of Object.keys(CONTENT.species)) {
      cry(sp);
      out['cry:' + sp] = await sample(900);
    }
    cry('c05', { faint: true });
    out['cry:faint'] = await sample(1400);
    cry('c05', { happy: true });
    out['cry:happy'] = await sample(900);
    cry('zzz_unknown');
    out['cry:unknown'] = await sample(900);
  }
  return out;
}
