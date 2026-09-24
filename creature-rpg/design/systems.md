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

Starter triangle (f01 electric / f02 fire / f03 water): water→fire 2, fire→electric 2, electric→water 2; reverse directions are ½ (fire→water, electric→fire) and 1 (water→electric). The rival always takes the starter that is strong against the player's (section 14.1).

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
- `potential[stat]` for each of the 6 stats: integer 0–15. Wild: `rng.int(0,15)` per stat. Gifts/starters: 10 each. Trainers: see 13.3 (6 normal, 12 hard, 15 champion).
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
| `weariness` | turn ≥ 50 | See 15.8. |

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
1. **Command phase.** AI command is computed first from an `AIView` snapshot using the separate `rngAI` stream (section 13). Then the player chooses Fight / Bag / Switch / Run. The player's choice is never an input to the AI function.
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
   6. Weariness (turn ≥ 50): each active loses floor(maxHp × (turn − 49) / 16) (min 1) — escalating, so any battle ends by turn 65.
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

Sanity model (estimate): XP per foe at equal level ≈ Y·L/7·T. Foes needed per level ≈ 21L/(Y·T). With campaign-average Y·T ≈ 180, Lv 5→50 on the medium curve needs ≈ 145 foe-defeats for the lead; the campaign plan in sections 12.5/14 contains ≈ 150 trainer creatures plus optional wild battles, and the S factor (up to ×1.5) pulls under-levelled members up. Slow families end ~2 levels below medium ones; acceptable.

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
Discs are **reusable** (never consumed; key-item pocket; sellable 0 — cannot be sold). Compatibility: a species can learn a disc's move if (a) the move type is one of the species' types, or (b) the move type is in its family's `discCoverage` list (section 11.2), or (c) the disc is flagged universal (`i_disc_11` only). Teaching uses the replacement flow. Disc list in section 12.2.

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
- Per type: 10 moves (3–5 physical, 2–5 special, 2–3 status); power tiers 40 → 60–75 → 80–95 → 100–110 in every type.
- Priority: m013, m023, m053, m063, m083 (+1), m045 (+3). Healing: m014, m037, m068, m094 (+ drain m036). Recoil (no multi-turn moves exist in v1): m008, m030, m040, m100. Weather: m009, m017, m057, m087, m067 (clear). Status infliction: burn m006, paralysis m024, sleep m034, poison m073, frostbite m054, dizzy m084, sapped m033. Self boosts: m003, m026, m043, m095. Foe drops: m064 (atk), m074 (def), m085 (spa), m093 (acc), m044 (spe). Cleanse: m098.
- No two-turn charge moves, no forced-switch moves, no trapping — deliberate simplification of the state machine (see Unresolved questions).

---

## 10. Passive traits

Each species has exactly one trait (no hidden/alternate traits in v1). The Creature Art Director proposes a trait per species; the final species→trait assignment is reconciled against this canonical list in `creatures.json` (reference-validated). Traits not in this list are not implementable in v1.

| id | Trigger | Exact effect |
|---|---|---|
| `tr_last_stand` | currentHp ≤ floor(maxHp/3) | Moves of the user's **primary** type ×3/2 (damage step 8). Suggested: all starter-line stages. |
| `tr_resonant` | move type = zone attunedType | Resonance ×3/2 instead of ×6/5. |
| `tr_static_hide` | hit by a physical move | `rng.chance(30)` → attacker paralysis (normal eligibility rules). |
| `tr_ember_hide` | hit by a physical move | 30% → attacker burn. |
| `tr_toxic_skin` | hit by a physical move | 30% → attacker poison. |
| `tr_frost_hide` | hit by a physical move | 30% → attacker frostbite. |
| `tr_thorned` | hit by a physical move | attacker loses floor(attackerMaxHp/8) (min 1) after the hit. |
| `tr_menace` | on entry | foe atk −1 (blocked by `tr_clear_mind`). |
| `tr_clear_mind` | foe-caused stat drop | prevented ("mind stays clear"); self-inflicted changes still apply. |
| `tr_sturdy_core` | at full HP, a single hit would reduce HP to 0 | HP set to 1 instead. Per hit (a second hit of m035 can KO). |
| `tr_keen_focus` | always | crit stage +1. |
| `tr_small_strikes` | move base power ≤ 60 | power ×3/2 (floored) before the base formula. |
| `tr_reckless` | move has recoil (m000 excluded) | power ×6/5 before the base formula. |
| `tr_regrowth` | end-of-turn step 5 | heal floor(maxHp/16) if not full and not fainted. |
| `tr_charge_sink` | targeted by an electric move | move has no effect; if damaging, user heals floor(maxHp/4). Immune to paralysis. |
| `tr_tide_sink` | targeted by a water move | move has no effect; if damaging, heal floor(maxHp/4). |
| `tr_flame_sink` | targeted by a fire move | move has no effect; sets `absorbedFlame` (own fire moves ×3/2 while on field). Immune to burn. |
| `tr_rain_glide` | rain | effSpe ×2. |
| `tr_sun_bask` | sunlight | effSpe ×2. |
| `tr_snow_coat` | snow | def ×3/2 (stacks with the frost-type snow bonus). |
| `tr_fog_veil` | fog | foe moves targeting it: accuracy ×4/5. |
| `tr_shed_status` | end-of-turn step 5 | `rng.chance(30)` → cure own major status. |
| `tr_early_riser` | asleep | sleep counter decrements by 2. |
| `tr_adaptive` | STAB | STAB ×2 instead of ×3/2. |
| `tr_thick_fur` | hit by fire or frost move | damage ×1/2 (step 8). |
| `tr_quick_feet` | has a major status | effSpe ×3/2; ignores paralysis speed halving. |

