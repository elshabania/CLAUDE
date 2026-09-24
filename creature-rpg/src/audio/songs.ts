// Song data for the generative music engine. Pure data + tiny helpers (no Tone import),
// so it can be unit-tested and tree-shaken. Every theme is original: melodies are generated
// deterministically from each song's seed over its chord progression, and the only fixed
// melodic cell is the game's own "Chord motif" (creative_direction.md §8.2).

export type LeadKind = 'glass' | 'glass_dry' | 'reed' | 'reed_flutter' | 'pluck' | 'saw' | 'brass' | 'mute' | 'bell' | 'none';
export type PadKind = 'warm' | 'light' | 'chorus' | 'organ' | 'murky' | 'shimmer' | 'bright' | 'airy' | 'dark' | 'aurora' | 'cold' | 'full' | 'noise' | 'none';
export type BassKind = keyof typeof BASS;

export interface PercDef {
  k?: string; // kick / frame drum, 16 steps ('x' hit, 'o' soft)
  s?: string; // snare / brush
  h?: string; // hat / shaker
  t?: string; // tom (higher membrane)
  m?: string; // metal tick (anvil)
  c?: string; // click (clock tick)
  kick?: 'soft' | 'taiko' | 'sub' | 'log';
  bellEvery?: number; // bell accent on bar 0 of every N bars
  rand?: 'drip' | 'frog';
  swell?: number; // noise swell (rain-stick) every N bars
}

export interface SongDef {
  key: number; // tonic pitch class, 0 = C
  mode: number[];
  bpm: number;
  prog: number[]; // chord scale-degree per bar (8 bars, played twice with melodic variation)
  lead: LeadKind;
  lead2?: LeadKind;
  lead2Role?: 'answer' | 'unison';
  leadOct: number;
  arp?: 'pluck' | 'pluck16';
  pad: PadKind;
  bass: BassKind;
  bassOct?: number;
  bassWave?: 'triangle' | 'square' | 'sawtooth';
  perc: PercDef;
  motif?: 'chord' | 'odile' | 'battle' | 'none';
  density: number; // 0..1 melodic busyness
  swing?: number;
  seed: number;
  drone?: boolean;
  wind?: boolean;
  delay?: boolean; // echoing lead (cave)
  songFilter?: number; // lowpass on the whole song (Stillmark muffle)
  leadDb?: number; // extra lead gain (wild battles: -6)
  battle?: boolean;
  hallBell?: boolean; // bell on bar 1 of every 8 (Cantor)
  counter?: boolean; // pluck counter-melody (champion)
  trill?: boolean; // rival scarf-flutter trill
  phaseB?: boolean; // Odile phase B: filter open + Chord motif over Odile motif
}

export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygdom: [0, 1, 4, 5, 7, 8, 10],
};
const K = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };

// Bass patterns: [step, tone, durSteps]; tone 'cN' chord tone N (0 root,1 3rd,2 5th,3 octave),
// 'sN' N scale steps above the chord root, 'a' approach note (step below next bar's root), 't' tonic pedal.
export const BASS = {
  walk: [[0, 'c0', 4], [4, 'c1', 4], [8, 'c2', 4], [12, 'a', 4]],
  octaves: [[0, 'c0', 2], [2, 'c3', 2], [4, 'c0', 2], [6, 'c3', 2], [8, 'c0', 2], [10, 'c3', 2], [12, 'c0', 2], [14, 'c3', 2]],
  root5: [[0, 'c0', 8], [8, 'c2', 8]],
  drone: [[0, 'c0', 16]],
  pulse: [[0, 'c0', 2], [4, 'c0', 2], [6, 'c2', 2], [8, 'c0', 2], [12, 'c0', 2], [14, 'c2', 2]],
  step: [[0, 'c0', 4], [4, 's1', 4], [8, 'c1', 4], [12, 's1', 4]],
  sub: [[0, 'c0', 6], [8, 'c0', 6]],
  sync: [[0, 'c0', 3], [3, 'c0', 3], [6, 'c2', 2], [10, 'c0', 2], [12, 'c3', 4]],
  jaunty: [[0, 'c0', 3], [4, 'c2', 2], [6, 'c3', 2], [8, 'c1', 3], [12, 'c2', 2], [14, 'a', 2]],
  driving: [[0, 'c0', 1], [2, 'c0', 1], [4, 'c0', 1], [6, 'c2', 1], [8, 'c0', 1], [10, 'c0', 1], [12, 'c3', 1], [14, 'c2', 1]],
  heavy: [[0, 'c0', 4], [4, 'c0', 2], [6, 's1', 2], [8, 'c0', 4], [12, 's1', 4]],
  sparse: [[0, 'c0', 12]],
  pedal: [[0, 't', 16]],
  slow: [[0, 'c0', 8], [8, 'c1', 8]],
  battle: [[0, 'c0', 1], [2, 'c0', 1], [3, 'c3', 1], [4, 'c0', 1], [6, 'c0', 1], [7, 'c2', 1], [8, 'c0', 1], [10, 'c0', 1], [11, 'c3', 1], [12, 'c0', 1], [14, 'c1', 1], [15, 'c2', 1]],
  none: [],
} as const satisfies Record<string, readonly (readonly [number, string, number])[]>;

