// Human cast entry point (creative_direction §5.1, §5.6; design/reviews/human_characters.md).
// Humans are skinned MakeHuman-derived (CC0) bodies with tailored garments, sculpted hair, a morph-driven face and
// procedural skeletal animation; see src/creatures/human/. Kin still use the part-table assembler.
export type { HumanLook, HairStyle, Build, Extra, Wear } from './human/types';
export { HumanModel, type HumanOpts } from './human/HumanModel';
export type { HumanAction, Expression } from './human/animator';
export { loadHumanData } from './human/data';
