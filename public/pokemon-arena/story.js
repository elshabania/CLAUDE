// story.js — Ember Crown Grand Prix narrative data (pure data + functions; no three.js, no DOM)

export const FAN_DISCLAIMER =
  'Fan-made tribute. Pokémon © Nintendo / Game Freak / Creatures Inc. Not affiliated or endorsed.';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function pick(arr, round) {
  return arr[((round % arr.length) + arr.length) % arr.length];
}

// ---------------------------------------------------------------------------
// Announcer intro lines (per species, with variants picked by round)
// ---------------------------------------------------------------------------

const ANNOUNCER_INTROS = {
  golem: [
    'LADIES AND GENTLEFOLK OF THE EMBER CITY COLOSSEUM — the mountain has come to US! TERRADON!',
    'FEEL THAT RUMBLE, FOLKS? That is no earthquake — that is TERRADON taking the field!',
    'Carved from the old peaks and STILL undefeated by erosion — give it up for TERRADON!',
  ],
  plant: [
    'LOCK THE GATES, FOLKS! Something hungry slipped its handlers — VINEMAUL is LOOSE in the arena!',
    'You smell that? Sap and bad intentions! The thorn terror VINEMAUL takes the field!',
    'Groundskeepers, look away! The garden bites back tonight — IT IS VINEMAUL!',
  ],
  water: [
    'OH-HO, fans, polish your monocles — the showboat of the seven circuits, AQUARITH, has ARRIVED!',
    'Cue the fountains! Strutting in on a red carpet of seafoam — the one, the only, AQUARITH!',
    'The tide rolls in fashionably late as always — make some noise for AQUARITH!',
  ],
  storm: [
    'SILENCE IN THE STANDS! The reigning champion descends from the thunderhead — GALVATALON!',
    'The sky itself bows, folks! Wings of lightning, heart of ice — CHAMPION GALVATALON!',
    'Every crown casts a shadow — and this one has TALONS! GALVATALON enters the arena!',
  ],
};

const ANNOUNCER_BOSS_INTROS = {
  golem: [
    'BOSS ROUND! The Colosseum floor is CRACKING, folks — TERRADON has gone FULL AVALANCHE!',
    'HOLD ONTO YOUR SEATS! This is no boulder — this is the WHOLE MOUNTAIN! TITAN TERRADON!',
  ],
  plant: [
    'BOSS ROUND! They fed it after midnight, folks — VINEMAUL is OVERGROWN and OFF THE LEASH!',
    'EVACUATE THE FRONT ROW! VINEMAUL has bloomed into something the rulebook has NO WORDS FOR!',
  ],
  water: [
    'BOSS ROUND! AQUARITH demanded a bigger stage — and brought the ENTIRE OCEAN to fill it!',
    'A TIDAL WAVE WITH AN EGO, FOLKS! Boss-tier AQUARITH crashes into the Colosseum!',
  ],
  storm: [
    'THIS IS IT! THE FINAL! The Ember Crown itself watches as GALVATALON UNLEASHES THE TEMPEST!',
    'BOSS ROUND! The champion holds NOTHING back — GALVATALON, AVATAR OF THE STORM!',
  ],
};

// ---------------------------------------------------------------------------
// Species voice lines — intros (2 lines each variant), taunts, KO lines
// ---------------------------------------------------------------------------