const NONE: PercDef = {};

export const SONGS: Record<string, SongDef> = {
  // D major → D Mixolydian, the glass lead states the Chord motif over a D pedal.
  title: { key: K.D, mode: MODES.mixolydian, bpm: 84, prog: [0, 6, 3, 0, 0, 6, 4, 0], lead: 'glass', leadOct: 5, pad: 'warm', bass: 'pedal', perc: { bellEvery: 4 }, motif: 'chord', density: 0.3, seed: 11 },
  // Larkhollow: luthier village — pluck arpeggio + reed melody, walking bass, brushes on 2 & 4.
  town_1: { key: K.G, mode: MODES.major, bpm: 96, prog: [0, 3, 4, 0, 5, 3, 1, 4], lead: 'reed', leadOct: 5, arp: 'pluck', pad: 'warm', bass: 'walk', perc: { s: '....o.......o...', h: '..o...o...o...o.' }, motif: 'chord', density: 0.5, seed: 101 },
  // Thistledown Way: bright meadow gallop.
  route_1: { key: K.D, mode: MODES.major, bpm: 118, prog: [0, 4, 5, 3, 0, 4, 3, 4], lead: 'reed', leadOct: 5, pad: 'light', bass: 'octaves', perc: { k: 'x.....x...x.....', h: 'x.o.x.o.x.o.x.o.', kick: 'soft' }, motif: 'chord', density: 0.65, seed: 102 },
  // Murmurwood: sparse glass over a chorused pad and wind; log-tom.
  forest: { key: K.E, mode: MODES.dorian, bpm: 90, prog: [0, 3, 0, 3, 6, 3, 4, 0], lead: 'glass', leadOct: 5, pad: 'chorus', bass: 'root5', perc: { k: 'x.........x.....', kick: 'log' }, motif: 'chord', density: 0.3, wind: true, seed: 103 },
  // Brackenridge Pass: drone fiddle feel, stomping kick.
  route_2: { key: K.A, mode: MODES.mixolydian, bpm: 112, prog: [0, 6, 0, 6, 3, 6, 4, 0], lead: 'reed', leadOct: 4, pad: 'none', bass: 'pulse', perc: { k: 'x.......x.......', s: '....o.......o...' }, motif: 'chord', density: 0.6, drone: true, seed: 104 },
  // Knellstone: quarry bell town, organ pad and anvil ticks.
  town_2: { key: K.C, mode: MODES.major, bpm: 100, prog: [0, 5, 3, 4, 0, 1, 3, 4], lead: 'bell', lead2: 'pluck', lead2Role: 'answer', leadOct: 5, pad: 'organ', bass: 'step', perc: { k: 'x.......x.......', m: '....x.......x...', kick: 'soft' }, motif: 'chord', density: 0.45, seed: 105 },
  // The Undertone: echoing glass, low drone, random drip plinks.
  cave: { key: K.B, mode: MODES.phrygian, bpm: 76, prog: [0, 1, 0, 6, 0, 1, 5, 0], lead: 'glass', leadOct: 5, pad: 'dark', bass: 'sub', perc: { rand: 'drip', kick: 'sub' }, motif: 'chord', density: 0.25, drone: true, delay: true, seed: 106 },
  // Sallowfen: lazy swung reed, murky pad, frog clicks.
  route_3: { key: K.F, mode: MODES.dorian, bpm: 92, prog: [0, 3, 0, 4, 6, 3, 1, 0], lead: 'reed', leadOct: 5, pad: 'murky', bass: 'sync', perc: { s: '......o.......o.', rand: 'frog' }, motif: 'chord', density: 0.5, swing: 0.3, seed: 107 },
  // Sillowmere: long glass notes in Lydian, shimmer pad, rain-stick swells.
  lake: { key: K.Eb, mode: MODES.lydian, bpm: 88, prog: [0, 1, 0, 1, 5, 4, 1, 0], lead: 'glass', leadOct: 5, pad: 'shimmer', bass: 'slow', perc: { swell: 2 }, motif: 'chord', density: 0.25, seed: 108 },
  // Galewick: reed + pluck call-and-response, snare-brush rolls.
  town_3: { key: K.F, mode: MODES.major, bpm: 108, prog: [0, 4, 5, 3, 0, 3, 4, 4], lead: 'reed', lead2: 'pluck', lead2Role: 'answer', leadOct: 5, pad: 'bright', bass: 'jaunty', perc: { s: '....o.......oxox', h: 'x.x.x.x.x.x.x.x.' }, motif: 'chord', density: 0.55, seed: 109 },
  // Highscar Rise: big leaps, driving 8ths, toms and wind.
  route_4: { key: K.D, mode: MODES.mixolydian, bpm: 124, prog: [0, 6, 3, 0, 0, 6, 3, 4], lead: 'reed', leadOct: 5, pad: 'airy', bass: 'driving', perc: { k: 'x..x..x.x..x..x.', t: '..........x.x...' }, motif: 'chord', density: 0.6, wind: true, seed: 110 },
  // Mount Cindral: wah saw lead, dark pad, heavy root/♭2, taiko.
  volcano: { key: K.C, mode: MODES.phrygdom, bpm: 104, prog: [0, 1, 0, 6, 5, 1, 0, 0], lead: 'saw', leadOct: 4, pad: 'dark', bass: 'heavy', bassWave: 'square', perc: { k: 'x.....x.x.......', s: '....x.......x...', kick: 'taiko' }, motif: 'chord', density: 0.5, seed: 111 },
  // Gloamstair: glass motif fragments over an aurora pad, distant bell.
  route_5: { key: K.A, mode: MODES.aeolian, bpm: 80, prog: [0, 5, 3, 4, 0, 5, 6, 0], lead: 'glass', leadOct: 5, pad: 'aurora', bass: 'sparse', perc: { bellEvery: 2 }, motif: 'chord', density: 0.2, seed: 112 },
  // Hoarcrown: glass + reed unison, cold pad, crisp hats.
  snowpeak: { key: K.B, mode: MODES.aeolian, bpm: 96, prog: [0, 5, 2, 6, 0, 3, 4, 0], lead: 'glass_dry', lead2: 'reed', lead2Role: 'unison', leadOct: 5, pad: 'cold', bass: 'pedal', perc: { h: '.x.x.x.x.x.x.x.x', s: '........o.......' }, motif: 'chord', density: 0.45, seed: 113 },
  // Concord Spire: full Chord motif on brass-like FM, processional drums.
  league: { key: K.D, mode: MODES.major, bpm: 110, prog: [0, 4, 5, 3, 0, 3, 4, 0], lead: 'brass', leadOct: 5, arp: 'pluck', pad: 'full', bass: 'root5', perc: { k: 'x...x...x...x...', s: '..........o.xoxo', bellEvery: 8 }, motif: 'chord', density: 0.5, seed: 114 },
  // The Stillhouse: muted Odile motif, filtered noise bed, clock ticks, no bass.
  stillhouse: { key: K.D, mode: MODES.aeolian, bpm: 70, prog: [0, 0, 5, 5, 3, 3, 4, 4], lead: 'mute', leadOct: 5, pad: 'noise', bass: 'none', perc: { c: 'x...x...x...x...' }, motif: 'odile', density: 0.25, leadDb: 5, seed: 115 },
  // Hearthrest: pluck lullaby.
  hearth: { key: K.G, mode: MODES.major, bpm: 72, prog: [0, 3, 0, 4, 0, 3, 4, 0], lead: 'pluck', leadOct: 5, pad: 'warm', bass: 'none', perc: NONE, motif: 'none', density: 0.4, leadDb: 5, seed: 116 },
  // Rootloft & other Trial halls: stately bells and pluck, hall bell accents.
  hall: { key: K.G, mode: MODES.mixolydian, bpm: 100, prog: [0, 3, 6, 0, 5, 3, 4, 0], lead: 'bell', lead2: 'reed', lead2Role: 'answer', leadOct: 5, pad: 'organ', bass: 'root5', perc: { k: 'x.......x.......', s: '............o.o.', bellEvery: 8 }, motif: 'chord', density: 0.4, seed: 117 },
  // Knell Hall trial: processional toms, glass lead in A Dorian.
  trial: { key: K.A, mode: MODES.dorian, bpm: 104, prog: [0, 3, 0, 6, 5, 3, 4, 4], lead: 'glass', leadOct: 5, arp: 'pluck', pad: 'warm', bass: 'octaves', perc: { k: 'x.......x.......', t: '......x.......x.', bellEvery: 8 }, motif: 'chord', density: 0.45, seed: 118 },
};

