# DESIGN PIVOT v2 — "Ash & Charizard: Trainer's Path" (overrides combat/engine sections)

The render/audio/character/world module contracts in pokemon-arena-contracts.md STILL HOLD
(geometry, look, sound are unchanged). This file overrides ONLY the engine/control/game-loop
design. game.js implements this.

## New premise
You are **ASH** (controllable trainer). You walk/run the world in third person. Your
**partner Pokémon** battles for you — you START with **CHARIZARD** and **COLLECT** more.
You COMMAND your active Pokémon; it obeys and attacks. You also throw **Poké Balls** to
catch weakened wild Pokémon, building a roster.

## Control scheme
- WASD / left joystick: move **Ash**.
- Ash's active Pokémon (Charizard at start) **follows** Ash (flies/hovers at his side,
  ~3–4 units back/up), and auto-faces the locked target.
- **Tab / LOCK button**: cycle locked wild target (gold marker). Aim assist faces the
  partner at it.
- **Keys 1–6 / mobile move buttons = COMMANDS to the partner.** When pressed, the partner
  dashes toward the locked target and performs the move (the 6-move set from the original
  contract: STRIKE chain, BITE counter, BREATH, BURST, SPIN SLAM, HYPER BEAM), then
  returns to Ash's side. Charizard "takes my command and attacks accordingly."
- **C / CATCH button**: throw a Poké Ball at the locked wild Pokémon. Catch chance scales
  with how low its HP is (≤25% HP ≈ high). Success → capture animation (ball wobble), the
  species is added to your **roster**; the wild one is removed. Fail → ball bursts, brief
  cooldown.
- **R / SWAP button** (or number-row on roster UI): switch active partner among caught
  Pokémon. Each species uses its own model + element + move flavors.
- **Space**: command partner to **FLY mode** (it gains altitude; Ash can ride? no — Ash
  stays grounded, camera lifts). Optional flourish.
- Q/E: order an **evasive dodge** for the partner (i-frames).

## Camera (engaging — explicit requirement)
Dynamic 3rd-person rig that frames BOTH Ash and the action:
- Default: behind-Ash over-the-shoulder, partner & target in frame.
- **Auto-zoom**: dolly IN close during a commanded attack/clash (punch-in on impact,
  ~0.5s, then ease out); dolly OUT to a wider establishing angle when roaming/exploring.
- **Catch cam**: on Poké Ball throw, cut to a dramatic low angle tracking the ball arc,
  slow-mo on the wobble.
- Mouse / right-drag orbits; wheel / pinch manual zoom (clamped). Smooth critically-damped
  follow (spring), collision pushes camera in near walls. Screen shake on big hits.
- Keep the original cinematics.js challenger-intro for wild-encounter reveals.

## Collection / progression
- Roster array of caught Pokémon {speciesId, level, xp, hp}. HUD shows party balls
  (filled = caught). Start: [charizard].
- Wild Pokémon roam the overworld (the 4 enemy species + optionally venusaur/blastoise/
  voltaron as rarer catches). Approaching one can trigger an encounter (announcer + intro
  cam) OR open-world real-time battle — use open-world real-time (simpler, livelier).
- Defeating a wild Pokémon (without catching) gives XP/score; catching gives XP + the
  Pokémon. Partner levels up, Mega at Lv5, type chart + statuses unchanged.
- "Ember Crown Grand Prix" story reframed: Ash's journey to collect & become champion;
  reuse story.js lines as encounter dialogue / milestones at caught-count 4/8/12/16.

## What stays identical
6 moves & damage, type chart (1.5/0.65) + statuses, enemy AI (windup/recovery telegraph
markers, circle-strafe, ranged on disengage), XP/level/Mega, HUD ids, audio, look, world,
mobile UI. The move buttons now command the partner instead of self.

## game.js extra DOM (added to index.html by engine owner)
Reuse existing ids. New optional ids the engine may add: `#roster-bar` (party balls),
`#catch-feedback`, `#partner-name`. If absent, engine creates them dynamically — but prefer
adding to index.html.
