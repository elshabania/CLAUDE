# Creative Direction — *Wildchord: Songs of Cantarra*

Owner: Creative Director. Status: v1 design, binding for narrative, character language, signature mechanic, UI and audio identity.
Designed against `design/ANCHORS.md` (fixed ids, stack, scope). Where this document needs a number owned by another document (damage math, encounter weights, map placement), it states a **target** and names the owner. Playtimes are **estimates**. Nothing here was playtested or measured.

---

## 0. One-paragraph pitch

In the highland region of **Cantarra**, ancient standing stones called **Chordstones** hum in answer to the creatures that live around them. People who bond with these creatures, called **kin**, are **Tuners**. A newly licensed Tuner from a village of instrument makers sets out to earn six **Keynotes** from the region's **Cantors**. Each Keynote lets the player's kin *resonate* with a new kind of landmark. Meanwhile a quiet, well-organized faction, **the Stillmark**, is silencing the Chordstones one by one. They believe that silence would free kin from people. What it would actually do is leave kin blind to their homes. The tone is warm, earnest and lightly comic, with real stakes in the second half. Think "a folk song that turns into an anthem".

---

## 1. Identity, tone, setting, zones

### 1.1 Core identity

| Item | Decision |
|---|---|
| Game title | **Wildchord: Songs of Cantarra** (short: *Wildchord*) |
| Region | **Cantarra**, a temperate highland: orchard valleys → quarry ridges → fen and lake basin → windy sea-cliffs → volcanic caldera → glacial peak |
| Tone | Warm, curious, sincere. The humor comes from character, never from mocking anyone. The antagonist is principled but wrong. The world is never grimdark. Kin never die; they "faint" (story term: *go quiet*). |
| Central metaphor | Sound and harmony. Bonds are "in tune"; the villain wants silence; the finale restores a chord. Every coined term comes from music, craft or hearth vocabulary. |
| Setting era | Pre-industrial craft culture with *resonant* technology: brass, glass, tuned stone, windmills, lanterns. No guns, no cars, no screens. The phone equivalent is a hand-cranked **Tuning Ledger**. |
| Visual pillars | 1) Stylized realism with soft PBR materials. 2) Every zone is readable from one hero landmark (its Chordstone). 3) Type color appears as *accent light*, not as whole-zone tint. |
| Player term | **Tuner** (player & NPC battlers). Party = **troupe** (max 6). Storage = **the Fosterage** (cap 300, see §3). Evolution = **Crescendo**. |

### 1.2 Zones (fixed ids + original names)

Proposed story order, which the World Designer confirms or adjusts in `world.md`:
`town_1 → route_1 → forest → route_2 → town_2 → cave → route_3 → lake → town_3 → route_4 → volcano → route_5 → snowpeak → league`.

Every non-town zone has exactly one **attuned type** (§6.4), and the ten outdoor zones cover all ten types once. Towns are **neutral**. Trial halls use their Cantor's type.

| id | Name | Attuned | Visual theme (landmark / materials / palette) | Lighting & weather mood |
|---|---|---|---|---|
| `town_1` | **Larkhollow** | neutral | Terraced village of luthiers. Timber-frame workshops, orchard rows, strings of wind-chimes, a moss-capped Chordstone on the green. Palette `#E9D8A6` straw, `#94A56B` orchard green, `#8C5A3C` walnut. | Soft morning sun, light breeze, occasional drizzle. |
| `route_1` | **Thistledown Way** | lumen | Sunlit meadow lanes, hedgerows, a white chalk waystone with a sunburst carving, dandelion-seed particles. `#F2E3A0`, `#A7C46A`, `#FFFFFF`. | Bright, long shadows, pollen motes. |
| `forest` | **Murmurwood** | verdant | Giant hollow trees that hum when wind passes, root arches, glowing seed-knots, a canopy hall (**Rootloft**, `trial_1`). `#2F5E3A`, `#6FA35A`, `#C9B458` lantern fungus. | Dappled light shafts, green fog. |
| `route_2` | **Brackenridge Pass** | stone | Heather ridges, dry-stone walls, stacked cairns, rust-red bracken. `#8A6E4B`, `#B5543C`, `#6F7F5A`. | Overcast, wind gusts, occasional hail flurry. |
| `town_2` | **Knellstone** | neutral | Quarry town carved into a cliff. Stone bell towers, cranes, terraced streets, the **Knell Hall** (`trial_2`). `#C2B8A3` limestone, `#5B6770` slate, `#D08C3A` lamp. | Warm dusk lamps, dust motes. |
| `cave` | **The Undertone** | electric | Mine galleries opening into crystal caverns. Lode-veins crackle; old brass lift gates. `#1D2433`, `#3E7CB1` lode blue, `#F2C230` spark. | Dark, point-lit, crystal glints. |
| `route_3` | **Sallowfen** | toxin | Reed fen on boardwalks, sallow willows, bubbling violet pools, a half-sunk Chordstone. `#5E6B3A`, `#8E5AA8` bloom, `#C7C28A` reed. | Humid haze, low fog, frogsong. |
| `lake` | **Sillowmere** | water | A wide mirror lake with stilt-hamlets and floating reed-isles; the **Mere Hall** (`trial_3`) stands on piles. `#2E6F95`, `#A9D6E5`, `#E8E1C9` driftwood. | Reflections, rain bands, calm. |
| `town_3` | **Galewick** | neutral | Windmill city on sea-cliffs. Rope bridges, kites, sail-roofed market, the **Vane Hall** (`trial_4`). `#E7EEF2` whitewash, `#3D7E8C` sea, `#C4553A` sail. | Bright, windy, gull cries. |
| `route_4` | **Highscar Rise** | gale | Switchback cliffs, updraft vents with ribbon markers, a hidden Stillmark base (**the Stillhouse**). `#9DA8A0`, `#D9CBA8`, `#4B6A77`. | Strong wind, moving cloud shadows. |
| `volcano` | **Mount Cindral** | fire | Basalt terraces, ash drifts, lava channels, the caldera **Forge Hall** (`trial_5`). `#2B2320`, `#E4572E`, `#F2A541` glow. | Orange underlight, ember particles, heat shimmer (High only). |
| `route_5` | **Gloamstair** | shade | Stone stairway across a twilight tundra where the sun barely sets. Aurora ribbons, frozen standing stones. `#3A3556`, `#7B6FA8`, `#B8E0D2` aurora. | Blue hour permanently, light snow. |
| `snowpeak` | **Hoarcrown** | frost | Glacier, frozen falls, rime-crusted Chordstone ring, the **Rime Hall** (`trial_6`), and the summit where the Stillmark hangs its **Null Bell**. `#EAF4F8`, `#7FD3E6`, `#4C6A85`. | Crisp, high-contrast, blizzard bursts. |
| `league` | **Concord Spire** | none (neutral arena) | Tall tuned-stone spire above Hoarcrown, reached by a resonance lift. Six Keynote sockets at the door. `#F3EAD7`, `#C8963E` brass, `#2FA39A` resonance teal. | Golden hour, clear sky. |

---

## 2. Cast and story frame

### 2.1 Protagonist

| Item | Decision |
|---|---|
| Name | Player-entered (default **Rowan**). Two body builds × three skin tones × three hair styles; outfit palette fixed (see §5.6). Pronouns chosen at start (they/she/he); dialogue uses names more than pronouns. |
| Age read | ~14–15 (young teen). |
| Motivation (personal) | Rowan grew up sweeping Oriel's workshop and listening to Larkhollow's Chordstone hum every dawn. On licensing day the stone goes silent for the first time in living memory. Rowan promises Oriel to find out why. |
| Motivation (ambition) | Earn six Keynotes, climb Concord Spire and "sound the Great Chord", the traditional feat of a master Tuner. |
| Arc | From "I want to be the best" to "I want everyone to be heard". Rowan ends by restoring the stones rather than just winning. |

### 2.2 Rival — Cass Rookwell

| Item | Decision |
|---|---|
| Role | Neighbor and childhood friend. Loud, fast, funny, generous in defeat, allergic to losing twice. |
| Hidden layer | Cass's mother is **Rhea Rookwell**, the reigning Concordant (champion). Cass fears being "only Rhea's kid". The rival-battle arc resolves when Cass stops copying Rhea's team style and builds their own. |
| Look | Long red-orange scarf, too-big coat with rolled sleeves, one fingerless glove. Silhouette hook: the scarf tail animates in wind. |
| Starter logic | Cass picks second and **takes the starter whose type is strong against the player's**. Rule for code: `rival = argmax over the two remaining starters of typeMult(S.type → player.type)`. Tie-break: the lowest `typeMult(player.type → S.type)`. Final tie: fixed table below. |
| Default table | Expected under the triad cycle (Water > Fire, Fire > Electric, Electric > Water). **This cycle must be confirmed by systems.md.** Player Voltra (electric) → Cass takes Emberhorn (fire); leftover Rippleback. Player Emberhorn (fire) → Cass takes Rippleback (water); leftover Voltra. Player Rippleback (water) → Cass takes Voltra (electric); leftover Emberhorn. |
| Team growth | R1: starter only. R2: +f07 gale stage 1. R3: +f05 stone. R4: +f09 shade. R5: +f06 frost, starter stage 3. R6: six kin, stage-3 starter as ace. Species/levels are finalized in trainer data (`t_rival_1`..`t_rival_6`). |

### 2.3 Antagonist faction — the Stillmark

