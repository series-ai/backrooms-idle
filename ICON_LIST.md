# Backrooms: Idle Survival — Art Assets Still Needed

Style guide: VHS / analog horror aesthetic. Grainy, slightly distorted, muted colors with occasional harsh contrast. Think old security camera footage, worn tape labels, liminal space photography.

- **Color palette:** Yellows (#E8DCA0, #C4A44A), blacks, dark browns, muted greens, occasional harsh red/orange for danger
- **Texture:** Grain, VHS scan lines, slight blur, analog noise
- **Background:** Transparent PNG so icons layer over the dark UI
- **Sizes:** entities render up to ~300px in the showcase → make at 512×512; everything else works at 64–128px → make at 256×256

Ordered by on-screen impact. ✅ sections at the bottom are done — listed so this file is the single source of truth.

---

## 1. Entities — HIGH priority (full-size encounter art, ~300px on screen)

These four still show a single emoji where every other monster has real art:

| File | Entity | In-game flavor to work from |
|---|---|---|
| `icons/entities/crimson_watcher.png` | Crimson Watcher (🔴) | "Red light pulses from around the corner. Something watches." A pulsing red eye/lamp glow bleeding around a hallway corner. |
| `icons/entities/ink_crawler.png` | Ink Crawler (🖋️) | "Words crawl off the pages and skitter toward you." A skittering many-legged mass made of handwriting and ink. |
| `icons/entities/archivist.png` | The Archivist (📚) | '"You are not catalogued." A figure turns from the shelves.' Tall librarian silhouette between endless shelves, too many card-catalog drawers. |
| `icons/entities/frost_shade.png` | Frost Shade (❄️) | "Your breath turns to ice. Something moves in the fog." A gaunt shape half-visible in freezer fog, frost-rimmed. |

Note: `icons/entities/elevator.png` already exists on disk but nothing loads or references it yet (also still untracked in git).

## 2. Weapon gear — HIGH priority (88px slot box + gear cards; all four currently share the same 🔫 emoji)

| File | Item | Description |
|---|---|---|
| `icons/equipment/pipe_pistol.png` | Pipe Pistol | A single-shot pistol built from plumbing pipe, duct tape grip. |
| `icons/equipment/scrap_shotgun.png` | Scrap Shotgun | Double-barrel of welded scrap metal and tape, sawn-off, crude. |
| `icons/equipment/salvaged_ar.png` | Salvaged AR | A rusted, mismatched-parts rifle with a taped magazine. |
| `icons/equipment/impossible_gun.png` | Impossible Gun | A weapon with wrong geometry — barrels that don't line up, faint static/glitch aura, unsettling. |

## 3. Pets — HIGH priority (104px in the pet modal, 46px shop button)

Code already looks for these texture keys and falls back to emoji:

| File | Pet | Description |
|---|---|---|
| `icons/pets/pet_static.png` | Static (📺) | A torn, floating scrap of living TV static — jagged edges, scan lines, faint glow. Crackles when luck spikes (Super Crits). |
| `icons/pets/pet_snapshot.png` | Snapshot (📷) | A twitchy little instant camera creature on stubby legs, flashbulb charged — it files finds in mint condition. |
| `icons/pets/pet_balloon.png` | Party Balloon (🎈) | A red balloon that drifted away from the Partygoers, string trailing, a faint =) sheen on its skin. |
| `icons/pets/pet_cat.png` | Black Cat (🐈‍⬛) | A black cat with faint static in its eyes. |

(Lamp Trap currently reuses the `lamp` resource icon — fine, or give it its own trap-rigged-lamp art later.)

## 4. Scrap currency — HIGH priority (gear header, dismantle buttons, rewind summary)

| File | Description |
|---|---|
| `icons/prestige/scrap.png` | Scrap (🔩) — a small pile of bolts/bent metal bits on torn cloth. Sits alongside void_shard/void_fragment which already have art. |

## 5. Shop upgrades — MEDIUM (36px inline icon on the card name line)

Two of these have NO icon at all (blank), the rest are emoji:

| File | Upgrade | Description |
|---|---|---|
| `icons/shop/search_upgrade.png` | Search Upgrade (blank) | A magnifying glass over damp carpet / pried-open wall panel. |
| `icons/shop/hype_train.png` | Hype Train (blank) | A toy train with party streamers, slightly wrong. |
| `icons/shop/stealth_camping.png` | Stealth Camping (⛺) | A tent pitched inside an office room, lights off. |
| `icons/shop/boxed_supplies.png` | Boxed Supplies (📦) | A dented cardboard box packed with almond water bottles. |
| `icons/shop/second_explorer.png` | Another Explorer (🏃) | A second silhouetted wanderer waving from down the hall. |

## 6. Void upgrades — MEDIUM (small inline icon; 9 total, all emoji)

`icons/void/` — void_resonance (🌀), deep_pockets (🧳), familiar_halls (🚪), fragment_sight (👁️), void_hunger (🕳️), moth_lure (🦋), lucid_memory (💭), umbral_veil (🌑), void_conduit (💠). Dark purple/static VHS-glitch styling to match the void tab.

## 7. Run upgrades — LOW (22 upgrades, small inline emoji; roster may still change)

`icons/upgrades/` — auto_explore 🤖, moth_powers 🦋, master_scav 🎒, sharp_eye 👁️, trapper 🪤, rally_cry 📣, lucky_find 🍀, heavy_sweep 🧹, quality_find ✨, quality_sense 🔍, splinters 🪵, metal_head 💥, stocked_shelves 📦, tape_it 🧷, prism_sight 🔷, bright_idea 🪔, dead_air 📻, watchful_eye 📹, soft_soles 👟, camera_flash 📸, escape_plan 📄.

**Repurpose candidates before making new art** — these PNGs are loaded but used by NOTHING (leftovers from the old upgrade/gear rosters):
- `icons/upgrades/sharp_eyes.png` → sharp_eye
- `icons/upgrades/quiet_steps.png` or `icons/equipment/steel_toe_boots.png` → soft_soles
- `icons/upgrades/scavenger.png` → master_scav
- `icons/upgrades/quick_feet.png`, `thick_skin.png`, `iron_will.png`, `regeneration.png`, `meditation.png`, `icons/equipment/hazmat_suit.png` → unassigned, free for anything

---

## ✅ Already covered (no work needed)

- **Resources:** all 31 floor resources + moth have PNGs.
- **Entities:** smiler, hound, skin_stealer, partygoer, the_wretched, clump, doll_face, scrambles, corpus_vitis, lucky_crane, moth.
- **Non-weapon gear:** every tool/light/pack/charm item reuses an existing equipment/resource PNG via `iconTexture`.
- **Abilities:** scavenge, barricade, signal_flare.
- **Prestige:** void_fragment, void_shard, rewind_button, depth_counter.
- **Player character:** buddy1–6 sprite sheets (suits + weapon run variants).
- **Thumbnail / wallpaper:** done.

## Not worth art yet

- **Achievements** — the defs have no icon field; cards are text-only by design.
- **Tab bar icons** — tabs are text labels now (only SHOP shows the void_shard icon); revisit only if the tab bar gets an icon treatment.
