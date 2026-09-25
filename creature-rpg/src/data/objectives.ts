// Critical-path objectives shown in the journal and as a HUD hint (derived from story flags; never stored).
export interface Objective { flag: string; ch: number; title: string; hint: string; zone?: string }

export const OBJECTIVES: Objective[] = [
  { flag: 'flag_starter_chosen', ch: 1, title: 'The Quiet Stone', hint: "Visit Oriel's workshop in Larkhollow and choose a partner.", zone: 'town_1' },
  { flag: 'flag_rival_1_done', ch: 1, title: 'The Quiet Stone', hint: 'Cass wants a battle on the village green.', zone: 'town_1' },
  { flag: 'flag_resonance_tutorial', ch: 1, title: 'The Quiet Stone', hint: 'Let Oriel show you how kin resonate with the Chordstone.', zone: 'town_1' },
  { flag: 'flag_capture_tutorial', ch: 1, title: 'The Quiet Stone', hint: 'Befriend a wild Dozebud by the stile on Thistledown Way.', zone: 'route_1' },
  { flag: 'flag_forest_rootgate_open', ch: 2, title: 'Murmurwood', hint: 'Open the Rootgate into Murmurwood with a Verdant kin (Rootcall).', zone: 'forest' },
  { flag: 'flag_trial_1_cleared', ch: 2, title: 'Murmurwood', hint: 'Earn the Moss Keynote at Rootloft Hall.', zone: 'forest' },
  { flag: 'flag_rival_2_done', ch: 3, title: 'Knellstone', hint: 'Cross Brackenridge Pass — Cass is waiting at the ridge cairn.', zone: 'route_2' },
  { flag: 'flag_trial_2_cleared', ch: 3, title: 'Knellstone', hint: 'Earn the Slate Keynote at Knell Hall in Knellstone.', zone: 'town_2' },
  { flag: 'flag_cave_miners_saved', ch: 4, title: 'The Undertone', hint: 'Help the miners below Knellstone. Heave (Stone) moves boulders.', zone: 'cave' },
  { flag: 'flag_fen_stone_restored', ch: 5, title: 'Sallowfen', hint: "Follow the survey crew into Sallowfen and free the fen's Chordstone.", zone: 'route_3' },
  { flag: 'flag_rival_3_done', ch: 5, title: 'Sallowfen', hint: 'Cass is at the end of the boardwalk.', zone: 'route_3' },
  { flag: 'flag_trial_3_cleared', ch: 6, title: 'Mirror of Sillowmere', hint: 'Earn the Mere Keynote at the Mere Hall on the lake.', zone: 'lake' },
  { flag: 'flag_trial_4_cleared', ch: 7, title: 'Galewick', hint: 'Earn the Vane Keynote in windy Galewick.', zone: 'town_3' },
  { flag: 'flag_leftover_rescued', ch: 8, title: 'The Stillhouse', hint: 'Climb Highscar Rise with Gust (Gale) and find the Stillhouse.', zone: 'route_4' },
  { flag: 'flag_rival_4_done', ch: 8, title: 'The Stillhouse', hint: 'Cass wants to see if you are even.', zone: 'route_4' },
  { flag: 'flag_trial_5_cleared', ch: 9, title: 'Cindral', hint: 'Earn the Forge Keynote on Mount Cindral.', zone: 'volcano' },
  { flag: 'flag_odile_revealed', ch: 10, title: 'Gloamstair', hint: 'Walk the twilight stair of Gloamstair.', zone: 'route_5' },
  { flag: 'flag_trial_6_cleared', ch: 11, title: 'Hoarcrown', hint: 'Freeze the falls with Rime (Frost) and earn the Rime Keynote.', zone: 'snowpeak' },
  { flag: 'flag_nullbell_broken', ch: 11, title: 'Hoarcrown', hint: 'Reach the summit and stop the Great Stillbell.', zone: 'snowpeak' },
  { flag: 'flag_champion_defeated', ch: 12, title: 'Concord', hint: 'Place six Keynotes at Concord Spire and face the Concordant.', zone: 'league' },
];

/** Schematic map positions (0..100) for the region map. */
export const MAP_POS: Record<string, [number, number]> = {
  town_1: [12, 88], route_1: [12, 72], forest: [14, 56], trial_1: [22, 52], route_2: [26, 42], town_2: [38, 38], trial_2: [42, 30],
  cave: [52, 44], route_3: [60, 56], lake: [70, 66], trial_3: [78, 72], town_3: [82, 50], trial_4: [90, 46], route_4: [78, 34],
  stillhouse: [70, 28], volcano: [86, 20], trial_5: [94, 14], route_5: [68, 14], snowpeak: [50, 10], trial_6: [42, 4], league: [32, 14],
};
