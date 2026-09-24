# Decisions log (orchestrator rulings)

Status: binding from 2026-09-24 (review round 1 closed). Each entry: decision · rejected alternatives · rationale · affected docs. Owners revise their documents to match (targeted follow-up round for blockers). Where a document still disagrees with this file, **this file wins**.

## Campaign structure

**D1 — Story, zone and trial order follow `creative_direction.md`.**
- Zone order: town_1 → route_1 → forest → route_2 → town_2 → cave → route_3 → lake → town_3 → route_4 → volcano → route_5 → snowpeak → league.
- Trials: trial_1 forest **verdant** (Cantor Wren Mossgrave) · trial_2 town_2 **stone** (Dorran Flint) · trial_3 lake **water** (Nerys Tidewell) · trial_4 town_3 **gale** (Tamsin Galloway) · trial_5 volcano **fire** (Bastian Coalridge) · trial_6 snowpeak **frost** (Isaure Frostmere) · champion league (the Concordant, Rhea Rookwell).
- Attuned types per zone: creative_direction §1.2 table (route_1 lumen, forest verdant, route_2 stone, cave electric, route_3 toxin, lake water, route_4 gale, volcano fire, route_5 shade, snowpeak frost; towns/league neutral; trial halls = Cantor type).
- Rejected: world.md v1 order (verdant, gale, stone, frost, fire, lumen). Rationale: the Creative Director's order carries the fully written narrative and dialogue; the World Designer confirmed (review WD) the map, encounter script and softlock method carry over with table changes only. 12 chapters (creative_direction §4) with an estimated 9 h 20 m critical path (estimate only).

**D2 — Resonance field actions.** Registers and names per creative_direction §6.2 (Rootcall/verdant, Spark/electric, Kindle/fire, Swell/water, Heave/stone, Seep/toxin, Gust/gale, Veil/shade, Rime/frost, Gleam/lumen) with its unlock schedule (tutorial: Rootcall + the three triad registers; Keynote 1→Heave, 2→Seep, 3→Gust, 4→Veil, 5→Rime, 6→Gleam). A field action may be performed by **any troupe member of the matching type, fainted or not** (systems §5.5 + CD R3); world.md's "must lead" rule is rejected. Exactly four mandatory gates: Rootcall (forest Rootgate), Heave (cave lower galleries), Gust (route_4 ascent), Rime (snowpeak falls), each with a Resonance Steward fallback (CD §6.6 R1–R7). Starter types are never mandatory.

**D3 — Resonance (attunement) battle bonus = ×11/10, applied after same-type bonus** (new step between STAB and effectiveness), for both sides; `tr_resonant` raises it to ×6/5. Rejected ×6/5 base (systems v1): with hard AI and larger teams in trial halls it gave leaders a 20 % home advantage (systems review). Test vector Arc Lash becomes 48.

**D4 — Rival: 6 battles** (`t_rival_1..6`, creative_direction chapters 1, 3, 5, 8, 10, 12); the rival takes the starter that is **strong against** the player's (Water > Fire > Electric > Water). Rejected: 5 battles, fixed-cycle gift rule.

**D5 — Unchosen starters.** The leftover starter (neither player's nor rival's) is found in ch8 at the Stillhouse (`flag_leftover_rescued`) and fostered via `q_foster_leftover` (stage 1, Lv 25). The rival's line is obtained via `q_second_clutch` after trial_5 (stage 1, Lv 30). Release fallback: Oriel's fosterage offers a replacement young of either line. No waits, no multiplayer.

**D6 — Antagonist redesign (originality finding F-0-01).** The Stillmark keep their name, Odile Graven, Brann and Vey, but change on four axes so they no longer parallel a known "liberate creatures" villain team:
1. Goal: not "freeing" kin. Odile believes resonance surges cause stampedes (her Ash Flats tragedy) and wants to replace every Chordstone with her own **Stillbells** so that only the Stillmark decides when stones sound — a control-for-safety motive.
2. Public face: they present as a licensed **survey guild** of engineers "servicing" stones — clipboards and coil-rigs, no pamphlets, no sermons.
3. Look: quilted slate work-coats, brass ear-muff helmets and coil lanterns; no hoods, no chest emblem (their mark appears on lantern glass only).
4. Methods: they do not steal people's kin. They siphon stones with coils; kin panicked by silenced stones stray, and the Stillmark pen strays at the Stillhouse "for safekeeping". The leftover starter bolted from Larkhollow when the stone fell silent (ch1) and is found there in ch8.