| Item | Decision |
|---|---|
| Name | **The Stillmark** (members: *Stillhands*; base: *the Stillhouse*; emblem: a circle with one horizontal bar, meaning "a bell held still") |
| Public face | A tidy, soft-spoken society in slate-gray cloaks with felt-lined gloves. They hand out pamphlets: "Let the wild be quiet." |
| Stated goal | Silence every Chordstone so kin are no longer "called" by people, which would return them to true wildness. |
| Actual plan | Hang the **Null Bell** on Hoarcrown's summit Chordstone ring. The Bell drinks resonance from every stone at once. Stolen young kin tune it, because young kin resonate most strongly. Once rung, kin across Cantarra lose their sense of place, and wild kin would flee or panic. The founder believes that is a mercy. |
| Founder / boss | **Magister Odile Graven.** She trained as a Chordwright beside Oriel. She once saw a resonance surge at Cindral drive a herd of kin into a lava flow, and concluded that resonance is a leash. Calm, precise, never shouts. Specialty: shade/toxin/lumen mix. Ace: a stage-3 f09 (shade). |
| Admin 1 | **Warden Brann Coldcourt**: blunt ex-quarry foreman who joined for the wage and stays out of loyalty. Stone/frost. Appears at the cave (ch4) and the snowpeak (ch11). He switches sides after ch11. |
| Admin 2 | **Warden Vey Lanternlow**: theatrical true believer who talks in whispers and stage directions. Toxin/shade. Appears at the fen (ch5) and the Stillhouse (ch8). |
| Grunts | Stillhand battlers (`t_still_*`) with 1–3 kin. Their lines are polite and slightly eerie ("Pardon us. We're only turning down the volume."). |
| Visual language | Slate `#4A4F5C`, felt gray `#8A8F99`, one muted mauve accent `#8C6A8A`. Hoods with a stitched bar across the chest. The shapes are soft and muffled: rounded hoods and mitten gloves. No skulls, no letters on their chests. |

### 2.4 Supporting cast

| Name | Role (original) | Where | Notes |
|---|---|---|---|
| **Oriel Vantasse** | **Chordwright**: instrument maker, Chordstone surveyor and keeper of Larkhollow's kin **fosterage** (a shelter that raises orphaned kin). Replaces the "professor" function. | `town_1` workshop | Gives the starter, the Kinsong (§3) and the resonance tutorial. Fifties, silver braid, leather apron covered in tuning keys, magnifier monocle on a cord. Warm but blunt. |
| **Hearthkeepers** | Run the **Hearthrest** healing houses. Each has a sounding bowl that rings the troupe back to health. | Each town + lake stilt-hamlet + volcano base + snowpeak lodge | Uniform: rust-orange shawl with a bell-shaped brooch. Maud (town_1, grandmotherly), Tobin (town_2, burly and gentle), Ysolde (town_3, brisk). Other Hearthkeepers are generic variants. Heal line: "Sit by the fire. There — hear that? They're in tune again." |
| **Chandlers** | Shopkeepers at the **Chandlery** counter inside every Hearthrest | Same | Archetypes: Pip (eager apprentice), Garrow (dry old merchant), Nell (gossip). Plus **Wick**, a traveling peddler with a cart who appears on routes 2 and 4 and sells a rotating item. |
| **Resonance Stewards** | Volunteer Tuners in teal sashes stationed at every mandatory resonance gate. They lend a kin when you lack the needed type (softlock fallback, §6.6). | Mandatory gates | One reusable NPC template with a name pool. |
| **Rhea Rookwell** | **The Concordant**: champion of Cantarra and Cass's mother | `league` | Tall, calm, laughs easily. Balanced team with a lumen ace (f10 stage 3). |
| **Juniper "Jun" Aske** | Kinsong researcher and optional quest-giver. Rewards Kinsong completion milestones. | `town_2` → `town_3` | Replaces the "aide" role. Keeps the player's completion checklist. |

### 2.5 Final showdown structure

1. **Climax (ch11, Hoarcrown summit):** the player climbs to the Null Bell. Brann stands aside ("Go on. I've heard enough quiet."). Odile fights in **two phases**, as one trainer battle with two scripted teams:
   - Phase A: the zone attunement is **suppressed**, and the HUD shows "Attunement: Silenced".
   - When Odile's third kin faints, a cutscene plays: the player's lead kin resonates, the Chordstone ring flares, and the attunement **frost ×1.1 returns** for phase B against her ace.
   - After victory the player resonates the Bell with the lead kin. It cracks and every stone in Cantarra hums again (`flag_nullbell_broken`). Odile is not arrested on screen. She walks down the mountain and leaves a letter for Oriel, which is readable in the post-game.
2. **Finale (ch12, Concord Spire):** the six Keynotes open the Spire. **Cass battle 6** takes place on the lift landing. Then comes the **Concordant Rhea**. The victory scene is the "Great Chord": all six Keynotes, the player's troupe and the Chordstones sound together (the audio stinger of §8.5).

---

## 3. Original terminology (genre functions → Wildchord names)

| Function (generic) | Wildchord name | Presentation | Id conventions |
|---|---|---|---|
| Creatures | **kin** (sing. & plural); "wild kin" | — | `c01`..`c30` |
| Battler (player/NPC) | **Tuner** | Title on the ID screen: "Licensed Tuner" | `t_...` |
| Party | **troupe** | Max 6 | — |
| PC storage | **the Fosterage** | Ledger at any Hearthrest. Cap 300. When full, a newly bonded kin stays in the troupe if there is room. If the troupe is also full, the capture is **not attempted**: the chime is greyed out with the tooltip "Your Fosterage is full". | — |
| Challenge venues ("gyms") | **Cadence Halls** (e.g. *Rootloft Hall*) | Each is an interior/landmark hall with a traversal gimmick, 2–4 hall Tuners, then the Cantor. | `trial_1`..`trial_6` |
| Venue leaders | **Cantors** | Title "Cantor Wren" | `t_cantor_1`..`t_cantor_6` |
| Venue reward ("badge") | **Keynote**: a tuning-fork-shaped crystal, one color per hall, that slots into the protagonist's **Tuning Ledger** | Six Keynotes = "full chord" | `i_keynote_1`..`i_keynote_6` (key items) |
| Final four + champion | **Concord Spire** and **the Concordant** | Single champion battle after the final rival battle. No gauntlet. | `league`, `champion` |
| Capture devices (4 tiers) | **Chimes**: hexagonal bell-lanterns. Thrown, they ring and weave a band of light around the kin. | **Reed Chime** (T1, woven reed + brass clapper), **Brass Chime** (T2), **Silver Chime** (T3, engraved), **Crown Chime** (T4, crown-shaped top, near-certain) | `i_chime_reed`, `i_chime_brass`, `i_chime_silver`, `i_chime_crown` |
| Encyclopedia ("dex") | **the Kinsong**: an illustrated songbook. Each species is a "verse". Seen = "heard", caught = "sung". | Interactive 3D viewer page per verse | — |
| Teaching items ("TMs") | **Etudes**: engraved wax cylinders played on a pocket phonograph. Whether they are reusable is decided in systems.md. | Brass cylinder icon with the move's type glyph | `i_etude_mXXX` |
| Healing center | **Hearthrest** | A hearth-room with a sounding bowl and a Chandlery counter | — |
| Shop | **Chandlery** | Inside Hearthrests | — |
| Currency | **tallies** (symbol **◇**, a notched diamond) | Shown as "◇ 1,250" | — |
| Trainer card | **Tuning Ledger** | A leather-bound book: profile, Keynotes, playtime, Kinsong count | — |
| Evolution | **Crescendo** | "Voltra is crescendoing!" | — |
| Faint | **go quiet** | "Emberhorn went quiet." | — |
| Fast travel points | **Waystones**: each zone's Chordstone, registered by resonating with it once | — | `ws_<zone>` |
| Field ability system | **Resonance** (§6) | — | `rn_<zone>_<nn>` nodes |
| Battle menu | **Moves / Satchel / Swap / Retreat** | §7.4 | — |
| Effectiveness text | "**Resounding!**" (super), "**Muffled…**" (resisted), "**No echo.**" (immune) | — | — |
| Encounter text | Variant pool, e.g. "A wild {kin} rustles out!" or "{kin} blocks the path!" | Never a single fixed formula | — |

**Terminology screen.** The following were checked against well-known franchise vocabulary, from general knowledge only and not as a legal search. None of them are used anywhere in UI, dialogue or ids: Poké-/Pocket-, Ball, Gym, Badge, Trainer Card, Pokédex/Dex, TM/HM/TR, Elite Four, Team + villain-name pattern, Pokémon Center, PokéMart, PC Box, Professor + tree name, "Wild X appeared!", "It's super effective!", "fainted". Words that are generic English and appear in some other media (Tuner, Cantor, Keynote, Chime, Hearth) are acceptable as ordinary words. They are listed in §9.4 for a light conflict check.

---

## 4. Chapter-by-chapter story

Notes:
- The flags listed are the story flags that **gate the critical path**. Quests use `q_main_chNN` plus the named side quests.
- Levels are **narrative targets** for systems.md to finalize.
- Playtime is an **estimate** for a first-time player who does not grind and skips optional sidequests. Planned total **≈ 9 h 20 m**. Optional content adds about 1.5–3 h (estimate).

### Chapter summary table

| Ch | Title | Zones | Trial / key battle | Target lvl | Est. time |
|---|---|---|---|---|---|
| 1 | The Quiet Stone | town_1, route_1 | Rival 1 | 5–7 | 40 m |
| 2 | Murmurwood | route_1, forest | trial_1 (verdant) | 8–12 | 50 m |
| 3 | Knellstone | route_2, town_2 | Rival 2, trial_2 (stone) | 13–17 | 55 m |
| 4 | The Undertone | cave | Admin Brann 1 | 17–20 | 40 m |
| 5 | Sallowfen | route_3 | Admin Vey 1, Rival 3 | 20–23 | 40 m |
| 6 | Mirror of Sillowmere | lake | trial_3 (water) | 23–26 | 50 m |
| 7 | Galewick | town_3 | trial_4 (gale) | 27–30 | 45 m |
| 8 | The Stillhouse | route_4 | Admin Vey 2, Rival 4 (tag-in), leftover starter rescue | 30–33 | 55 m |
| 9 | Cindral | volcano | trial_5 (fire) | 34–37 | 50 m |
| 10 | Gloamstair | route_5 | Rival 5, Odile revealed | 38–40 | 35 m |
| 11 | Hoarcrown | snowpeak | trial_6 (frost), Magister Odile | 41–45 | 60 m |
| 12 | Concord | league | Rival 6, Concordant Rhea | 46–50 | 40 m |
| | **Total (estimate)** | | | | **560 m ≈ 9 h 20 m** |

### Ch1 — The Quiet Stone (town_1, route_1) — est. 40 m

