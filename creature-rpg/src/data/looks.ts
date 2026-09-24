// Character looks for the human cast (creative_direction §5.6, DECISIONS D6/D7).
import type { HumanLook } from '../creatures/humans';

export const SKINS = ['#F1D3B8', '#C99672', '#7E5238'];
export const HAIRS: { color: string; style: HumanLook['hairStyle'] }[] = [
  { color: '#3B2A20', style: 'crop' },
  { color: '#B5552E', style: 'tail' },
  { color: '#1E1A1C', style: 'curly' },
];

export function playerLook(build: number, skin: number, hair: number): HumanLook {
  return {
    id: `arden_${build}${skin}${hair}`,
    build: build === 1 ? 'slim' : 'teen',
    skin: SKINS[skin] ?? SKINS[0],
    hair: HAIRS[hair]?.color ?? HAIRS[0].color,
    hairStyle: HAIRS[hair]?.style ?? 'crop',
    top: '#5E7D4A', top2: '#EDE3CC', pants: '#4A4F5C', shoes: '#6B4128', accent: '#C8963E', iris: '#4E6B3A',
    extras: ['satchel'],
  };
}

export const LOOKS: Record<string, HumanLook> = {
  cass: { id: 'cass', build: 'teen', skin: '#E8C3A0', hair: '#2B2224', hairStyle: 'spiky', top: '#3B3F4A', top2: '#F2F2F2', pants: '#2E3140', shoes: '#1F2229', accent: '#D9582B', iris: '#7A4B2A', extras: ['scarf'] },
  oriel: { id: 'oriel', build: 'broad', skin: '#D7A988', hair: '#C9CDD2', hairStyle: 'braid', top: '#7A4E32', top2: '#E8DCC3', pants: '#5A4636', shoes: '#3A2A20', accent: '#E8DCC3', extras: ['apron', 'monocle'], skirt: true },
  odile: { id: 'odile', build: 'slim', skin: '#E9D3C4', hair: '#1F1D24', hairStyle: 'bun', top: '#4A4F5C', top2: '#DAD4C8', pants: '#3A3E48', shoes: '#26282E', accent: '#8C6A8A', iris: '#6B5A7A', extras: ['collar', 'coat', 'bell'] },
  brann: { id: 'brann', build: 'broad', skin: '#B98563', hair: '#5A4030', hairStyle: 'crop', top: '#4A4F5C', top2: '#8A8F99', pants: '#3A3E48', shoes: '#2A2A2E', accent: '#B5543C', extras: ['earmuffs', 'mitts'] },
  vey: { id: 'vey', build: 'slim', skin: '#EFD9C9', hair: '#5C3A5E', hairStyle: 'long', top: '#4A4F5C', top2: '#8C6A8A', pants: '#3A3E48', shoes: '#26282E', accent: '#5C3A5E', extras: ['earmuffs', 'lantern'] },
  stillhand: { id: 'stillhand', build: 'adult', skin: '#D2A98A', hair: '#3A3230', hairStyle: 'crop', top: '#4A4F5C', top2: '#8A8F99', pants: '#3A3E48', shoes: '#26282E', accent: '#8C6A8A', extras: ['earmuffs', 'lantern', 'coat'] },
  wren: { id: 'wren', build: 'slim', skin: '#C99672', hair: '#4B6B2E', hairStyle: 'long', top: '#6B4A2E', top2: '#6FA35A', pants: '#4A3A2A', shoes: '#3A2A20', accent: '#C9B458', extras: ['staff'] },
  dorran: { id: 'dorran', build: 'broad', skin: '#E0B48E', hair: '#8E8A84', hairStyle: 'crop', top: '#5B6770', top2: '#D6B25E', pants: '#4A4F55', shoes: '#2E2E30', accent: '#E8E4DA', extras: ['goggles', 'mallet'] },
  nerys: { id: 'nerys', build: 'adult', skin: '#9C6B4E', hair: '#1F2630', hairStyle: 'long', top: '#2E6F95', top2: '#E8E1C9', pants: '#3A4A5A', shoes: '#4A3A2A', accent: '#C9B458', extras: ['brimhat', 'pole'], skirt: true },
  tamsin: { id: 'tamsin', build: 'adult', skin: '#F0D0B4', hair: '#E3B04B', hairStyle: 'tail', top: '#E7EEF2', top2: '#3D7E8C', pants: '#3D7E8C', shoes: '#2A2A30', accent: '#C4553A', extras: ['kite', 'sash'] },
  bastian: { id: 'bastian', build: 'elder', skin: '#8A5A40', hair: '#D9D6D0', hairStyle: 'bald', top: '#2B2320', top2: '#E4572E', pants: '#2B2320', shoes: '#1A1614', accent: '#C8963E', extras: ['apron', 'tongs'] },
  isaure: { id: 'isaure', build: 'slim', skin: '#F2DDD0', hair: '#EAF4F8', hairStyle: 'bob', top: '#1F3A5C', top2: '#7FD3E6', pants: '#1F3A5C', shoes: '#C0C4CC', accent: '#EAF4F8', extras: ['collar', 'cane'] },
  rhea: { id: 'rhea', build: 'slim', skin: '#E8C3A0', hair: '#2B2224', hairStyle: 'long', top: '#F3EAD7', top2: '#D8B35A', pants: '#E3D5B8', shoes: '#8C6A44', accent: '#D9582B', extras: ['cape'] },
  hearth: { id: 'hearth', build: 'elder', skin: '#D7A988', hair: '#A7A3A0', hairStyle: 'bun', top: '#B5543C', top2: '#F3EAD7', pants: '#6B4A3A', shoes: '#3A2A20', accent: '#C8963E', extras: ['shawl'], skirt: true },
  hearth2: { id: 'hearth2', build: 'broad', skin: '#7E5238', hair: '#1E1A1C', hairStyle: 'crop', top: '#B5543C', top2: '#F3EAD7', pants: '#4A3A2A', shoes: '#2A2018', accent: '#C8963E', extras: ['shawl'] },
  hearth3: { id: 'hearth3', build: 'adult', skin: '#F0D0B4', hair: '#B5552E', hairStyle: 'tail', top: '#B5543C', top2: '#F3EAD7', pants: '#4A3A2A', shoes: '#2A2018', accent: '#C8963E', extras: ['shawl'], skirt: true },
  chandler: { id: 'chandler', build: 'teen', skin: '#E0B48E', hair: '#6B4A2E', hairStyle: 'curly', top: '#3D7E8C', top2: '#EDE3CC', pants: '#4A4F5C', shoes: '#3A2A20', accent: '#C8963E', extras: ['apron'] },
  chandler2: { id: 'chandler2', build: 'elder', skin: '#C99672', hair: '#D9D6D0', hairStyle: 'crop', top: '#5B4A6B', top2: '#EDE3CC', pants: '#3A3040', shoes: '#2A2018', accent: '#C8963E', extras: ['glasses', 'apron'] },
  steward: { id: 'steward', build: 'adult', skin: '#B98563', hair: '#2B2224', hairStyle: 'bob', top: '#E3D5B8', top2: '#F3EAD7', pants: '#4A4F5C', shoes: '#3A2A20', accent: '#2FA39A', extras: ['sash'] },
  marra: { id: 'marra', build: 'adult', skin: '#9C6B4E', hair: '#2B1E1A', hairStyle: 'curly', top: '#6B7F99', top2: '#F3EAD7', pants: '#3A3E48', shoes: '#2A2A30', accent: '#E8C27A', extras: ['glasses', 'clipboard', 'satchel'] },
  villagerA: { id: 'villagerA', build: 'adult', skin: '#F1D3B8', hair: '#8C5A3C', hairStyle: 'bun', top: '#94A56B', top2: '#E9D8A6', pants: '#6B5A44', shoes: '#3A2A20', accent: '#E9D8A6', skirt: true },
  villagerB: { id: 'villagerB', build: 'broad', skin: '#7E5238', hair: '#1E1A1C', hairStyle: 'crop', top: '#8C5A3C', top2: '#E9D8A6', pants: '#4A4F5C', shoes: '#2A2018', accent: '#E9D8A6', extras: ['hat'] },
  villagerC: { id: 'villagerC', build: 'child', skin: '#E0B48E', hair: '#E3B04B', hairStyle: 'tail', top: '#D08C3A', top2: '#F3EAD7', pants: '#3D7E8C', shoes: '#2A2A30', accent: '#C4553A' },
  villagerD: { id: 'villagerD', build: 'elder', skin: '#D7A988', hair: '#FFFFFF', hairStyle: 'bald', top: '#5B6770', top2: '#C2B8A3', pants: '#3A3E48', shoes: '#2A2018', accent: '#C2B8A3', extras: ['cane', 'glasses'] },
  hiker: { id: 'hiker', build: 'broad', skin: '#C99672', hair: '#5A4030', hairStyle: 'crop', top: '#B5543C', top2: '#E3D5B8', pants: '#5A4636', shoes: '#3A2A20', accent: '#94A56B', extras: ['brimhat', 'satchel'] },
  youth: { id: 'youth', build: 'child', skin: '#F1D3B8', hair: '#3B2A20', hairStyle: 'spiky', top: '#2E86DE', top2: '#FFFFFF', pants: '#3A3E48', shoes: '#C4553A', accent: '#F2C230', extras: ['hat'] },
  angler: { id: 'angler', build: 'adult', skin: '#9C6B4E', hair: '#3A3230', hairStyle: 'crop', top: '#2E6F95', top2: '#E8E1C9', pants: '#4A4F5C', shoes: '#2A2A30', accent: '#E8E1C9', extras: ['brimhat', 'pole'] },
  scholar: { id: 'scholar', build: 'slim', skin: '#E9D3C4', hair: '#6B4A2E', hairStyle: 'bob', top: '#6B7F99', top2: '#F3EAD7', pants: '#3A3E48', shoes: '#2A2A30', accent: '#E8C27A', extras: ['glasses', 'satchel'], skirt: true },
  veteran: { id: 'veteran', build: 'adult', skin: '#B98563', hair: '#9AA5B8', hairStyle: 'tail', top: '#3A3556', top2: '#B8E0D2', pants: '#2E3140', shoes: '#1F2229', accent: '#7B6FA8', extras: ['cape'] },
  climber: { id: 'climber', build: 'slim', skin: '#F0D0B4', hair: '#B5552E', hairStyle: 'tail', top: '#C4553A', top2: '#E7EEF2', pants: '#4B6A77', shoes: '#2A2A30', accent: '#E7EEF2', extras: ['goggles', 'satchel'] },
};
