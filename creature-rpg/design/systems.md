# Systems Design — battle, capture, progression, economy, AI

Owner: Systems Designer. Status: v1 draft for integration. Binding anchors: `design/ANCHORS.md`.
Scope of this document: every rule the deterministic battle simulation, capture resolver, progression and economy code needs, stated so each can be a pure function. Names in *italics* are working names; the Creative Director owns final names. All ids are final unless listed under Unresolved questions.

Conventions used everywhere below:
- All arithmetic is integer. "×a/b" means `x = floor(x * a / b)` applied immediately. Never use floating multipliers in the battle core (determinism across engines).
- `rng.int(a,b)` returns a uniformly distributed integer in [a,b] inclusive from the battle's seeded PRNG. `rng.chance(p)` means `rng.int(1,100) <= p`.
- Stats are named `hp, atk, def, spa, spd, spe` (spa = special attack, spd = special defense, spe = speed).
- "Playtime", "expected level" and "expected income" numbers are design estimates, not measurements.

---

## 1. Types

### 1.1 Type ids
`fire, water, electric, verdant, stone, frost, gale, toxin, shade, lumen`, plus the internal type `none` (used only by the fallback move `m000` and the dizzy self-hit; effectiveness of `none` against everything is 1, and `none` never receives same-type bonus or Resonance).

### 1.2 Effectiveness matrix (attacker row → defender column)

| atk \ def | fire | water | electric | verdant | stone | frost | gale | toxin | shade | lumen |
|---|---|---|---|---|---|---|---|---|---|---|
| **fire** | ½ | ½ | **2** | **2** | ½ | **2** | 1 | 1 | 1 | 1 |
| **water** | **2** | ½ | 1 | ½ | **2** | ½ | 1 | **2** | 1 | 1 |
| **electric** | ½ | **2** | ½ | 1 | ½ | 1 | **2** | 1 | 1 | 1 |
| **verdant** | 1 | **2** | 1 | ½ | **2** | 1 | ½ | ½ | 1 | **2** |
| **stone** | **2** | 1 | **2** | ½ | ½ | **2** | **0** | 1 | 1 | ½ |
| **frost** | ½ | ½ | 1 | **2** | **2** | ½ | **2** | 1 | 1 | 1 |
| **gale** | **2** | 1 | ½ | 1 | 1 | ½ | ½ | **2** | **2** | 1 |
| **toxin** | 1 | **2** | 1 | **2** | **0** | 1 | 1 | ½ | ½ | **2** |
| **shade** | 1 | 1 | **2** | 1 | 1 | 1 | 1 | ½ | ½ | **2** |
| **lumen** | 1 | 1 | ½ | 1 | 1 | **2** | 1 | **2** | **2** | ½ |

Data encoding: `types.json` stores each cell as integer k ∈ {0, 1, 2, 4} meaning k/2 (0, ½, 1, 2). See 1.4 for the integer dual-type product.

### 1.3 Row rationale
| Attacker | Strong (2) because | Weak (½ / 0) because |
|---|---|---|
| fire | burns verdant; melts frost; overheats and melts electric conductors | doused by water; cannot burn stone; fire vs fire |
| water | quenches fire; erodes stone; dilutes and washes away toxin | drunk by verdant; frost simply freezes it; water vs water |
| electric | water conducts; strikes airborne gale creatures through the charged air | stone insulates; flame plasma shunts the current (fire); electric vs electric |
| verdant | drinks water; roots split stone; plants feed on light (lumen) | toxin withers growth; gale strips leaves; verdant vs verdant |
| stone | smothers fire; grounds electric; shatters brittle frost | **0 vs gale** — cannot reach what rides the wind; verdant roots bind it; crystal refracts lumen; stone vs stone |
| frost | freezes plants; frost-wedging cracks stone; ices wings (gale) | melted by fire; water merely chills; frost vs frost |
| gale | snuffs flames; disperses toxic fumes; scatters shadows (shade) | storms feed electric; cold wind feeds frost; gale vs gale |
| toxin | poisons water sources; withers verdant; corrupts spirit-light (lumen) | **0 vs stone** — inert mineral cannot be poisoned; shade is already rot-kin; toxin vs toxin |
| shade | smothers sparks (electric); eclipses lumen | toxin is kin to decay; shade vs shade |
| lumen | thaws rime (frost); purifies toxin; banishes shade | electric is kindred energy; lumen vs lumen |

Starter triangle (f01 electric / f02 fire / f03 water): water→fire 2, fire→electric 2, electric→water 2; reverse directions are ½ (fire→water, electric→fire) and 1 (water→electric). The rival always takes the starter that is strong against the player's (section 11).

Notable pair: shade and lumen are mutually super-effective (2 both ways) and each resists itself — high-risk mirror matchup.

### 1.4 Dual-type rule
`eff = m(moveType, t1) × m(moveType, t2)` (t2 absent → ×1). Possible values: 0, ¼, ½, 1, 2, 4. Implementation: each cell stored as integer `k ∈ {0,1,2,4}` meaning k/2; dual product `k1*k2` is in units of 1/4; damage step: `x = floor(x * k1 * k2 / 4)` (single type: `k2 = 2`). UI text: 0 → "no effect", ¼/½ → "resisted", 2/4 → "strong hit".

### 1.5 Balance counts (single types)
| Type | Attacks 2× | Attacks ½× | Attacks 0× | Weak to (def 2×) | Resists (def ½×) | Immune to |
|---|---|---|---|---|---|---|
| fire | 3 | 3 | 0 | 3 (water, stone, gale) | 3 (fire, electric, frost) | – |
| water | 3 | 3 | 0 | 3 (electric, verdant, toxin) | 3 (fire, water, frost) | – |
| electric | 2 | 3 | 0 | 3 (fire, stone, shade) | 3 (electric, gale, lumen) | – |
| verdant | 3 | 3 | 0 | 3 (fire, frost, toxin) | 3 (water, verdant, stone) | – |
| stone | 3 | 3 | 1 | 3 (water, verdant, frost) | 3 (fire, electric, stone) | toxin |
| frost | 3 | 3 | 0 | 3 (fire, stone, lumen) | 3 (water, frost, gale) | – |
| gale | 3 | 3 | 0 | 2 (electric, frost) | 2 (verdant, gale) | stone |
| toxin | 3 | 2 | 1 | 3 (water, gale, lumen) | 3 (verdant, toxin, shade) | – |
| shade | 2 | 2 | 0 | 2 (gale, lumen) | 2 (toxin, shade) | – |
| lumen | 3 | 2 | 0 | 3 (verdant, toxin, shade) | 2 (stone, lumen) | – |
| **Total** | **28** | **27** | **2** | **28** | **27** | **2** |