- **Objectives:** wake up; visit Oriel's workshop; choose a starter from the fosterage; Cass chooses; first battle vs Cass; resonance tutorial at the Larkhollow Chordstone; route_1 capture tutorial (a guaranteed f04 stage-1 encounter); register the route_1 Waystone.
- **Prereq:** new game (`flag_game_started` set on name confirm).
- **Flags set:** `flag_starter_chosen`, `flag_rival_1_done`, `flag_resonance_tutorial`, `flag_capture_tutorial`, `flag_ws_route_1`.
- **Beats:**
  - *Dawn:* the Chordstone hum cuts out mid-note, and a wind-chime drops to the ground. Oriel: "Forty years that stone's sung me awake. Today it forgot the words."
  - *Starter choice:* three young kin in the fosterage pen. Oriel: "Don't pick the strongest. Pick the one that looks back at you."
  - *Cass bursts in:* "Did I miss it? I missed it. Fine — I'll take *that* one. No reason. Definitely not because it'd flatten yours."
  - *Rival 1 (after Cass's pick):* on a loss the player is healed and the story continues (§6.6 recovery rule). Cass on losing: "Okay. Okay! First one doesn't count. That's a rule. I just made it."
  - *Tutorial:* Oriel shows the carved glyph on a bramble knot near the green. The player's starter resonates its own type on a secret-only node (Spark/Kindle/Swell). Oriel then explains the Rootcall (verdant) register, and Rowan hears that the stone is not dead, just "holding its breath".
  - *Capture tutorial:* Oriel gives 5 Reed Chimes. A guaranteed wild f04 stage-1 kin sits by the stile. Oriel: "Weaken, don't wound. A Chime asks. It doesn't grab."
  - *Night hook:* a gray-cloaked figure is seen leaving the fosterage. The leftover starter is gone. (The player learns this at the start of ch2.)

### Ch2 — Murmurwood (route_1 → forest) — est. 50 m

- **Objectives:** hear the news of the stolen kin; cross route_1; open the Rootgate into Murmurwood with **Rootcall** (mandatory, verdant); first Stillmark sighting (2 grunts silencing a hollow tree); reach Rootloft; clear `trial_1`.
- **Prereq:** `flag_capture_tutorial`.
- **Flags set:** `flag_forest_rootgate_open`, `flag_stillmark_first_seen`, `flag_trial_1_cleared` (grants `i_keynote_1`, which unlocks the **Heave/stone** register), `flag_ws_forest`.
- **Beats:**
  - Oriel (via Ledger message): "They took the little one. Whoever they are, they knew which pen." This is the first **leftover-starter** hook.
  - Stillhand: "Pardon us. We're only turning down the volume." After defeat: "You'll understand when it's quiet."
  - **Cantor Wren Mossgrave** (hall gimmick: vine bridges retract when a hall Tuner is defeated, and Rootcall regrows them elsewhere): "A forest isn't loud. It's *layered*. Show me you can hear the layers."
  - Keynote line: "Take this. It's tuned to stone. Every hall teaches the note *after* its own. That's how a chord gets built."

### Ch3 — Knellstone (route_2 → town_2) — est. 55 m

- **Objectives:** cross Brackenridge (the Heave tutorial on an optional boulder shortcut); **Rival 2** at the ridge cairn; arrive in Knellstone; the quarry bells ring off-key (a Stillmark tampering side-beat); clear `trial_2`.
- **Prereq:** `flag_trial_1_cleared`.
- **Flags set:** `flag_rival_2_done`, `flag_trial_2_cleared` (grants `i_keynote_2`, which unlocks the **Seep/toxin** register), `flag_ws_route_2`, `flag_ws_town_2`.
- **Beats:**
  - Cass before R2: "Mum's got six Keynotes and a spire. I've got one Keynote and a *plan*. The plan is: beat you."
  - **Cantor Dorran Flint** (gimmick: pillar maze; striking tuning plates raises or lowers pillar rows): "Stone keeps time better than any clock. Let's see if you do."
  - Town gossip (Nell): "Gray cloaks bought every felt blanket in town. Who needs forty blankets in summer?"

### Ch4 — The Undertone (cave) — est. 40 m

- **Objectives:** miners report that kin have gone missing below; **Heave** (mandatory, stone) boulders open the lower galleries; restore the brass lift using an optional **Spark** node or the long way round; confront **Warden Brann** siphoning the cave Chordstone into a felt-wrapped coil; free the miners' kin.
- **Prereq:** `flag_trial_2_cleared`.
- **Flags set:** `flag_cave_heave_gate`, `flag_admin_brann_1`, `flag_cave_miners_saved`, `flag_ws_cave`.
- **Beats:**
  - Brann: "It's a job, kid. Quiet pays better than rock." After defeat: "…Magister won't like this. Neither do I, much."
  - Rowan discovers that the coil is tuned with **young kin fur**. The Stillmark is using young kin, which ties the theft back to Larkhollow.

### Ch5 — Sallowfen (route_3) — est. 40 m

- **Objectives:** follow Stillmark tracks into the fen; the half-sunk Chordstone is being "muffled" by Vey's team; battle **Warden Vey**; restore the stone (resonate with any kin); **Rival 3** at the boardwalk end, where Cass arrives late and embarrassed.
- **Prereq:** `flag_cave_miners_saved`.
- **Flags set:** `flag_admin_vey_1`, `flag_fen_stone_restored`, `flag_rival_3_done`, `flag_ws_route_3`.
- **Beats:**
  - Vey (stage whisper): "*Enter the hero, stage left, too loud as usual.*"
  - Cass after losing: "You fixed a *stone*. I was busy losing to a frog. Don't tell anyone." Then, quieter: "…Do you ever feel like everyone's already decided who you are?"

### Ch6 — Mirror of Sillowmere (lake) — est. 50 m

- **Objectives:** reach the stilt-hamlets; optional **Swell** current-stones lead to an island secret; clear `trial_3` at Mere Hall.
- **Prereq:** `flag_rival_3_done`.
- **Flags set:** `flag_trial_3_cleared` (grants `i_keynote_3`, which unlocks the **Gust/gale** register), `flag_ws_lake`.
- **Beats:**
  - **Cantor Nerys Tidewell** (gimmick: the hall floor sits at three water levels. Each defeated hall Tuner drains a level, and the walkways shift): "A lake shows you whatever you bring to it. Bring me something honest."
  - Keynote: "Gale's next. Galewick's winds will carry you, if you let them."

### Ch7 — Galewick (town_3) — est. 45 m

- **Objectives:** arrive by ferry or causeway; meet **Jun Aske** (Kinsong sidequests unlock); Stillmark pamphleteers are in the market (dialogue only); clear `trial_4`; learn from Oriel's letter that Odile Graven was her old apprentice.
- **Prereq:** `flag_trial_3_cleared`.
- **Flags set:** `flag_trial_4_cleared` (grants `i_keynote_4`, which unlocks the **Veil/shade** register), `flag_odile_named`, `flag_ws_town_3`.
- **Beats:**
  - **Cantor Tamsin Galloway** (gimmick: floor vents launch the player between platforms; the player pulls wind-vanes to redirect them): "In Galewick we don't fight the wind. We argue with it, politely, until it agrees."
  - Oriel's letter: "Odile and I built our first Chime together. She always said the stones asked too much of kin. I thought she'd grow out of it."

### Ch8 — The Stillhouse (route_4) — est. 55 m

- **Objectives:** climb Highscar using **Gust** updrafts (mandatory, gale); find the Stillhouse in a cliff notch; Cass joins, and the base is split into two wings; defeat grunts and **Warden Vey 2**; rescue the young kin, including the **leftover starter**; then **Rival 4**, which Cass demands "to see if we're even".
- **Prereq:** `flag_trial_4_cleared`.
- **Flags set:** `flag_route4_updraft`, `flag_stillhouse_found`, `flag_admin_vey_2`, `flag_leftover_rescued`, `flag_rival_4_done`, `flag_ws_route_4`.
- **Beats:**
  - Rescue scene: the leftover starter cowers behind felt baffles. It won't come to Cass, but it comes to Rowan's starter. That opens `q_foster_leftover` (§4.1).
  - Vey after defeat: "*Curtain.* …The Magister is already on Hoarcrown, darling. You're late to your own finale."
  - Cass: "We make a good team. I hate that. Battle me anyway."

### Ch9 — Cindral (volcano) — est. 50 m

- **Objectives:** cross the basalt terraces (optional Kindle and Seep secrets); the Forge Hall is sealed by an overheated vent, so cool it with a Swell node **or** talk to the hall steward (either works); clear `trial_5`; an optional lore beat shows the site of Odile's childhood tragedy.
- **Prereq:** `flag_rival_4_done`.
- **Flags set:** `flag_trial_5_cleared` (grants `i_keynote_5`, which unlocks the **Rime/frost** register), `flag_ws_volcano`.
- **Beats:**
  - **Cantor Bastian Coalridge** (gimmick: magma channels; hitting brass sluice-wheels redirects lava flow to open paths, timed at 6 s per cycle with no fail state beyond a respawn at the last wheel): "Heat's honest. It tells you exactly how close is too close."
  - Memorial plaque (lore): "For the herd of the Ash Flats, who ran toward the loudest stone."

### Ch10 — Gloamstair (route_5) — est. 35 m

- **Objectives:** walk the twilight stair; find the stones already silenced (attunement suppressed in this zone until ch11); **Rival 5**; meet **Odile** at the top of the stair. She doesn't battle and speaks with the player.
- **Prereq:** `flag_trial_5_cleared`.
- **Flags set:** `flag_rival_5_done`, `flag_odile_revealed`, `flag_ws_route_5`.
- **Beats:**
  - Cass before R5: "I stopped using Mum's lineup. These are *mine*. So if I lose, it's on me. Which — is weirdly great?"
  - Odile: "You hear them sing, and you call it friendship. I hear them *answer*, and I wonder if they ever had a choice." And: "When the Bell rings, nothing will call them. Not me. Not you. Isn't that fair?"
  - Rowan's reply choice (flavor only, no branching): **[It isn't your choice either.]** / **[Ask them.]**

### Ch11 — Hoarcrown (snowpeak) — est. 60 m

