// Character looks for the human cast (creative_direction §5.6, DECISIONS D6/D7; human_characters review).
// Every look keeps its id (zones and trainers reference them). `wear` tailors the outfit; `sex` picks the body preset.
import type { HumanLook } from '../creatures/humans';

export const SKINS = ['#F1D3B8', '#C99672', '#7E5238'];
export const HAIRS: { color: string; style: HumanLook['hairStyle']; label: string }[] = [
  { color: '#3B2A20', style: 'crop', label: 'Crop' },
  { color: '#B5552E', style: 'tail', label: 'Tail' },
  { color: '#1E1A1C', style: 'curly', label: 'Curls' },
  { color: '#2A211E', style: 'spiky', label: 'Spiky' },
];

/** Player (Tuner) default outfit: rust cap with tuning-fork emblem, open short-sleeve teal field jacket with brass
 *  piping and a Tuner's badge loop, cream henley, tan fingerless gloves, rolled canvas trousers, trail sneakers. */
export function playerLook(build: number, skin: number, hair: number): HumanLook {
  const h = HAIRS[hair] ?? HAIRS[0];
  return {
    id: `arden_${build}${skin}${hair}`,
    build: 'teen',
    sex: 'n',
    body: build === 1 ? { teenM: 0.45, teenF: 0.25, youngM: 0.3, tall: 0.7, thin: 0.2 } : { teenM: 0.6, teenF: 0.4, short: 0.15 },
    skin: SKINS[skin] ?? SKINS[0],
    hair: h.color,
    hairStyle: h.style,
    top: '#1E5A5E', top2: '#E4D6B8', pants: '#3F4B61', shoes: '#C4553A', accent: '#C8963E', iris: '#4E6B3A',
    extras: ['cap', 'gloves', 'badge', 'satchel'],
    wear: { outer: 'jacket', outerSleeve: 0.52, inner: 'henley', innerSleeve: 0.4, legs: 'rolled', shoe: 'sneaker', piping: '#C8963E', cap: '#B5552E' },
  };
}

