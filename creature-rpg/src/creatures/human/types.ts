// Character look description shared by the player creator, NPC cast (src/data/looks.ts) and the model builder.
export type HairStyle = 'crop' | 'long' | 'bun' | 'spiky' | 'braid' | 'bob' | 'bald' | 'tail' | 'curly';
export type Build = 'teen' | 'adult' | 'elder' | 'broad' | 'slim' | 'child';
export type Extra =
  | 'satchel' | 'scarf' | 'apron' | 'cape' | 'hat' | 'brimhat' | 'lantern' | 'monocle' | 'glasses' | 'earmuffs'
  | 'mitts' | 'shawl' | 'goggles' | 'staff' | 'mallet' | 'kite' | 'tongs' | 'collar' | 'glove' | 'coat' | 'sash' | 'bell' | 'pole' | 'cane' | 'clipboard'
  | 'cap' | 'gloves' | 'badge' | 'chime';

/** Top layer kinds. `jacket` = open short/long-sleeve field jacket, `coat` = long coat, `vest` = sleeveless. */
export type OuterKind = 'none' | 'jacket' | 'coat' | 'vest' | 'cardigan';
export type InnerKind = 'tee' | 'henley' | 'shirt' | 'turtleneck' | 'tank' | 'blouse' | 'sweater';
export type LegKind = 'trousers' | 'shorts' | 'skirt' | 'longskirt' | 'rolled';
export type ShoeKind = 'sneaker' | 'boot' | 'shoe';

export interface Wear {
  outer: OuterKind;
  /** 0 = sleeveless, 0.45 ≈ short sleeve, 1 = elbow, 2 = full length */
  outerSleeve: number;
  inner: InnerKind;
  innerSleeve: number;
  /** stripes on the inner top (uses top2 + accent) */
  stripes?: boolean;
  legs: LegKind;
  /** trouser length in leg units (upperLeg 0..1, lowerLeg 1..2, foot 2..) */
  legLen: number;
  shoe: ShoeKind;
  /** piping colour on outer garment edges */
  piping?: string;
  /** quilted outer garment (Stillmark coats) */
  quilted?: boolean;
  /** sporty cap colour (extra 'cap') */
  cap?: string;
}

export interface HumanLook {
  id: string;
  build: Build;
  /** body preset: female/male/neutral blend (defaults from id) */
  sex?: 'f' | 'm' | 'n';
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  top: string;        // jacket / main garment
  top2: string;       // shirt / inner
  pants: string;
  shoes: string;
  accent: string;     // extras (scarf, sash, brooch, buckle)
  iris?: string;
  extras?: Extra[];
  skirt?: boolean;
  wear?: Partial<Wear>;
  /** explicit body preset weights (overrides build/sex mapping), see scripts/build-humans.mjs PRESETS */
  body?: Record<string, number>;
  /** 0..1 subtle proportion variety seed (defaults from id hash) */
  seed?: number;
}