- **Objectives:** ascend the glacier using **Rime** (mandatory, frost) to freeze the falls into stairs; clear `trial_6` at the Rime Hall; Brann blocks the summit path, then steps aside; **two-phase battle vs Magister Odile**; break the Null Bell.
- **Prereq:** `flag_odile_revealed`.
- **Flags set:** `flag_snowpeak_ascended`, `flag_trial_6_cleared` (grants `i_keynote_6`, which unlocks the **Gleam/lumen** register), `flag_admin_brann_2`, `flag_odile_defeated`, `flag_nullbell_broken`, `flag_ws_snowpeak`.
- **Beats:**
  - **Cantor Isaure Frostmere** (gimmick: rime panels; Rime freezes water panels into floor and Kindle thaws them, while a hall lever lets a player without fire kin thaw them too): "Cold is patience made visible. Let's see how patient you are."
  - Brann: "Go on. I've heard enough quiet."
  - Odile phase-B trigger: "…Why is it *singing*? It shouldn't—" Rowan's starter answers the stone.
  - After victory: "Then let it be loud. But promise me you'll listen to what it says."

### Ch12 — Concord (league) — est. 40 m

- **Objectives:** the Waystone lift to Concord Spire; place six Keynotes (`flag_spire_open`); **Rival 6** on the landing; the **Concordant Rhea**; the Great Chord ending; credits; post-game unlocks.
- **Prereq:** `flag_nullbell_broken` **and** all `flag_trial_N_cleared`.
- **Flags set:** `flag_spire_open`, `flag_rival_6_done`, `flag_champion_defeated`, `flag_game_cleared`.
- **Beats:**
  - Cass (R6): "No jokes this time. Just — play your best, okay? I want to lose to the *real* you. Or win. Winning's also fine."
  - Rhea: "I've watched my kid chase my shadow for two years. You're the first one who made them turn around. Now — show me what *you* sound like."
  - Ending line (Oriel, at the Larkhollow stone, which is humming again): "There it is. Same song. New verse."

### 4.1 Obtaining the two unchosen starters (World Designer places)

| Quest | Starter obtained | Availability | Steps | Reward |
|---|---|---|---|---|
| `q_foster_leftover` | **Leftover** starter (neither player nor Cass took it) | Opens at `flag_leftover_rescued` (ch8). Critical-path rescue; accepting the kin is optional. | 1) Return it to Oriel in Larkhollow (fast travel). 2) Oriel asks Rowan to foster it: **[Foster it]** gives it at Lv 25, stage 1. **[Not yet]** leaves it in the Larkhollow fosterage pen, where it can be claimed any time. | Species stage 1 (`c01`/`c04`/`c07` by case), `flag_leftover_obtained` |
| `q_second_clutch` | **Rival's** starter line | Opens at `flag_trial_5_cleared` **and** `flag_leftover_obtained`. Optional; can be finished before the champion. | 1) Oriel: a wild young of Cass's line has been hanging around the fosterage but won't let anyone near. 2) Bring your own starter line **and** the leftover line in your troupe to the Larkhollow Chordstone and resonate. The "Triad Chord" cutscene plays. 3) The young kin joins. | Rival-line stage 1 at Lv 30, `flag_triad_complete`. Kinsong gets a special page flourish. |

Softlock notes:
- Both steps use kin the player already owns and need no specific field register.
- If the player has released their starter or the leftover, Oriel's fosterage offers a **replacement** young of that line after one more conversation. The fosterage never runs dry, so the quest can't be blocked by a release.

### 4.2 Required flags (master list)

`flag_game_started, flag_starter_chosen, flag_rival_1_done, flag_resonance_tutorial, flag_capture_tutorial, flag_forest_rootgate_open, flag_stillmark_first_seen, flag_trial_1_cleared, flag_rival_2_done, flag_trial_2_cleared, flag_cave_heave_gate, flag_admin_brann_1, flag_cave_miners_saved, flag_admin_vey_1, flag_fen_stone_restored, flag_rival_3_done, flag_trial_3_cleared, flag_trial_4_cleared, flag_odile_named, flag_route4_updraft, flag_stillhouse_found, flag_admin_vey_2, flag_leftover_rescued, flag_rival_4_done, flag_trial_5_cleared, flag_rival_5_done, flag_odile_revealed, flag_snowpeak_ascended, flag_trial_6_cleared, flag_admin_brann_2, flag_odile_defeated, flag_nullbell_broken, flag_spire_open, flag_rival_6_done, flag_champion_defeated, flag_game_cleared`
Side: `flag_leftover_obtained, flag_triad_complete`. Waystones: `flag_ws_<zone>` for each zone.

### 4.3 Story-battle loss rule

- **Rival 1:** losing lets the story continue (scripted), and the troupe is healed.
- **All other story battles:** the standard wipe rule from systems.md applies: return to the last Hearthrest, lose a fixed share of tallies, and the event is re-armed.
- **Constraint:** no story battle ever sets a flag on a loss that locks content.

---

## 5. Character language

### 5.1 Proportions

Head ratio = head height / total standing height, measured on the default rest pose.

| Class | Head ratio | Eye height (% of head height) | Limb read | Stance |
|---|---|---|---|---|
| Kin stage 1 | **0.42–0.50** (about 1:1 to 1:1.4 head:body) | 24–30 % | Stubby limbs, short or absent neck | Wide, bouncy, bottom-heavy (center of mass low) |
| Kin stage 2 | **0.30–0.38** | 16–22 % | Limbs lengthen and joints read | Mid-stance, more directional (leaning forward or up) |
| Kin stage 3 | **0.18–0.28** | 10–15 % | Defined musculature via shape, not detail | Grounded or imposing. Silhouette owns one dominant "hero feature". |
| Human child/teen (Rowan, Cass) | 4.5–5 heads tall (0.20–0.22) | 14–16 % | Hands and feet ×1.15 realistic size | Neutral upright, slight forward lean |
| Human adult | 5.5–6 heads (0.17–0.18) | 11–13 % | Hands ×1.1 | Per-character (see §5.6) |
| Human elder | 5.5 heads with 5–10° upper-back curve | 11–12 % | — | — |

Additional rules:
- **Scale continuity.** The largest stage-3 kin is at most 3.2× a human teen's height. The smallest stage-1 kin is at least 0.25× (stays readable in the overworld follow slot).
- **Family continuity.** Across stages, a family keeps: (a) the same eye shape class, (b) its signature feature (it may grow or multiply, e.g. horn count), and (c) the same dominant color. Stage changes add at least 2 new anatomical parts or re-proportion at least 2 existing ones (per ANCHORS: never a scaled recolor).

### 5.2 Faces and eyes (canvas-drawn textures)

Construction. Every face is a canvas texture:
- **Size:** 256×256 per eye on High and Balanced, 128×128 on Mobile, mapped onto a slightly convex eye-disc mesh.
- **Mouth and brows:** separate small meshes, because meshes deform cleanly and stay crisp at all distances.
- **Layer order when drawing:**
  1. sclera shape fill (off-white `#F7F3EA`, never pure white)
  2. iris: radial gradient, outer ring 15 % darker than the center
  3. pupil
  4. an upper-lid shadow band at 12 % opacity
  5. highlights
  6. a 2–3 px dark outline (`#1B1B22` at 85 %)

Eye shape classes. Each family picks one; they're assigned in creatures.md, and no two families in the same primary silhouette group share a class.

| Class | Shape | Feel |
|---|---|---|
| E1 Round | Circle, lid cut 10 % | Friendly, young |
| E2 Almond | Pointed ellipse, tilted 8–12° outward | Clever, alert |
| E3 Teardrop | Round top, pointed lower-outer corner | Gentle, wistful |
| E4 Half-moon | Flat top edge (heavy lid) | Calm, sleepy, stoic |
| E5 Keystone | Rounded trapezoid, wide at top | Bold, sturdy |
| E6 Crescent-lid | Round with a thick sculpted upper lid mesh | Fierce, older (stage 3) |

Pupils. Allowed: round, vertical ellipse (1:2.2), horizontal bar (goat-like, for ungulate kin), or a small ring pupil (hollow centre) for lumen and shade families. No star, heart or spiral pupils.

Highlights. Key light is fixed at **upper-left, 10–11 o'clock** for every face in the game:
- **Primary highlight:** ellipse, 18–22 % of iris diameter.
- **Secondary highlight:** circle, 6–8 % of iris diameter, at 4–5 o'clock.
- On a hit or faint, highlights shrink 50 % (a "dull" read).

Brows. Thin tapered capsule or extruded meshes, 0.6–0.9× eye width, floating 4–8 % of head height above the eye. Kin with no visible brow still have a brow ridge mesh that rotates. Brow rotation per emotion is given in the table below; positive = inner end up.

Mouth. Kin use either a jaw part (hinged) or a mouth-shape mesh set swapped per emotion. Humans use 6 mouth shapes drawn on a small face-plate texture.

Emotion table (applies to kin and humans):

| Emotion | Eyes (texture frame) | Brows | Mouth | Used in |
|---|---|---|---|---|
| Neutral | Open 100 % | 0° | Small closed curve | Idle |
| Happy | Lower lid up 30 % ("smiling eyes") | +8° | Open wide "D" | Victory, pet, capture success in Kinsong |
| Determined | Upper lid down 20 % | −15° (inner down) | Closed, corners flat, or teeth visible | Attack windup, trainer send-out |
| Surprised | Open 115 %, pupil −20 % | +20°, raised 5 % | Small "o" | Chime break-out, encounter start |
| Hurt | Squeezed: two converging arcs | +12° inner, crumpled | Wavy line | Hit reaction (max 400 ms) |
| Sleepy / status | Half-moon at 40 % | −5° | Slack small oval | Sleep or other lingering status idles |
| Quiet (faint) | Closed downward arcs | Relaxed 0° | Slightly open | Faint end pose |

Each species' eye texture holds these **7 frames** in one atlas row. Swaps are instant; a blink is 3 frames of closure (≈ 100 ms) every 2.5–6 s at random.

### 5.3 Silhouettes

- **20 px rule.** At 20 px tall, every stage-3 silhouette (flat black fill) must be distinguishable from all other 29 in a side-by-side test (QA owns the test). Stage 1s must be distinguishable within 3 wrong guesses.
- **Hero feature.** Each family has one hero feature on its outline (horns, fin-sail, tail plate, ear-fans, etc.), plus a second "silhouette break" feature from stage 2.
- **Mass classes.** Each kin belongs to one: *ball*, *pear*, *wedge*, *long-low*, *upright*, *spread-wing*. Within a mass class, no two families use the same hero feature position (top, back, tail, sides).
- **Humans** get a silhouette hook each: Rowan's satchel and cropped jacket, Cass's scarf tail, Oriel's monocle cord and apron, Odile's high collar and long glove, Rhea's asymmetric cape, and a signature prop per Cantor (§5.6).