const SPECIES_INTRO_LINES = {
  golem: [
    ['I was old when this valley was young.', 'Stand still, little ember. Mountains do not chase.'],
    ['You climb. All climbers fall.', 'I will be patient. Stone is always patient.'],
    ['The peak does not hate the wind.', 'But the wind still breaks upon it. Come.'],
  ],
  plant: [
    ['Hungry. So hungry.', 'You smell... warm. GOOD.'],
    ['Roots deep. Teeth deeper.', 'Run. Running makes it sweeter.'],
    ['Little spark. Crunchy spark.', 'The vines remember everyone they eat.'],
  ],
  water: [
    ['Oh darling, did they not warn you?', 'I never lose. I merely let others rehearse winning.'],
    ['Look at you! Adorable. Tragic, but adorable.', 'Try to splash dramatically when you fall.'],
    ['I had a statue commissioned for this victory.', 'Do try not to scuff it on your way down.'],
  ],
  storm: [
    ['So. The little flame that climbed my sky.', 'Kneel now, and I shall make this dignified.'],
    ['I have worn the storm as a crown for an age.', 'You will find it does not come off.'],
    ['Thunder heralds me. Lightning serves me.', 'And you? You are merely weather.'],
  ],
};

const SPECIES_TAUNTS = {
  golem: [
    'You strike like rain on granite.',
    'Erosion takes centuries. You have minutes.',
    'I have outlasted glaciers, little ember.',
    'The mountain stands. The mountain always stands.',
  ],
  plant: [
    'MORE. Hit MORE. Still hungry!',
    'Wriggle, wriggle. The vines like it.',
    'Tasty tasty firefly...',
    'Grow. Strangle. FEAST.',
  ],
  water: [
    'Was that an attack or a curtsy?',
    'Darling, I have seen puddles with more menace.',
    'Smile! The jumbotron loves my good side.',
    'I would dodge slower, but the fans expect art.',
  ],
  storm: [
    'Is this the storm they promised me? Disappointing.',
    'Higher, little flame. Die closer to the sun.',
    'I have unmade champions politer than you.',
    'The crown is not won. It is SURVIVED.',
  ],
};

const SPECIES_KO_LINES = {
  golem: [
    'So... even mountains... bow to time.',
    'Good. The stone... finally rests.',
    'You strike like a glacier, small one. Slow... then all at once.',
  ],
  plant: [
    'Full... so full... of LOSING...',
    'Vines... wilting... still... hungry...',
    'Good prey... became... good hunter...',
  ],
  water: [
    'Cancel the statue... commission a fountain... of my TEARS.',
    'I am not defeated, darling. I am... on hiatus.',
    'At least... I fell... PHOTOGENICALLY.',
  ],
  storm: [
    'So falls the storm... and the sky... feels lighter.',
    'Take the crown, ember-child. It was always... heavy.',
    'Magnificent... I had forgotten... what losing teaches.',
  ],
};

// ---------------------------------------------------------------------------
// Exported API
// ---------------------------------------------------------------------------

export function getRoundIntro(round, species, isBoss) {
  const id = species && SPECIES_INTRO_LINES[species.id] ? species.id : 'golem';
  const name = species && species.name ? species.name : 'CHALLENGER';
  const announcerPool = isBoss ? ANNOUNCER_BOSS_INTROS[id] : ANNOUNCER_INTROS[id];
  const announcer = `ROUND ${round}! ` + pick(announcerPool, round);
  const lines = pick(SPECIES_INTRO_LINES[id], round).slice();
  if (isBoss && id !== 'storm') lines.push('No more games. THIS round, you face ALL of me.');
  if (isBoss && id === 'storm') lines.push('Come, then. Let the Ember Crown choose its head.');
  return { announcer, speaker: name, lines };
}

