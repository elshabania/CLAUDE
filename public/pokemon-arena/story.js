// story.js — narrative data for the Pokemon Arena duels.
// Pure data module: no three.js, no DOM. Deterministic line picks only.

export const OPENING = [
  "WELCOME TO THE EMBER CROWN GRAND PRIX — the stadium where legends are forged!",
  "Wild champions guard this arena. Beat them all, and the Ember Crown is yours!",
  "Ash is in your corner. The crowd is roaring. Trainer... choose your partner!",
];

// ---------------------------------------------------------------------------
// Per-species flavor pools
// ---------------------------------------------------------------------------

const SPECIES = {
  ROCKOR: {
    epithets: ["THE STONE SENTINEL", "THE BOULDER BRUTE", "THE MOUNTAIN'S FIST"],
    intros: [
      "ROCKOR rumbles up from the arena floor! They say it was the stadium's first brick. It took the job personally.",
      "The ground shakes — ROCKOR is awake! This golem has guarded the gates since the first Grand Prix. Nobody told it to stop.",
      "ROCKOR cracks its granite knuckles! Carved from the arena's own bedrock, it considers every challenger a trespasser.",
    ],
    bossEpithets: ["WARDEN OF THE EMBER CROWN", "THE LIVING RAMPART"],
    bossIntros: [
      "BOSS ROCKOR descends like an avalanche! The old wardens fused their armor into this titan. The arena itself holds its breath.",
      "It's BOSS ROCKOR — the wall that ended a hundred title runs! Legend says the Crown's gemstone was chipped from its heart.",
    ],
    taunts: [
      "ROCKOR grinds out a challenge: 'You. Shall. Crumble.'",
      "ROCKOR slams the ground — that's golem for 'bring it!'",
      "ROCKOR stares you down. Slowly. Very slowly. It's terrifying anyway!",
    ],
  },
  VINEX: {
    epithets: ["THE VINE TYRANT", "THE THORN KING", "THE CREEPING CHAMPION"],
    intros: [
      "VINEX slithers into the light! It sprouted from a seed dropped by the first champion — and it never forgave the loss.",
      "Vines burst through the arena tiles — VINEX has arrived! Groundskeepers gave up pruning it years ago. Now it prunes challengers.",
      "VINEX unfurls with a hiss! They say its roots run under every seat in the stadium. The crowd nervously lifts their feet.",
    ],
    bossEpithets: ["OVERGROWTH OF THE EMBER CROWN", "THE GARDEN THAT BITES BACK"],
    bossIntros: [
      "BOSS VINEX erupts in full bloom! Whole title runs lie tangled in its thorns. The Crown's wreath was cut from its crown — it wants it back.",
      "It's BOSS VINEX — the bracket-eating bramble! Every vine is a former challenger's nightmare, and tonight it's blooming for you.",
    ],
    taunts: [
      "VINEX rattles its thorns: 'Wither, little sprout.'",
      "VINEX cracks a vine like a whip — show-off!",
      "VINEX grins with way too many leaves. Is that even possible?!",
    ],
  },
  AQUISH: {
    epithets: ["THE TIDE TERROR", "THE DEEP-END DUELIST", "THE STADIUM LEVIATHAN"],
    intros: [
      "AQUISH surges out of the arena moat! It swam in during a storm decades ago and simply declared itself security.",
      "A wave crashes over the barrier — AQUISH is here! It guards the arena's hidden spring, and it does NOT do dry humor.",
      "AQUISH rises, dripping with menace! The maintenance crew loves it: it mops the floor with everyone.",
    ],
    bossEpithets: ["TIDEMASTER OF THE EMBER CROWN", "THE UNDERTOW SOVEREIGN"],
    bossIntros: [
      "BOSS AQUISH crests like a tidal wave! The springs beneath the stadium answer to it — and tonight, the forecast is pain.",
      "It's BOSS AQUISH — the flood that fits in a bracket! They say the Crown was cooled in its waters. It still claims a deposit.",
    ],
    taunts: [
      "AQUISH gurgles ominously: 'Glub means GO HOME.'",
      "AQUISH spits a perfect water ring. The crowd oohs. You gulp.",
      "AQUISH flexes a fin. Somewhere, a referee gets splashed.",
    ],
  },
  ZEPHYRA: {
    epithets: ["THE STORM HERALD", "THE GALE GUARDIAN", "THE SKY'S OWN SIREN"],
    intros: [
      "ZEPHYRA dives from the floodlights! It nests in the stadium rafters and treats every match as turbulence practice.",
      "Thunder rolls — ZEPHYRA screams onto the field! Born in the storm that lit the first Ember Crown, it guards the sky above the arena.",
      "ZEPHYRA circles overhead, crackling! Its feathers short out the scoreboard every time. The crowd cheers anyway.",
    ],
    bossEpithets: ["TEMPEST OF THE EMBER CROWN", "THE HURRICANE CROWNED"],
    bossIntros: [
      "BOSS ZEPHYRA splits the sky! The storm that forged the Crown never died — it just grew feathers and a grudge.",
      "It's BOSS ZEPHYRA — the final forecast! When it lands, champions take off. Hold onto your hat, trainer!",
    ],
    taunts: [
      "ZEPHYRA shrieks a thunderclap: 'The sky picks NO favorites!'",
      "ZEPHYRA loops the floodlights, raining sparks. Pure showmanship!",
      "ZEPHYRA's eyes flash white. The hair on your arms stands up.",
    ],
  },
};