### 5.4 Color grouping

- **Budget.** 2–3 dominant colors per kin (60 / 30 / 10 split), plus eyes and small accents. The type color doesn't have to be dominant; it must appear in at least one accent (glow, markings or inner mouth).
- **Value contrast.**
  - Between the two most-used colors: ΔL* ≥ 25 (CIELAB).
  - Eye area vs surrounding face: ΔL* ≥ 40.
  - The face must remain the highest local-contrast region of the model.
- **Saturation.**
  - At most one fully saturated color per kin (chroma > 60); the others are desaturated.
  - Stage 3 lowers overall saturation by about 10 % and adds one darker "mature" shade.
- **Material treatment.** Every kin model has roughness variation in two or more bands (e.g. matte fur vs glossy horn). Emissive is only for type features, max emissive intensity 1.5 before bloom.
- **Humans.** Each principal character has a 3-color costume plus skin/hair. Faction membership is signaled by one shared accent (Stillmark mauve `#8C6A8A`, Stewards teal `#2FA39A`, Hearthkeepers rust `#B5543C`).

### 5.5 Emotional poses and animation principles

Pose table (procedural clips, per-part transforms):

| Clip | Kin behavior | Human equivalent |
|---|---|---|
| idle | Breath scale 2–4 % on body (1.8–2.6 s loop), head look-around every 4–7 s, tail or ear secondary motion | Weight shift every 5–8 s |
| alert / encounter | Crouch 6 %, head snaps to target, surprised face 400 ms | Step back, hand raised |
| move | Gait per anatomy; bounce amplitude falls with stage | Walk / run blend |
| attack | Anticipation → action → follow-through (timings below) | Point / fling arm (Tuner command) |
| hit | Hitstop → knockback → recover, hurt face | Flinch |
| capture | Shrink into the Chime's light band (scale → 0.05 over 450 ms with a spiral twist ≤ 90°) | — |
| break-out | Pop with 12 % stretch, surprised face | — |
| faint | Sag, eyes close, settle | Kneel (Tuner loss pose) |
| victory | Hop or rear with happy face | Fist pump / scarf flourish |

Timing at a 60 fps reference. Clips are time-based (ms) and run the same at any framerate.

| Phase | Stage 1 | Stage 2 | Stage 3 |
|---|---|---|---|
| Attack anticipation | 150 ms | 200 ms | 260 ms |
| Attack action (contact/release) | 80 ms | 100 ms | 130 ms |
| Attack follow-through / settle | 220 ms | 260 ms | 320 ms |
| Attack total cap | ≤ 550 ms | ≤ 650 ms | ≤ 800 ms |
| Hitstop on the receiver | 50 ms | 60 ms | 70 ms |
| Knockback + recover | 350 ms | 380 ms | 420 ms |
| Faint | 900 ms | 1,050 ms | 1,200 ms |
| Idle breath loop | 1.8 s | 2.2 s | 2.6 s |

Squash and stretch limits (volume-preserving: scaleY × scaleXZ² ≈ 1):

| Class | Max squash/stretch |
|---|---|
| Stage 1 | 15 % |
| Stage 2 | 10 % |
| Stage 3 | 6 % |
| Humans | 4 % (on jumps / landing only) |

Additional principles:
- **Arcs.** Heads and tails move on arcs, never linear.
- **Overlapping action.** Tail and ear chains lag the parent by 60–120 ms per segment.
- **Offsets.** Every idle is phase-offset per instance so two kin never breathe in sync.
- **Camera shake.**
  - Stage-3 heavy hits only, amplitude ≤ 0.15 m, ≤ 200 ms.
  - Reduced motion disables camera shake and squash/stretch, and replaces knockback with a 2-frame flash plus a tint.

### 5.6 Principal human designs (brief)

| Character | Build | Colors (dominant/secondary/accent) | Hook |
|---|---|---|---|
| Rowan | Teen, 4.75 heads | Moss `#5E7D4A` jacket / cream `#EDE3CC` shirt / brass `#C8963E` buckle | Cross-body satchel with a hanging Reed Chime |
| Cass Rookwell | Teen, 4.75 heads, lanky | Charcoal `#3B3F4A` coat / red-orange `#D9582B` scarf / white `#F2F2F2` | Scarf tail (a 4-segment physics tube) |
| Oriel Vantasse | Adult 5.6 heads, broad | Leather `#7A4E32` / linen `#E8DCC3` / brass | Monocle on a cord, tool-key apron |
| Odile Graven | Adult 6 heads, tall and narrow | Slate `#4A4F5C` / bone `#DAD4C8` / mauve `#8C6A8A` | High collar, single long glove, small silver bell at the belt (clapper removed) |
| Brann Coldcourt | Adult 5.5 heads, very broad | Slate / felt gray / rust | Oversized felted mitts |
| Vey Lanternlow | Adult 5.8 heads, thin | Slate / mauve / plum `#5C3A5E` | Hooded lantern carried with a bent arm |
| Wren Mossgrave (trial_1, verdant) | Adult, wiry | Bark / leaf green / pollen | Pruning hook staff, vine sleeve |
| Dorran Flint (trial_2, stone) | Adult, stocky | Slate / ochre / white dust | Mallet over shoulder, safety goggles pushed up |
| Nerys Tidewell (trial_3, water) | Adult | Lake blue / driftwood / reed gold | Wide-brim rain hat, punt pole |
| Tamsin Galloway (trial_4, gale) | Adult, athletic | White / sea teal / sail red | Kite harness with ribbons |
| Bastian Coalridge (trial_5, fire) | Adult elder, 5.5 heads | Soot / ember orange / brass | Leather forge apron, tongs |
| Isaure Frostmere (trial_6, frost) | Adult | Ice blue / navy / silver | Tall fur collar, glass cane |
| Rhea Rookwell (champion) | Adult 6 heads | Ivory / gold `#D8B35A` / scarf red (echoes Cass) | Asymmetric half-cape |

### 5.7 Originality: convention vs imitation

Genre conventions we **may** use freely: collecting and training creatures; three starters with a type triangle; a rival; a villain faction; badge-like progression; round-ish cute juveniles evolving into larger forms; turn-based 1v1 battles with 4 moves; big expressive eyes; type colors.

Imitation we **must avoid**. QA and the release gate check every item:

1. **Capture devices.** Spherical, two-tone, center-button devices (any red/white or split-hemisphere look). Chimes are hexagonal bell-lanterns with a top loop.
2. **Mascots.** Yellow rodent mascots with red cheek circles; lightning-tail rodents; anything with round cheek-dots used as an "electric sac".
3. **Recognizable species.** A starter that reads as a famous fire lizard with a tail flame, grass quadruped with a back bulb, or blue turtle; also fox with many tails, pink round singer, sleeping giant blocker, or an evolving egg-shaped blob. Voltra, Emberhorn and Rippleback must each pass a "name-covered" review. Per the brief, Voltra is a gliding lizard. It must not have a tail flame, an orange body with a cream belly, or a dragon-wing read.
4. **UI layouts.** Battle HUD layouts that copy the franchise's diagonal placement plus its specific HP-bar colors and labels. Our HUD uses a different composition (§7.4) and a "resonance string" HP meter.
5. **Phrases.** Fixed phrases: "A wild ___ appeared!", "It's super effective!", "Go! ___!", "fainted", "Trainer ___ would like to battle!". The trainer-spotted "!" bubble is replaced by a **chord-burst** icon: three short radiating arcs.
6. **Audio.** Healing jingles, level-up fanfares or battle intros that echo known melodies (see the §8 check). No 8-bit square-wave pastiche as the primary palette.
7. **Villains.** No letter-on-chest uniforms, no "Team ___" naming, no motto chant.
8. **Encyclopedia.** A red handheld encyclopedia device. The Kinsong is a cloth-bound songbook.
9. **Signature combinations.** No combination of silhouette, palette and signature feature that maps to one specific existing creature, even if each part alone is generic. Review method: two reviewers, name and color hidden, silhouette at 64 px. "Reminds me of X" from both reviewers means redesign.

---

## 6. Signature mechanic — Resonance

### 6.1 Concept

Landmarks carved with a **type glyph** are *resonant nodes*. A kin of the matching type in the troupe can "sing" to a node, which transforms it permanently. Registers (action categories) are unlocked by the tutorial and by Keynotes. Each zone's **Chordstone** is a Waystone for fast travel and sets the zone's **attunement**, a small battle bonus. Exploration (what you can reach), collection (which types you keep in your troupe) and combat (attunement) all run through one system.

### 6.2 Field actions — all 10 types

| Type | Register name | Node object (visual) | Effect | Unlocked by | Progression role |
|---|---|---|---|---|---|
| verdant | **Rootcall** | Seed-knot on a root or wall, green glyph | Grows a vine ladder or bridge (fixed geometry that appears with a grow animation) | Tutorial (ch1, `flag_resonance_tutorial`) | **MANDATORY**: forest Rootgate (ch2). Also secrets. |
| electric | **Spark** | Dormant brass lode-gate or lift | Powers a gate or lift | Tutorial (triad register) | Secrets and shortcuts only (cave lift shortcut, Galewick lighthouse) |
| fire | **Kindle** | Thornwood knot or ice plug | Burns thornwood away; thaws a frost plug | Tutorial (triad register) | Secrets only (Kindle in Rime Hall has a lever alternative) |
| water | **Swell** | Current-stone in a stream | Raises stepping-stones for 60 s, or fills a basin | Tutorial (triad register) | Secrets only (the volcano vent has a talk-to-steward alternative) |
| stone | **Heave** | Cracked boulder with a stone glyph | Shifts the boulder 2 m along a groove | `i_keynote_1` (trial_1) | **MANDATORY**: Undertone lower galleries (ch4). Also secrets. |
| toxin | **Seep** | Rusted grate or corroded lock | Dissolves the grate | `i_keynote_2` (trial_2) | Secrets only (fen caches, Stillhouse back door shortcut) |
| gale | **Gust** | Updraft vent with a ribbon marker | Lifts the player and follower to a marked landing; fixed path | `i_keynote_3` (trial_3) | **MANDATORY**: Highscar Rise ascent (ch8). Also secrets. |
| shade | **Veil** | Shadow-veil curtain (purple haze) | Fades the veil, revealing a hidden path or chest | `i_keynote_4` (trial_4) | Secrets only |
| frost | **Rime** | Waterfall or water panel with a frost glyph | Freezes it into walkable ice | `i_keynote_5` (trial_5) | **MANDATORY**: Hoarcrown frozen-falls ascent (ch11). Also secrets. |
| lumen | **Gleam** | Unlit beacon brazier or sun-dial | Lights a beacon, revealing a star-path or opening a shrine | `i_keynote_6` (trial_6) | Secrets only, including the post-game **Old Chord Shrine** |