export function getMilestone(round) {
  switch (round) {
    case 4:
      return {
        announcer: 'QUALIFIERS COMPLETE! Our challenger PUNCHES a ticket into the Ember Crown Grand Prix proper!',
        speaker: 'ANNOUNCER',
        lines: [
          'For those new to the Colosseum: the Ember Crown was forged in the first volcano-fire of this valley!',
          'Sixteen rounds. One crown. And legend says it only sits on a head that NEVER backed down!',
          'The bracket tightens, folks. From here on, every challenger wants what YOU carry!',
        ],
      };
    case 8:
      return {
        announcer: 'SEMIFINALS, FOLKS! Half the bracket lies in glorious, smoldering RUINS!',
        speaker: 'ANNOUNCER',
        lines: [
          'And do you FEEL it? That static in the air? Look up past the floodlights...',
          'High above the stadium, wings of lightning circle. The champion GALVATALON is WATCHING.',
          'They say it studies every contender worth fearing. Congratulations — you are now FEARED.',
        ],
      };
    case 12:
      return {
        announcer: 'THE EVE OF THE FINAL! ONE round stands between our challenger and DESTINY!',
        speaker: 'ANNOUNCER',
        lines: [
          'Listen to that, folks! Forty thousand voices, one name — YOURS! The Colosseum is CHANTING!',
          'Vendors are out of banners. The braziers burn double. Ember City has chosen its hero!',
          'Rest if you can, challenger. Tomorrow, the storm comes down from the sky to meet you.',
        ],
      };
    case 16:
      return {
        announcer: 'THIS! IS! THE FINAL! For the EMBER CROWN ITSELF — the match a generation will remember!',
        speaker: 'ANNOUNCER',
        lines: [
          'The crown sits ringside on a pillar of obsidian, and I SWEAR, folks, it is glowing brighter!',
          'GALVATALON, undefeated lord of the thunderhead, versus the challenger who would not fall!',
          'No more brackets. No more tomorrows. ONE battle, ONE crown. FIGHT WITH EVERYTHING!',
        ],
      };
    default:
      return null;
  }
}

export function getKOLine(species) {
  const id = species && SPECIES_KO_LINES[species.id] ? species.id : 'golem';
  const hpSalt = species && typeof species.hp === 'number' ? species.hp : 0;
  return pick(SPECIES_KO_LINES[id], hpSalt);
}

export function getVictory(playerName) {
  const name = playerName || 'CHALLENGER';
  return {
    announcer: `THE STORM HAS FALLEN! ${name} WINS THE EMBER CROWN GRAND PRIX! THE COLOSSEUM ERUPTS!`,
    lines: [
      `Sixteen rounds! Mountain, thorn, tide, and tempest — and ${name} outlasted them ALL!`,
      'The obsidian pillar lowers... the Ember Crown rises... and it BURNS in salute!',
      `All hail ${name} — EMBER CHAMPION, sovereign of the Colosseum, legend of Ember City!`,
      'Light the braziers! Sound the horns! Tonight, the whole valley glows with YOUR fire!',
    ],
  };
}

export function getDefeat(round) {
  if (round <= 4) {
    return {
      announcer: 'And DOWN goes our challenger in the qualifiers! But OH, what a spark we saw tonight!',
      lines: [
        'The crowd rises anyway, folks — they know a future champion when they see one fall.',
        'The Ember Crown waits for those who return. And something tells me... this one returns.',
      ],
    };
  }
  if (round <= 11) {
    return {
      announcer: `Round ${round}, and the run ends here — but what a run it WAS, ladies and gentlefolk!`,
      lines: [
        'Deep into the bracket, past beasts that ended a hundred careers — that is no small flame.',
        'High above, the champion circles once... and dips a wing. Even the storm pays respect.',
        'Heal up, challenger. The Colosseum keeps your name warm by the brazier.',
      ],
    };
  }
  return {
    announcer: `SO CLOSE TO THE CROWN! Round ${round}, and the Colosseum falls to a stunned, ROARING hush!`,
    lines: [
      'They will sing about this run, folks — the challenger who made the final sky tremble.',
      'The Ember Crown glowed for you tonight. Crowns remember. They ALWAYS remember.',
      'Walk out with your head high. Ember City just found its next legend — finished or not.',
    ],
  };
}

export function getTaunt(species) {
  const id = species && SPECIES_TAUNTS[species.id] ? species.id : 'golem';
  const salt = species && typeof species.speed === 'number' ? Math.round(species.speed * 10) : 0;
  return pick(SPECIES_TAUNTS[id], salt + ((Date.now() / 1000) | 0));
}