export const LOOKS: Record<string, HumanLook> = {
  cass: { id: 'cass', build: 'teen', sex: 'n', skin: '#E8C3A0', hair: '#2B2224', hairStyle: 'spiky', top: '#3B3F4A', top2: '#F2F2F2', pants: '#2E3140', shoes: '#1F2229', accent: '#D9582B', iris: '#7A4B2A', extras: ['scarf'], wear: { outer: 'jacket', outerSleeve: 2, inner: 'tee', innerSleeve: 0.4, legs: 'trousers', shoe: 'boot', piping: '#2B2E36' } },
  oriel: { id: 'oriel', build: 'broad', sex: 'f', body: { youngF: 0.45, oldF: 0.55, muscle: 0.25, heavy: 0.3 }, skin: '#D7A988', hair: '#C9CDD2', hairStyle: 'braid', top: '#7A4E32', top2: '#E8DCC3', pants: '#5A4636', shoes: '#3A2A20', accent: '#7A4E32', iris: '#5b6e7a', extras: ['apron', 'monocle'], skirt: true, wear: { outer: 'none', inner: 'shirt', innerSleeve: 1.35, legs: 'longskirt', shoe: 'boot' } },
  odile: { id: 'odile', build: 'slim', sex: 'f', skin: '#E9D3C4', hair: '#1F1D24', hairStyle: 'bun', top: '#4A4F5C', top2: '#DAD4C8', pants: '#2a2c33', shoes: '#26282E', accent: '#B08D57', iris: '#6B5A7A', extras: ['collar', 'coat', 'bell', 'glove', 'earmuffs'], wear: { outer: 'coat', outerSleeve: 2, inner: 'turtleneck', innerSleeve: 2, legs: 'trousers', shoe: 'boot', piping: '#B08D57', quilted: true } },
  brann: { id: 'brann', build: 'broad', sex: 'm', skin: '#B98563', hair: '#5A4030', hairStyle: 'crop', top: '#4A4F5C', top2: '#8A8F99', pants: '#3A3E48', shoes: '#2A2A2E', accent: '#B5543C', extras: ['earmuffs', 'mitts', 'coat'], wear: { outer: 'coat', outerSleeve: 2, inner: 'sweater', innerSleeve: 2, legs: 'trousers', shoe: 'boot', piping: '#B5543C', quilted: true } },
  vey: { id: 'vey', build: 'slim', sex: 'f', skin: '#EFD9C9', hair: '#5C3A5E', hairStyle: 'long', top: '#4A4F5C', top2: '#8C6A8A', pants: '#3A3E48', shoes: '#26282E', accent: '#5C3A5E', iris: '#7a5a86', extras: ['earmuffs', 'lantern', 'coat'], wear: { outer: 'coat', outerSleeve: 2, inner: 'turtleneck', innerSleeve: 2, legs: 'trousers', shoe: 'boot', piping: '#8C6A8A', quilted: true } },
  stillhand: { id: 'stillhand', build: 'adult', sex: 'm', skin: '#D2A98A', hair: '#3A3230', hairStyle: 'crop', top: '#4A4F5C', top2: '#8A8F99', pants: '#3A3E48', shoes: '#26282E', accent: '#8C6A8A', extras: ['earmuffs', 'lantern', 'clipboard'], wear: { outer: 'jacket', outerSleeve: 2, inner: 'turtleneck', innerSleeve: 2, legs: 'trousers', shoe: 'boot', piping: '#8C6A8A', quilted: true } },
  wren: { id: 'wren', build: 'slim', sex: 'f', skin: '#C99672', hair: '#4B6B2E', hairStyle: 'long', top: '#6B4A2E', top2: '#6FA35A', pants: '#4A3A2A', shoes: '#3A2A20', accent: '#C9B458', iris: '#6a7a2a', extras: ['staff', 'gloves'], wear: { outer: 'vest', inner: 'shirt', innerSleeve: 1.3, legs: 'trousers', shoe: 'boot', piping: '#C9B458' } },
  dorran: { id: 'dorran', build: 'broad', sex: 'm', body: { youngM: 0.7, oldM: 0.3, muscle: 0.6, heavy: 0.5, short: 0.35 }, skin: '#E0B48E', hair: '#8E8A84', hairStyle: 'crop', top: '#5B6770', top2: '#D6B25E', pants: '#4A4F55', shoes: '#2E2E30', accent: '#E8E4DA', extras: ['goggles', 'mallet'], wear: { outer: 'vest', inner: 'tee', innerSleeve: 0.45, legs: 'trousers', shoe: 'boot', piping: '#D6B25E' } },
  nerys: { id: 'nerys', build: 'adult', sex: 'f', skin: '#9C6B4E', hair: '#1F2630', hairStyle: 'long', top: '#2E6F95', top2: '#E8E1C9', pants: '#8C7a5a', shoes: '#4A3A2A', accent: '#C9B458', iris: '#3a2a20', extras: ['brimhat', 'pole'], skirt: true, wear: { outer: 'jacket', outerSleeve: 1.4, inner: 'blouse', innerSleeve: 1.4, legs: 'skirt', shoe: 'boot', piping: '#C9B458' } },
  tamsin: { id: 'tamsin', build: 'adult', sex: 'f', skin: '#F0D0B4', hair: '#E3B04B', hairStyle: 'tail', top: '#E7EEF2', top2: '#3D7E8C', pants: '#D6CFBd', shoes: '#2A2A30', accent: '#C4553A', iris: '#3d6e8c', extras: ['kite', 'sash', 'gloves'], wear: { outer: 'jacket', outerSleeve: 0.5, inner: 'tank', innerSleeve: 0, legs: 'trousers', shoe: 'sneaker', piping: '#C4553A' } },
  bastian: { id: 'bastian', build: 'elder', sex: 'm', skin: '#8A5A40', hair: '#D9D6D0', hairStyle: 'bald', top: '#2B2320', top2: '#E4572E', pants: '#2B2320', shoes: '#1A1614', accent: '#5a3a26', extras: ['apron', 'tongs', 'gloves'], wear: { outer: 'none', inner: 'shirt', innerSleeve: 1.3, legs: 'trousers', shoe: 'boot' } },
  isaure: { id: 'isaure', build: 'slim', sex: 'f', skin: '#F2DDD0', hair: '#EAF4F8', hairStyle: 'bob', top: '#1F3A5C', top2: '#7FD3E6', pants: '#1F3A5C', shoes: '#C0C4CC', accent: '#EAF4F8', iris: '#7FB8D6', extras: ['collar', 'cane', 'coat'], wear: { outer: 'coat', outerSleeve: 2, inner: 'turtleneck', innerSleeve: 2, legs: 'trousers', shoe: 'boot', piping: '#C0C4CC' } },
  rhea: { id: 'rhea', build: 'slim', sex: 'f', skin: '#E8C3A0', hair: '#2B2224', hairStyle: 'long', top: '#F3EAD7', top2: '#D8B35A', pants: '#5a4636', shoes: '#8C6A44', accent: '#D9582B', iris: '#7A4B2A', extras: ['cape'], wear: { outer: 'jacket', outerSleeve: 2, inner: 'blouse', innerSleeve: 2, legs: 'trousers', shoe: 'boot', piping: '#D8B35A' } },
  hearth: { id: 'hearth', build: 'elder', sex: 'f', skin: '#D7A988', hair: '#A7A3A0', hairStyle: 'bun', top: '#B5543C', top2: '#F3EAD7', pants: '#6B4A3A', shoes: '#3A2A20', accent: '#C8963E', extras: ['shawl'], skirt: true, wear: { outer: 'none', inner: 'blouse', innerSleeve: 2, legs: 'longskirt', shoe: 'shoe' } },
  hearth2: { id: 'hearth2', build: 'broad', sex: 'm', skin: '#7E5238', hair: '#1E1A1C', hairStyle: 'crop', top: '#B5543C', top2: '#F3EAD7', pants: '#4A3A2A', shoes: '#2A2018', accent: '#C8963E', extras: ['shawl'], wear: { outer: 'vest', inner: 'shirt', innerSleeve: 1.3, legs: 'trousers', shoe: 'boot', piping: '#C8963E' } },
  hearth3: { id: 'hearth3', build: 'adult', sex: 'f', skin: '#F0D0B4', hair: '#B5552E', hairStyle: 'tail', top: '#B5543C', top2: '#F3EAD7', pants: '#4A3A2A', shoes: '#2A2018', accent: '#C8963E', extras: ['shawl'], skirt: true, wear: { outer: 'none', inner: 'blouse', innerSleeve: 1.4, legs: 'skirt', shoe: 'boot' } },
  chandler: { id: 'chandler', build: 'teen', sex: 'm', skin: '#E0B48E', hair: '#6B4A2E', hairStyle: 'curly', top: '#3D7E8C', top2: '#EDE3CC', pants: '#4A4F5C', shoes: '#3A2A20', accent: '#8a6a4a', extras: ['apron'], wear: { outer: 'none', inner: 'shirt', innerSleeve: 1.3, legs: 'trousers', shoe: 'boot' } },
  chandler2: { id: 'chandler2', build: 'elder', sex: 'f', skin: '#C99672', hair: '#D9D6D0', hairStyle: 'crop', top: '#5B4A6B', top2: '#EDE3CC', pants: '#3A3040', shoes: '#2A2018', accent: '#6b5a4a', extras: ['glasses', 'apron'], wear: { outer: 'cardigan', outerSleeve: 2, inner: 'blouse', innerSleeve: 2, legs: 'longskirt', shoe: 'shoe' }, skirt: true },
  steward: { id: 'steward', build: 'adult', sex: 'n', skin: '#B98563', hair: '#2B2224', hairStyle: 'bob', top: '#E3D5B8', top2: '#F3EAD7', pants: '#4A4F5C', shoes: '#3A2A20', accent: '#2FA39A', extras: ['sash'], wear: { outer: 'jacket', outerSleeve: 2, inner: 'shirt', innerSleeve: 2, legs: 'trousers', shoe: 'shoe', piping: '#2FA39A' } },
  marra: { id: 'marra', build: 'adult', sex: 'f', skin: '#9C6B4E', hair: '#2B1E1A', hairStyle: 'curly', top: '#6B7F99', top2: '#F3EAD7', pants: '#3A3E48', shoes: '#2A2A30', accent: '#E8C27A', extras: ['glasses', 'clipboard', 'satchel'], wear: { outer: 'cardigan', outerSleeve: 1.6, inner: 'shirt', innerSleeve: 2, legs: 'trousers', shoe: 'shoe' } },
  villagerA: { id: 'villagerA', build: 'adult', sex: 'f', skin: '#F1D3B8', hair: '#8C5A3C', hairStyle: 'bun', top: '#94A56B', top2: '#E9D8A6', pants: '#6B5A44', shoes: '#3A2A20', accent: '#E9D8A6', skirt: true, wear: { outer: 'cardigan', outerSleeve: 1.5, inner: 'blouse', innerSleeve: 1.5, legs: 'longskirt', shoe: 'shoe' } },
  villagerB: { id: 'villagerB', build: 'broad', sex: 'm', skin: '#7E5238', hair: '#1E1A1C', hairStyle: 'crop', top: '#8C5A3C', top2: '#E9D8A6', pants: '#4A4F5C', shoes: '#2A2018', accent: '#6b4a2e', extras: ['hat'], wear: { outer: 'vest', inner: 'shirt', innerSleeve: 1.35, legs: 'trousers', shoe: 'boot' } },
  villagerC: { id: 'villagerC', build: 'child', sex: 'f', skin: '#E0B48E', hair: '#E3B04B', hairStyle: 'tail', top: '#D08C3A', top2: '#F3EAD7', pants: '#3D7E8C', shoes: '#C4553A', accent: '#C4553A', wear: { outer: 'none', inner: 'tee', innerSleeve: 0.45, stripes: true, legs: 'shorts', shoe: 'sneaker' } },
  villagerD: { id: 'villagerD', build: 'elder', sex: 'm', skin: '#D7A988', hair: '#FFFFFF', hairStyle: 'bald', top: '#5B6770', top2: '#C2B8A3', pants: '#3A3E48', shoes: '#2A2018', accent: '#C2B8A3', extras: ['cane', 'glasses'], wear: { outer: 'cardigan', outerSleeve: 2, inner: 'shirt', innerSleeve: 2, legs: 'trousers', shoe: 'shoe' } },
  hiker: { id: 'hiker', build: 'broad', sex: 'm', skin: '#C99672', hair: '#5A4030', hairStyle: 'crop', top: '#B5543C', top2: '#E3D5B8', pants: '#5A4636', shoes: '#3A2A20', accent: '#94A56B', extras: ['brimhat', 'satchel'], wear: { outer: 'jacket', outerSleeve: 1.35, inner: 'tee', innerSleeve: 0.4, legs: 'rolled', shoe: 'boot', piping: '#94A56B' } },
  youth: { id: 'youth', build: 'child', sex: 'm', skin: '#F1D3B8', hair: '#3B2A20', hairStyle: 'spiky', top: '#2E86DE', top2: '#FFFFFF', pants: '#3A3E48', shoes: '#C4553A', accent: '#F2C230', extras: ['cap'], wear: { outer: 'none', inner: 'tee', innerSleeve: 0.45, stripes: true, legs: 'shorts', shoe: 'sneaker', cap: '#2E86DE' } },
  angler: { id: 'angler', build: 'adult', sex: 'f', skin: '#9C6B4E', hair: '#3A3230', hairStyle: 'tail', top: '#2E6F95', top2: '#E8E1C9', pants: '#4A4F5C', shoes: '#2A2A30', accent: '#C9B458', extras: ['brimhat', 'pole'], wear: { outer: 'vest', inner: 'shirt', innerSleeve: 1.3, legs: 'rolled', shoe: 'boot' } },
  scholar: { id: 'scholar', build: 'slim', sex: 'f', skin: '#E9D3C4', hair: '#6B4A2E', hairStyle: 'bob', top: '#6B7F99', top2: '#F3EAD7', pants: '#3A3E48', shoes: '#2A2A30', accent: '#E8C27A', extras: ['glasses', 'satchel'], skirt: true, wear: { outer: 'cardigan', outerSleeve: 2, inner: 'shirt', innerSleeve: 2, legs: 'skirt', shoe: 'shoe' } },
  veteran: { id: 'veteran', build: 'adult', sex: 'm', skin: '#B98563', hair: '#9AA5B8', hairStyle: 'tail', top: '#3A3556', top2: '#B8E0D2', pants: '#2E3140', shoes: '#1F2229', accent: '#7B6FA8', extras: ['cape'], wear: { outer: 'jacket', outerSleeve: 2, inner: 'shirt', innerSleeve: 2, legs: 'trousers', shoe: 'boot', piping: '#7B6FA8' } },
  climber: { id: 'climber', build: 'slim', sex: 'f', skin: '#F0D0B4', hair: '#B5552E', hairStyle: 'tail', top: '#C4553A', top2: '#E7EEF2', pants: '#4B6A77', shoes: '#2A2A30', accent: '#E7EEF2', extras: ['goggles', 'satchel', 'gloves'], wear: { outer: 'jacket', outerSleeve: 2, inner: 'tee', innerSleeve: 0.45, legs: 'trousers', shoe: 'boot', piping: '#E7EEF2' } },
};