Suggested defaults (for reconciliation, not binding): f01 `tr_last_stand`→st3 `tr_static_hide`; f02 `tr_last_stand`→st3 `tr_reckless`; f03 `tr_last_stand`→st3 `tr_rain_glide`; f04 `tr_regrowth`; f05 `tr_sturdy_core`; f06 `tr_snow_coat`; f07 `tr_keen_focus`; f08 `tr_toxic_skin`; f09 `tr_fog_veil`; f10 `tr_resonant`. The trait choice must be one of the 26 ids; balance gate: no stage-1 creature may have `tr_adaptive`.

---

## 11. Learnsets

Rule: one learnset table **per family**, shared by all three stages (a creature learns by its current level regardless of stage). Evolution moves (8.3) are learned on evolving. Lv 1 moves are known on creation; starters are created at Lv 5 knowing the two Lv 1 moves. Every family has, by Lv 25, at least two STAB damaging moves (one ≥ 65 power), one coverage type hitting at least one of its weaknesses, and one status/utility move.

Format: `Lv: move` (★ = evolution move).

| Family | Learnset |
|---|---|
| **f01 electric** | 1: m021, 1: m022, 7: m062, 10: m024, 13: m063, ★16: m025, 20: m026, 24: m027, 28: m065, 32: m028, ★34: m055, 38: m029, 43: m030, 48: m070 |
| **f02 fire** | 1: m002, 1: m001, 7: m041, 10: m006, 13: m021, ★16: m004, 20: m005, 24: m003, 28: m038, 32: m007, ★34: m048, 36: m027, 38: m009, 42: m008, 47: m010 |
| **f03 water** | 1: m012, 1: m011, 7: m013, 10: m015, 13: m052, ★16: m016, 20: m014, 24: m056, 28: m019, 32: m017, ★34: m047, 38: m018, 42: m058, 47: m020 |
| **f04 verdant** | 1: m031, 1: m032, 5: m033, 9: m071, 12: m034, ★16: m035, 19: m036, 21: m044, 23: m075, 27: m037, ★32: m047, 35: m038, 39: m039, 44: m040, 48: m078 |
| **f05 stone** | 1: m041, 1: m043, 6: m042, 10: m044, 14: m021, 18: m046, ★20: m045, 24: m027, 28: m047, 32: m048, ★36: m004, 40: m050, 45: m049, 50: m030 |
| **f06 frost** | 1: m051, 1: m052, 6: m053, 10: m015, 14: m054, 18: m056, ★22: m055, 26: m057, 30: m065, 34: m058, ★38: m019, 42: m059, 47: m060 |
| **f07 gale** | 1: m062, 1: m061, 5: m064, 9: m063, 13: m081, ★14: m066, 18: m065, 22: m068, 26: m086, ★30: m069, 34: m067, 38: m097, 43: m088, 48: m070 |
| **f08 toxin** | 1: m071, 1: m072, 6: m073, 10: m082, 14: m075, ★18: m076, 22: m074, 26: m077, 30: m033, ★34: m036, 38: m078, 42: m088, 46: m079, 50: m080 |
| **f09 shade** | 1: m081, 1: m082, 6: m085, 10: m083, 14: m084, 18: m072, 21: m086, ★24: m087, 28: m088, 32: m076, 36: m056, ★40: m089, 44: m058, 48: m090 |
| **f10 lumen** | 1: m091, 1: m092, 6: m093, 10: m094, 14: m061, 18: m096, 22: m095, ★26: m097, 30: m065, 34: m098, 38: m099, 42: m005, ★(st3): m100, 46: m007 |