Every type has 2–3 offensive strengths and 2–3 defensive weaknesses; no type has more than 3 resistances + 1 immunity. Electric (2 strengths) compensates with the best speed-oriented movepool; shade (2/2) is the "neutral" type with the fewest bad matchups both ways. Validation test: recompute this table from the JSON matrix and assert it equals the table above.

---

## 2. Stats

### 2.1 Species inputs (supplied by the Creature Art Director, validated here)
Per species: base `hp, atk, def, spa, spd, spe` (integers 20–140). Recommended base-stat-total (BST) bands: stage 1: 280–320, stage 2: 395–435, stage 3: 505–535 (starters 310 / 405 / 525). The following are **derived by systems** and must not be hand-entered:
- `catchRate`: stage 1 = 190, stage 2 = 90, stage 3 = 45; starter families (f01–f03) = 45 at every stage.
- `xpYield` (Y): stage 1 = floor(BST/5), stage 2 = floor(BST/3), stage 3 = floor(BST×4/9).
- `growth` per family: f01 medium, f02 medium, f03 medium, f04 fast, f05 slow, f06 medium, f07 fast, f08 medium, f09 slow, f10 slow.

### 2.2 Instance data (generated when a creature instance is created)
- `potential[stat]` for each of the 6 stats: integer 0–15. Wild: `rng.int(0,15)` per stat. Gifts/starters: 10 each. Trainers: see 11.4.
- `temperament`: one of 21 ids. `tm_steady` (no change) or `tm_<up>_<down>` with up ≠ down, both from {atk, def, spa, spd, spe} (20 ids, e.g. `tm_spa_atk` = +10% spa, −10% atk). Wild: uniform over the 21. Starter: `tm_steady`. HP is never affected. Display names by Creative Director.
- `level` 1–60 (cap 60), `xp`, `moves[1..4]` each with `charges`, `currentHp`, `status`, `uid`.

### 2.3 Stat formulas
```
core(B, P, L) = floor((2*B + P) * L / 100)
maxHp        = core(Bhp, Php, L) + L + 10
stat         = floor((core(B, P, L) + 5) * T / 10)     T = 11 (boosted), 9 (lowered), 10 otherwise
```
Stats are recomputed on level-up and evolution; `currentHp += newMaxHp - oldMaxHp` (never below 1 if it was above 0).
Reference: base 87 stat, P 8, Lv 50, T 10 → core 91 → stat 96; base 87 hp → maxHp 151.

### 2.4 Stat stages
Stages for atk, def, spa, spd, spe, acc, eva: integer −6..+6, reset on switch-out and at battle end.
- atk/def/spa/spd/spe: stage n ≥ 0 → ×(2+n)/2; n < 0 → ×2/(2−n). (+1 = 1.5, +2 = 2, +6 = 4; −1 = 0.67, −6 = 0.25)
- acc/eva combined stage s = clamp(accStage(user) − evaStage(target), −6, 6): s ≥ 0 → ×(3+s)/3; s < 0 → ×3/(3−s).
- A change that would exceed ±6 is clamped; if no change is possible the message "won't go higher/lower" is shown and the effect counts as failed (for AI scoring).

### 2.5 Effective speed (turn order)
`effSpe = spe ×stageMult` then ×1/2 if paralysis (unless `tr_quick_feet`), then trait multipliers (`tr_rain_glide` / `tr_sun_bask` ×2, `tr_quick_feet` ×3/2), each floored.

---

## 3. Damage

### 3.1 Formula (physical uses atk/def, special uses spa/spd)
```
A = attacker's atk or spa after stages     (crit: use max(stage,0))
D = defender's def or spd after stages     (crit: use min(stage,0)); snow: frost-type defender def ×3/2
P = move power after power modifiers (tr_small_strikes, tr_reckless, m077 doubling)
L = attacker level
base = floor( floor( (floor(2*L/5) + 2) * P * A / D ) / 50 ) + 2
```
Then apply in this exact order, flooring after each step:
1. Weather: ×3/2 or ×1/2 (see 5.3).
2. Resonance: ×6/5 if move type = zone's attuned type (×3/2 instead if attacker has `tr_resonant`). Applies to both sides, wild and trainer.
3. Critical: ×3/2.
4. Random: `R = rng.int(85,100)`, ×R/100.
5. Same-type bonus (STAB): ×3/2 if move type ∈ attacker's types (`tr_adaptive`: ×2).
6. Type effectiveness: ×k1·k2/4 (section 1.4).
7. Burn (physical move, attacker burned): ×1/2. Frostbite (special move, attacker frostbitten): ×1/2.
8. Trait modifiers in this order: `tr_last_stand` ×3/2, `tr_flame_sink` boost ×3/2, defender `tr_thick_fur` ×1/2.
9. If effectiveness > 0 and result < 1 → 1. If effectiveness = 0 → 0 and "no effect" (no secondary effects).
10. Damage is capped at defender's currentHp for the HP change (drain/recoil use the capped value).

Multi-hit (m035): each hit runs steps crit→random→… independently (fresh crit roll and random roll per hit); accuracy rolled once.

### 3.2 Critical hits
Crit stage = move (+1 for "crit+1" moves) + `tr_keen_focus` (+1). Chance: stage 0 → 1/24, 1 → 1/8, 2 → 1/2, ≥3 → always. Roll: `rng.int(1, den) == 1` (den 24/8/2; stage ≥3 no roll). Multiplier ×3/2. Crits ignore attacker's negative attack stage and defender's positive defense stage; they do not ignore burn/frostbite, weather or shields.

### 3.3 Accuracy
Moves with accuracy "—" never miss and skip the roll. Otherwise:
```
hit = moveAcc
hit = floor(hit * accStageMult(s))                (2.4)
fog and move type ≠ shade: hit = floor(hit * 9/10)
tr_fog_veil defender in fog: hit = floor(hit * 4/5)
weather overrides (5.3): "never misses" → skip roll; Skyfall Strike in sunlight: moveAcc = 50 before the steps above
if hit >= 100: no roll, hits.  else hits iff rng.int(1,100) <= hit
```
Shield (`shielded`) is checked before accuracy; a blocked move consumes no RNG.