const FALLBACK = {
  epithets: ["THE UNKNOWN CHALLENGER"],
  intros: ["A mysterious champion steps into the light! Even the announcers are checking their notes!"],
  bossEpithets: ["MYSTERY WARDEN OF THE EMBER CROWN"],
  bossIntros: ["A boss unlike any in the record books towers over the arena! History gets written tonight!"],
  taunts: ["The challenger beckons. The crowd loses its mind!"],
};

function pick(pool, seed) {
  return pool[((seed % pool.length) + pool.length) % pool.length];
}

// ---------------------------------------------------------------------------
// Round script
// ---------------------------------------------------------------------------

export function getRoundScript(round, speciesName, isBoss) {
  const name = String(speciesName || "").toUpperCase();
  const s = SPECIES[name] || FALLBACK;
  const seed = round + name.length;
  const epithet = pick(isBoss ? s.bossEpithets : s.epithets, seed);
  const intro = pick(isBoss ? s.bossIntros : s.intros, seed);
  const taunt = pick(s.taunts, seed);
  const title = isBoss
    ? `ROUND ${round} — BOSS BATTLE: ${epithet}`
    : `ROUND ${round} — ${epithet}`;
  return { title, intro, taunt };
}

// ---------------------------------------------------------------------------
// Victory / defeat / milestones
// ---------------------------------------------------------------------------

const VICTORY_EARLY = [
  "WHAT A FINISH! The arena guardian bows out — the crowd is on its feet!",
  "Down goes the challenger! The Grand Prix has a new fan favorite!",
  "Victory! Somewhere in the stands, a vendor drops an entire tray of popcorn!",
];

const VICTORY_LATE = [
  "UNSTOPPABLE! The Ember Crown is within reach — you can almost feel its heat!",
  "Another guardian falls! The Crown's flame flickers brighter with every win!",
  "The deep rounds, and you're still standing! The Ember Crown is within reach...",
];

const ASH_QUOTES = [
  "Ash pumps a fist: 'That's how we do it! One step closer!'",
  "Ash cups his hands: 'I knew you had it in you! Keep it up!'",
  "Ash grins: 'Did you SEE that?! Best partner ever!'",
];

export function victoryLine(round, speciesName) {
  const name = String(speciesName || "").toUpperCase();
  const seed = round + name.length;
  const base = pick(round >= 8 ? VICTORY_LATE : VICTORY_EARLY, seed);
  // Ash chimes in on every other win — occasional, but deterministic.
  if (seed % 2 === 0) {
    return `${base} ${pick(ASH_QUOTES, seed)}`;
  }
  return base;
}

const DEFEAT_LINES = [
  "The guardian stands tall... but so did you. The crowd salutes a worthy run!",
  "Down, but never out! Ash helps you up: 'The Crown isn't going anywhere. We'll be back!'",
  "The arena dims, but the announcers agree: that was a run worth remembering. Rest up, trainer!",
];

export function defeatLine(round) {
  return pick(DEFEAT_LINES, round);
}

const MILESTONES = {
  4: "QUARTERFINALS COMPLETE! The bracket burns away — only the fiercest guardians remain. The Crown stirs in its vault...",
  8: "SEMIFINALS CONQUERED! The Ember Crown is carried to its pedestal. Win on, trainer — it's watching you now!",
  12: "THE FINAL FALLS! The stadium erupts — but the old wardens whisper of one last trial beyond the bracket...",
  16: "THE CHAMPION'S GAUNTLET IS BROKEN! Take the Ember Crown — tonight, the legend wears YOUR name!",
};

export function milestoneLine(round) {
  return MILESTONES[round] || null;
}
