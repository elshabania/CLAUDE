# Systems Design — battle, capture, progression, economy, AI

Owner: Systems Designer. **Status: v2** (2026-09-24). This revision applies the orchestrator rulings in `design/DECISIONS.md` (binding) and the change list in `design/reviews/systems_designer.md` §8. Binding anchors: `design/ANCHORS.md`.
Scope: every rule the deterministic battle simulation, capture resolver, progression and economy code needs, stated so each can be a pure function. Names in *italics* are working names. The Creative Director owns final display names. All ids are final unless listed under Unresolved questions.

**v2 changes (summary):**
- Resonance is ×11/10, applied after the same-type bonus; `tr_resonant` makes it ×6/5 (D3).
- Attunement may be `null` ("Silenced").
- Status display names are set (D8), and capture uses chime **rings** (D9).
- Item ids follow D10.
- Evolution levels are confirmed (D11). Species fields are derived and listed for all 30 (D12). One fixed trait per species (D13).
- Six rivals and a 17-battle story table in the Creative Director's order (D1, D4). Odile's fight has two phases (D22).
- Trainer XP bonus applies to mandatory battles only, quest money is cut, optional trainers have at most 3 kin from ch5, and wild creatures must be at or above their evolution level (D23).
- Second-type moves are added to the f06–f10 learnsets. `AIView` gets its own `rngAIState`.
- The move table (m000–m100) keeps its v1 format and ids.

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

Starter triangle (f01 electric / f02 fire / f03 water): water→fire 2, fire→electric 2, electric→water 2; reverse directions are ½ (fire→water, electric→fire) and 1 (water→electric). The rival always takes the starter that is strong against the player's (section 14.2).

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

### 2.1 Species inputs and derived fields
Base stats (`hp, atk, def, spa, spd, spe`, integers 20–140) come from creatures.md v2, including the four D12 fixes: c20 395, c12 505, c21 505, c30 535. Base-stat-total (BST) bands: stage 1 280–320, stage 2 395–435, stage 3 505–535; starters exactly 310 / 405 / 525. All 30 species are inside the bands.

The following fields are **derived by systems** (content build computes them; the validator recomputes and compares; never hand-entered):
- `catchRate`: stage 1 = 190, stage 2 = 90, stage 3 = 45. Starter families (f01–f03) = 45 at every stage.
- `xpYield` (Y): stage 1 = floor(BST/5), stage 2 = floor(BST/3), stage 3 = floor(BST×4/9).
- `growth` per family: f01 medium, f02 medium, f03 medium, f04 fast, f05 slow, f06 medium, f07 fast, f08 medium, f09 slow, f10 slow.
- `trait`: one per species (section 10, mapping from the Creature Art Director review, D13).

| id | family | stage | types (creatures.md) | BST | catchRate | Y | growth | trait |
|---|---|---|---|---|---|---|---|---|
| c01 | f01 | 1 | electric | 310 | 45 | 62 | medium | `tr_last_stand` |
| c02 | f01 | 2 | electric | 405 | 45 | 135 | medium | `tr_last_stand` |
| c03 | f01 | 3 | electric · gale | 525 | 45 | 233 | medium | `tr_static_hide` |
| c04 | f02 | 1 | fire | 310 | 45 | 62 | medium | `tr_last_stand` |
| c05 | f02 | 2 | fire | 405 | 45 | 135 | medium | `tr_last_stand` |
| c06 | f02 | 3 | fire · stone | 525 | 45 | 233 | medium | `tr_reckless` |
| c07 | f03 | 1 | water | 310 | 45 | 62 | medium | `tr_last_stand` |
| c08 | f03 | 2 | water | 405 | 45 | 135 | medium | `tr_last_stand` |
| c09 | f03 | 3 | water · frost | 525 | 45 | 233 | medium | `tr_frost_hide` |
| c10 | f04 | 1 | verdant | 290 | 190 | 58 | fast | `tr_early_riser` |
| c11 | f04 | 2 | verdant · toxin | 395 | 90 | 131 | fast | `tr_toxic_skin` |
| c12 | f04 | 3 | verdant · toxin | 505 | 45 | 224 | fast | `tr_regrowth` |
| c13 | f05 | 1 | stone | 300 | 190 | 60 | slow | `tr_sturdy_core` |
| c14 | f05 | 2 | stone | 410 | 90 | 136 | slow | `tr_thorned` |
| c15 | f05 | 3 | stone · electric | 505 | 45 | 224 | slow | `tr_charge_sink` |
| c16 | f06 | 1 | frost | 310 | 190 | 62 | medium | `tr_frost_hide` |
| c17 | f06 | 2 | frost | 420 | 90 | 140 | medium | `tr_snow_coat` |
| c18 | f06 | 3 | frost · lumen | 520 | 45 | 231 | medium | `tr_clear_mind` |
| c19 | f07 | 1 | gale | 285 | 190 | 57 | fast | `tr_small_strikes` |
| c20 | f07 | 2 | gale · verdant | 395 | 90 | 131 | fast | `tr_keen_focus` |
| c21 | f07 | 3 | gale · verdant | 505 | 45 | 224 | fast | `tr_keen_focus` |
| c22 | f08 | 1 | toxin | 300 | 190 | 60 | medium | `tr_toxic_skin` |
| c23 | f08 | 2 | toxin · water | 405 | 90 | 135 | medium | `tr_tide_sink` |
| c24 | f08 | 3 | toxin · water | 505 | 45 | 224 | medium | `tr_menace` |
| c25 | f09 | 1 | shade | 315 | 190 | 63 | slow | `tr_fog_veil` |
| c26 | f09 | 2 | shade | 425 | 90 | 141 | slow | `tr_quick_feet` |
| c27 | f09 | 3 | shade · fire | 530 | 45 | 235 | slow | `tr_flame_sink` |
| c28 | f10 | 1 | lumen | 320 | 190 | 64 | slow | `tr_regrowth` |
| c29 | f10 | 2 | lumen | 430 | 90 | 143 | slow | `tr_keen_focus` |
| c30 | f10 | 3 | lumen · shade | 535 | 45 | 237 | slow | `tr_resonant` |

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
2. Critical: ×3/2.
3. Random: `R = rng.int(85,100)`, ×R/100.
4. Same-type bonus (STAB): ×3/2 if move type ∈ attacker's types (`tr_adaptive`: ×2).
5. **Resonance:** ×11/10 if `attunedType ≠ null` and move type = attunedType (×6/5 instead if the attacker has `tr_resonant`). Applies to both sides, wild and trainer (D3).
6. Type effectiveness: ×k1·k2/4 (section 1.4).
7. Burn (physical move, attacker burned): ×1/2. Frostbite (special move, attacker frostbitten): ×1/2.
8. Trait modifiers in this order: `tr_last_stand` ×3/2, `tr_flame_sink` boost ×3/2, defender `tr_thick_fur` ×1/2.
9. If effectiveness > 0 and result < 1 → 1. If effectiveness = 0 → 0 and "no effect" (no secondary effects).
10. Damage is capped at the defender's currentHp for the HP change (drain and recoil use the capped value).

Multi-hit (m035): each hit runs steps 2–8 independently (a fresh crit roll and random roll per hit); accuracy is rolled once.
The RNG draw order is unchanged from v1 (6.2): crit roll before the damage roll.

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
Display names and 3-letter HUD codes (D8) are shown next to an icon with a unique shape, so status is never shown by color alone. Internal ids are unchanged.

| id | Display (code) | Effect | Timing | Immune |
|---|---|---|---|---|
| `burn` | *Scorch* (SCH) | Physical damage dealt ×1/2 (step 7). Loses floor(maxHp/16) (min 1). | End-of-turn step 3 | fire types; `tr_flame_sink` |
| `poison` | *Blight* (BLT) | Loses floor(maxHp/8) (min 1). | End-of-turn step 3 | toxin and stone types |
| `paralysis` | *Jolt* (JLT) | effSpe ×1/2; before acting `rng.chance(25)` → loses action ("is locked up"). | Action check | electric types; `tr_charge_sink` |
| `sleep` | *Drowse* (DRW) | Cannot act. On apply: `counter = rng.int(1,3)`. On each action attempt: if counter = 0 → wakes, status cleared, acts this turn; else counter −1 (−2 with `tr_early_riser`, floor 0) and action lost. Counter persists across switching. | Action check | none |
| `frostbite` | *Rimebite* (RMB) | Special damage dealt ×1/2 (step 7). Loses floor(maxHp/16). Cannot be inflicted in sunlight. | End-of-turn step 3 | frost types |