**D7 — Renames (originality/name-similarity findings).** Umbraleen → **Coronaleen** (c30); Cinderscrim → **Emberfold** (c27); Nodbell → **Lullstalk** (c11); Juniper "Jun" Aske → **Marra Aske**; default protagonist name Rowan → **Arden**. Starters: Voltra → **Fizzkit**, Emberhorn → **Wickwool**, Rippleback kept (creatures.md §1). Floeguard (c09): **no helmet**, whiskers reduced to two short nubs, shell stays on back/tail-fan only (F-0-06).

**D8 — Status display names and codes** (avoid the franchise's exact abbreviations): burn → *Scorch* (SCH), poison → *Blight* (BLT), paralysis → *Jolt* (JLT), sleep → *Drowse* (DRW), frostbite → *Rimebite* (RMB); volatile dizzy → *Muddled*. Internal ids unchanged.

**D9 — Capture presentation:** the thrown Chime **rings** (up to three light-and-tone pulses) instead of shaking; success = a sustained chord and bonding light band. Same probability model (systems §7).

**D10 — Item ids** are those in `src/data/content/items.json`: capture devices `i_chime_reed|brass|silver|crown`, heals `i_salve_1..4`, cures `i_cure_*`, revives `i_revive_1..2`, charges `i_charge_1..2`, repel-analogue `i_hush_1..2`, escape `i_thread`, discs `i_disc_01..18` (displayed as *Etudes*), Keynotes `i_keynote_1..6`, `i_evo_prism`. Flags/quests: creative_direction §4.2 ids are canonical for story; world.md v2 adopts them.

## Species and systems

**D11 — Evolution levels** = systems §8.3 (accepted by the Creature Art Director): f01–f03 16/34, f04 16/32, f05 20/36, f06 22/38, f07 14/30, f08 18/34, f09 24/40, f10 26/(Dawn Prism or 44).

**D12 — Derived species fields** (catch rate, XP yield, growth) are systems-derived (systems §2.1), not hand-entered. Base stats: creatures.md with the four band fixes (c20 395, c12 505, c21 505, c30 535).

**D13 — Traits:** one fixed canonical trait per species per the Creature Art Director's mapping (review CAD). Display names are original; `tr_reckless` displays *Headlong*, `tr_sturdy_core` displays *Keystone Core*.

**D14 — Faces:** the 8-cell atlas (`open, half, closed, happy, hurt, faint, determined, surprised`) is canonical across all docs. Cells: 256 px High, 256 px Balanced (encyclopedia & battle), 128 px Mobile. The right eye is a UV-mirrored copy (highlight mirrors); accepted stylization, avoids 2× texture memory.

**D15 — Animation timing authority:** creatures.md per-species clip durations (attack 0.4–1.3 s) are authoritative; creative_direction §5.5 caps become guidance for stage-1 feel, not gates. Contact event at 40–55 % of the attack clip.

**D16 — Creature budgets (revised, measured later):** LOD0 ≤ 12k triangles (stage 3 large ≤ 16k); segment counts scale with part size; small accessories may be dropped at LOD2 **except** silhouette-feature parts. Draw calls per creature may exceed the v1 targets (separate animated parts, no skinning); this is a documented deviation to be measured on reference hardware — mitigation (merge static children) applies where it doesn't affect animation.

**D17 — Cave:** single-level heightfield zone with rim walls and a ceiling shell (world.md two-level cave rejected for production capacity; the lower galleries become a separate area of the same zone behind the Heave gate).

**D18 — Full storage:** systems §7.4 rule (throw allowed after a confirmation; mandatory release prompt after success). Party + storage cap 6 + 300.

**D19 — Reload mid-battle/capture/evolution:** returns to the pre-battle committed checkpoint (rendering §10.5; systems §15.11).

**D20 — Story-battle loss:** Rival 1 loss continues the story (healed); all others use the wipe rule (systems §15.1).

**D21 — Wild creature cap:** 6 roaming per zone on every profile (fairness); cost controlled by animation update rate at distance.

**D22 — Two-phase Odile battle:** supported as a trainer with `phases` (phase A attunement silenced; phase B after her third kin faints restores frost ×11/10 and sends her ace).

**D23 — Economy/levels:** systems v2 revises trainer counts (optional trainers ≤ 3 kin from ch5), quest money (main ×¼, side ×½), trainer XP bonus only on mandatory battles, and a validator rule that no wild stage-2/3 appears below its evolution level.

## Technical

**D24 — Toolchain:** TypeScript 7.0.2 retained (typechecks clean); gate string scans use regex over JSON/TSX string literals, not the TS compiler API. React 19.2.0, three 0.186.1, R3F 9.8.0, drei 10.7.8, rapier 2.2.0, postprocessing 3.1.2/6.39.5, zustand 5.0.15, tone 15.1.22, zod 4.6.5, Playwright 1.56.1 (matches preinstalled Chromium 1194).

**D25 — Terrain collider:** Rapier trimesh built from the same vertex grid as the render mesh (not `<HeightfieldCollider>`), so collision and visuals share one triangulation.

**D26 — Reference devices** are named in rendering_and_architecture §7.1 but remain **Not measured** until run on physical hardware; the container's software-GL Chromium is never used for FPS claims.

**D27 — Silhouette procedure:** the release gate's GC-07 is the single spec; per-species side-view angle allowed for planar designs (creatures review).

**D28 — Deployment target:** static build of `creature-rpg/dist` deployed as a Vercel preview (the repository is already connected to Vercel). Dev tools (`?tool=`) are excluded from production unless `VITE_QA=1`.

## Addendum (release-agent name check, 2026-09-24)

**D29 — Further renames** (name-similarity fails/near-fails against existing franchise names): c24 Venomantle → **Drapetide**; c21 Samaraptor → **Samarch**; default protagonist name Arden → **Hollis**; trial_2 Cantor Dorran Flint → **Dorran Shale**. Lumarlin (c29), Emberfold, Coronaleen, Lullstalk and Magmouflon are kept with the release agent's recorded reasons. The final display-name source of truth is `src/data/content/species.json` (generated from creatures.md + this file).

## Addendum (Systems Designer balance tuning pass, 2026-09-24)

**D30 — Balance tuning pass** (evidence: design/reviews/balance_sim.md "Tuning pass"; mechanical simulation only, not a playtest). (1) **Engine:** T = 3/2 XP now applies only when the trainer record has `mandatory: true` (systems §8.1). `BattleSetup`/`BattleState` carry `mandatory`, and `buildBattleSetup` passes it (fixes F9). (2) **Story teams** (systems §14.2, world.md §2.9): R1 is RS1 Lv 3 with potential 6 and no item (loss-tolerant but winnable); R2 is 12/14; Cantor 3 is 22/22/23/24; Cantor 4 is 25/26/27/28; R5 is 35/35/35/36/37; Cantor 6 is 37–41; R6 is five kin at 43 plus RS3 at 44; the champion's non-ace kin are 45/45/46/46/47 (c30 stays 50). Cantor 1, Cantor 2, Cantor 5, the admins and Odile keep their levels. (3) **Heal items** are capped at the chapter's shop tier (§13.3): R1, Cantor 1 and R6 hold none; R2 and Cantor 2 hold 1× `i_salve_1`; Brann 1, Vey 1 and Cantor 3 hold 1× `i_salve_2`; R3 holds 2× `i_salve_2`; the rest are unchanged. These values are made durable by `STORY_TUNING` in `scripts/build-world-content.py`. (4) **Water starter:** f03 learns m052 Hoarbreath (frost) at Lv 6 (was 13) and m015 at Lv 8 (was 10); m013 moves to Lv 13. (5) **Simulator player policy** (tests only): coverage-aware move replacement; Etudes taught at their §12.5/§12.2 acquisition points; the Triad gifts (world.md §2.6); one shop-tier salve per routine trainer battle; retreat from super-effective threats in routine battles; a sensible finisher choice after a faint; catches weighted to the next story battle; and 8 progressions × 6 seeds per story battle. Result: all 48 blocking starter × story pairs meet the qa_plan §7.2 targets, and the allow-list is empty. Known limits: the Odile fight is structurally easy (4 kin; its levels made no measurable difference, so they are unchanged); the late troupe average runs 5–6 levels below the §14.4 model column; the fire starter's champion (63%) and the water starter's Cantor 1 and Cantor 6 (67%) have the thinnest margins. Human route playtests (qa_plan M-50) are still required.
