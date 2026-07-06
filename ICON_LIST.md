# Backrooms: Idle Survival — Art Assets Still Needed

Style guide: VHS / analog horror aesthetic. Grainy, slightly distorted, muted colors with occasional harsh contrast. Think old security camera footage, worn tape labels, liminal space photography.

- **Color palette:** Yellows (#E8DCA0, #C4A44A), blacks, dark browns, muted greens, occasional harsh red/orange for danger
- **Texture:** Grain, VHS scan lines, slight blur, analog noise
- **Background:** Transparent PNG so icons layer over the dark UI
- **Sizes:** entities render up to ~300px in the showcase → make at 512×512; everything else works at 64–128px → make at 256×256

Ordered by on-screen impact. ✅ sections at the bottom are done — listed so this file is the single source of truth.

---

## 1. Shop upgrades — MEDIUM (36px inline icon on the card name line)

Two of these have NO icon at all (blank), the rest are emoji:

| File | Upgrade | Description |
|---|---|---|
| `icons/shop/search_upgrade.png` | Search Upgrade (blank) | A magnifying glass over damp carpet / pried-open wall panel. |
| `icons/shop/hype_train.png` | Hype Train (blank) | A toy train with party streamers, slightly wrong. |
| `icons/shop/stealth_camping.png` | Stealth Camping (⛺) | A tent pitched inside an office room, lights off. |
| `icons/shop/boxed_supplies.png` | Boxed Supplies (📦) | A dented cardboard box packed with almond water bottles. |
| `icons/shop/second_explorer.png` | Another Explorer (🏃) | A second silhouetted wanderer waving from down the hall. |

## 2. Void upgrades — MEDIUM (small inline icon; 9 total, all emoji)

`icons/void/` — void_resonance (🌀), deep_pockets (🧳), familiar_halls (🚪), fragment_sight (👁️), void_hunger (🕳️), moth_lure (🦋), lucid_memory (💭), umbral_veil (🌑), void_conduit (💠). Dark purple/static VHS-glitch styling to match the void tab.

## 3. Run upgrades — LOW (35 upgrades, small inline emoji; roster may still change)

`icons/upgrades/` — auto_explore 🤖, moth_powers 🦋, master_scav 🎒, sharp_eye 👁️, trapper 🪤, rally_cry 📣, lucky_find 🍀, heavy_sweep 🧹, quality_find ✨, quality_sense 🔍, splinters 🪵, metal_head 💥, stocked_shelves 📦, tape_it 🧷, prism_sight 🔷, battery_pack 🔋, bright_idea 🪔, dead_air 📻, watchful_eye 📹, soft_soles 👟, camera_flash 📸, escape_plan 📄, charted_routes 🗺️, stockpile 🥫, field_rations 🍱, sugar_rush 🍫, wrapped_tight 🩹, steady_hands 💊, iodine_regimen ☢️, brittle_burn ⚫, bone_deep 🦴, silent_decoys 🧍, still_waters 💧, pain_tolerance 🩸, mint_condition 🪙.

**Repurpose candidates before making new art** — these PNGs are loaded but used by NOTHING (leftovers from the old upgrade/gear rosters):
- `icons/upgrades/sharp_eyes.png` → sharp_eye
- `icons/upgrades/quiet_steps.png` or `icons/equipment/steel_toe_boots.png` → soft_soles
- `icons/upgrades/scavenger.png` → master_scav
- `icons/upgrades/quick_feet.png`, `thick_skin.png`, `iron_will.png`, `regeneration.png`, `meditation.png`, `icons/equipment/hazmat_suit.png` → unassigned, free for anything

---

## ✅ Already covered (no work needed)

- **Resources:** all 31 floor resources + moth have PNGs.
- **Entities:** ALL 14 — smiler, hound, skin_stealer, partygoer, the_wretched, clump, doll_face, scrambles, corpus_vitis, lucky_crane, moth, plus CrimsonWatcher/InkCrawler/TheArchivist/FrostShade (PascalCase files).
- **Weapon gear:** PipePistol, ScrapShotgun, SalvagedAR, ImpossibleGun (in `icons/equipment/`).
- **Non-weapon gear:** every tool/light/pack/charm item reuses an existing equipment/resource PNG via `iconTexture`.
- **Pets:** Static, Snapshot, PartyBalloon, BlackCat (in `icons/pets/`, texture keys `icon_pet_*`). Lamp Trap reuses the `lamp` resource icon — fine, or give it its own trap-rigged-lamp art later.
- **Scrap currency:** `icons/equipment/Scrap.png`, shown in the gear header (emoji fallback kept).
- **Abilities:** scavenge, barricade, signal_flare.
- **Prestige:** void_fragment, void_shard, rewind_button, depth_counter.
- **Player character:** buddy1–6 sprite sheets (suits + weapon run variants).
- **Thumbnail / wallpaper:** done.

Note: `icons/entities/elevator.png` exists on disk but nothing loads or references it yet.

## Not worth art yet

- **Achievements** — the defs have no icon field; cards are text-only by design.
- **Tab bar icons** — tabs are text labels now (only SHOP shows the void_shard icon); revisit only if the tab bar gets an icon treatment.