### 11.1 Coverage check (weakness → learnset answer)
| Family | Weak to | Coverage types in learnset | Example Lv 30 set |
|---|---|---|---|
| f01 electric | fire, stone, shade | gale (vs fire, shade), frost (vs stone, st3) | m025, m027, m065, m026 |
| f02 fire | water, stone, gale | verdant (vs water, stone), electric (vs gale: m021 Lv 13, m027 Lv 36) | m004, m005, m038, m003 |
| f03 water | electric, verdant, toxin | frost (vs verdant), stone (vs electric, st3) | m016, m019, m056, m014 |
| f04 verdant | fire, frost, toxin | stone (vs fire, frost: m044 Lv 21, m047 Lv 32), toxin | m036, m035, m075, m037 |
| f05 stone | water, verdant, frost | electric (vs water), fire (vs verdant, frost, st3) | m047, m027, m045, m046 |
| f06 frost | fire, stone, lumen | water (vs fire, stone), gale | m056, m055, m065, m015 |
| f07 gale | electric, frost | shade, lumen (vs frost) | m069, m065, m086, m068 |
| f08 toxin | water, gale, lumen | verdant (vs water), shade (vs lumen) | m076, m077, m074, m033 |
| f09 shade | gale, lumen | toxin (vs lumen), frost (vs gale, Lv 36) | m088, m086, m084, m072 |
| f10 lumen | verdant, toxin, shade | gale (vs toxin, shade), fire (vs verdant, Lv 42; disc i_disc_01 earlier) | m096, m097, m065, m094 |

### 11.2 Disc coverage (`discCoverage` per family, in addition to the species' own types)
f01: gale, frost, lumen · f02: verdant, electric, stone · f03: frost, stone, gale · f04: toxin, stone, lumen · f05: electric, fire, frost · f06: water, gale, stone · f07: shade, lumen, electric · f08: shade, verdant, water · f09: frost, toxin, electric · f10: gale, fire, water.

---

## 12. Items and economy

Sell value = floor(price/2) unless stated. "Not sold" items appear only as pickups/rewards (World Designer places). Items cannot be used by the player in trainer battles more than once per turn (one action per turn anyway).

### 12.1 Consumables
| id | Effect | Price | First sold |
|---|---|---|---|
| `i_salve_1` | restore 20 HP | 200 | town_1 |
| `i_salve_2` | restore 60 HP | 500 | after trial_1 |
| `i_salve_3` | restore 150 HP | 1000 | after trial_3 |
| `i_salve_4` | restore all HP | 2000 | after trial_5 |
| `i_cure_burn` / `i_cure_poison` / `i_cure_para` / `i_cure_sleep` / `i_cure_frost` | cure that status | 150 each | town_1 |
| `i_cure_all` | cure any major status and dizzy | 450 | after trial_2 |
| `i_revive_1` | revive fainted creature at floor(maxHp/2) | 1200 | after trial_2 |
| `i_revive_2` | revive at full HP | not sold (sell 1000) | — |
| `i_charge_1` | +10 charges to one move | 600 | after trial_2 |
| `i_charge_2` | all moves of one creature to full charges | not sold (sell 800) | — |
| `i_repel_1` | wild creatures do not initiate contact for 200 m walked (they still roam; player can still touch them to battle) | 300 | after trial_1 |
| `i_repel_2` | same, 400 m | 500 | after trial_3 |
| `i_escape` | outside battle, in cave/forest/volcano/snowpeak/lake areas and interiors: return to last healing center | 400 | town_1 |
| `i_evo_prism` | f10 stage 2 → stage 3 (8.3) | 3000 (town_3 only) | one guaranteed pickup (World Designer) |
| `i_orb_1..4` | capture devices (7.1) | 200 / 600 / 1200 / 2500 | 7.1 |

Battle usage: HP/cure/revive items target a party member (revive only fainted; others only non-fainted); use consumes the player's action. Out of battle all except orbs/escape are usable from the Bag.

### 12.2 Teaching discs (reusable, cannot be sold)
| id | Move | Suggested source (World Designer places) | Price if sold in shop |
|---|---|---|---|
| i_disc_01 | m005 Heat Ribbon | shop town_2 | 2000 |
| i_disc_02 | m019 Deluge Beam | trial_3 reward | — |
| i_disc_03 | m025 Arc Lash | shop town_1 (after trial_1) | 1500 |
| i_disc_04 | m036 Draining Bloom | forest secret | — |
| i_disc_05 | m044 Rock Tumble | trial_1 reward | — |
| i_disc_06 | m055 Sleet Spray | shop town_2 | 2000 |
| i_disc_07 | m065 Razor Draft | route gale-field-action secret | — |
| i_disc_08 | m075 Sludge Lob | shop town_2 | 2000 |
| i_disc_09 | m088 Umbral Pulse | antagonist admin 2 reward | — |
| i_disc_10 | m096 Prism Ray | trial_2 reward | — |
| i_disc_11 | m045 Bulwark (**universal**) | shop town_1 | 1500 |
| i_disc_12 | m024 Buzz Field | shop town_2 | 1500 |
| i_disc_13 | m048 Quake Stomp | trial_4 reward | — |
| i_disc_14 | m058 Rime Beam | shop town_3 | 3000 |
| i_disc_15 | m028 Stormcoil Bolt | trial_5 reward | — |
| i_disc_16 | m007 Kiln Blast | shop town_3 | 3000 |
| i_disc_17 | m086 Night Rake | cave secret | — |
| i_disc_18 | m094 Radiant Mend | trial_6 reward | — |

