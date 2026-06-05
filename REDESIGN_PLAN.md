# Backrooms Idle — Design (Explorer / "Idle Miner" model)

> The proven idle loop (à la Cavern Idle Miner), reskinned as **exploring the Backrooms
> instead of mining**. Keep all the content that gives this game identity — the resources,
> the entities, the levels, the lore. Cut the survival-sim baggage (HP/Sanity/death/combat).
> Make the numbers compound so it's actually fun.

---

## The core loop

```
EXPLORE the current level (idle, automatic)
        ↓  passively find this level's RESOURCES   ← your "ore"
SPEND resources on UPGRADES (explore faster, find more, dig deeper)
        ↓  upgrades compound → exploration accelerates
DESCEND to the next level when ready
        ↓  each new level = a new, rarer RESOURCE TIER that gates better upgrades
…repeat, deeper and richer each time…
        ↓
REWIND (prestige) = reset the run for permanent multipliers, climb back faster
```

**Depth is the main axis of progress** — "how deep have I gotten" is the big number you
always chase. Going deeper unlocks the next resource, which unlocks the next upgrades.

---

## Resources = infinite tiers from finite art  *(player's idea)*

- A fixed base list of resource types (reuse the existing icons: cloth scraps, batteries,
  scrap metal, almond water, canned food, firesalt, lucky coins…).
- You unlock them in sequence as you descend. When the list runs out, it **repeats at the
  next tier**: same icons, but with a **colored outline** marking the tier
  (Tier 1 = none, Tier 2 = red, Tier 3 = next color, … forever).
- Higher tier = rarer, worth more, and required by the next band of upgrades.
- Net: endless resource progression with no new art. Deeper is always "unlock the next one."

---

## Upgrades = the compounding engine

- Spend resources on upgrades that make exploring **faster / find more / reach deeper**.
- Upgrades are **multiplicative and effectively uncapped** (cost curve does the pacing, not a
  hard maxLevel), so buying the next one always matters — the "numbers accelerate" feeling.
- Deeper upgrades cost deeper-tier resources → the reason to keep descending.
- Reuse the existing upgrade ideas (Quick Feet = explore speed, Sharp Eyes = find rate,
  Scavenger = double find…). The old combat/defense upgrades get repurposed into useful idle
  ones (e.g. deeper-find chance, offline yield, auto-explore).

## Prestige = the long-term engine (kept)

- **Rewind the Tape** stays: reset the run for **Void Fragments**, a permanent currency that
  buys global multipliers. Payout scales with the **deepest level reached**.
- Procedural infinite depth already exists in code; rewards just need to keep pace.
- Theme intact: waking back in the Lobby, "the carpet is the same."

---

## Entities = clickable bonuses, NOT threats  *(player's idea)*

- No HP, no Sanity, no death, no combat. Those are cut.
- Instead, an entity (Smiler, Hound, Skin-Stealer…) **drifts across the screen** now and
  then. **Tap it for a temporary bonus** — a speed surge, double finds, or a resource burst.
- Ignore it → nothing bad happens. Pure upside for paying attention (like golden cookies,
  but it's the Backrooms creatures). Keeps the monsters cool and the active layer fun.

---

## Onboarding / clarity (first 30 seconds must work)

- Visible, filling exploration bar + resource counters from second 1 ("Exploring The Lobby…").
- One obvious, bright thing to tap (never gray/disabled-looking).
- A one-line goal: "Find resources → upgrade → descend deeper."
- Reveal advanced systems (Prestige/Void) only when first relevant — not all at once.
- Tooltips everywhere (the data already has description fields).

---

## What we KEEP vs CUT

**Keep:** all resources (now tiered), all entities (now clickable buffs), all levels (now
depth/tiers), the lore + ambient writing, the Rewind/Void prestige, the procedural infinite
depth.

**Cut:** HP, Sanity, death/respawn, the firesalt-block combat resolution, gear/equipment,
crafting, the old shop (revisit later if wanted). Anything that served the survival sim.

---

## Build order (small, approved, committed slices — game runs after each)

1. **Core loop** — explore → find tiered resources → buy compounding upgrades → descend.
   Clarity/onboarding built in from the start. (No HP/Sanity; entities not yet interactive.)
2. **Resource tiers + colored outlines** — the infinite-cycle resource system.
3. **Entities as clickable drifting bonuses.**
4. **Prestige (Rewind/Void) wired to the new loop.**
5. **Tuning pass** (headless sim for pacing).