### 3.4 Priority brackets
| Bracket | Contents |
|---|---|
| Action phase A | Run attempts (wild only) |
| Action phase B | Switches |
| Action phase C | Items and capture throws |
| Move +3 | Bulwark (m045) |
| Move +1 | m013, m023, m053, m063, m083 (quick strikes) |
| Move 0 | all other moves, including m000 |
| Move −1..−6 | reserved (no moves use them in v1) |

Within a move bracket: higher `effSpe` first; exact tie → `rng.int(0,1)` (0 = player first). Tie rolls happen once per turn at ordering time, before any move executes. Speed is evaluated at ordering time (a speed drop mid-turn does not reorder the current turn).

### 3.5 Recoil, drain, healing
- Recoil `r`: user loses `max(1, floor(damageDealt * r))` after the hit (r = 1/3 for m008/m030/m040/m100; m000 uses `floor(userMaxHp/4)` regardless of damage).
- Drain 1/2: user heals `max(1, floor(damageDealt/2))`, not above max.
- Heal fractions use `floor(maxHp * n / d)`; heal at full HP fails.

---

## 4. Status conditions

### 4.1 Major statuses (at most one; cannot be overwritten; persist through switching and after battle until cured)
| id | Effect | Timing | Immune |
|---|---|---|---|
| `burn` | Physical damage dealt ×1/2 (step 7). Loses floor(maxHp/16) (min 1). | End-of-turn step 3 | fire types; `tr_flame_sink` |
| `poison` | Loses floor(maxHp/8) (min 1). | End-of-turn step 3 | toxin and stone types |
| `paralysis` | effSpe ×1/2; before acting `rng.chance(25)` → loses action ("is locked up"). | Action check | electric types; `tr_charge_sink` |
| `sleep` | Cannot act. On apply: `counter = rng.int(1,3)`. On each action attempt: if counter = 0 → wakes, status cleared, acts this turn; else counter −1 (−2 with `tr_early_riser`, floor 0) and action lost. Counter persists across switching. | Action check | none |
| `frostbite` | Special damage dealt ×1/2 (step 7). Loses floor(maxHp/16). Cannot be inflicted in sunlight. | End-of-turn step 3 | frost types |

Out of battle: burn/poison/frostbite do **not** deal overworld damage (no field attrition). All statuses cured at healing centers.
Secondary-effect status chance: rolled only if the move hit, dealt > 0 damage, target not fainted, target has no major status and is not immune. Status moves (100% infliction) fail with a message if the target already has a status or is immune; a status move whose type has effectiveness 0 against the target (e.g. m073 vs stone) fails.

### 4.2 Volatile conditions (cleared on switch-out and battle end)
| id | Source | Effect |
|---|---|---|
| `dizzy` | m084 (100%), m096 (10%), m070 (30%) | On apply `counter = rng.int(2,4)`. Each action attempt: counter −1; if now 0 → "snaps out", acts normally. Else `rng.chance(33)` → hits itself: typeless physical power 40 using own atk vs own def, no crit, random applied, no STAB/Resonance/weather; action lost. Cannot be re-applied while dizzy (move fails). |
| `flinch` | flinch-chance moves | Only set if the target has not yet acted this turn. On its action check: action lost. Cleared at end of turn. |
| `sapped` | m033 | End-of-turn step 4: loses floor(maxHp/8) (min 1); the opposing active creature, if not fainted, heals the same amount. verdant types immune. Cannot stack. |
| `shielded` | m045 | Until end of turn, all foe-targeted moves against it are blocked ("braced"). Consecutive successful uses: n = count of immediately preceding successful Bulwarks; success if n = 0 or `rng.int(1, 3^n) == 1`. Any other action resets n to 0. |
| `absorbedFlame` | `tr_flame_sink` | Fire moves ×3/2 while on field. |
| `weariness` | turn ≥ 50 | See 13.8. |

### 4.3 Action check order (per creature, when its turn to move arrives)
1. Fainted → skip. 2. Flinched → lose action. 3. Sleep (4.1). 4. Paralysis 25% lock. 5. Dizzy (4.2). 6. Choose move: if all 4 moves have 0 charges → m000. 7. Deduct 1 charge (deducted even if the move then misses/fails/is blocked; not deducted if the action was lost in steps 2–5). 8. Execute.

---

## 5. Weather and Resonance

### 5.1 Weather ids
`clear, rain, snow, fog, sunlight`.

### 5.2 Sources and duration
- **Ambient weather** = overworld weather of the zone at the moment the battle starts (world.md weather states map 1:1: clear→clear, rain→rain, snow→snow, fog→fog, heat/sunny→sunlight). Interiors and the cave are `clear` unless world.md says otherwise. Ambient weather lasts the whole battle.
- **Move weather** (m009, m017, m057, m087, m067): replaces current weather, `turns = 5`; decremented at end-of-turn step 1 of every turn including the one it was set; at 0 the weather reverts to ambient. Using a weather move while that exact weather is active (move or ambient) fails.
- Battle weather never changes the overworld weather.

### 5.3 Effects
| Weather | Damage modifiers (step 1) | Other |
|---|---|---|
| clear | – | – |
| rain | water ×3/2, fire ×1/2 | m029, m070 never miss; m014 heals 2/3; m037 heals 1/4; `tr_rain_glide` speed ×2 |
| sunlight | fire ×3/2, water ×1/2 | frostbite cannot be inflicted; m029 accuracy 50; m037 heals 2/3; `tr_sun_bask` speed ×2 |
| snow | frost ×3/2 | frost-type creatures def ×3/2; m059, m060 never miss; m037 heals 1/4 |
| fog | shade ×3/2, lumen ×1/2 | non-shade moves accuracy ×9/10; m037 heals 1/4 |

No weather deals chip damage (keeps battles readable and avoids hidden attrition).

### 5.4 Resonance (signature mechanic, battle side)
Each zone record carries `attunedType` (owned by world.md / creative_direction.md). In battles staged in that zone, any damaging move of that type gets ×6/5 at step 2 (×3/2 with `tr_resonant`). Status moves are unaffected. The battle HUD shows the attuned type icon plus text label (not color alone). Interaction with weather is owned by the Creative Director; systems exposes `ambientWeather` and `attunedType` as independent battle inputs.