### 12.3 Key items (functional ids; names by Creative Director)
`i_mark_1`..`i_mark_6` (trial emblems; each unlocks one field-action category per creative_direction.md), `i_key_disc_case` (holds discs; given with first disc), `i_key_journal` (quest log), `i_key_map` (fast-travel map). Key items cannot be sold, dropped or used up.

### 12.4 Money sources
- Starting money 1000. Wild battles give no money.
- Trainer payout on victory = `classBase × (highest level in the trainer's team)`.

| Trainer class | classBase |
|---|---|
| youth / novice | 16 |
| regular route trainer | 24 |
| veteran | 36 |
| faction grunt | 20 |
| faction admin / boss | 60 |
| rival | 40 |
| trial leader | 100 |
| champion | 200 |

- Wipe penalty: see 15.1. Money is capped at 999,999 and never negative.

### 12.5 Income vs spending per chapter (estimate; excludes pickups and quest rewards)
Trainer mix per chapter matches section 14 (counts are the World Designer's target; they may vary ±20% without breaking the budget).

| Chapter | Est. hours | Trainers (class×count @ max lvl) | Income | Typical purchases | Spend | Balance after |
|---|---|---|---|---|---|---|
| C1 start → trial_1 | 1.2 | youth×5 @8, rival @5, leader @14 | 2,240 | 5 orb_1, 4 salve_1 | 1,800 | 1,440 (from 1,000 start) |
| C2 → trial_2 | 1.2 | youth×4 @14, regular×4 @16, rival @17, leader @20 | 5,112 | 5 orb_1, 2 orb_2, 3 salve_2, 2 cures | 4,000 | 2,552 |
| C3 → trial_3 | 1.3 | regular×4 @21, grunt×3 @21, admin @22, leader @26 | 7,196 | 4 orb_2, 3 salve_2, 1 revive, 1 disc | 7,100 | 2,648 |
| C4 → trial_4 | 1.3 | regular×6 @27, veteran×3 @28, rival @29, leader @32 | 11,272 | 3 orb_3, 4 salve_3, 1 disc | 10,100 | 3,820 |
| C5 → trial_5 | 1.3 | regular×5 @33, grunt×3 @33, admin @34, leader @38 | 11,780 | 3 orb_3, 3 salve_3, 2 revive, 2 repel_2 | 10,000 | 5,600 |
| C6 → trial_6 | 1.3 | veteran×5 @39, grunt×3 @39, rival @40, boss @42, leader @43 | 17,780 | 3 orb_4, 4 salve_3, 2 revive, 1 disc | 16,900 | 6,480 |
| C7 → champion | 1.0 | veteran×6 @46, rival @47, champion @50 | 21,816 (11,816 before champion) | 6 salve_4, 3 revive | 15,600 | 12,696 |

Conclusions: purchases fit income at every chapter with no extra battles; healing centers are free, so purchases are convenience, not survival. Even a player who buys nothing beyond orbs finishes every chapter with a positive balance; the free orb rule (15.3) covers a player who overspends.

---

## 13. AI

### 13.1 Information rule (all levels)
The AI function signature is `chooseAction(view: AIView, rngAI) → Action`. `AIView` contains: the AI's own full team state; the player's **active** creature's species, types, level, currentHp/maxHp, status, volatiles, stat stages and trait (visible); weather, turns remaining, attunedType, turn number; the player's moves **revealed** so far this battle (used at least once); the count of the player's non-fainted creatures. It contains **no** field for the player's pending command, the player's unrevealed moves, the player's bench identities, potentials or temperament. The AI's choice is computed before the player's command is read and uses only `rngAI`, so the player's input cannot influence it. For damage estimates the AI assumes the player creature has potential 8 in every stat and `tm_steady`.

### 13.2 Move scoring (used by all levels)
`est(move)` = damage formula with random R = 92, no crit, known weather/Resonance/STAB/effectiveness/burn/traits. `pct = min(100, floor(100 × est / targetCurrentHp))`.
| Move kind | Score |
|---|---|
| Damaging | `pct × acc / 100` (acc "—" = 100); +40 if est ≥ targetCurrentHp; +20 more if also priority > 0; −floor(50 × recoilHp / userCurrentHp) for recoil; effectiveness 0 → score 0 |
| Status infliction (burn/poison/paralysis/sleep/frostbite) | 45 if target has no major status, is not immune, and target HP > 40%; else 0 |
| dizzy / sap | 35 if target lacks it (sap: not verdant); else 0 |
| Self boost | 35 if every boosted stat stage < +2 and user HP ≥ 60%; else 5 |
| Foe drop | 30 if relevant foe stage > −2; else 0 |
| Heal | 90 if user HP ≤ 40%; 40 if ≤ 60%; else 0 |
| Weather | 35 if not active and it boosts one of the user's types or its trait; else 0 |
| Clearing Wind | 30 if the foe has any positive stage or the current weather boosts the foe's type; else 0 |
| Bulwark | 10; 25 if foe is burned/poisoned/frostbitten/sapped or user has `tr_regrowth`; 0 if used last turn |
| Cleanse | 50 if user has a major status or any stage ≤ −2; else 0 |
| m000 | only option when forced |

### 13.3 Difficulty levels
| Level | Used by | Move choice | Switching | Items | Replacement | Team potentials |
|---|---|---|---|---|---|---|
| **Easy** | all wild creatures | uniform random among moves with score > 0 (if none, uniform among usable moves) | never | never | n/a | random 0–15 |
| **Normal** | route trainers, grunts, rival R1–R2 | highest score; with `rngAI.chance(25)` instead pick uniformly among moves scoring ≥ 60% of the max | never voluntarily | holds 0–1 `i_salve_*` (trainer data); uses it when own HP ≤ 20% and `rngAI.chance(50)`, once per battle | next party slot | 6 all stats, `tm_steady` (rival always 12) |
| **Hard** | trial leaders, admins/boss, rival R3–R5, champion | highest score; ties → `rngAI` uniform; +30 to priority moves if the AI estimates it will be KO'd before acting (player effSpe > AI effSpe and a revealed player move's est ≥ AI HP) | see 13.4 | holds up to 2 heal items + 1 `i_cure_all`; heals when HP ≤ 25% and no move scores KO; uses cure_all on sleep/paralysis/frostbite if it is the last creature | best matchup (13.4) | 12 (leaders, admins, rival), 15 (champion); temperaments data-defined |