export const SONG_ALIASES: Record<string, string> = {
  town: 'town_1', village: 'town_1', larkhollow: 'town_1', knellstone: 'town_2', galewick: 'town_3',
  route: 'route_1', meadow: 'route_1', ridge: 'route_2', fen: 'route_3', marsh: 'route_3', cliff: 'route_4', cliffs: 'route_4',
  tundra: 'route_5', snow: 'snowpeak', peak: 'snowpeak', spire: 'league', concord: 'league',
  trial_hall: 'hall', trialhall: 'hall', hearthrest: 'hearth', stillmark: 'stillhouse',
  trial_1: 'hall', trial_2: 'trial', trial_3: 'hall', trial_4: 'trial', trial_5: 'hall', trial_6: 'trial',
};

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Night variant: slower, sparser, darker, no hats. */
export function nightify(d: SongDef): SongDef {
  return {
    ...d,
    bpm: Math.round(d.bpm * 0.9),
    density: d.density * 0.65,
    perc: { ...d.perc, h: undefined, m: undefined },
    arp: undefined,
    pad: d.pad === 'none' ? 'none' : d.pad === 'noise' ? 'noise' : 'murky',
    seed: d.seed + 7,
  };
}

/** Resolve a zone music id (optionally suffixed "@night") to a song def; unknown ids get a generated theme. */
export function resolveSong(id: string): { key: string; def: SongDef } {
  const [raw, variant] = id.split('@');
  const base = raw.trim().toLowerCase();
  const name = SONGS[base] ? base : SONG_ALIASES[base] ?? base;
  let def = SONGS[name];
  if (!def) {
    const h = hashStr(name);
    const modes = [MODES.major, MODES.dorian, MODES.mixolydian, MODES.aeolian, MODES.lydian];
    const leads: LeadKind[] = ['glass', 'reed', 'pluck'];
    def = {
      key: h % 12, mode: modes[(h >>> 4) % modes.length], bpm: 84 + ((h >>> 8) % 30), prog: [0, 3, 4, 0, 5, 3, 4, 0],
      lead: leads[(h >>> 12) % 3], leadOct: 5, pad: 'warm', bass: 'root5', perc: { h: '..o...o...o...o.' }, motif: 'chord', density: 0.4, seed: h,
    };
  }
  const night = variant === 'night' && name !== 'stillhouse' && name !== 'title';
  return { key: name + (night ? '@night' : ''), def: night ? nightify(def) : def };
}