### 5.5 Field actions (systems constraints on the exploration side)
A field action of type X can be performed if **any** party member (fainted or not) has type X and the player owns the corresponding trial unlock. Field actions cost nothing (no HP, charges or items). This is the systems guarantee against lead-creature softlocks; the Creative Director / World Designer own the action list.

---

## 6. Turn resolution (full order)

Battle start:
1. Build combatants (stats from instance), set ambient weather, attunedType, turn = 1.
2. Send-out animations (player lead = first non-fainted party slot).
3. Entry traits in effSpe order (tie `rng.int(0,1)`): `tr_menace`.

Each turn:
1. **Command phase.** AI command is computed first from an `AIView` snapshot using the separate `rngAI` stream (section 10). Then the player chooses Fight / Bag / Switch / Run. The player's choice is never an input to the AI function.
2. **Phase A — Run** (wild only): see 6.1. Success ends battle.
3. **Phase B — Switches**: player switch then AI switch (trainers only switch under hard AI). Outgoing creature's volatiles and stages cleared. Incoming entry traits trigger.
4. **Phase C — Items / capture**: player item, then AI item. Capture resolves here (section 7); success ends the battle immediately (no end-of-turn).
5. **Ordering**: build list of creatures that chose moves; sort by priority, effSpe, tie roll.
6. **Move execution**, for each actor in order: action check (4.3) → target validity (target fainted → "no target", charge still spent) → shield check → accuracy → crit roll → damage roll → apply damage → contact traits (`tr_*_hide`, `tr_thorned`) → secondary effects in table order (each its own roll) → recoil/drain → **faint check** after each HP change (fainted creature is removed from the remaining order).
7. **End-of-turn**, fixed order; within a step, process the faster creature first (same tie rule):
   1. Weather counter decrement / revert.
   2. (reserved; no weather damage)
   3. Major status damage: burn, poison, frostbite.
   4. `sapped` drain/heal.
   5. Traits: `tr_regrowth` heal, `tr_shed_status` (`rng.chance(30)`).
   6. Weariness (turn ≥ 50): each active loses floor(maxHp/16).
   7. Clear `flinch` and `shielded`; turn += 1.
   8. Faint checks.
8. **Faint resolution**:
   1. For each foe that fainted this turn (in order of fainting): award XP (section 8); run level-ups and move-learn prompts now; evolutions are queued to battle end.
   2. If a side has no non-fainted creatures, battle ends. If **both** sides are out in the same turn, the player wins.
   3. Replacement: AI picks its replacement first (normal: next party slot; hard: 10.4) without knowledge of the player's pick; then, if the player's active fainted, the player must pick a replacement (cannot cancel). In wild battles the prompt also offers "Flee", which always succeeds. Both enter; entry traits in effSpe order.

### 6.1 Run formula (wild battles; trainer battles: Run is disabled with a message)
`attempts` counts this battle's run tries including the current one.
- If player effSpe ≥ wild effSpe → success.
- Else chance = clamp(floor(100 × playerSpe / wildSpe) − 10 + 20 × (attempts − 1), 30, 100); success iff `rng.chance(chance)`.
- `tr_*`: none affect running in v1. Failed run consumes the turn.

### 6.2 RNG streams and draw order
- `rngBattle` = seeded from `battleSeed`; `rngAI` = seeded from `battleSeed XOR 0x9E3779B9`. Rendering, audio and UI never draw from either.
- Draw order within a move: paralysis lock → sleep/dizzy rolls → shield (only if n > 0) → accuracy (only if hit < 100) → crit (only if stage < 3) → damage random → each secondary effect in listed order → sleep/dizzy counter on application.
- Battle replay test: same seed + same player command list ⇒ identical event log.

---

## 7. Capture

### 7.1 Capture devices
| id | Working role | Device mult O10 (×1/10) | Price | Sell | First sold |
|---|---|---|---|---|---|
| `i_orb_1` | basic | 10 (×1.0) | 200 | 100 | town_1 (5 given at start) |
| `i_orb_2` | improved | 15 (×1.5) | 600 | 300 | after trial_1 |
| `i_orb_3` | advanced | 20 (×2.0) | 1200 | 600 | after trial_3 |
| `i_orb_4` | master-crafted | 30 (×3.0) | 2500 | 1250 | after trial_5 |

### 7.2 Formula
```
M = target maxHp, H = target currentHp, C = catchRate, L = target level
S10 = 20 if sleep; 15 if paralysis, burn, poison, frostbite; 10 otherwise
B20 = 20 + max(0, 15 - L)            (low-level bonus: Lv5 = ×1.5, Lv15+ = ×1.0)
a = floor( (3M - 2H) * C * O10 * S10 * B20 / (3M * 10 * 10 * 20) )
if a >= 255: caught, 3 shakes shown, no RNG drawn
else: threshold = SHAKE_TABLE[a] where SHAKE_TABLE[a] = floor(65536 * cbrt(a/255)), precomputed at build time and committed as data
      for k in 1..3: if rng.int(0,65535) >= threshold: fail after (k-1) shakes; stop
      all 3 pass: caught
```
Overall catch probability ≈ a/255. Capture is impossible in trainer battles: the device is deflected, **not consumed**, turn not spent.

### 7.3 Presentation steps (renderer/state machine)
1. Throw (projectile_arc, 600 ms) → 2. Flash and target absorbed (400 ms) → 3. Device drops (300 ms) → 4. Shakes: one per passed check (700 ms each, with tick sound) → 5a. Success: seal flash + chime (600 ms), "caught" banner, encyclopedia registered → 5b. Failure: device bursts at shake (passed+1), creature re-appears (500 ms). Failure consumes the device and the player's action; the turn continues (foe moves, end-of-turn runs normally).
Reduced-motion setting: steps 1–4 shortened to 150 ms each, shake count still displayed as text ("1… 2…").

### 7.4 Placement after capture
1. Optional nickname prompt (skippable). 2. If party < 6 → party. 3. Else if storage < 300 → storage (message names the box). 4. Else (party 6 **and** storage 300): before the throw, choosing a device shows "Storage is full. If caught you must release a creature. Throw anyway?" (Yes/No; No returns to Bag without spending the turn). After a successful capture, a mandatory prompt: **"Release the new creature"** or **"Choose one to release"** (opens storage picker; party members are also selectable except when it would leave 0 non-fainted in party). Double confirmation. Creatures flagged `bond` (the starter) cannot be released. The prompt cannot be dismissed without one of the two outcomes; the save is committed only after it resolves.