Mandatory set, and how each is guaranteed:

| Register | Gate | Guaranteed source before the gate | Steward fallback |
|---|---|---|---|
| Rootcall (verdant) | forest Rootgate | Scripted route_1 capture-tutorial kin (f04 stage 1), plus common f04 on route_1 and the forest edge | Yes |
| Heave (stone) | cave lower galleries | f05 stage 1 common on route_2 and the cave mouth | Yes |
| Gust (gale) | route_4 ascent | f07 stage 1 common on route_1/route_4 lower slope; Cass's gale kin is shown as a hint in R2 | Yes |
| Rime (frost) | snowpeak falls | f06 stage 1 common on route_5 and the snowpeak foot | Yes |

The World Designer must confirm these encounter placements. Starter types (electric/fire/water) are **never** mandatory, because the player may not own the needed one.

### 6.3 Interaction flow and UI prompts

1. **Marker.** Every node shows its carved glyph (§7.3). The glyph emits softly in the type color and has a unique shape, so it's readable without color. Unregistered or locked nodes are dull stone; available nodes pulse (1.2 s period; static under reduced motion).
2. **Range.** When the player is within **3.0 m** and facing within 60°, a prompt appears above the node:
   - Ready: `[E] Resonate — Rootcall · {KinName}`. The mobile context button shows the type glyph plus "Resonate". A gamepad shows the south face button.
   - Missing type: `Needs a Verdant kin in your troupe.` If a Steward is present, this becomes `Ask the Steward for help`.
   - Register locked: `This register is still silent — earn the Keynote of Rootloft Hall.`
   - Already done: no prompt; the node shows its transformed state.
3. **Which kin performs.** The first troupe member of the matching type, **fainted or not**, walks out. ("Even a quiet kin can hum.") This way HP never blocks traversal.
4. **Sequence (≈ 1.8 s; skippable after the first time per register):**
   - kin walks to the node
   - anticipation (200 ms)
   - type-colored ripple ring expands 0 → 4 m (600 ms)
   - node transforms (800 ms)
   - kin does a happy pose
   - Chime-note SFX in the register's pitch (§8.6)
5. **Persistence.** Solved nodes are stored as `rn_<zone>_<nn>` in the save (committed on completion). Transformations are permanent, except **Swell** stepping-stones, which reset after 60 s and are never on a mandatory path.
6. **Journal.** The Tuning Ledger's "Registers" page lists the 10 registers with glyph, status (Silent / Tuned) and hint text. The map marks discovered but unsolved nodes with a hollow glyph.

### 6.4 In battle — attunement

| Rule | Value |
|---|---|
| Zone attunement | The zone's type (§1.2). Trial halls use the Cantor's type. Towns, league and interiors (other than trial halls) are neutral. |
| Effect | Moves of the attuned type get **×1.10 power**, for **both sides** (player, wild, AI). Applied as a separate multiplier after STAB and before type effectiveness; systems.md finalizes the order. |
| Attuned kin | A kin whose type(s) include the attuned type gets a small "attuned" glyph on its HUD plate. No stat change (flavor and readability only). |
| Weather bias | Attunement adds a bias to the zone weather table. Suggested: fire → heat, water → rain, frost → snow, gale → wind, others → no bias. World Designer and systems.md own the numbers. |
| Silenced stones | Until the story restores them (route_3 in ch5, route_5 in ch11), a silenced zone shows `Attunement: Silenced` and applies no bonus. |
| Odile phase A/B | Phase A is Silenced; phase B restores frost ×1.10 (§2.5). |
| HUD | Top-center pill: `[glyph] Attuned: Verdant ×1.1`. Tooltip / long-press: "Verdant moves resound here." |

### 6.5 Tutorial integration

| When | What the player learns | How |
|---|---|---|
| Ch1 Larkhollow green | Resonating in general; the node glyph; triad registers | The player's starter solves a secret-only triad node (Spark, Kindle or Swell by starter). Its reward is a Reed Chime ×2 cache, so there's instant feedback. |
| Ch1 Waystone | Waystones = fast travel; any kin can resonate a Chordstone | The player resonates route_1's Chordstone. The first attunement tooltip appears in the next wild battle. |
| Ch2 Rootgate | Needing a specific type | The captured f04 is suggested by Oriel's Ledger note: "Your new friend is verdant — the forest will like that." The first Steward appears here if the player has no verdant kin. |
| Each Keynote | New register | A Keynote ceremony card: "New register tuned: Heave (Stone)" with a glyph animation. The first node of that register sits within 60 s' walk of the hall exit. |

### 6.6 Softlock-proof rules (binding)

1. **R1.** Every mandatory node has a **Resonance Steward** within 15 m. The Steward performs the action with a loaned kin if the troupe lacks the type.
2. **R2.** Mandatory registers come only from non-starter types (verdant, stone, gale, frost). Each has a guaranteed or common encounter in a zone the player must pass through before its gate.
3. **R3.** Fainted kin can resonate. HP, PP and status never block a field action.
4. **R4.** Mandatory transformations are permanent. They're committed to the save in the same write as the flag, and never undone by story events.
5. **R5.** No mandatory node sits on the *return* path. The player can always walk back to the previous Hearthrest from any point without resonance.
6. **R6.** Waystones (fast travel) never require a type. Stones silenced by the story are either (a) not yet registered, or (b) keep fast travel working while attunement alone is suppressed.
7. **R7.** Load-time validation (a QA test). For each mandatory node, the node's type must be in the union of encounter-table types for zones reachable before the gate **or** a Steward must exist. A content build fails otherwise.

---

## 7. UI language

### 7.1 Palette

| Token | Hex | Use |
|---|---|---|
| `ink` | `#1E2433` | Text on light surfaces, outlines |
| `night` | `#232B3D` | Primary panel background (dark UI default) |
| `night-2` | `#2F3A52` | Raised panel / hover |
| `parchment` | `#F3EAD7` | Dialogue box body, Kinsong pages |
| `parchment-2` | `#E3D5B8` | Page shade, dividers |
| `brass` | `#C8963E` | Frames, focus rings, selected state |
| `brass-hi` | `#E8C27A` | Focus glow |
| `resonance` | `#2FA39A` | Resonance prompts, attunement, positive feedback |
| `alert` | `#E0604F` | Danger, low HP |
| `mist` | `#9AA5B8` | Disabled, secondary text on dark |
| `white-text` | `#F7F3EA` | Text on dark (never pure white) |

Contrast requirements:
- Body text: at least **4.5:1**. `white-text` on `night` ≈ 13:1; `ink` on `parchment` ≈ 13:1.
- Large text and icons: at least **3:1**.

Type colors and glyphs. Chip text is always the 3-letter code, in `ink` or `white-text`, whichever gives ≥ 4.5:1.

| Type | Hex | Code | Glyph (single-color, works in monochrome) |
|---|---|---|---|
| fire | `#E4572E` | FIR | **Upturned teardrop with a notched inner flicker**: an outline drop, point up, with a V-notch cut from its base |
| water | `#2E86DE` | WTR | **Three stacked arcs**, each wider below: a ripple fan |
| electric | `#F2C230` | ELC | **Two offset chevrons joined by a dot**: ›•› drawn at 30° (not a lightning bolt) |
| verdant | `#4CAF50` | VRD | **Sprout**: a vertical stem with two asymmetric leaves |
| stone | `#9C7A54` | STN | **Faceted hexagon**: a hexagon with one internal Y-split |
| frost | `#7FD3E6` | FRS | **Three-bar asterisk with ticked ends**: six arms, each ending in a small cross-tick |
| gale | `#8FB9A8` | GAL | **Open spiral with a trailing tail**: 1.5 turns |
| toxin | `#9B4FB0` | TOX | **Three bubbles in a triangle**: big, medium, small, the small one hollow |
| shade | `#4B3F72` | SHD | **Eclipse crescent**: a filled circle overlapped by an offset outline circle |
| lumen | `#F5E6A8` | LUM | **Four-point star inside a thin ring**, with the star points touching the ring |

Glyph and chip rules:
- Glyphs are drawn on a 24×24 grid with a 2 px stroke, round caps, and no fills except where stated.
- Every glyph is unique in outline, so it's readable at 16 px in grayscale.
- Dark types (shade) get a `white-text` chip label; light types (lumen, electric, frost) use `ink`.

### 7.2 Typography (no remote font CDN)

| Role | CSS stack | Size / weight |
|---|---|---|
| Display (titles, Keynote cards, Cantor names) | `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", Georgia, serif` | 32–56 px, 600, letter-spacing 0.02em, small-caps for labels |
| UI and body (menus, dialogue) | `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif` | Dialogue 20 px (min 18 on mobile), menus 16–18 px, captions ≥ 14 px; 400/600 |
| Numbers (HP, levels, prices, stats) | `ui-monospace, "SF Mono", "Cascadia Mono", Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace` with `font-variant-numeric: tabular-nums` | 16–20 px, 600 |

- **Optional bundled font.** An SIL-OFL display face (e.g. a humanist serif) may be vendored locally under `public/fonts/` with its license file. The stacks above are the guaranteed fallback. No runtime network fetch.
- **Text-size setting.** 100 % / 125 % / 150 % scales all UI rem values.
- **Dialogue text speed.** Slow / Normal / Instant.

### 7.3 Iconography style

- Line icons with a 2 px stroke on a 24 px grid, round caps and joins, and one optional fill region. The style matches the type glyphs.
- Carved-stone versions of the type glyphs, used on resonance nodes, are the same paths extruded 2 cm and beveled, emissive in the type color.
- **Item family silhouettes:**
  - Chimes: a hexagonal bell with a loop.
  - Restoratives: a corked vial.
  - Etudes: a cylinder with grooves.
  - Key items: a tuning fork.