### 13.4 Hard AI switching and matchup
`matchup(c) = max over c's damaging moves of effectiveness vs player's active types (as ×4 integer) − max over player's revealed damaging moves' types (if none revealed: player's own types, as STAB proxies) of effectiveness vs c's types`.
Voluntary switch at command time iff all hold: best move score < 25; active HP > 25%; a benched non-fainted creature has `matchup ≥ matchup(active) + 4` (i.e. one full effectiveness step better); fewer than 2 voluntary switches so far this battle; the AI did not switch last turn. Picks the highest matchup (ties: party order). Replacement after a faint: highest matchup, ties party order.

---

## 14. Difficulty progression

### 14.1 Major battles
| Battle | Team size | Opponent levels | Recommended player ace | AI |
|---|---|---|---|---|
| Rival R1 (town_1, start) | 1 | 5 (starter strong vs player's) | 5 | Normal |
| trial_1 leader | 2 | 12, 14 | 13 | Hard |
| Rival R2 (before trial_2) | 2 | 15, 17 | 17 | Normal |
| trial_2 leader | 3 | 17, 18, 20 | 19 | Hard |
| Admin A1 (C3) | 2 | 20, 22 | 21 | Hard |
| trial_3 leader | 3 | 23, 24, 26 | 25 | Hard |
| Rival R3 (before trial_4) | 3 | 26, 27, 29 | 28 | Hard |
| trial_4 leader | 4 | 29, 30, 30, 32 | 31 | Hard |
| Admin A2 (C5) | 3 | 32, 33, 34 | 33 | Hard |
| trial_5 leader | 4 | 35, 36, 36, 38 | 37 | Hard |
| Rival R4 (before trial_6) | 4 | 37, 38, 39, 40 | 39 | Hard |
| Faction boss (C6) | 4 | 39, 40, 41, 42 | 41 | Hard |
| trial_6 leader | 5 | 40, 41, 41, 42, 43 | 42 | Hard |
| Rival R5 (before champion) | 5 | 44, 45, 45, 46, 47 | 46 | Hard |
| champion | 6 | 46, 47, 47, 48, 48, 50 | 48 | Hard |

Rules: the rival's starter is always the one strong against the player's (fire vs electric pick, water vs fire, electric vs water) and evolves at the same levels; rival teams grow by adding creatures from families the World Designer makes available by that chapter. Leaders' teams center on one type (Creative/World own which), with at least one creature whose second type or coverage covers the most likely player counter. Route trainers: team size 1–3, levels within the chapter's band below.

### 14.2 Chapter bands and expected player curve (estimates, not measured)
| Chapter | Cumulative est. hours | Wild levels (guidance to World Designer) | Route trainer levels | Expected ace at chapter end | Expected party average |
|---|---|---|---|---|---|
| C1 | 1.2 | 3–8 | 5–9 | 13 | 10 |
| C2 | 2.4 | 9–15 | 11–16 | 19 | 16 |
| C3 | 3.7 | 14–21 | 17–22 | 25 | 22 |
| C4 | 5.0 | 20–27 | 23–28 | 31 | 28 |
| C5 | 6.3 | 26–33 | 29–34 | 37 | 34 |
| C6 | 7.6 | 31–38 | 35–40 | 42 | 39 |
| C7 | 8.6 | 38–44 | 42–46 | 48 | 45 |

Estimated total main story ≈ 8.6 h (range 8–10 h depending on exploration); to be validated by playtest. Leaders are tuned so a player at "recommended ace" with party average as above wins in 1–2 attempts; no level requirement is ever enforced. The S factor in XP (8.1) gives under-levelled members up to ×1.5 and over-levelled down to ×0.5, compressing the party toward the curve.

---

## 15. Anti-softlock and recovery

1. **Party wipe / trainer loss**: battle ends; screen fades; the player respawns at the last healing center visited (or the town_1 home before any center) with the entire party healed (HP, status, charges). Money penalty = `min(floor(money/4), 100 + 150 × marksOwned)`. All other progress kept: story flags, captures, XP/levels gained during the lost battle, items (consumed items stay consumed). The winning trainer is **not** marked defeated and can be re-challenged immediately; rival/admin/leader story battles re-trigger at the same place. Wild-battle wipes use the same rule.
2. **No usable moves**: if all four moves have 0 charges, Fight shows only m000 *Scramble*. Charges are fully restored at healing centers (free) and after a wipe.
3. **Out of capture devices / money**: when the player owns 0 capture devices of every tier **and** has money < 200, talking to any healing-center attendant gives 5 `i_orb_1` (repeatable every time both conditions hold). The starter gift includes 5 `i_orb_1` + 3 `i_salve_1`.
4. **Field actions**: performable by any party member of the right type, including fainted ones; cost nothing (5.5). The World Designer must guarantee each mandatory field-action type is obtainable before its gate (Creative/World own the list).
5. **Evolution cancelled**: evolution stays available from the party menu (8.3).
6. **Missed/forgotten moves**: free Recall at every healing center (8.4). Discs are reusable (8.5).
7. **Full storage**: explicit release prompt (7.4); the game never silently discards a creature.
8. **Endless battles**: from turn 50, *Weariness*: both actives lose floor(maxHp × (turn − 49)/16) at end-of-turn step 6 ("growing weary"; 1/16 on turn 50, 2/16 on turn 51, …). Every active faints by turn 65 at the latest; if both sides are out simultaneously the player wins (6, step 8.2). Guarantees termination against heal/Bulwark stall loops.
9. **Party integrity**: cannot deposit or release the last party creature; cannot deposit the last non-fainted creature while outside a healing center; the party menu cannot reorder a fainted creature into slot 1 during battle.
10. **Trainer battles cannot be fled**; wild battles always offer Run and, after a faint, "Flee" that always succeeds.
11. **Saves**: battle state is never saved; saving is disabled in battle and during capture/evolution scenes. Loading after a crash mid-battle restores the pre-battle committed state (the wild creature/trainer is still there).
12. **Money never negative**; prices never exceed the maximum affordable only if the item is optional (no mandatory purchases exist anywhere in the story).
13. **Level gating**: no mandatory area requires a minimum level; only story flags gate progress.

---

## 16. Worked example — one full turn

Setup (placeholder base stats; real ones come from creatures.md): Rival R2 on a route whose `attunedType = electric`, ambient weather **rain**.
- Player: c02 (f01 stage 2, pure electric for this example), Lv 18, bases hp 55 / atk 60 / def 50 / spa 80 / spd 55 / spe 95, potential 10 all, temperament `tm_spa_atk`. Stats: core(hp) = floor(120×18/100) = 21 → maxHp 21+18+10 = **49**; atk (core 23+5)×9/10 = **25**; def **24**; spa (core 30+5)×11/10 = **38**; spd **26**; spe **41**.
- Rival: c08 (f03 stage 2, water), Lv 17, bases 70 / 80 / 70 / 55 / 60 / 65, potential 12, `tm_steady`. Stats: maxHp **52**, atk **34**, def **30**, spa **25**, spd **27**, spe **29**. Status: **burn** (from an earlier turn). HP 52/52.

1. **Command phase.** AI (Normal) scores with the AIView. Riptide Bite m016 (physical): base = floor(floor(8×70×34/24)/50)+2 = 17 → rain ×3/2 = 25 → R92 → 23 → STAB 34 → ×1 → burn ×1/2 = 17 → pct 34 → score 34. Bubble Lance m015 (special): base = floor(floor(8×65×25/26)/50)+2 = 12 → 18 → 16 → 24 → pct 48 → score 48. `rngAI.int(1,100)` = 71 > 25 → pick the best: **m015**. Player then selects **m025 Arc Lash**.
2. Phases A–C: nothing.
3. Ordering: both priority 0; effSpe 41 vs 29 → player first. No tie roll.
4. **Player Arc Lash** (special, 65, acc 100): stage 0 → hit = 100 → no roll. Crit: `rng.int(1,24)` = 9 → no. Base: floor(2×18/5)+2 = 9; floor(9×65×38/27) = 823; floor(823/50)+2 = **18**. Weather (electric, rain): 18. Resonance (electric zone): ×6/5 → **21**. Crit: 21. Random `rng.int(85,100)` = 85 → floor(21×85/100) = **17**. STAB ×3/2 → **25**. Type electric→water ×2 → **50**. Burn n/a. Rival HP 52 → **2**. Secondary paralysis 10%: `rng.int(1,100)` = 57 → no.
5. **Rival Bubble Lance** (special, 65, acc 100): no acc roll. Crit roll 17 → no. Base: floor(2×17/5)+2 = 8; floor(8×65×25/26) = 500; 500/50+2 = **12**. Rain water ×3/2 → **18**. Resonance: no (water ≠ electric). Random 88 → **15**. STAB → **22**. Type water→electric ×1 → 22. Burn does not affect special. Player HP 49 → **27**. Secondary spe −1 20%: roll 14 ≤ 20 → player spe stage −1.
6. **End of turn**: (1) ambient weather, no counter. (3) Burn: rival loses floor(52/16) = 3 → HP 2 → **0**, faints. (7) clear flinch/shield; turn = 2. (8) faint check: rival c08 fainted.
7. **Faint resolution**: XP to c02 (participant): Y = floor(400/3) = 133 (BST 400); floor(133×17/7) = 323; T = 3/2; S = (2×17+10)/(17+18+10) = 44/45 → XP = floor(323×3×44/(2×45)) = **473**. Non-participant party members receive 236. Rival still has one creature: AI (Normal) sends next party slot. Player's active is alive → no player prompt. Rival's remaining creature enters; turn 2 command phase begins. On final victory: payout 40 × 17 = **680**.

## 17. Worked example — capture
See 7.5 (Lv 18, 36% HP, `i_orb_2`, a = 102, threshold 48287, 2 shakes then escape). Continuing that battle: next turn the player uses m034 Drowse Pollen (hits), target asleep → S10 = 20 → a = floor(125×90×15×20×20/330000) = 204 → threshold = floor(65536 × cbrt(0.8)) = 60838; rolls 3114, 47770, 22058 all < 60838 → **caught** after 3 shakes; party has 6 → sent to storage box 1.

---

## 18. Data contracts (for content JSON / zod schemas)
- `types.json`: `{ ids: TypeId[10], matrix: Record<TypeId, Record<TypeId, 0|1|2|4>> }` (k/2 encoding).
- `moves.json`: `{ id, name, type, category: "physical"|"special"|"status", power|null, accuracy|null, charges|null, priority, target: "foe"|"self"|"field", effects: Effect[], anim: AnimId }`.
- `traits.json`: `{ id, name, description }` — behavior implemented in code keyed by id.
- `species` fields owned here: `catchRate`, `xpYield` (derived, validated), `growth`, `learnset: {level, move}[]` (per family), `evolution: {toSpecies, level?|item?, move?}`, `discCoverage` (per family), `trait`.
- `items.json`: `{ id, kind: "heal"|"cure"|"revive"|"charge"|"repel"|"escape"|"orb"|"disc"|"key"|"evo", price|null, sell|null, params }`.
- `trainers.json`: `{ id, class, ai: "normal"|"hard", potential, team: {species, level, moves?, temperament?}[], items: ItemId[] }`.
- Validation: every move id referenced by learnsets/discs/trainers exists; every family learnset reaches ≥ 4 damaging-or-utility moves by Lv 10; disc moves exist; effects reference valid statuses/weathers.

---

## 19. Acceptance criteria
1. Type table test: 100 cells equal section 1.2; derived counts equal 1.5; dual-type products produce only {0, ¼, ½, 1, 2, 4}.
2. Stat test vectors: the section 16 stats (49/25/24/38/26/41 and 52/34/30/25/27/29) reproduce exactly.
3. Damage test vectors: Arc Lash = 50 and Bubble Lance = 22 with the given rolls; AI scores 34 and 48.
4. Capture test vectors: a = 68/102/136/204 for the four devices (7.5); SHAKE_TABLE monotonic, SHAKE_TABLE[254] < 65536; Monte-Carlo (100k seeded trials) of shake procedure within ±1% of a/255 for a ∈ {10, 102, 200}.
5. XP test vector: 473 (section 16). Curve tables in 8.2 reproduce.
6. Determinism: identical seed + commands ⇒ identical event logs (1,000 random battles); rendering/audio never call battle RNG (lint rule or injected-RNG test).
7. AI isolation: `AIView` type has no pending-player-action field; property test: for fixed state and seed, AI action is identical for all 4 possible player move choices.
8. Turn order: priority beats speed; speed tie distribution ≈ 50/50 over 10k seeds; flinch only when attacker moved first.
9. Status tests: each immunity in 4.1; sleep lasts 1–3 action attempts; paralysis lock rate ≈ 25%; burn/poison/frostbite tick amounts; dizzy self-hit ≈ 33%.
10. Weather: move weather lasts exactly 5 end-of-turns then reverts to ambient; duplicate weather fails.
11. Move data: ≥ 100 moves + m000, every type exactly 10, every move has a valid anim id from 9.1, each learnset move exists.
12. Every family has ≥ 4 known moves by Lv 10 and a coverage move super-effective against at least one of its weakness types by Lv 25 (automated check against 11.1 using the matrix).
13. Economy simulation (script over section 12.5 inputs) keeps balance ≥ 0 at every chapter end.
14. Softlock tests: wipe → respawn with penalty formula; 0 orbs + <200 money → attendant gives 5 orbs; all-charges-empty → m000; storage full → mandatory release prompt; a scripted heal/Bulwark stall battle ends by turn 65.

## 20. Dependencies
- **creatures.md** (Creature Art Director): base stats per species (within 2.1 bands), final types (stage 2/3 secondaries), trait proposals, BST → derived catchRate/xpYield. The worked example uses placeholder stats.
- **creative_direction.md**: final names for moves, items, traits, temperaments, capture devices, statuses, Resonance; per-zone attuned type semantics and any Resonance↔weather interaction; field-action list per trial; type colors for VFX.
- **world.md**: zone `attunedType`, ambient weather states and probabilities, trainer counts per chapter (12.5 assumptions), placement of discs/`i_evo_prism`/shops/healing centers, encounter levels consistent with 14.2, availability of families per chapter (rival team composition, coverage).
- **rendering_and_architecture.md**: implementation of the 16 anim ids with type tint, `impactMs` sync, reduced-motion variants.
- **qa_plan.md**: test vectors in section 19.

## 21. Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Base stats outside bands skew damage pacing | fights too long/short | zod range checks; BST bands enforced; damage sanity (Lv 50 neutral 90-power STAB ≈ 38% of HP) |
| Shared XP makes the party over-level | trivial leaders | S factor down to ×1/2; leaders tuned at "expected ace"; playtest to adjust T/S |
| Slow-growth families (f05, f09, f10) lag | player benches them | S factor catch-up; evolution moves; can move f10 to medium if playtest shows lag |
| Electric has only 2 strengths | starter f01 feels weak | best speed, priority m023, Overclock, gale/frost coverage by Lv 28–34 |
| Stone immunity to toxin + gale immunity to stone confuses players | misplays | battle UI shows "no effect" text + encyclopedia matrix page |
| Fog accuracy + Dazzle Flash stacking feels unfair | frustration | only one accuracy-drop move; no evasion boosts exist; fog ×9/10 only |
| Weather reverting to ambient surprises players | confusion | HUD weather icon shows "ambient" vs "N turns" |
| AI scoring too predictable/too random | boring or unfair | 25% imperfection for Normal; hard AI deterministic but information-limited |
| Integer floors produce 1-point discrepancies across implementations | failing tests | all steps specified integer; test vectors in section 19 |

## 22. Unresolved questions
1. Final names for all *italic* working names (Creative Director) — ids are stable.
2. Should `sunlight` be an overworld weather state (e.g. volcano "heat") or only move-set? Systems supports both.
3. Resonance ↔ weather coupling (e.g. attuned zones shifting ambient weather odds) — Creative Director / World Designer.
4. Two-turn moves, forced-switch moves, trapping, held items and a player-selectable difficulty setting were deliberately excluded from v1; revisit after the core slice (phase 3) if scope allows.
5. Whether f10 stage 3 should require `i_evo_prism` at all (Lv 44 fallback exists) — depends on World Designer placing the guaranteed prism before Lv 44 is typical.
6. Trainer counts per chapter (12.5) are assumptions; World Designer's final counts must be fed into the economy/XP simulation.
7. Whether captured creatures should retain the device tier as cosmetic data (encyclopedia flavor) — no gameplay effect proposed.
8. Creature Art Director may propose traits outside the canonical 26; each needs a systems review before being added.