Out of battle: burn, poison and frostbite do **not** deal overworld damage (no field attrition). All statuses are cured at healing centers (Hearthrests).
Secondary-effect status chance is rolled only if the move hit, dealt > 0 damage, the target has not fainted, has no major status and is not immune. Status moves (100% infliction) fail with a message if the target already has a status or is immune. A status move whose type has effectiveness 0 against the target (e.g. m073 vs stone) fails.

### 4.2 Volatile conditions (cleared on switch-out and battle end)
| id | Source | Effect |
|---|---|---|
| `dizzy` (display *Muddled*) | m084 (100%), m096 (10%), m070 (30%) | On apply `counter = rng.int(2,4)`. Each action attempt: counter −1; if now 0 → "snaps out", acts normally. Else `rng.chance(33)` → hits itself: typeless physical power 40 using own atk vs own def, no crit, random applied, no STAB/Resonance/weather; action lost. Cannot be re-applied while dizzy (move fails). |
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
- Each battle receives `attunedType: TypeId | null` from its zone (D1; creative_direction §1.2):

| Zone | attunedType | Zone | attunedType |
|---|---|---|---|
| route_1 | lumen | lake | water |
| forest | verdant | route_4 | gale |
| route_2 | stone | volcano | fire |
| cave | electric | route_5 | shade |
| route_3 | toxin | snowpeak | frost |
| towns, league, non-hall interiors | null | trial halls `trial_1..6` | Cantor type: verdant, stone, water, gale, fire, frost |

- `null` = **Silenced**: no bonus, and the HUD shows "Attunement: Silenced". Story-silenced zones (route_3 until its stone is restored in ch5; route_5 until `flag_nullbell_broken`) pass `null`, as does Odile's phase A (section 14.3).
- Effect: damaging moves of the attuned type ×11/10 at damage step 5 (×6/5 with `tr_resonant`), for both sides. Status moves are unaffected.
- HUD pill: `[glyph] Attuned: <Type> ×1.1` (text label + glyph, not color alone). The `damage` event carries `attuned: true`.
- Weather: attunement does not change battle weather rules. The Creative Director's proposed weather bias (fire→heat, water→rain, frost→snow) is applied to the overworld weather tables by the World Designer. "heat" maps to battle `sunlight`. There is no `wind` weather in battle.

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
   1b. **Trainer phase hook (D22):** if the opposing trainer record has `phases` and the count of its fainted creatures equals the next phase's `trigger.faintedCount`, emit `phaseChange{phase, attunedType}`, set `attunedType` to that phase's value, and make that phase's team the AI's bench. This happens before the AI picks a replacement. Player state carries over (no heal); turn number, weather and weariness continue.
   2. If a side has no non-fainted creatures, battle ends. If **both** sides are out in the same turn, the player wins.
   3. Replacement: AI picks its replacement first (normal: next party slot; hard: 10.4) without knowledge of the player's pick; then, if the player's active fainted, the player must pick a replacement (cannot cancel). In wild battles the prompt also offers "Flee", which always succeeds. Both enter; entry traits in effSpe order.

### 6.1 Run formula (wild battles; trainer battles: Run is disabled with a message)
`attempts` counts this battle's run tries including the current one.
- If player effSpe ≥ wild effSpe → success.
- Else chance = clamp(floor(100 × playerSpe / wildSpe) − 10 + 20 × (attempts − 1), 30, 100); success iff `rng.chance(chance)`.
- `tr_*`: none affect running in v1. Failed run consumes the turn.

### 6.2 RNG streams and draw order
- `rngBattle` = seeded from `battleSeed`; `rngAI` = seeded from `battleSeed XOR 0x9E3779B9`, stored as `BattleState.rngAIState` (its own four-uint32 state, separate from `rngState`). Rendering, audio and UI never draw from either.
- Draw order within a move: paralysis lock → sleep/dizzy rolls → shield (only if n > 0) → accuracy (only if hit < 100) → crit (only if stage < 3) → damage random → each secondary effect in listed order → sleep/dizzy counter on application.
- Battle replay test: same seed + same player command list ⇒ identical event log.

---

## 7. Capture

### 7.1 Capture devices (Chimes, D10)
| id | Display | Device mult O10 (×1/10) | Price | Sell | First sold |
|---|---|---|---|---|---|
| `i_chime_reed` | Reed Chime | 10 (×1.0) | 200 | 100 | town_1 and every pedlar (5 given at start) |
| `i_chime_brass` | Brass Chime | 15 (×1.5) | 600 | 300 | after trial_1 |
| `i_chime_silver` | Silver Chime | 20 (×2.0) | 1200 | 600 | after trial_3 |
| `i_chime_crown` | Crown Chime | 30 (×3.0) | 2500 | 1250 | after trial_5 (town_3 Chandlery; World Designer may restrict to the league kiosk) |

Crown Chime is the most reliable device, not a guaranteed one. Its flavour text must not promise near-certainty: a full-HP stage 3 at ×3.0 is ≈18%.

### 7.2 Formula
```
M = target maxHp, H = target currentHp, C = catchRate, L = target level
S10 = 20 if sleep; 15 if paralysis, burn, poison, frostbite; 10 otherwise
B20 = 20 + max(0, 15 - L)            (low-level bonus: Lv5 = ×1.5, Lv15+ = ×1.0)
a = floor( (3M - 2H) * C * O10 * S10 * B20 / (3M * 10 * 10 * 20) )
if a >= 255: caught, 3 rings shown, no RNG drawn
else: threshold = RING_TABLE[a] where RING_TABLE[a] = floor(65536 * cbrt(a/255)), precomputed at build time and committed as data
      for k in 1..3: if rng.int(0,65535) >= threshold: fail after (k-1) rings; stop
      all 3 pass: caught
```
Overall catch probability ≈ a/255. Capture is impossible in trainer battles: the Chime is deflected, **not consumed**, turn not spent. (v1 name `SHAKE_TABLE` → `RING_TABLE`; values unchanged.)

### 7.3 Presentation steps (D9: rings, not shakes)
1. Throw: the Chime flies in an arc (600 ms).
2. The Chime opens, a band of light wraps the kin, and the kin dissolves into it (400 ms).
3. The Chime settles and hovers about 0.3 m above the stage (300 ms). It does not rest on the ground and does not wobble.
4. **Rings:** one per passed check (600 ms each). Each ring is a light pulse plus a tone that steps up a scale degree, and the band tightens one notch.
5a. Success: a sustained chord and the bonding light band closes (800 ms). Banner: "{kin} joined your troupe". The encyclopedia registers the kin.
5b. Failure: the band frays at ring (passed+1), and the kin reappears with a small shake-off (500 ms). The Chime is consumed and the player's action is spent; the turn continues (the foe moves, and end-of-turn runs normally).

Event: `captureAttempt{deviceTier, rings: 0..3, success}` (field renamed from `shakes`). Reduced motion: steps 1–4 at 150 ms each; the ring count is also shown as text ("♪ 1… 2…").

### 7.4 Placement after capture (D18)
1. Optional nickname prompt (skippable).
2. If the party (troupe) has < 6 → party.
3. Else if storage (Fosterage) < 300 → storage, with a message that names the box.
4. Else, when the party is 6 **and** storage is 300:
   - Before the throw, choosing a Chime shows "Your Fosterage is full. If this kin joins, you must release one. Ring anyway?" (Yes/No). No returns to the Satchel without spending the turn.
   - After a successful capture, a mandatory prompt appears: **"Release the new kin"** or **"Choose one to release"**. The second option opens the storage picker. Party members are selectable too, unless releasing would leave 0 non-fainted in the party.
   - Double confirmation. Creatures flagged `bond` (the starter) cannot be released.
   - The prompt cannot be dismissed without one of the two outcomes. The save commits only after it resolves.