- Status icons use a letter plus a shape: "SLP" moon-in-circle, "BRN" flame-in-square, "PSN" bubbles-in-triangle, "PAR" chevrons-in-diamond, "FRZ" asterisk-in-hexagon. The shape changes per status, so status never depends on color.

### 7.4 Panels, layout, motion

**Panel shape: the "fork-notch".** Rectangular panels with an **8 px chamfer on the top-left and bottom-right** corners, a 1.5 px `brass` inner rule inset 4 px, and a `night` fill at 94 % opacity. Dialogue boxes use `parchment` with an `ink` rule and a name tab: a pennant-shaped tab on the top edge, left-aligned.

**Battle HUD composition (original):**
- **Plates.** Both kin plates stack **top-left (foe) and bottom-left (player)**, vertically aligned. The 3D stage stays unobstructed on the right two-thirds.
- **Command panel.** Bottom-right, a **vertical list of 4 commands**: Moves / Satchel / Swap / Retreat, each with an icon. Moves open a 2-column list of move cards (type glyph, name, charges `12/15`, category icon).
- **HP meter ("resonance string").** A horizontal line that "vibrates" (1 px sine wobble, off under reduced motion). Its **pattern changes with HP bands** so it's readable without color:

| HP band | Line | Color |
|---|---|---|
| > 50 % | Solid | `resonance` |
| 20–50 % | Dashed (6/3) | `brass` |
| < 20 % | Dotted, with a pulsing ⚠ glyph | `alert` |

  Numeric `HP 34/81` is always shown for the player's kin; for foes it appears after that species is "sung" in the Kinsong, and a percentage is shown otherwise.
- **Attunement pill:** top-center (§6.4).

**Motion:**
- Panels slide 12 px + fade over 180 ms with ease-out `cubic-bezier(.2,.8,.2,1)`.
- Selection moves the brass focus ring in 120 ms.
- Keynote / Crescendo ceremony cards run 600–900 ms.
- **Reduced motion** replaces slides with 120 ms fades, disables the string wobble, node pulse and camera shake, and makes ceremony cards static.

**Input and accessibility:**
- Every menu is fully keyboard-navigable: arrows/WASD to move, Enter/Space to confirm, Esc/Backspace to go back.
- The focus ring is always visible: brass 2 px plus a 4 px glow.
- The mobile tap target is at least 44×44 px.

### 7.5 Accessibility, color-independent cues (binding)

| Information | Non-color cue |
|---|---|
| Type | Unique glyph shape plus 3-letter code on every chip |
| Effectiveness | Text ("Resounding!", "Muffled…", "No echo.") plus hit SFX variant plus ▲ / ▼ / ∅ marks on move cards once known |
| HP band | Line pattern (solid/dashed/dotted) plus numbers |
| Status | Letter code plus distinct shape |
| Attunement | Glyph plus text in the pill |
| Resonance node state | Pulse or static plus prompt text; the solved node's geometry visibly changes |
| Menu selection | Brass ring plus ▶ caret |

Settings: text size, text speed, reduced motion, camera sensitivity/invert, subtitles for cries/SFX in cutscenes (e.g. "[Voltra chirrs]"), master/music/sfx volume, and mute.

---

## 8. Audio style guide (Tone.js)

### 8.1 Instrument palette

Every instrument is built from Tone.js primitives. No samples are required.

| Role | Tone.js build | Character |
|---|---|---|
| **Glass lead** ("chime") | `FMSynth`, harmonicity 3.01, modulationIndex 8, short attack 5 ms, decay 0.6 s, sustain 0.2 + `Reverb` (decay 3 s, wet 0.25) | The Wildchord signature timbre: struck glass/tuned stone |
| **Reed lead** | `MonoSynth` sawtooth → lowpass 1.8 kHz, Q 2, slight `Vibrato` 5 Hz / 0.1 | Folk woodwind stand-in |
| **Pluck** | `PluckSynth` (attackNoise 1, dampening 3,500, resonance 0.9) | Lute/harp-like arpeggios |
| **Pad** | `PolySynth(AMSynth)` triangle, attack 0.8 s, release 2 s + `Chorus` (1.5 Hz, depth 0.5) | Warm bed |
| **Bass** | `MonoSynth` square/triangle, filter env, glide 0.03 | Round, low |
| **Drone** | `FatOscillator` sawtooth ×3 spread 20 → lowpass 400 Hz | Zone drones (cave, peak) |
| **Kick / tom** | `MembraneSynth` | Soft frame drum |
| **Brush / hat** | `NoiseSynth` pink/white → bandpass | Brushes, shakers |
| **Bell accent** | `MetalSynth` (harmonicity 5.1, resonance 3,000, short decay) | Chordstone hits, trial bells |

- **Master chain:** `Compressor(-18 dB, 3:1)` → `Limiter(-1 dB)` → out.
- **Budget:** at most ~24 simultaneous voices (rendering doc confirms).
- Audio starts only after the first user gesture (title "Press any key" / tap).

### 8.2 Leitmotif

- **"The Chord motif":** 4 notes with the rising interval pattern **root → up a perfect 5th → down a major 2nd → up a minor 3rd** (in D: D–A–G–B♭).
- **Rhythm:** quarter, quarter, dotted-quarter, eighth, then a held root one octave up.
- **Where it appears:** zone themes quote it on the glass lead, and the Great Chord stinger resolves it to major.
- **Odile's motif** is the same contour **inverted and muted**: pluck with fast decay and no reverb.
- **Originality check (required):** before phase 5, each motif and zone melody is compared by ear by two reviewers against well-known game and pop themes. Known risk: short motifs collide easily, so vary the rhythm if flagged.

### 8.3 Zone themes

Loops are 16–32 bars. Tempos are BPM.

| Zone | Key / mode | Tempo | Lead | Pad | Bass | Percussion |
|---|---|---|---|---|---|---|
| title | D major → D Mixolydian | 84 | Glass lead states the Chord motif | Wide AM pad | Pedal D | Soft bell every 4 bars |
| town_1 Larkhollow | G major | 96 | Pluck arpeggio + reed melody | Warm pad | Walking triangle bass | Brush shaker on 2 & 4 |
| route_1 Thistledown | D major | 118 | Reed lead, motif in bar 1 | Light pad | Bouncy octaves | Frame drum + shaker, 8ths |
| forest Murmurwood | E Dorian | 90 | Glass lead, sparse | Chorused pad + wind noise | Sustained root/5th | Log-tom (low Membrane), sparse |
| route_2 Brackenridge | A Mixolydian | 112 | Reed with a drone-fiddle feel | Drone A | Drone + pulse | Stomping kick on 1 & 3 |
| town_2 Knellstone | C major | 100 | Bell accents + pluck | Organ-ish AM pad | Stepwise | Anvil-ish MetalSynth tick |
| cave Undertone | B Phrygian | 76 | Glass, echoing (feedback delay 0.4) | Low drone | Sub pulse | Drip plinks (random, seeded) |
| route_3 Sallowfen | F Dorian | 92 | Reed, lazy swing (16th swing 0.3) | Murky pad (lowpass 900) | Syncopated | Frog-like clicks (short noise) |
| lake Sillowmere | E♭ Lydian | 88 | Glass lead, long notes | Shimmer pad | Slow triangle | Rain-stick noise swells |
| town_3 Galewick | F major | 108 | Reed + pluck call-and-response | Bright pad | Jaunty bass | Snare-brush rolls |
| route_4 Highscar | D Mixolydian | 124 | Reed lead, big leaps | Airy pad (highpass 300) | Driving 8ths | Toms + wind-noise sweeps |
| volcano Cindral | C Phrygian dominant | 104 | Saw-lead (MonoSynth, filter wah) | Dark pad | Heavy root/♭2 | Taiko-like Membrane |
| route_5 Gloamstair | A Aeolian | 80 | Glass motif fragments | Aurora pad (slow LFO filter) | Sparse | Distant bell, very quiet |
| snowpeak Hoarcrown | B minor | 96 | Glass + reed unison | Cold pad (no chorus) | Pedal | Crisp hats, sleigh-ish shaker |
| league Concord | D major | 110 | Full Chord motif, brass-like FM | Full pad | Strong | Processional drums |
| Stillhouse (interior) | Atonal cluster → D minor | 70 | Muted pluck (Odile motif) | Filtered noise bed | None | Clock-tick |
| Hearthrest | G major | 72 | Pluck lullaby, 8 bars | Soft pad | — | — |

### 8.4 Battle music layers

All layers play in sync. Layer changes are **quantized to the next bar** with 400 ms crossfades.

| Layer | Content | On when |
|---|---|---|
| **Base** | 132 BPM, the zone's key (transposed if needed), bass ostinato, kick/snare, pad | Every battle |
| **Melody** | Glass/reed lead, a battle variant of the Chord motif | Trainer battles (wild: melody at −6 dB) |
| **Intensity** | Hats go 16ths, bass octave-pulse, lowpass opens 800 → 4,000 Hz, pad adds a ♭6 tension | The player's active kin HP ≤ 25 % (exits at > 35 %, hysteresis) |
| **Trial-leader variant** | 140 BPM. The Cantor's type sets the lead instrument (fire saw, water glass, verdant reed, stone bell+pluck, gale reed with flutter, frost glass with no reverb decay). Adds a hall bell on bar 1 of every 8. | `t_cantor_*` |
| **Stillmark variant** | 128 BPM, minor, Odile motif, muffled lowpass 2 kHz on everything; Silenced phase has no melody | `t_still_*`, admins, Odile phase A |
| **Odile phase B** | Muffle filter sweeps open to full, the Chord motif returns over her motif | Phase-B trigger |
| **Champion variant** | 146 BPM, modulates up a whole step at the ace send-out, full ensemble, and a counter-melody on pluck | `champion` |
| **Rival variant** | 138 BPM, swing feel, scarf-flutter trill motif | `t_rival_*` |
| **Victory stinger** | 3 s: Chord motif resolved to major, bell hit | Win |
| **Capture stinger** | 2 s: Chime ring + rising pluck | Capture success |

### 8.5 Stingers and jingles (all original, short)