export const CANTOR_TYPES = ['verdant', 'stone', 'water', 'gale', 'fire', 'frost'];

/** Battle song for a kind; `zone` supplies the key for wild/trainer battles. */
export function battleSong(kind: string, cantorType?: string, zone?: SongDef): SongDef {
  const key = zone ? zone.key : K.A;
  const base: SongDef = {
    key, mode: MODES.aeolian, bpm: 132, prog: [0, 5, 3, 4, 0, 5, 6, 4], lead: 'reed', leadOct: 5, pad: 'dark', bass: 'battle', bassWave: 'sawtooth',
    perc: { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' }, motif: 'battle', density: 0.75, seed: 900 + key, battle: true,
  };
  switch (kind) {
    case 'wild':
      return { ...base, lead: 'glass', leadDb: -6, seed: 901 + key };
    case 'rival':
      return { ...base, key: K.E, mode: MODES.dorian, bpm: 138, swing: 0.25, lead: 'reed_flutter', trill: true, prog: [0, 3, 6, 4, 0, 3, 5, 4], seed: 930 };
    case 'cantor': {
      const lead: Record<string, LeadKind> = { fire: 'saw', water: 'glass', verdant: 'reed', stone: 'bell', gale: 'reed_flutter', frost: 'glass_dry', electric: 'glass', toxin: 'reed', shade: 'mute', lumen: 'brass' };
      const t = cantorType ?? 'verdant';
      const idx = Math.max(0, CANTOR_TYPES.indexOf(t));
      return { ...base, key: [K.E, K.C, K.Eb, K.D, K.C, K.B][idx] ?? K.A, mode: t === 'fire' ? MODES.phrygdom : MODES.dorian, bpm: 140, lead: lead[t] ?? 'glass', lead2: t === 'stone' ? 'pluck' : undefined, lead2Role: 'unison', hallBell: true, prog: [0, 6, 5, 4, 0, 3, 6, 4], seed: 940 + idx };
    }
    case 'admin':
    case 'stillmark':
      return { ...base, key: K.D, mode: MODES.aeolian, bpm: 128, lead: 'mute', motif: 'odile', songFilter: 2000, prog: [0, 5, 0, 4, 0, 1, 5, 4], seed: kind === 'admin' ? 950 : 951 };
    case 'odile':
      return { ...base, key: K.D, mode: MODES.phrygian, bpm: 128, lead: 'mute', motif: 'odile', songFilter: 2000, prog: [0, 1, 0, 6, 5, 1, 4, 0], seed: 960 };
    case 'odile_b':
      return { ...base, key: K.D, mode: MODES.phrygian, bpm: 128, lead: 'mute', lead2: 'glass', lead2Role: 'answer', motif: 'odile', phaseB: true, prog: [0, 1, 0, 6, 5, 1, 4, 0], seed: 960 };
    case 'champion':
      return { ...base, key: K.D, mode: MODES.mixolydian, bpm: 146, lead: 'brass', counter: true, pad: 'full', motif: 'battle', prog: [0, 6, 3, 4, 0, 6, 5, 4], perc: { k: 'x...x...x...x...', s: '....x.......x.xx', h: 'x.x.x.x.x.x.x.x.' }, seed: 970 };
    case 'trainer':
    default:
      return { ...base, mode: MODES.dorian, lead: 'glass', prog: [0, 3, 5, 4, 0, 3, 6, 4], seed: 910 + key };
  }
}

export interface MelNote { step: number; dur: number; idx: number; vel: number }

// Rhythm templates [onsetStep, durSteps] for one 16-step bar, by density.
const RHYTHMS: [number, number][][] = [
  [[0, 12], [12, 4]],
  [[0, 8], [8, 8]],
  [[0, 6], [6, 2], [8, 8]],
  [[0, 4], [4, 4], [8, 6], [14, 2]],
  [[0, 3], [3, 3], [6, 2], [8, 8]],
  [[0, 2], [2, 2], [4, 4], [8, 4], [12, 4]],
  [[0, 4], [6, 2], [8, 2], [10, 2], [12, 4]],
  [[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
];

/** Chord tones of bar `deg` as scale indices relative to tonic (0, 2, 4 above the degree). */
export function chordIdx(deg: number) {
  return [deg, deg + 2, deg + 4];
}

/**
 * Precomputes a 16-bar melody as scale indices (0 = tonic in the lead octave, 7 = octave above).
 * Deterministic from the seed. The "Chord motif" is root → up a 5th → down a 2nd → up a 3rd,
 * then the root an octave up; in scale steps: 0, 4, 3, 5, 7.
 */
export function genMelody(d: SongDef): MelNote[][] {
  const rng = mulberry(d.seed * 7919 + 17);
  const bars = d.prog.length * 2;
  const out: MelNote[][] = [];
  let cur = 4;
  const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length)];
  for (let b = 0; b < bars; b++) {
    const deg = d.prog[b % d.prog.length];
    const ct = chordIdx(deg).flatMap((x) => [x % 7, (x % 7) + 7]);
    const notes: MelNote[] = [];
    const phrasePos = b % 8;
    if (d.motif === 'chord' && phrasePos === 0) {
      notes.push({ step: 0, dur: 4, idx: 0, vel: 0.8 }, { step: 4, dur: 4, idx: 4, vel: 0.7 }, { step: 8, dur: 6, idx: 3, vel: 0.75 }, { step: 14, dur: 2, idx: 5, vel: 0.6 });
      cur = 7;
    } else if (d.motif === 'chord' && phrasePos === 1) {
      notes.push({ step: 0, dur: 10, idx: 7, vel: 0.8 });
      if (d.density > 0.4) notes.push({ step: 12, dur: 4, idx: 6, vel: 0.55 });
      cur = 6;
    } else if (d.motif === 'odile' && phrasePos % 4 === 0) {
      // Odile's motif: the Chord contour inverted (down a 5th, up a 2nd, down a 3rd, down to the low root).
      notes.push({ step: 0, dur: 4, idx: 7, vel: 0.7 }, { step: 4, dur: 4, idx: 3, vel: 0.6 }, { step: 8, dur: 6, idx: 4, vel: 0.65 }, { step: 14, dur: 2, idx: 2, vel: 0.5 });
      cur = 2;
    } else if (d.motif === 'battle' && phrasePos % 4 === 0) {
      // Battle variant: motif at double speed, answered by the octave root.
      notes.push({ step: 0, dur: 2, idx: 0, vel: 0.85 }, { step: 2, dur: 2, idx: 4, vel: 0.75 }, { step: 4, dur: 3, idx: 3, vel: 0.8 }, { step: 7, dur: 1, idx: 5, vel: 0.6 }, { step: 8, dur: 6, idx: 7, vel: 0.9 });
      if (d.trill) notes.push({ step: 14, dur: 1, idx: 8, vel: 0.5 }, { step: 15, dur: 1, idx: 7, vel: 0.5 });
      cur = 7;
    } else if (phrasePos === 3 || phrasePos === 7) {
      // phrase ending: a long chord tone (tonic on the final bar)
      const end = b === bars - 1 ? (rng() < 0.5 ? 0 : 7) : ct.reduce((a, x) => (Math.abs(x - cur) < Math.abs(a - cur) ? x : a), ct[0]);
      notes.push({ step: 0, dur: 12, idx: end, vel: 0.7 });
      cur = end;
    } else {
      const maxR = Math.max(1, Math.min(RHYTHMS.length, Math.round(2 + d.density * 6)));
      const minR = Math.max(0, maxR - 4);
      const r = RHYTHMS[minR + Math.floor(rng() * (maxR - minR))];
      for (const [st, du] of r) {
        if (st % 8 === 0) cur = ct.reduce((a, x) => (Math.abs(x - cur) < Math.abs(a - cur) ? x : a), ct[0]);
        else cur += pick([-2, -1, -1, 1, 1, 2, d.lead === 'reed' && d.bpm > 120 ? 4 : 1]);
        if (cur > 11) cur -= 2;
        if (cur < -2) cur += 2;
        if (rng() < 0.12 * (1 - d.density) && st !== 0) continue; // breathing rest
        notes.push({ step: st, dur: du, idx: cur, vel: st % 4 === 0 ? 0.75 : 0.55 });
      }
      if (d.trill && phrasePos === 2) for (let i = 0; i < 4; i++) notes.push({ step: 12 + i, dur: 1, idx: cur + (i % 2), vel: 0.45 });
    }
    out.push(notes.sort((a, z) => a.step - z.step).filter((n, i, arr) => i === 0 || arr[i - 1].step !== n.step));
  }
  return out;
}

/** Midi note for a scale index relative to the tonic in octave `oct` (C4 = 60). */
export function scaleMidi(d: SongDef, idx: number, oct: number): number {
  const n = d.mode.length;
  const o = Math.floor(idx / n);
  const i = ((idx % n) + n) % n;
  return 12 * (oct + 1) + d.key + d.mode[i] + 12 * o;
}

export function mtof(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}