5. Gift kin (D5: leftover starter at Lv 25, rival's line at Lv 30) never trigger the release prompt. If both party and storage are full, the gift is held pending: its flag is not consumed and the event repeats on next contact.

### 7.5 Worked capture example
Wild stage-2 creature, Lv 18, maxHp M = 55, currentHp H = 20, catchRate C = 90, no status (S10 = 10), `i_chime_brass` (O10 = 15), B20 = 20 + max(0, 15−18) = 20.
- 3M − 2H = 165 − 40 = 125.
- Numerator = 125 × 90 × 15 × 10 × 20 = 33,750,000. Denominator = 165 × 10 × 10 × 20 = 330,000.
- a = floor(102.27) = **102** → p ≈ 40.0%.
- threshold = RING_TABLE[102] = floor(65536 × cbrt(102/255)) = floor(65536 × 0.73681) = **48287**.
- Example rolls: 12050 < 48287 pass (ring 1); 40111 pass (ring 2); 51930 ≥ 48287 fail. The band frays after 2 rings, and the Chime is consumed.
- Same target with other Chimes: `i_chime_reed` a = 68 (26.7%), `i_chime_silver` a = 136 (53.3%), `i_chime_crown` a = 204 (80.0%). Asleep with `i_chime_brass`: a = 204 (80%).
- Early-game check: Lv 5 stage 1 (C = 190, M = 20), `i_chime_reed`, B20 = 30.
  - At full HP (H = 20): 3M − 2H = 20 → a = floor(20×190×10×10×30 / (60×10×10×20)) = 95 → ≈37%.
  - At H = 5: 3M − 2H = 50 → a = 237 → ≈93%.

## 8. Experience, levels, evolution, moves

### 8.1 XP award (per fainted foe)
```
T = 3/2 if the battle is against a trainer whose record has mandatory: true; 1 otherwise (optional trainers, wild)   (Tn/Td)
S = clamp((2*Lf + 10) / (Lf + Lp + 10), 1/2, 3/2)   Lf = foe level, Lp = recipient level  (Sn/Sd)
XP = max(1, floor( floor(Y * Lf / 7) * Tn * Sn / (Td * Sd) ))
```
`mandatory: true` covers all 17 story battles (section 14), Cadence Hall juniors that block the hall path, and faction grunts that block a path. All other trainers are optional (D23).
- Recipients: every non-fainted party member.
- **Participants** (active at any time while this foe was on the field) receive 100%.
- Non-participants receive `floor(XP/2)` ("shared lessons": built in, no item needed; core anti-grind rule).
- Fainted creatures receive 0.
- Captured creatures give the same XP to recipients as if defeated.
- Level 60 creatures receive none.

### 8.2 Level curves (cumulative XP required to be at level L; XP(1) = 0)
| Curve | Formula | Lv 5 | Lv 10 | Lv 20 | Lv 30 | Lv 40 | Lv 50 | Lv 60 |
|---|---|---|---|---|---|---|---|---|
| fast | floor(4·L³/5) | 100 | 800 | 6,400 | 21,600 | 51,200 | 100,000 | 172,800 |
| medium | L³ | 125 | 1,000 | 8,000 | 27,000 | 64,000 | 125,000 | 216,000 |
| slow | floor(5·L³/4) | 156 | 1,250 | 10,000 | 33,750 | 80,000 | 156,250 | 270,000 |

Multiple level-ups from one award are processed one level at a time (stat recompute, move prompts per level).

Sanity model (estimate): XP per foe at equal level ≈ Y·L/7·T. Foes needed per level ≈ 21L/(Y·T). With campaign-average Y·T ≈ 180, Lv 5→50 on the medium curve needs ≈ 145 foe-defeats for the lead; the campaign plan in sections 12.5/14 contains ≈ 150 trainer creatures plus optional wild battles, and the S factor (up to ×1.5) pulls under-levelled members up. Slow families end ~2 levels below medium ones; acceptable.

### 8.3 Evolution (levels confirmed by D11)
| Family | Stage 1→2 | Stage 2→3 | Evolution move (learned on evolving) |
|---|---|---|---|
| f01 electric | Lv 16 | Lv 34 | st2 m025, st3 m055 |
| f02 fire | Lv 16 | Lv 34 | st2 m004, st3 m048 |
| f03 water | Lv 16 | Lv 34 | st2 m016, st3 m047 |
| f04 verdant | Lv 16 | Lv 32 | st2 m035, st3 m047 |
| f05 stone | Lv 20 | Lv 36 | st2 m045, st3 m004 |
| f06 frost | Lv 22 | Lv 38 | st2 m055, st3 **m096** (lumen, second type) |
| f07 gale | Lv 14 | Lv 30 | st2 m066, st3 m069 |
| f08 toxin | Lv 18 | Lv 34 | st2 m076, st3 m036 |
| f09 shade | Lv 24 | Lv 40 | st2 m087, st3 m089 |
| f10 lumen | Lv 26 | `i_evo_prism` (*Dawn Prism*, any level) **or** Lv 44 | st2 m097, st3 **m088** (shade, second type) |

Rules:
- Level evolution checks run at battle end for each creature whose level ≥ threshold. Evolutions are queued, one scene per creature (the scene is called *Crescendo*).
- The player may cancel (hold Cancel during the scene). A cancelled or deferred creature shows "Ready to evolve" in the party menu and can evolve from there at any time outside battle, so no re-grind is needed.
- Item evolution: use `i_evo_prism` from the Satchel on a stage-2 f10 creature outside battle. The item is consumed.
- Evolution preserves uid, nickname, level, XP, potentials, temperament, moves (charges kept) and status. The species changes and stats are recomputed; `currentHp += maxHp delta`. The evolution move is learned if the creature has < 4 moves; otherwise the replacement flow (8.4) runs.
- Gifts (D5) arrive at stage 1 above their evolution level: the leftover starter at Lv 25 and the rival's line at Lv 30. They are immediately "Ready to evolve", so the encyclopedia registers stage 1 first.

### 8.4 Move learning and replacement flow
On reaching level L, for each learnset entry at exactly L (in table order): already known → skip; < 4 moves → learn (full charges); else prompt: "Learn X?" → pick one of the 4 to forget (shows both moves' type/power/accuracy/charges/effect) or "Don't learn" (confirm). Forgetting is final but see **Recall**: every healing center offers free Recall — relearn any learnset move with level ≤ current level, or any evolution move of current/prior stage, via the same replacement flow.
Wild/trainer default moveset: the last 4 distinct learnset moves with level ≤ its level (evolution moves count at the evolution level).

### 8.5 Teaching discs (*Etudes*)
- Discs (`i_disc_01..18`, displayed as "Etude: <move>") are **reusable**: never consumed, kept in the key pocket, and cannot be sold (sell 0).
- Compatibility: a species can learn a disc's move if any of these holds:
  - the move type is one of the species' types;
  - the move type is in its family's `discCoverage` list (section 11.2);
  - the disc is flagged universal (`i_disc_11` only).
- Teaching uses the replacement flow. The disc list is in section 12.2.

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
Reduced motion: creature clip durations are unchanged (rendering §4.5). VFX particle lifetimes ×0.5, particle counts ×0.5, no camera shake. Division of labour (CAD review SY-6): the move `anim` owns root travel and the VFX envelope. Species `attack`/`attack_special` clips animate in place, and the presenter aligns their `contact` marker to `impactMs`. Clip mapping: melee_lunge, melee_sweep, charge_rush, dash_through, multi_hit_flurry, ground_wave → `attackPhysical`; projectile_bolt, projectile_arc, beam, burst_area, rain_down → `attackSpecial`; debuff_cloud, aura_self, shield, heal_glow, weather_call → `attackStatus`.

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

Each species has exactly one fixed trait (D13). There are no hidden or alternate traits and no per-individual rolls. The canonical list below is the only set implementable in v1; the species→trait mapping is the Creature Art Director's (review CAD §2.2) and is reproduced in section 2.1 and below. Display names are original and owned by the Creative Director; fixed so far: `tr_reckless` → *Headlong*, `tr_sturdy_core` → *Keystone Core*. The trait is visible on the battle HUD and in the encyclopedia.

| id | Trigger | Exact effect |
|---|---|---|
| `tr_last_stand` | currentHp ≤ floor(maxHp/3) | Moves of the user's **primary** type ×3/2 (damage step 8). |
| `tr_resonant` | move type = zone attunedType (not null) | Resonance ×6/5 instead of ×11/10 (D3). |
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

Species mapping (D13, 20 distinct ids used):

| Family | Stage 1 | Stage 2 | Stage 3 |
|---|---|---|---|
| f01 | c01 `tr_last_stand` | c02 `tr_last_stand` | c03 `tr_static_hide` |
| f02 | c04 `tr_last_stand` | c05 `tr_last_stand` | c06 `tr_reckless` |
| f03 | c07 `tr_last_stand` | c08 `tr_last_stand` | c09 `tr_frost_hide` |
| f04 | c10 `tr_early_riser` | c11 `tr_toxic_skin` | c12 `tr_regrowth` |
| f05 | c13 `tr_sturdy_core` | c14 `tr_thorned` | c15 `tr_charge_sink` |
| f06 | c16 `tr_frost_hide` | c17 `tr_snow_coat` | c18 `tr_clear_mind` |
| f07 | c19 `tr_small_strikes` | c20 `tr_keen_focus` | c21 `tr_keen_focus` |
| f08 | c22 `tr_toxic_skin` | c23 `tr_tide_sink` | c24 `tr_menace` |
| f09 | c25 `tr_fog_veil` | c26 `tr_quick_feet` | c27 `tr_flame_sink` |
| f10 | c28 `tr_regrowth` | c29 `tr_keen_focus` | c30 `tr_resonant` |

Unused in v1 but kept in the canonical list for future species: `tr_ember_hide`, `tr_rain_glide`, `tr_sun_bask`, `tr_shed_status`, `tr_adaptive`, `tr_thick_fur`. Balance gate: no stage-1 creature may have `tr_adaptive`.

Interaction notes:
- c15 `tr_charge_sink` is stone·electric, so it absorbs electric moves and is immune to paralysis (it is already electric-typed).
- c27 `tr_flame_sink` is shade·fire, so it is immune to burn by both its type and the trait.
- c30 `tr_resonant` has no effect in Silenced zones.

---

## 11. Learnsets

Rule: one learnset table **per family**, shared by all three stages (a creature learns by its current level regardless of stage). Evolution moves (8.3) are learned on evolving. Lv 1 moves are known on creation; starters are created at Lv 5 knowing the two Lv 1 moves. Every family has, by Lv 25, at least two STAB damaging moves (one ≥ 65 power), one coverage type hitting at least one of its weaknesses, and one status/utility move. **v2:** every family learns at least one damaging move of its second type at or after the stage that gains that type. Most of these arrive within 4 levels; the exception is f05 (stone·electric at stage 3), which already has electric moves from Lv 14.

Format: `Lv: move` (★ = evolution move).

| Family | Learnset |
|---|---|
| **f01 electric** | 1: m021, 1: m022, 7: m062, 10: m024, 13: m063, ★16: m025, 20: m026, 24: m027, 28: m065, 32: m028, ★34: m055, 38: m029, 43: m030, 48: m070 |
| **f02 fire** | 1: m002, 1: m001, 7: m041, 10: m006, 13: m021, ★16: m004, 20: m005, 24: m003, 28: m038, 32: m007, ★34: m048, 36: m027, 38: m009, 42: m008, 47: m010 |
| **f03 water** | 1: m012, 1: m011, 6: m052, 8: m015, 13: m013, ★16: m016, 20: m014, 24: m056, 28: m019, 32: m017, ★34: m047, 38: m018, 42: m058, 47: m020 |
| **f04 verdant** | 1: m031, 1: m032, 5: m033, 9: m071, 12: m034, ★16: m035, 19: m036, 21: m044, 23: m075, 27: m037, ★32: m047, 35: m038, 39: m039, 44: m040, 48: m078 |
| **f05 stone** | 1: m041, 1: m043, 6: m042, 10: m044, 14: m021, 18: m046, ★20: m045, 24: m027, 28: m047, 32: m048, ★36: m004, 40: m050, 45: m049, 50: m030 |
| **f06 frost** | 1: m051, 1: m052, 6: m053, 10: m015, 14: m054, 18: m056, ★22: m055, 26: m057, 30: m065, 34: m058, ★38: m096, 40: m019, 42: m059, 44: m099, 47: m060 |
| **f07 gale** | 1: m062, 1: m061, 5: m064, 9: m063, 13: m081, ★14: m066, 17: m035, 18: m065, 22: m068, 26: m086, 27: m038, ★30: m069, 34: m067, 38: m097, 43: m088, 48: m070 |
| **f08 toxin** | 1: m071, 1: m072, 6: m073, 10: m082, 14: m075, ★18: m076, 20: m015, 22: m074, 26: m077, 30: m033, ★34: m036, 36: m019, 38: m078, 42: m088, 46: m079, 50: m080 |
| **f09 shade** | 1: m081, 1: m082, 6: m085, 10: m083, 14: m084, 18: m072, 21: m086, ★24: m087, 28: m088, 32: m076, 36: m056, ★40: m089, 42: m005, 44: m058, 46: m007, 48: m090 |
| **f10 lumen** | 1: m091, 1: m092, 6: m093, 10: m094, 14: m061, 18: m096, 22: m095, ★26: m097, 30: m065, 34: m098, 38: m099, 42: m005, ★(st3): m088, 46: m007, 50: m100 |

Second-type moves (types from creatures.md §0):

| Family | Second type (from stage) | Second-type moves in learnset |
|---|---|---|
| f01 | gale (st3, Lv 34) | m062 (7), m063 (13), m065 (28), m070 (48) |
| f02 | stone (st3, Lv 34) | m041 (7), m048 (★34) |
| f03 | frost (st3, Lv 34) | m052 (6; D30: early answer to verdant trial_1), m056 (24), m058 (42) |
| f04 | toxin (st2, Lv 16) | m071 (9), m075 (23), m078 (48) |
| f05 | electric (st3, Lv 36) | m021 (14), m027 (24), m030 (50) |
| f06 | lumen (st3, Lv 38) | **m096 (★38), m099 (44)** (new in v2) |
| f07 | verdant (st2, Lv 14) | **m035 (17), m038 (27)** (new in v2) |
| f08 | water (st2, Lv 18) | **m015 (20), m019 (36)** (new in v2) |
| f09 | fire (st3, Lv 40) | **m005 (42), m007 (46)** (new in v2) |
| f10 | shade (st3, prism or Lv 44) | **m088 (★st3)** (new in v2) |

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

Item ids follow D10 and `src/data/content/items.json`. Display names shown are those in items.json (working; the Creative Director may rename). Sell value = floor(price/2) unless stated. "Not sold" items appear only as pickups or rewards (World Designer places them).

### 12.1 Consumables
| id | Display | Effect | Price | First sold |
|---|---|---|---|---|
| `i_salve_1` | Honey Salve | restore 20 HP | 200 | town_1 |
| `i_salve_2` | Clover Salve | restore 60 HP | 500 | after trial_1 |
| `i_salve_3` | Ember-root Salve | restore 150 HP | 1000 | after trial_3 |
| `i_salve_4` | Hearth Balm | restore all HP | 2000 | after trial_5 |
| `i_cure_burn` / `i_cure_poison` / `i_cure_para` / `i_cure_sleep` / `i_cure_frost` | Cooling Moss / Bitterleaf / Loosening Oil / Waking Bell / Warm Wrap | cure Scorch / Blight / Jolt / Drowse / Rimebite | 150 each | town_1 |
| `i_cure_all` | Tuning Tonic | cure any major status and Muddled | 450 | after trial_2 |
| `i_revive_1` | Kindling Spark | revive a fainted kin at floor(maxHp/2) | 1200 | after trial_2 |
| `i_revive_2` | Rekindle Draught | revive at full HP | not sold (sell 1000) | — |
| `i_charge_1` | Rosin Cake | +10 charges to one move | 600 | after trial_2 |
| `i_charge_2` | Rosin Block | all moves of one kin to full charges | not sold (sell 800) | — |
| `i_hush_1` | Hush Incense | wild kin do not initiate contact for 200 m walked (they still roam; the player can still touch them to battle) | 300 | after trial_1 |
| `i_hush_2` | Deep Hush Incense | same, 400 m | 500 | after trial_3 |
| `i_thread` | Homeward Thread | outside battle, in forest, cave, lake, volcano, snowpeak, routes and non-hall interiors: return to the last Hearthrest | 400 | town_1 |
| `i_evo_prism` | Dawn Prism | f10 stage 2 → stage 3 (8.3) | 3000 (town_3 only) | also one guaranteed pickup before Lv 44 is typical (World Designer) |
| `i_chime_*` | Chimes | capture devices (7.1) | 200 / 600 / 1200 / 2500 | 7.1 |

`src/data/content/items.json` must rename `i_repel_1/2` → `i_hush_1/2` and `i_escape` → `i_thread` (D10).
Battle usage: HP, cure and revive items target a party member (revive only a fainted one; the others only non-fainted ones). Using an item consumes the player's action. Out of battle, everything except Chimes and the Thread is usable from the Satchel.

### 12.2 Teaching discs (Etudes; reusable, cannot be sold)
Sources follow the D1 trial order. Each trial reward matches the Cantor's type where a reward disc of that type exists. The World Designer places secrets.

| id | Move | Source | Price |
|---|---|---|---|
| i_disc_01 | m005 Heat Ribbon | shop town_2 | 2000 |
| i_disc_02 | m019 Deluge Beam | **trial_3 (water) reward** | — |
| i_disc_03 | m025 Arc Lash | shop town_1 (after trial_1) | 1500 |
| i_disc_04 | m036 Draining Bloom | **trial_1 (verdant) reward** | — |
| i_disc_05 | m044 Rock Tumble | **trial_2 (stone) reward** | — |
| i_disc_06 | m055 Sleet Spray | shop town_2 | 2000 |
| i_disc_07 | m065 Razor Draft | **trial_4 (gale) reward** | — |
| i_disc_08 | m075 Sludge Lob | shop town_2 | 2000 |
| i_disc_09 | m088 Umbral Pulse | Admin Vey 2 reward (ch8) | — |
| i_disc_10 | m096 Prism Ray | Gleam secret or side quest | — |
| i_disc_11 | m045 Bulwark (**universal**) | shop town_1 | 1500 |
| i_disc_12 | m024 Buzz Field | shop town_2 | 1500 |
| i_disc_13 | m048 Quake Stomp | cave lower galleries (Heave secret) | — |
| i_disc_14 | m058 Rime Beam | **trial_6 (frost) reward** (v2: no longer sold; items.json price → null) | — |
| i_disc_15 | m028 Stormcoil Bolt | side quest reward (ch7 town_3) | — |
| i_disc_16 | m007 Kiln Blast | **trial_5 (fire) reward** (v2: no longer sold; items.json price → null) | — |
| i_disc_17 | m086 Night Rake | Veil secret (after trial_4) | — |
| i_disc_18 | m094 Radiant Mend | Kinsong survey milestone (Marra Aske) | — |

### 12.3 Key items
`i_keynote_1..6` (Moss, Slate, Mere, Vane, Forge, Rime Keynotes; each unlocks one register: 1 Heave, 2 Seep, 3 Gust, 4 Veil, 5 Rime, 6 Gleam; D2) and `i_key_ledger` (Tuning Ledger: quest log, Keynote display, map/fast travel). Key items cannot be sold, dropped or used up.

### 12.4 Money sources
- Starting money 1000 tallies (◇). Wild battles give no money.
- Trainer payout on victory = `classBase × (highest level in the trainer's team)`.

| Trainer class | classBase |
|---|---|
| youth / novice | 16 |
| regular route trainer, Cadence Hall junior (ch1–8) | 24 |
| veteran, Cadence Hall junior (ch9+) | 36 |
| Stillmark surveyor (grunt) | 20 |
| Stillmark admin (Brann, Vey) | 60 |
| Magister Odile | 80 |
| rival (Cass) | 40 |
| Cantor (trial leader) | 100 |
| the Concordant (champion) | 200 |

- Quest money (D23): main-quest money = world.md v1 amounts ×1/4, and the final quest pays 0 (the game ends there). Side-quest money = world.md v1 amounts ×1/2. Coin pouches are unchanged. World Designer v2 applies these values.
- Wipe penalty: see 15.1. Money is capped at 999,999 and is never negative.

### 12.5 Income vs spending per chapter (estimate; not measured)
Assumptions: the Creative Director's 12 chapters; trainer counts as listed (World Designer v2 re-slots its ≈74 trainers onto these chapters; ±20% does not break the budget); optional trainers from ch5 have ≤ 3 kin (D23); quest money after the D23 cuts, including pouches.

| Ch | Zones | Trainers (story battles) | Trainer income | Quest + pouch money | Typical purchases | Spend | Balance after |
|---|---|---|---|---|---|---|---|
| 1 | town_1, route_1 | 4 (R1) | 440 | 450 | 4 Reed, 3 salve_1 | 1,400 | 490 (from 1,000) |
| 2 | forest | 9 (trial_1) | 2,592 | 200 | 3 Reed, 3 salve_1 | 1,200 | 2,082 |
| 3 | route_2, town_2 | 9 (R2, trial_2) | 4,764 | 1,925 | 2 Brass, 2 salve_2, i_disc_03, 2 cures | 4,000 | 4,771 |
| 4 | cave | 6 (Brann) | 3,328 | 1,750 | 3 Brass, 3 salve_2, Thread | 3,700 | 6,149 |
| 5 | route_3 | 7 (Vey 1, R3) | 4,792 | 1,625 | 4 Brass, 2 salve_2, revive, cure_all | 5,050 | 7,516 |
| 6 | lake | 7 (trial_3) | 6,100 | 1,675 | 3 Silver, i_disc_06 | 5,600 | 9,691 |
| 7 | town_3 | 5 (trial_4) | 5,736 | 1,250 | 3 Silver, 3 salve_3 | 6,600 | 10,077 |
| 8 | route_4, Stillhouse | 9 (Vey 2, R4) | 8,092 | 0 | 2 Silver, 3 salve_3, 2 revive | 7,800 | 10,369 |
| 9 | volcano | 6 (trial_5) | 10,072 | 3,125 | 3 Silver, 3 salve_3, 2 hush_2, i_disc_08 | 9,600 | 13,966 |
| 10 | route_5 | 5 (R5) | 7,216 | 0 | 2 Crown, 3 salve_3 | 8,000 | 13,182 |
| 11 | snowpeak | 9 (trial_6, Odile) | 17,532 | 3,375 | 2 Crown, 2 salve_4, 2 revive | 11,400 | 22,689 |
| 12 | league | 4 (R6, champion) | 15,232 (5,232 before the champion) | 0 | 5 salve_4, 3 revive, 2 cure_all | 14,500 | 23,421 |

D30 note: the story-level cuts (14.2) lower payouts by 1,140 in total (R1 −80, R2 −80, trial_3 −100, trial_4 −200, R5 −120, trial_6 −400, R6 −160); the table above is not re-derived, and every chapter still ends positive.

Conclusions:
- Every chapter ends with a positive balance and no extra battles.
- Pre-champion funds are 22,689 + 5,232 = 27,921, which covers the ch12 purchases.
- Hearthrests heal for free, so purchases are convenience, not survival.
- Late-game money is plentiful by design (spare Crown Chimes, the Dawn Prism). The quest-money cut keeps early and mid-game purchases meaningful.
- The free-Chime rule (15.3) covers a player who overspends.

## 13. AI

### 13.1 Information rule (all levels)
The AI function signature is `chooseAction(view: AIView, rngAI) → Action`, where `view = toAIView(state)` is a pure projection and `rngAI` is restored from `BattleState.rngAIState`. `AIView` contains: the AI's own full team state; the player's **active** creature's species, types, level, currentHp/maxHp, status, volatiles, stat stages and trait (visible); weather, turns remaining, attunedType, turn number; the player's moves **revealed** so far this battle (used at least once); the count of the player's non-fainted creatures. It contains **no** field for the player's pending command, the player's unrevealed moves, the player's bench identities, potentials or temperament. The AI's choice is computed before the player's command is read and uses only `rngAI`, so the player's input cannot influence it. For damage estimates the AI assumes the player creature has potential 8 in every stat and `tm_steady`.

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
| **Normal** | route trainers, hall juniors, grunts, rival R1–R2 | highest score; with `rngAI.chance(25)` instead pick uniformly among moves scoring ≥ 60% of the max | never voluntarily | holds 0–1 `i_salve_*` (trainer data); uses it when own HP ≤ 20% and `rngAI.chance(50)`, once per battle | next party slot | 6 all stats, `tm_steady` (rival always 12) |
| **Hard** | Cantors, admins, Odile, rival R3–R6, champion | highest score; ties → `rngAI` uniform; +30 to priority moves if the AI estimates it will be KO'd before acting (player effSpe > AI effSpe and a revealed player move's est ≥ AI HP) | see 13.4 | holds up to 2 heal items + 1 `i_cure_all`, never of a tier above what the chapter's shop sells (12.1; D30); heals when HP ≤ 25% and no move scores KO; uses cure_all on sleep/paralysis/frostbite if it is the last creature | best matchup (13.4) | 12 (Cantors, admins, rival), 13 (Odile), 15 (champion); temperaments data-defined |

### 13.4 Hard AI switching and matchup
`matchup(c) = max over c's damaging moves of effectiveness vs player's active types (as ×4 integer) − max over player's revealed damaging moves' types (if none revealed: player's own types, as STAB proxies) of effectiveness vs c's types`.
Voluntary switch at command time iff all hold: best move score < 25; active HP > 25%; a benched non-fainted creature has `matchup ≥ matchup(active) + 4` (i.e. one full effectiveness step better); fewer than 2 voluntary switches so far this battle; the AI did not switch last turn. Picks the highest matchup (ties: party order). Replacement after a faint: highest matchup, ties party order.

---

## 14. Difficulty progression

### 14.1 Legality rules for trainer and wild teams (D23)
- **Wild:** a wild creature of stage k ≥ 2 must have level ≥ its family's stage (k−1)→k evolution level (8.3). The content validator rejects violations. f10 stage 3 counts as Lv 44.
- **Trainers:** the same rule, with one exception: in the 17 story battles, a stage-k creature may be up to 4 levels below its threshold (for example the trial_1 ace c11 at Lv 12, threshold 16).
- Trainer movesets: by default the last 4 learnset moves with level ≤ the creature's level (8.4). Trainer data may override with any move from the family learnset (level ≤ current + 5) or a disc the family can learn.

### 14.2 The 17 story battles (D1, D4, D22)
RS = the rival's starter line, which is strong against the player's (Water > Fire > Electric > Water):

| Player picks | Rival line (RS) | RS1 / RS2 / RS3 |
|---|---|---|
| f01 (c01) | f02 | c04 / c05 / c06 |
| f02 (c04) | f03 | c07 / c08 / c09 |
| f03 (c07) | f01 | c01 / c02 / c03 |

"Recommended ace" = a comfortable level for the player's strongest kin. "Model party avg" = party-average level before the battle from the XP model in 14.4. All `mandatory: true`.

| # | Ch | Battle (trainer id) | Zone (attunedType) | Team: species Lv | AI | Recommended ace | Model party avg |
|---|---|---|---|---|---|---|---|
| 1 | 1 | Rival 1 `t_rival_1` | town_1 (null) | RS1 3 (potential 6, no item) | Normal | 5 | 5 |
| 2 | 2 | Cantor Wren Mossgrave `t_cantor_1` | trial_1 (verdant) | c10 10, c13 11, **c11 12** | Hard | 12 | 11 |
| 3 | 3 | Rival 2 `t_rival_2` | route_2 (stone) | c20 12, **RS2 14** | Normal | 14 | 14 |
| 4 | 3 | Cantor Dorran Shale `t_cantor_2` | trial_2 (stone) | c13 15, c22 16, **c14 17** | Hard | 17 | 14 |
| 5 | 4 | Admin Brann 1 `t_admin_brann_1` | cave (electric) | c22 18, c25 19, **c23 20** | Hard | 20 | 19 |
| 6 | 5 | Admin Vey 1 `t_admin_vey_1` | route_3 (null, silenced) | c25 21, c28 21, **c23 22** | Hard | 22 | 23 |
| 7 | 5 | Rival 3 `t_rival_3` | route_3 (toxin, restored) | c20 21, c14 22, **RS2 23** | Hard | 23 | 24 |
| 8 | 6 | Cantor Nerys Tidewell `t_cantor_3` | trial_3 (water) | c23 22, c17 22, c23 23, **c08 24** | Hard | 24 | 27 |
| 9 | 7 | Cantor Tamsin Galloway `t_cantor_4` | trial_4 (gale) | c20 25, c14 26, c20 27, **c21 28** | Hard | 28 | 29 |
| 10 | 8 | Admin Vey 2 `t_admin_vey_2` | Stillhouse interior (null) | c26 31, c23 31, c29 32, **c26 33** | Hard | 33 | 33 |
| 11 | 8 | Rival 4 `t_rival_4` (1v1; "tag-in" is narrative only) | route_4 (gale) | c21 31, c14 31, c26 32, **RS2 33** | Hard | 33 | 34 |
| 12 | 9 | Cantor Bastian Coalridge `t_cantor_5` | trial_5 (fire) | c05 34, c14 35, c05 35, c15 36, **c06 37** | Hard | 37 | 37 |
| 13 | 10 | Rival 5 `t_rival_5` | route_5 (null, silenced) | c21 35, c15 35, c18 35, c26 36, **RS3 37** | Hard | 37 | 40 |
| 14 | 11 | Cantor Isaure Frostmere `t_cantor_6` | trial_6 (frost) | c17 37, c15 38, c09 39, c18 39, c24 40, **c18 41** | Hard | 41 | 45 |
| 15 | 11 | Magister Odile `t_odile` (two phases, 14.3) | snowpeak summit (A null / B frost) | A: c24 42, c29 43, c26 44 · B: **c27 46** | Hard | 46 | 46 |
| 16 | 12 | Rival 6 `t_rival_6` | league (null) | c21 43, c15 43, c18 43, c27 43, c12 43, **RS3 44** (no heal items) | Hard | 44 | 47 |
| 17 | 12 | The Concordant Rhea `t_champion` | league (null) | c12 45, c24 45, c21 46, c15 46, c18 47, **c30 50** | Hard | 50 | 49 |

Bold = ace (last out). Rival team growth follows creative_direction §2.2: R2 +f07, R3 +f05, R4 +f09, R5 +f06 with the starter at stage 3, R6 six kin. The rival always carries an answer to the typical counter of its starter: c15 (stone·electric) vs water, c14/c15 vs fire, c21 vs electric's stone foes. **Loss rule (D20):** R1 loss continues the story with the troupe healed. Every other story battle uses the wipe rule (15.1) and re-arms. Potentials: rival 12 (R1: 6), Cantors and admins 12, Odile 13, Rhea 15.

**D30 balance tuning pass** (design/reviews/balance_sim.md "Tuning pass"): the levels above are the tuned values (R1, R2, Cantor 3, Cantor 4, R5, Cantor 6, R6 and the champion's non-ace kin were lowered; aces of Cantors 1, 2, 5, the admins, Odile and the champion are unchanged). Story-trainer heal items follow the shop tier of their chapter (13.3): R1 and Cantor 1 none; R2 and Cantor 2 1× `i_salve_1`; Brann 1 and Vey 1 1× `i_salve_2`; R3 2× `i_salve_2`; Cantor 3 1× `i_salve_2`; Cantor 4, Vey 2, R4, Cantor 5, R5, Cantor 6 2× `i_salve_3`; R6 none; Odile and Rhea as 14.3. The "Model party avg" column is the unchanged XP model; the balance simulation measures the whole-troupe average 2–6 levels lower from ch5 (the strongest kin tracks the column; see 14.4).

### 14.3 Odile two-phase battle (D22)
Trainer record `t_odile`:
```
phases: [
  { team: [c24 Lv42, c29 Lv43, c26 Lv44], attunedType: null },
  { team: [c27 Lv46],                      attunedType: "frost", trigger: { faintedCount: 3 } } ]
```
- Phase A is Silenced: no Resonance, and the HUD shows "Attunement: Silenced".
- When her third kin faints, the phase hook (6, step 8.1b) emits `phaseChange`, and the presenter plays the "it's singing" cutscene. `attunedType` becomes frost (×11/10 for frost moves on both sides), and she sends c27.
- The player's troupe is not healed. Weather, turn count and Weariness carry over.
- Hard AI throughout. Items: 2 × `i_salve_4` and 1 × `i_cure_all`, usable across both phases.
- A loss re-arms from phase A.

### 14.4 Chapter bands and expected party curve (estimates, not measured)
The XP model assumes:
- the chapter's trainers from 12.5 (optional trainers with ≤ 3 kin, ×1 XP; mandatory ×3/2);
- 4 wild battles per chapter in ch1–4 and 2 per chapter after;
- each party member receives ≈60% of the full XP (a mix of participation and shared lessons);
- medium growth.

A single "carry" lead ends ≈2–4 levels higher; the S factor pulls it back toward the curve.

| Ch | Zones | Est. time (creative_direction §4) | Wild levels (world.md v2 target) | Route trainer levels | Model party avg at chapter end |
|---|---|---|---|---|---|
| 1 | town_1, route_1 | 40 m | 3–7 | 4–6 | 6 |
| 2 | forest | 50 m | 6–12 | 7–10 | 11 |
| 3 | route_2, town_2 | 55 m | 11–16 | 12–16 | 15 |
| 4 | cave | 40 m | 16–21 | 17–20 | 20 |
| 5 | route_3 | 40 m | 19–23 | 20–23 | 24 |
| 6 | lake | 50 m | 22–27 | 23–26 | 28 |
| 7 | town_3 | 45 m | — (town) | 27–29 | 30 |
| 8 | route_4, Stillhouse | 55 m | 28–33 | 30–33 | 35 |
| 9 | volcano | 50 m | 32–37 | 33–36 | 37 |
| 10 | route_5 | 35 m | 36–41 | 37–40 | 41 |
| 11 | snowpeak | 60 m | 40–45 (stage-3 rares ≤ 46) | 41–44 | 47 |
| 12 | league | 40 m | — | 45–47 | 50 |

Total critical path ≈ 9 h 20 m (Creative Director estimate; not measured). No level requirement is ever enforced.

**Measured (balance simulation, D30; mechanical only, not a playtest):** with T = 3/2 limited to `mandatory` trainers (8.1), the strongest kin tracks the "Model party avg" column (±3), but the six-kin troupe average runs about 2 levels below it by ch5 and 5–6 below by ch11–12 (≈ 43–44 before the champion), because benched kin earn 50% and slow families lag. The ch10–12 story teams were tuned to that measured curve (14.2); doubling the late wild budget (2 → 4 per chapter) was simulated and adds only ≈ 1 level, so the budget is unchanged. QA `progression.json` takes `expectedPartyLevel[battleId]` = the "Model party avg" column in 14.2, and the wild-battle budget above.

## 15. Anti-softlock and recovery

1. **Party wipe / trainer loss**: battle ends; screen fades; the player respawns at the last Hearthrest (rest site) activated (or the town_1 home before any) with the entire party healed (HP, status, charges). Money penalty = `min(floor(money/4), 100 + 150 × keynotesOwned)`. Exception (D20): losing Rival 1 applies no penalty; the troupe is healed and the story continues. All other progress kept: story flags, captures, XP/levels gained during the lost battle, items (consumed items stay consumed). The winning trainer is **not** marked defeated and can be re-challenged immediately; rival/admin/leader story battles re-trigger at the same place. Wild-battle wipes use the same rule.
2. **No usable moves**: if all four moves have 0 charges, Fight shows only m000 *Scramble*. Charges are fully restored at healing centers (free) and after a wipe.
3. **Out of capture devices / money**: when the player owns 0 capture devices of every tier **and** has money < 200, talking to any healing-center attendant gives 5 `i_chime_reed` (repeatable every time both conditions hold). Pedlars in every wild area also sell `i_chime_reed`. The starter gift includes 5 `i_chime_reed` + 3 `i_salve_1`.
4. **Field actions** (D2): performable by any troupe member of the right type, including fainted ones; cost nothing (5.5). Exactly four mandatory gates (Rootcall, Heave, Gust, Rime) are backed by common encounters before each gate and a Resonance Steward fallback.
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

Fixture battle (test fixture, not tied to a story zone): inputs `attunedType = electric`, `ambientWeather = rain`, trainer marked `mandatory: true`. The stats are **fixture placeholders**, not the creatures.md bases, so the vectors stay stable if creature stats are rebalanced.
- Player: c02, pure electric for the fixture. Lv 18; bases hp 55 / atk 60 / def 50 / spa 80 / spd 55 / spe 95; potential 10 in all stats; temperament `tm_spa_atk`.
  - maxHp: core(hp) = floor(120×18/100) = 21 → 21 + 18 + 10 = **49**.
  - atk: core 23 → (23+5)×9/10 = **25**. def **24**.
  - spa: core 30 → (30+5)×11/10 = **38**. spd **26**. spe **41**.
- Rival: c08 (water). Lv 17; bases 70 / 80 / 70 / 55 / 60 / 65; potential 12; `tm_steady`.
  - Stats: maxHp **52**, atk **34**, def **30**, spa **25**, spd **27**, spe **29**.
  - Status: **burn** (*Scorch*) from an earlier turn. HP 52/52.

1. **Command phase.** The AI (Normal) scores its moves from the AIView using `rngAI`:
   - Riptide Bite m016 (physical): base = floor(floor(8×70×34/24)/50) + 2 = 17 → rain ×3/2 = 25 → R92 → 23 → STAB 34 → Resonance: none (water ≠ electric) → ×1 → burn ×1/2 = 17. pct 34 → score 34.
   - Bubble Lance m015 (special): base = floor(floor(8×65×25/26)/50) + 2 = 12 → 18 → 16 → 24 → pct 48 → score 48.
   - `rngAI.int(1,100)` = 71 > 25, so the AI picks the best: **m015**.
   - The player then selects **m025 Arc Lash**.
2. Phases A–C: nothing.
3. Ordering: both moves are priority 0. effSpe 41 vs 29 → player first; no tie roll.
4. **Player Arc Lash** (special, 65 power, acc 100):
   - Stage 0 → hit = 100 → no accuracy roll. Crit roll `rng.int(1,24)` = 9 → no crit.
   - Base: floor(2×18/5) + 2 = 9; floor(9×65×38/27) = 823; floor(823/50) + 2 = **18**.
   - Step 1 weather (electric in rain): 18. Step 2 crit: 18.
   - Step 3 random `rng.int(85,100)` = 85 → floor(18×85/100) = **15**.
   - Step 4 STAB ×3/2 → **22**. Step 5 Resonance ×11/10 → **24**.
   - Step 6 type (electric→water ×2) → **48**. Step 7 burn: n/a.
   - Rival HP 52 → **4**. Secondary paralysis 10%: `rng.int(1,100)` = 57 → no.
5. **Rival Bubble Lance** (special, 65 power, acc 100):
   - No accuracy roll. Crit roll 17 → no crit.
   - Base: floor(2×17/5) + 2 = 8; floor(8×65×25/26) = 500; floor(500/50) + 2 = **12**.
   - Rain (water) ×3/2 → **18**. Random 88 → **15**. STAB → **22**.
   - Resonance: none. Type water→electric ×1 → 22. Burn does not affect special moves.
   - Player HP 49 → **27**. Secondary spe −1 20%: roll 14 ≤ 20 → player spe stage −1.
6. **End of turn:**
   - Step 1: ambient weather, no counter.
   - Step 3: Burn (*Scorch*): the rival loses floor(52/16) = 3 → HP 4 → **1**.
   - Step 7: clear flinch/shield; turn = 2.
   - Step 8: no faints. (In v1 the rival fainted here; the ×11/10 Resonance leaves it at 1 HP.)
7. **Turn 2 preview.**
   - The player is now slower (spe 41 × 2/3 = 27 < 29), so the rival moves first in turn 2 unless the player uses a priority move.
   - When c08 faints, XP to c02 (participant): Y = floor(400/3) = 133 (fixture BST 400); floor(133×17/7) = 323; T = 3/2 (mandatory); S = (2×17+10)/(17+18+10) = 44/45 → XP = floor(323×3×44/(2×45)) = **473**. Non-participants receive 236.
   - Victory payout for a rival: 40 × 17 = **680**.

## 17. Worked example — capture
See 7.5 (Lv 18, 36% HP, `i_chime_brass`, a = 102, threshold 48287, 2 rings then the band frays).
- Next turn the player uses m034 Drowse Pollen, which hits; the target is asleep → S10 = 20.
- a = floor(125×90×15×20×20/330000) = 204 → threshold = floor(65536 × cbrt(0.8)) = 60838.
- Rolls 3114, 47770, 22058 are all < 60838 → **joined** after 3 rings and a sustained chord.
- The party has 6 → the kin is sent to Fosterage box 1.

---

## 18. Data contracts (for content JSON / zod schemas)
- `types.json`: `{ ids: TypeId[10], matrix: Record<TypeId, Record<TypeId, 0|1|2|4>> }` (k/2 encoding).
- `moves.json`: `{ id, name, type, category: "physical"|"special"|"status", power|null, accuracy|null, charges|null, priority, target: "foe"|"self"|"field", effects: Effect[], anim: AnimId }`.
- `traits.json`: `{ id, name, description }`. Behaviour is implemented in code, keyed by id.
- `species` fields owned here:
  - `catchRate`, `xpYield`, `growth`: derived; the validator recomputes them from BST and stage (2.1).
  - `trait` (the section 10 mapping).
  - `evolution: {toSpecies, level?|item?, move?}`.
- `families.json`: `learnset: {level, move, evo?}[]` per family, `discCoverage: TypeId[]`.
- `items.json`: `{ id, name, kind, price|null, sell|null, desc, params }`. Ids per D10 (section 12).
- `trainers.json`:
  ```
  { id, class, mandatory: boolean, ai: "normal"|"hard", potential,
    team?: {species, level, moves?, temperament?}[],
    phases?: {team, attunedType: TypeId|null, trigger?: {faintedCount}}[],
    items: ItemId[] }
  ```
  Exactly one of `team` or `phases` is present. `payout` is derived from the class.
- `zones` (world.md): `attunedType: TypeId|null`, `ambientWeather` table.
- `BattleSetup = { party, opponent: {kind:'wild', species, level} | {kind:'trainer', trainerId}, attunedType: TypeId|null, ambientWeather }`. The AI tier comes from the trainer record.
- `BattleState` holds `rngState` and `rngAIState`.
- `CreatureInstance` = `{ id, speciesId, nickname?, level, xp, temperament, potential: {hp,atk,def,spa,spd,spe}, moves: [{moveId, charges}], hp, status, statusCounter?, bond?, caughtAt: {zoneId, level} }`. There is no held item in v1.
- BattleEvent additions for v2:
  - `phaseChange{phase, attunedType}`
  - `weariness{side, amount}`
  - `shieldBlocked{side}`
  - `dizzySelfHit{side, amount}`
  - `captureAttempt{deviceTier, rings, success}`
- Validation:
  - Every move id referenced by learnsets, discs or trainers exists.
  - Every family learnset reaches ≥ 4 moves by Lv 10.
  - Wild and trainer stage legality holds (14.1).
  - Effects reference valid statuses and weathers.
  - Every trait id is canonical.

## 19. Acceptance criteria
1. Type table test: the 100 cells equal section 1.2; derived counts equal 1.5; dual-type products produce only {0, ¼, ½, 1, 2, 4}.
2. Stat test vectors: the section 16 fixture stats (49/25/24/38/26/41 and 52/34/30/25/27/29) reproduce exactly.
3. **Damage test vectors (v2):**
   - With the section 16 rolls: Arc Lash = **48** (trace 18 → 18 → 18 → 15 → 22 → 24 → 48) and Bubble Lance = **22**.
   - AI scores are 34 and 48.
   - The rival ends turn 1 at 1 HP.
   - With `attunedType = null`, Arc Lash = 44.
   - With `tr_resonant` on the attacker, Arc Lash = floor(22×6/5) = 26 → **52**.
4. Capture test vectors:
   - a = 68/102/136/204 for the four Chimes (7.5).
   - RING_TABLE is monotonic, and RING_TABLE[254] < 65536.
   - Monte-Carlo (100k seeded trials) of the ring procedure is within ±1% of a/255 for a ∈ {10, 102, 200}.
   - The `captureAttempt` event reports `rings`.
5. XP test vectors: 473 in a mandatory battle; the same foe in an optional trainer battle gives floor(323×44/45) = **315**; curve tables in 8.2 reproduce.
6. Determinism: identical seed + commands ⇒ identical event logs (1,000 random battles). Rendering and audio never call either RNG stream.
7. AI isolation: the `AIView` type has no pending-player-action field. Property test: for a fixed state and seed, the AI action is identical for all 4 possible player move choices and for any change to the player's unrevealed moves.
8. Turn order: priority beats speed; the speed tie distribution is ≈50/50 over 10k seeds; flinch applies only when the attacker moved first.
9. Status tests:
   - Each immunity in 4.1.
   - Sleep lasts 1–3 action attempts; the paralysis lock rate is ≈25%.
   - Burn, poison and frostbite tick amounts; the dizzy self-hit rate is ≈33%.
   - HUD codes SCH/BLT/JLT/DRW/RMB and the *Muddled* label are present with icons.
10. Weather: move weather lasts exactly 5 end-of-turns, then reverts to ambient; a duplicate weather move fails.
11. Move data: 101 moves (m000–m100), exactly 10 per type; every move has a valid anim id from 9.1; every learnset move exists.
12. Learnsets:
    - Every family has ≥ 4 known moves by Lv 10.
    - Every family has a coverage move super-effective against at least one of its weakness types by Lv 25.
    - f06–f10 learn a damaging move of their second type, as tabled in section 11.
13. Economy simulation (script over the 12.5 inputs) keeps the balance ≥ 0 at every chapter end.
14. Softlock tests:
    - Wipe → respawn with the penalty formula; an R1 loss continues the story with no penalty.
    - 0 Chimes + < 200 money → the attendant gives 5 Reed Chimes.
    - All charges empty → m000.
    - Full storage → the mandatory release prompt; gifts are held pending.
    - A scripted heal/Bulwark stall battle ends by turn 65.
15. Species data: all 30 BSTs are inside the 2.1 bands; derived fields match 2.1; each species' trait matches section 10.
16. Story battles: the 17 records in 14.2 exist with legal species and levels (14.1). `t_odile` switches `attunedType` null → frost exactly when her third kin faints (`phaseChange` event), and a loss re-arms phase A.
17. Validator: no wild stage-2/3 creature below its evolution level in any encounter table (D23).

## 20. Dependencies
- **DECISIONS.md** (binding): D1–D5, D8–D13, D18, D20, D22, D23 are applied here.
- **creatures.md v2**: base stats with the D12 fixes; types (section 2.1 table mirrors them); the trait mapping; clips animate in place (CAD SY-6). The worked example uses fixture stats on purpose.
- **creative_direction.md**:
  - display names for moves, traits, temperaments and statuses (the D8 names are fixed);
  - attuned types per zone (5.4);
  - story order and trainer names (14.2);
  - the ring presentation (D9) and the Crown Chime flavour text (7.1).
- **world.md v2**:
  - re-slot trainers onto the 12 chapters (12.5; optional trainers ≤ 3 kin from ch5);
  - quest money cuts (12.4);
  - wild levels per 14.4 with the stage legality rule (14.1);
  - disc and `i_evo_prism` placements (12.2);
  - weather bias tables (5.4);
  - trainer records with the `mandatory` flag.
- **src/data/content/items.json**: rename `i_repel_1/2` → `i_hush_1/2` and `i_escape` → `i_thread`; set `i_disc_14` and `i_disc_16` price to null (now trial rewards). `families.json` receives the v2 learnset rows for f06–f10.
- **rendering_and_architecture.md**:
  - the anim → clip mapping (9.1);
  - the v2 BattleEvent additions (18);
  - `rngAIState` and `AIView`;
  - nullable `attunedType` in `BattleSetup`.
- **qa_plan.md**: the section 19 vectors (Arc Lash 48); U-XP-03 50% shared lessons; SIM opponents at their record's AI tier; `progression.json` from 14.2/14.4; the SIM turn limit can drop to 70.

## 21. Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Base stats outside bands skew damage pacing | Fights too long or too short | zod range checks; BST bands enforced; damage sanity check (Lv 50 neutral 90-power STAB ≈ 38% of HP) |
| Shared XP makes the party over-level | Trivial Cantors | S factor down to ×1/2; trainer XP bonus only on mandatory battles; optional trainers ≤ 3 kin from ch5 (D23); leaders tuned to the 14.2 model; playtest to adjust T/S |
| World v2 trainer counts differ from 12.5 | Economy or curve drift | Re-run the 12.5/14.4 model script on world v2 data; QA SIM-03/SIM-04 |
| Slow-growth families (f05, f09, f10) lag | Player benches them | S factor catch-up; evolution moves; f10 can move to medium if playtest shows lag |
| Electric has only 2 strengths | Starter f01 feels weak | Best speed, priority m023, Overclock, gale/frost coverage by Lv 28–34 |
| Dual-type 4× weaknesses (c06 ← water, c20/c21 ← frost, c27 ← gale) | Rival ace or Odile's ace swept | Story teams carry answers (c15 vs water, c14/c15 vs fire); Odile has 2 heals |
| Stone immunity to toxin and gale immunity to stone confuse players | Misplays | Battle UI shows "No echo." text; encyclopedia matrix page |
| Silenced zones and the mid-battle attunement change surprise players | Confusion | HUD pill switches with an animation plus text; `phaseChange` cutscene explains it |
| Fog accuracy + Dazzle Flash stacking feels unfair | Frustration | Only one accuracy-drop move; no evasion boosts exist; fog ×9/10 only |
| Weather reverting to ambient surprises players | Confusion | HUD weather icon shows "ambient" vs "N turns" |
| AI scoring too predictable or too random | Boring or unfair | 25% imperfection for Normal; hard AI deterministic but information-limited |
| Integer floors produce 1-point discrepancies across implementations | Failing tests | All steps specified as integers; test vectors in section 19 |
| Implementation (commit 506aa34) is on v1 rules | Failing v2 vectors | Code changes: Resonance step order and value, `rngAIState`, rings event, item renames, learnset rows, T for optional trainers, phases |

## 22. Unresolved questions
1. Final display names for all *italic* working names (Creative Director); ids are stable.
2. Should `sunlight` be an overworld weather state (volcano "heat")? Systems supports both; the World Designer decides the tables (5.4).
3. Two-turn moves, forced-switch moves, trapping, held items and a player-selectable difficulty setting remain excluded in v2. Revisit after the core slice (phase 3) if scope allows.
4. Final placement of the guaranteed `i_evo_prism` and of the reward discs in 12.2 (World Designer).
5. The flag that restores route_3 attunement (creative_direction `flag_fen_stone_restored`) and whether R3 happens before or after the restore. 14.2 assumes after, so R3 has toxin attunement.
6. Whether captured kin should retain the Chime tier as cosmetic data (encyclopedia flavour). No gameplay effect proposed.
7. Trait additions beyond the canonical 26 need a systems review; none are pending in v2.