### 7.5 Worked capture example
Wild stage-2 creature, Lv 18, maxHp M = 55, currentHp H = 20, catchRate C = 90, no status (S10 = 10), `i_orb_2` (O10 = 15), B20 = 20 + max(0, 15−18) = 20.
- 3M − 2H = 165 − 40 = 125
- numerator = 125 × 90 × 15 × 10 × 20 = 33,750,000; denominator = 165 × 10 × 10 × 20 = 330,000
- a = floor(102.27) = **102** → p ≈ 40.0%
- threshold = floor(65536 × cbrt(102/255)) = floor(65536 × 0.73681) = **48287**
- Rolls (example): 12050 < 48287 pass (shake 1), 40111 pass (shake 2), 51930 ≥ 48287 fail → device bursts after 2 shakes; device consumed; turn continues.
- Same target with other devices: `i_orb_1` a = 68 (26.7%), `i_orb_3` a = 136 (53.3%), `i_orb_4` a = 204 (80.0%). With sleep and `i_orb_2`: a = 204 (80%).
- Early-game check: Lv 5 stage-1 (C = 190, M = 20, H = 20 full HP), `i_orb_1`, B20 = 30: 3M−2H = 20 → a = floor(20×190×10×10×30 / (60×10×10×20)) = floor(95.0) = 95 → ≈37% at full HP; at H = 5: 3M−2H = 50 → a = 237 → ≈93%. Early catches are reliable after one or two hits.

---

## 8. Experience, levels, evolution, moves

### 8.1 XP award (per fainted foe)
```
T = 3/2 in trainer battles, 1 in wild battles  (Tn/Td)
S = clamp((2*Lf + 10) / (Lf + Lp + 10), 1/2, 3/2)   Lf = foe level, Lp = recipient level  (Sn/Sd)
XP = max(1, floor( floor(Y * Lf / 7) * Tn * Sn / (Td * Sd) ))
```
Recipients: every non-fainted party member. **Participants** (was active at any time while this foe was on the field) receive 100%; non-participants receive `floor(XP/2)` ("shared lessons" — built-in, no item needed; core anti-grind rule). Captured creatures give the same XP to recipients as if defeated. Level 60 creatures receive none.

### 8.2 Level curves (cumulative XP required to be at level L; XP(1) = 0)
| Curve | Formula | Lv 5 | Lv 10 | Lv 20 | Lv 30 | Lv 40 | Lv 50 | Lv 60 |
|---|---|---|---|---|---|---|---|---|
| fast | floor(4·L³/5) | 100 | 800 | 6,400 | 21,600 | 51,200 | 100,000 | 172,800 |
| medium | L³ | 125 | 1,000 | 8,000 | 27,000 | 64,000 | 125,000 | 216,000 |
| slow | floor(5·L³/4) | 156 | 1,250 | 10,000 | 33,750 | 80,000 | 156,250 | 270,000 |

Multiple level-ups from one award are processed one level at a time (stat recompute, move prompts per level).

Sanity model (estimate): XP per foe at equal level ≈ Y·L/7·T. Foes needed per level ≈ 21L/(Y·T). With campaign-average Y·T ≈ 180, Lv 5→50 on the medium curve needs ≈ 145 foe-defeats for the lead; the campaign plan in section 11 contains ≈ 150 trainer creatures plus optional wild battles, and the S factor (up to ×1.5) pulls under-levelled members up. Slow families end ~2 levels below medium ones; acceptable.

### 8.3 Evolution
| Family | Stage 1→2 | Stage 2→3 | Evolution move (learned on evolving) |
|---|---|---|---|
| f01 electric | Lv 16 | Lv 34 | st2 m025, st3 m055 |
| f02 fire | Lv 16 | Lv 34 | st2 m004, st3 m048 |
| f03 water | Lv 16 | Lv 34 | st2 m016, st3 m047 |
| f04 verdant | Lv 16 | Lv 32 | st2 m035, st3 m047 |
| f05 stone | Lv 20 | Lv 36 | st2 m045, st3 m004 |
| f06 frost | Lv 22 | Lv 38 | st2 m055, st3 m019 |
| f07 gale | Lv 14 | Lv 30 | st2 m066, st3 m069 |
| f08 toxin | Lv 18 | Lv 34 | st2 m076, st3 m036 |
| f09 shade | Lv 24 | Lv 40 | st2 m087, st3 m089 |
| f10 lumen | Lv 26 | item `i_evo_prism` (any level) **or** Lv 44 | st2 m097, st3 m100 |

Rules:
- Level evolution checks happen at battle end for each creature whose level ≥ threshold (queued, one scene per creature). The player may cancel (hold Cancel during the scene). A cancelled or deferred creature shows "Ready to evolve" in the party menu and can evolve from there at any time outside battle — no re-grind needed.
- Item evolution: use `i_evo_prism` from the Bag on a stage-2 f10 creature outside battle; item consumed.
- Evolution preserves uid, nickname, level, XP, potentials, temperament, moves (charges kept), status; species changes; stats recomputed; `currentHp += maxHp delta`. Evolution move: learned if < 4 moves, else the replacement flow (8.4).