- **Heal (Hearthrest):** 2.5 s. The sounding bowl (MetalSynth, low harmonicity) plus a pad swell and one ascending 5th.
- **Keynote earned:** 4 s. The Cantor's lead plays the Chord motif, and the Keynote's own note is added on top.
- **Crescendo (evolution):** a 6 s rising filtered pad with a pluck arpeggio accelerating from 4 → 16 notes per bar, ending on a bell.
- **Great Chord ending:** a 10 s layered chord. Each Keynote enters as one note of a D add9 voicing.

### 8.6 Creature cry synthesis

Each species gets a parameter record, stored in the creature JSON and authored in creatures.md. The same parameters always give the same cry (deterministic).

| Parameter | Range | Notes |
|---|---|---|
| `voice` | `fm` / `am` / `saw_formant` / `noise_formant` | Picked per family (the family motif) |
| `basePitchHz` | Stage 1: 520–900 · Stage 2: 300–560 · Stage 3: 120–340 | Each stage is at least 5 semitones lower than the previous one in the same family |
| `contour` | 3–5 breakpoints of (t 0–1, semitone offset −12..+12) | Defines the "word" of the cry, unique per family. Stages share the contour shape with timing stretched ×1.15 per stage. |
| `durationMs` | 280–1,200 | Scales with stage |
| `adsr` | attack 5–60 ms, decay 50–300 ms, sustain 0–0.7, release 80–400 ms | — |
| `fmHarmonicity` / `modIndex` | 0.5–6 / 1–20 | FM voice only; higher = more metallic |
| `formants` | 2 bandpass filters (F1 250–900 Hz, F2 900–2,800 Hz) | saw/noise voices; fakes "vowel" |
| `vibrato` | 0–9 Hz, depth 0–0.4 | — |
| `noiseMix` | 0–0.5 | Breath/grit (stone, fire) |
| `typeColor` fx | fire: + distortion 0.1; water: + chorus; electric: + bitcrush 8-bit mix 0.15; frost: + short shimmer delay; shade: + reverse-envelope swell; lumen: + octave-up sine 0.2; gale: + phaser; toxin: + wobble LFO 6 Hz; stone: + low-shelf +4 dB; verdant: + soft pluck transient | Type flavor |

Cry variants:
- **Faint cry:** the same params, pitch −30 %, duration ×1.4, with a downward contour tail appended.
- **Happy chirp** (Kinsong pet, victory): the first 40 % of the contour, pitch +3 semitones.

Constraint: cries must not imitate real animal recordings closely enough to be mistaken for them, and must not reuse a single "species name spoken" gimmick.

### 8.7 SFX list

Every SFX is synthesized, and each gets an id `sfx_*`.

| Category | SFX |
|---|---|
| UI | `ui_move` (soft tick), `ui_confirm` (glass pling), `ui_back` (low pluck), `ui_error` (muted double-thud), `ui_open_panel`, `ui_close_panel`, `ui_page_turn` (Kinsong), `ui_tally_gain` (coin-like bell) |
| Overworld | footsteps ×6 surfaces (grass, stone, wood, sand/ash, snow, water-shallow), `jump`, `land`, `door_open`, `zone_transition_whoosh`, `ledger_open`, `item_pickup`, `chest_open` |
| Resonance | `res_ready` (node in range, hum), `res_trigger_<type>` ×10 (each type's register chord), `res_transform_grow`, `res_transform_shift`, `res_transform_freeze`, `res_transform_gust`, `res_waystone_register` |
| Battle | `battle_start_wild`, `battle_start_trainer` (chord-burst), `send_out`, `recall`, `hit_normal`, `hit_resounding`, `hit_muffled`, `hit_crit` (added bell), `miss_whiff`, `stat_up` (rising sweep), `stat_down` (falling sweep), `status_apply_<status>` ×5, `faint`, `xp_tick`, `level_up`, `retreat_success`, `retreat_fail` |
| Move families | 10 type bases × 3 shapes (projectile, contact, field) = 30 procedural recipes; each move references one recipe plus pitch/duration params (systems.md `animationRef`) |
| Capture | `chime_throw`, `chime_ring_1..3` (shakes), `chime_bond` (success), `chime_break` (break-out) |
| Events | `heal_bowl`, `keynote_get`, `crescendo_start`, `crescendo_finish`, `nullbell_toll`, `nullbell_crack`, `stone_rehum` |
| Ambience beds | meadow (birds via FM chirps), forest (wind + hollow-tree hum), cave (drips, lode crackle), fen (frogs, bubbles), lake (lapping), cliffs (wind gusts), volcano (rumble, hiss), tundra (low wind), peak (blizzard noise) |

---

## 9. Acceptance criteria, dependencies, risks, open questions

### 9.1 Acceptance criteria (for this direction as implemented)

1. All UI, dialogue and content ids use the terminology in §3. A text scan of built content finds **none** of these forbidden terms (case-insensitive): "pokemon", "poké", "pokedex", "dex", "gym", "badge", "trainer card", "elite four", "super effective", "fainted", "team rocket". QA owns the scan. Word-boundary matching avoids false positives, e.g. "index".
2. The story critical path runs ch1 → ch12 using only the flags in §4.2, and every flag in "Prereq" is set by an earlier chapter (automated quest-dependency check).
3. The rival's starter is chosen by the §2.2 rule, and all 3 player choices produce the expected pairing given systems.md's matrix (unit test).
4. Both unchosen starters are obtainable in one save before `flag_champion_defeated` via `q_foster_leftover` and `q_second_clutch`, with the release fallback working.
5. Rival battles: 6 scripted (`t_rival_1..6`). Trials `trial_1..6` are ordered as in §4 with the listed Cantor types. Champion `champion` = Rhea.
6. Resonance:
   - All 10 registers exist with the unlocks in §6.2.
   - The 4 mandatory nodes pass rules R1–R7.
   - Field actions work with fainted kin.
   - Solved nodes persist across save/reload.
7. Attunement ×1.10 applies to both sides in each attuned zone, shows in the HUD pill, and is suppressed in silenced zones and Odile phase A.
8. Character language:
   - Every kin and principal human matches the head-ratio band of its class (§5.1), measured on the rest pose.
   - Every kin has the 7-frame eye atlas.
   - Clip timings fall within §5.5 caps.
   - Squash/stretch stays within its limits.
   - Reduced motion removes shake, squash and pulse.
9. UI:
   - Palette tokens are used.
   - Fonts load with no network request.
   - Text contrast is ≥ 4.5:1.
   - Every type, status, HP band and effectiveness cue has a non-color equivalent (§7.5).
   - Menus are fully keyboard-operable.
10. Audio:
    - Every zone in §1.2 has a theme with the listed key and tempo.
    - Battle layers switch on bar boundaries.
    - The intensity layer follows the ≤25 % / >35 % hysteresis.
    - Cries are deterministic from params.
    - No audio plays before a user gesture.
11. The per-chapter playtime estimates are labeled "estimate" everywhere they appear, until playtesting data exists.

### 9.2 Dependencies

| Needs | From | What |
|---|---|---|
| Type matrix confirming the starter triad (Water > Fire > Electric > Water) and ×1.10 attunement placement in the damage formula | systems.md | Rival pick rule and default table; attunement math |
| Trainer levels / teams for `t_rival_*`, `t_cantor_*`, admins, Odile (2-phase), champion | systems.md | Narrative targets in §4 |
| Encounter placement of f04 (route_1/forest), f05 (route_2/cave), f07 (route_1/route_4), f06 (route_5/snowpeak) before their gates; Steward placement; node coordinates; zone graph; `league` access from `snowpeak`; quest giver positions | world.md | §6.2 guarantees, §6.6 R7 |
| Species eye classes, hero features, mass classes, cry params, family motifs | creatures.md | §5, §8.6 |
| Eye texture resolution per quality profile, emissive/bloom limits, follower spacing, glyph extrusion cost | rendering_and_architecture.md | §5.2, §6.3 |
| Forbidden-term scan, silhouette 20 px test, R7 validator, contrast checks | qa_plan.md | §9.1 |
| Character-consistency checklist referencing §5 | release_character_gate.md | — |

### 9.3 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The triad cycle in systems.md differs from the assumption | Rival pairing text wrong | The rule is formula-based (§2.2); only the default table changes |
| The leitmotif accidentally resembles an existing melody | Originality failure | Two-reviewer listen check. Change rhythm or intervals if flagged. Keep motifs short and non-iconic. |
| Procedural faces look stiff or "uncanny" at small sizes | Character-direction gate fail | 7-frame atlas, fixed highlight rule, brows as meshes; test at 64 px and in-game distance each phase |
| 12 chapters overrun the 8–10 h estimate or fall short | Scope | Chapter budgets let content be cut per chapter. Optional secrets (non-mandatory registers) absorb overflow without touching the critical path. |
| Stewards feel like they trivialize resonance | Weakens the mechanic | Stewards only exist at the 4 mandatory nodes. Secrets require owning the type. |
| Too many coined terms confuse new players | Onboarding | Introduce at most 2 new terms per chapter. The Tuning Ledger glossary page auto-fills as terms appear. |
| Generic words (Tuner, Cantor, Keynote) are used in other media | Naming conflict | Light conflict review (§9.4). These are dictionary words, not franchise-specific coinages. |
| The Great Chord ending relies on a heavy audio mix on mobile | Performance | A pre-rendered `Tone.Offline` buffer for the 10 s stinger, generated at load |

### 9.4 Unresolved questions

1. **Title and region conflict check.** The title "Wildchord" and region name "Cantarra" were chosen without a trademark or store search, which isn't possible here. The orchestrator should do a quick web and store check before release; alternates are *Songs of Cantarra* or *Kinsong*.
2. **Trial_1 difficulty.** Should trial_1 (verdant) be softened for water-starter players? Proposal: the Cantor's team includes one non-verdant kin, and a guaranteed fire-type-effective option is catchable on route_1. Systems and World to confirm.
3. **Etudes reusability.** Owned by systems.md; either choice works for this direction.
4. **`league` placement.** Should Concord Spire be a separate zone id `league` (proposed) or an interior of `snowpeak`? The World Designer decides and documents it.
5. **Choice line in ch10.** Is the flavor-only choice worth the localization cost? Currently kept.
6. **Post-game scope.** The Old Chord Shrine (Gleam secret) and an Odile epilogue letter are proposed, but not budgeted in the 9 h 20 m estimate.
7. **Default protagonist name.** "Rowan" may be changed if it conflicts with prominent characters in the genre (low risk; common given name).