### 8.4 Move learning and replacement flow
On reaching level L, for each learnset entry at exactly L (in table order): already known → skip; < 4 moves → learn (full charges); else prompt: "Learn X?" → pick one of the 4 to forget (shows both moves' type/power/accuracy/charges/effect) or "Don't learn" (confirm). Forgetting is final but see **Recall**: every healing center offers free Recall — relearn any learnset move with level ≤ current level, or any evolution move of current/prior stage, via the same replacement flow.
Wild/trainer default moveset: the last 4 distinct learnset moves with level ≤ its level (evolution moves count at the evolution level).

### 8.5 Teaching discs
Discs are **reusable** (never consumed; key-item pocket; sellable 0 — cannot be sold). Compatibility: a species can learn a disc's move if (a) the move type is one of the species' types, or (b) the move type is in its family's `discCoverage` list (section 9.3), or (c) the disc is flagged universal (`i_disc_11` only). Teaching uses the replacement flow. Disc list in section 10A.

---

## 9. Moves

### 9.1 Animation reference vocabulary (`anim`)
The renderer implements each as a generic, type-tinted effect (color = type palette from creative_direction.md; shape accents per type optional). `impactMs` is when the hit/HP change is shown.
| anim | Motion / VFX | Duration / impactMs |
|---|---|---|
| `melee_lunge` | user darts ~60% of the gap, strike pose, returns; impact spark on target | 700 / 350 |
| `melee_sweep` | user steps in, horizontal arc trail (claw/tail/wing) across target | 750 / 380 |
| `charge_rush` | wind-up crouch, full-length dash, heavy impact shake, user bounce-back (recoil flash if recoil) | 1100 / 650 |
| `dash_through` | user blurs past target leaving a streak, reappears at start (quick moves) | 500 / 220 |
| `projectile_bolt` | small fast straight projectile from mouth/hands | 650 / 450 |
| `projectile_arc` | lobbed parabolic blob, splash on impact | 800 / 600 |
| `beam` | continuous line user→target, 400 ms sustain, target glow | 900 / 500 |
| `burst_area` | expanding sphere/ring centered on target, ground ring decal | 900 / 450 |
| `rain_down` | 5–9 objects fall from above onto target, dust puff | 1000 / 600 |
| `ground_wave` | user stomps, shockwave ripples along ground to target, camera shake | 1000 / 600 |
| `multi_hit_flurry` | N rapid small impacts (N = hit count) | 400 per hit / 200 per hit |
| `debuff_cloud` | swirling motes envelop target, downward arrows if stat drop | 900 / 600 |
| `aura_self` | rising motes and glow around user, upward arrows per boosted stat | 900 / 500 |
| `shield` | translucent hemisphere forms in front of user; on block, ripple | 700 / 300 |
| `heal_glow` | soft motes descend on user, HP bar pulse | 900 / 600 |
| `weather_call` | user looks skyward, column of particles rises, weather crossfades in | 1200 / 800 |
Reduced motion: all durations ×0.5, no camera shake, particle counts ×0.5.

### 9.2 Effect vocabulary (data field `effects[]`, evaluated in order)
`status(id, chance)`, `stat(target, stat, delta, chance)` (target `self`/`foe`), `flinch(chance)`, `dizzy(chance)`, `recoil(num, den)`, `drain(1,2)`, `heal(num, den)` with optional weather overrides, `weather(id)`, `critStage(+1)`, `hits(2)`, `shield`, `sap`, `cleanse` (cure own major status, dizzy and sapped; set own negative stages to 0), `clearAll` (weather → clear for 5 turns; reset all stages both sides), `powerIfTargetStatus(poison, x2)`, `neverMissIn(weather)`, `accIn(weather, value)`. Chance 100 on a status move means "if the move hits". "Contact" = every physical move.

### 9.3 Move list (101 moves: m000 + m001–m100, 10 per type)
Columns: id | name | type | cat | power | acc | charges | pri | target | effects | anim. "—" = none / never misses.

**Fallback**
| id | name | type | cat | pow | acc | ch | pri | tgt | effects | anim |
|---|---|---|---|---|---|---|---|---|---|---|
| m000 | *Scramble* | none | physical | 50 | — | ∞ | 0 | foe | user loses floor(maxHp/4); used automatically when all moves have 0 charges; cannot be learned | melee_lunge |

**Fire**
| id | name | type | cat | pow | acc | ch | pri | tgt | effects | anim |
|---|---|---|---|---|---|---|---|---|---|---|
| m001 | *Cinder Flick* | fire | special | 40 | 100 | 25 | 0 | foe | burn 10% | projectile_bolt |
| m002 | *Kindle Butt* | fire | physical | 40 | 100 | 30 | 0 | foe | burn 10% | melee_lunge |
| m003 | *Stoke* | fire | status | — | — | 20 | 0 | self | self atk +1, spa +1 | aura_self |
| m004 | *Flare Ram* | fire | physical | 70 | 100 | 20 | 0 | foe | burn 10% | melee_lunge |
| m005 | *Heat Ribbon* | fire | special | 65 | 100 | 20 | 0 | foe | burn 10% | beam |
| m006 | *Scorch Ring* | fire | status | — | 85 | 15 | 0 | foe | burn 100% | debuff_cloud |
| m007 | *Kiln Blast* | fire | special | 90 | 100 | 15 | 0 | foe | burn 10% | burst_area |
| m008 | *Pyre Charge* | fire | physical | 110 | 100 | 10 | 0 | foe | recoil 1/3; burn 10% | charge_rush |
| m009 | *Sunflare Call* | fire | status | — | — | 5 | 0 | field | weather sunlight (5) | weather_call |
| m010 | *Magma Surge* | fire | special | 110 | 85 | 5 | 0 | foe | burn 30% | burst_area |

**Water**
| id | name | type | cat | pow | acc | ch | pri | tgt | effects | anim |
|---|---|---|---|---|---|---|---|---|---|---|
| m011 | *Spritz Shot* | water | special | 40 | 100 | 25 | 0 | foe | — | projectile_bolt |
| m012 | *Shell Slap* | water | physical | 40 | 100 | 30 | 0 | foe | — | melee_sweep |
| m013 | *Rushing Current* | water | physical | 40 | 100 | 20 | +1 | foe | — | dash_through |
| m014 | *Mending Tide* | water | status | — | — | 10 | 0 | self | heal 1/2 (rain 2/3) | heal_glow |
| m015 | *Bubble Lance* | water | special | 65 | 100 | 20 | 0 | foe | foe spe −1 20% | projectile_bolt |
| m016 | *Riptide Bite* | water | physical | 70 | 100 | 20 | 0 | foe | flinch 20% | melee_lunge |
| m017 | *Rainsong* | water | status | — | — | 5 | 0 | field | weather rain (5) | weather_call |
| m018 | *Cascade Crash* | water | physical | 85 | 100 | 15 | 0 | foe | flinch 20% | charge_rush |
| m019 | *Deluge Beam* | water | special | 90 | 100 | 15 | 0 | foe | — | beam |
| m020 | *Maelstrom* | water | special | 110 | 80 | 5 | 0 | foe | — | burst_area |

**Electric**
| id | name | type | cat | pow | acc | ch | pri | tgt | effects | anim |
|---|---|---|---|---|---|---|---|---|---|---|
| m021 | *Static Nip* | electric | physical | 40 | 100 | 30 | 0 | foe | paralysis 10% | melee_lunge |
| m022 | *Spark Dart* | electric | special | 40 | 100 | 25 | 0 | foe | paralysis 10% | projectile_bolt |
| m023 | *Jolt Step* | electric | physical | 40 | 100 | 20 | +1 | foe | — | dash_through |
| m024 | *Buzz Field* | electric | status | — | 90 | 20 | 0 | foe | paralysis 100% | debuff_cloud |
| m025 | *Arc Lash* | electric | special | 65 | 100 | 20 | 0 | foe | paralysis 10% | beam |
| m026 | *Overclock* | electric | status | — | — | 20 | 0 | self | self spa +1, spe +1 | aura_self |
| m027 | *Volt Fang* | electric | physical | 70 | 95 | 15 | 0 | foe | paralysis 10%; flinch 10% | melee_lunge |
| m028 | *Stormcoil Bolt* | electric | special | 90 | 100 | 15 | 0 | foe | paralysis 10% | beam |
| m029 | *Skyfall Strike* | electric | special | 110 | 70 | 10 | 0 | foe | paralysis 30%; rain: never misses; sunlight: acc 50 | rain_down |
| m030 | *Surge Tackle* | electric | physical | 110 | 100 | 10 | 0 | foe | recoil 1/3; paralysis 10% | charge_rush |

**Verdant**
| id | name | type | cat | pow | acc | ch | pri | tgt | effects | anim |
|---|---|---|---|---|---|---|---|---|---|---|
| m031 | *Leaf Snip* | verdant | physical | 40 | 100 | 30 | 0 | foe | — | melee_sweep |
| m032 | *Seed Pellet* | verdant | special | 40 | 100 | 25 | 0 | foe | — | projectile_bolt |
| m033 | *Sapping Tendril* | verdant | status | — | 90 | 10 | 0 | foe | sap (sapped volatile) | debuff_cloud |
| m034 | *Drowse Pollen* | verdant | status | — | 75 | 15 | 0 | foe | sleep 100% | debuff_cloud |
| m035 | *Thorn Volley* | verdant | physical | 35 | 100 | 20 | 0 | foe | hits exactly 2 | multi_hit_flurry |
| m036 | *Draining Bloom* | verdant | special | 70 | 100 | 15 | 0 | foe | drain 1/2 | beam |
| m037 | *Sunsoak Rest* | verdant | status | — | — | 10 | 0 | self | heal 1/2 (sunlight 2/3; rain/snow/fog 1/4) | heal_glow |
| m038 | *Bramble Whip* | verdant | physical | 80 | 100 | 15 | 0 | foe | crit+1 | melee_sweep |
| m039 | *Canopy Burst* | verdant | special | 90 | 100 | 10 | 0 | foe | foe spd −1 10% | burst_area |
| m040 | *Heartwood Crash* | verdant | physical | 110 | 100 | 10 | 0 | foe | recoil 1/3 | charge_rush |

**Stone**
| id | name | type | cat | pow | acc | ch | pri | tgt | effects | anim |
|---|---|---|---|---|---|---|---|---|---|---|
| m041 | *Pebble Toss* | stone | physical | 40 | 100 | 30 | 0 | foe | — | projectile_arc |
| m042 | *Gravel Burst* | stone | special | 40 | 100 | 25 | 0 | foe | — | burst_area |
| m043 | *Bedrock Brace* | stone | status | — | — | 20 | 0 | self | self def +2 | aura_self |
| m044 | *Rock Tumble* | stone | physical | 60 | 95 | 15 | 0 | foe | foe spe −1 100% | rain_down |
| m045 | *Bulwark* | stone | status | — | — | 10 | +3 | self | shield | shield |
| m046 | *Crag Shard* | stone | special | 65 | 100 | 20 | 0 | foe | — | projectile_bolt |
| m047 | *Rockfall* | stone | physical | 75 | 90 | 10 | 0 | foe | flinch 30% | rain_down |
| m048 | *Quake Stomp* | stone | physical | 90 | 100 | 10 | 0 | foe | — | ground_wave |
| m049 | *Monolith Drop* | stone | physical | 110 | 80 | 5 | 0 | foe | crit+1 | rain_down |
| m050 | *Geode Pulse* | stone | special | 90 | 100 | 10 | 0 | foe | self spd +1 10% | beam |

**Frost**
| id | name | type | cat | pow | acc | ch | pri | tgt | effects | anim |
|---|---|---|---|---|---|---|---|---|---|---|
| m051 | *Rime Nip* | frost | physical | 40 | 100 | 30 | 0 | foe | frostbite 10% | melee_lunge |
| m052 | *Hoarbreath* | frost | special | 40 | 100 | 25 | 0 | foe | frostbite 10% | beam |
| m053 | *Icicle Jab* | frost | physical | 40 | 100 | 20 | +1 | foe | — | projectile_bolt |
| m054 | *Rime Touch* | frost | status | — | 85 | 15 | 0 | foe | frostbite 100% | debuff_cloud |
| m055 | *Sleet Spray* | frost | special | 65 | 100 | 20 | 0 | foe | frostbite 10% | burst_area |
| m056 | *Glacier Fang* | frost | physical | 70 | 95 | 15 | 0 | foe | frostbite 10%; flinch 10% | melee_lunge |
| m057 | *Snowcall* | frost | status | — | — | 5 | 0 | field | weather snow (5) | weather_call |
| m058 | *Rime Beam* | frost | special | 90 | 100 | 10 | 0 | foe | frostbite 10% | beam |
| m059 | *Avalanche Drop* | frost | physical | 100 | 90 | 10 | 0 | foe | snow: never misses | rain_down |
| m060 | *Whiteout* | frost | special | 110 | 70 | 5 | 0 | foe | frostbite 10%; snow: never misses | burst_area |

**Gale**
| id | name | type | cat | pow | acc | ch | pri | tgt | effects | anim |
|---|---|---|---|---|---|---|---|---|---|---|
| m061 | *Puff Gust* | gale | special | 40 | 100 | 35 | 0 | foe | — | projectile_bolt |
| m062 | *Wing Clip* | gale | physical | 40 | 100 | 30 | 0 | foe | — | melee_sweep |
| m063 | *Slipstream* | gale | physical | 40 | 100 | 20 | +1 | foe | — | dash_through |
| m064 | *Down Flurry* | gale | status | — | 100 | 15 | 0 | foe | foe atk −2 | debuff_cloud |
| m065 | *Razor Draft* | gale | special | 75 | 95 | 15 | 0 | foe | crit+1 | projectile_bolt |
| m066 | *Sky Dive* | gale | physical | 75 | 100 | 15 | 0 | foe | — | dash_through |
| m067 | *Clearing Wind* | gale | status | — | — | 5 | 0 | field | clearAll (weather clear 5 turns; reset all stages both sides) | weather_call |
| m068 | *Perch Rest* | gale | status | — | — | 10 | 0 | self | heal 1/2 | heal_glow |
| m069 | *Gale Cleaver* | gale | physical | 90 | 100 | 10 | 0 | foe | — | melee_sweep |
| m070 | *Stormwheel* | gale | special | 110 | 70 | 5 | 0 | foe | dizzy 30%; rain: never misses | burst_area |

**Toxin**
| id | name | type | cat | pow | acc | ch | pri | tgt | effects | anim |
|---|---|---|---|---|---|---|---|---|---|---|
| m071 | *Barb Prick* | toxin | physical | 40 | 100 | 30 | 0 | foe | poison 20% | melee_lunge |
| m072 | *Acid Spittle* | toxin | special | 40 | 100 | 25 | 0 | foe | foe spd −1 10% | projectile_arc |
| m073 | *Blight Puff* | toxin | status | — | 90 | 20 | 0 | foe | poison 100% | debuff_cloud |
| m074 | *Corrode* | toxin | status | — | 100 | 20 | 0 | foe | foe def −2 | debuff_cloud |
| m075 | *Sludge Lob* | toxin | special | 65 | 100 | 20 | 0 | foe | poison 30% | projectile_arc |
| m076 | *Blight Fang* | toxin | physical | 70 | 100 | 15 | 0 | foe | poison 30% | melee_lunge |
| m077 | *Festering Wave* | toxin | special | 65 | 100 | 10 | 0 | foe | power ×2 if target poisoned | burst_area |
| m078 | *Noxious Burst* | toxin | special | 90 | 100 | 10 | 0 | foe | poison 30% | burst_area |
| m079 | *Needle Crush* | toxin | physical | 90 | 100 | 10 | 0 | foe | poison 20% | melee_lunge |
| m080 | *Miasma Torrent* | toxin | special | 110 | 80 | 5 | 0 | foe | poison 30% | beam |

**Shade**
| id | name | type | cat | pow | acc | ch | pri | tgt | effects | anim |
|---|---|---|---|---|---|---|---|---|---|---|
| m081 | *Gloom Nip* | shade | physical | 40 | 100 | 30 | 0 | foe | flinch 10% | melee_lunge |
| m082 | *Dusk Mote* | shade | special | 40 | 100 | 25 | 0 | foe | — | projectile_bolt |
| m083 | *Sneak Snap* | shade | physical | 40 | 100 | 20 | +1 | foe | — | dash_through |
| m084 | *Unsettling Gaze* | shade | status | — | 100 | 10 | 0 | foe | dizzy 100% | debuff_cloud |
| m085 | *Dread Whisper* | shade | status | — | 100 | 20 | 0 | foe | foe spa −2 | debuff_cloud |
| m086 | *Night Rake* | shade | physical | 70 | 100 | 15 | 0 | foe | crit+1 | melee_sweep |
| m087 | *Fogfall* | shade | status | — | — | 5 | 0 | field | weather fog (5) | weather_call |
| m088 | *Umbral Pulse* | shade | special | 80 | 100 | 15 | 0 | foe | flinch 20% | beam |
| m089 | *Gloom Crusher* | shade | physical | 95 | 95 | 10 | 0 | foe | foe def −1 20% | charge_rush |
| m090 | *Void Surge* | shade | special | 110 | 85 | 5 | 0 | foe | foe spd −1 20% | burst_area |

**Lumen**
| id | name | type | cat | pow | acc | ch | pri | tgt | effects | anim |
|---|---|---|---|---|---|---|---|---|---|---|
| m091 | *Glimmer Tap* | lumen | physical | 40 | 100 | 30 | 0 | foe | — | melee_lunge |
| m092 | *Mote Flick* | lumen | special | 40 | 100 | 25 | 0 | foe | — | projectile_bolt |
| m093 | *Dazzle Flash* | lumen | status | — | 100 | 20 | 0 | foe | foe acc −1 | burst_area |
| m094 | *Radiant Mend* | lumen | status | — | — | 10 | 0 | self | heal 1/2 | heal_glow |
| m095 | *Halo Veil* | lumen | status | — | — | 20 | 0 | self | self def +1, spd +1 | aura_self |
| m096 | *Prism Ray* | lumen | special | 65 | 100 | 20 | 0 | foe | dizzy 10% | beam |
| m097 | *Dawn Lance* | lumen | physical | 75 | 100 | 15 | 0 | foe | crit+1 | dash_through |
| m098 | *Cleansing Chime* | lumen | status | — | — | 10 | 0 | self | cleanse | heal_glow |
| m099 | *Sunlance Beam* | lumen | special | 90 | 100 | 10 | 0 | foe | foe spd −1 10% | beam |
| m100 | *Starfall Crash* | lumen | physical | 110 | 100 | 10 | 0 | foe | recoil 1/3 | rain_down |

### 9.4 Move coverage summary
- Per type: 10 moves (3–4 physical, 3–4 special, 2–3 status); power tiers 40 → 60–75 → 80–95 → 100–110 in every type.
- Priority: m013, m023, m053, m063, m083 (+1), m045 (+3). Healing: m014, m037, m068, m094 (+ drain m036). Recoil (no multi-turn moves exist in v1): m008, m030, m040, m100. Weather: m009, m017, m057, m087, m067 (clear). Status infliction: burn m006, paralysis m024, sleep m034, poison m073, frostbite m054, dizzy m084, sapped m033. Self boosts: m003, m026, m043, m095. Foe drops: m064 (atk), m074 (def), m085 (spa), m093 (acc), m044 (spe). Cleanse: m098.
- No two-turn charge moves, no forced-switch moves, no trapping — deliberate simplification of the state machine (see Unresolved questions).
