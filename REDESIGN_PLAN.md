# Backrooms Idle — Redesign Plan (design-panel synthesis)

> **Evolve, don't rewrite.** Keep every resource, entity, level, lore line, boss, gear
> piece, and the Rewind/Void prestige. The content is the strength and the moat. The
> problems are (1) the numbers don't compound and (2) the game doesn't explain itself —
> both fixable *on top of* what exists. Protect the theme; fix the math and the clarity.

This is a synthesis of three independent expert passes (idle-systems designer, Backrooms
creative director, adversarial critic). They agreed on almost everything below.

---

## The verdict all three reached
- **Content stays 100%.** 8 resources, 9 entities, hand-crafted levels, lore, gear, bosses,
  Rewind/Void — sacred. Merging/deleting content is what killed the last attempt.
- **Two real problems:** nothing compounds (upgrades are additive & hard-capped, so the
  "big number" never accelerates), and the game is invisible/confusing to a new player
  (auto-runs with nothing obvious to tap; jargon dumped all at once).
- **Most fixes are math + UI layered onto existing systems.** Small approved increments,
  game always runs, commit each step.

---

## A. Make the numbers compound  *(the "it's finally an idle game" fix)*
- Convert the headline upgrades (Quick Feet, Sharp Eyes, Scavenger, defense) from
  **additive+capped → multiplicative + uncapped**. The cost curve is already exponential;
  the `maxLevel` was just throttling it. Buying upgrade #14 should still move the needle.
- Stack multiplier sources as a **product, not a sum**: run-upgrades × gear × void × depth × milestones.
- Give **Total Depth real teeth**: every level ever cleared = a permanent ×production
  ("DepthMult"). The "big number always going up" finally *does* something.
- Reward re-clearing a level ("Familiarity" stacks) — gives cleared levels a purpose.

## B. Turn prestige into the long-term engine
- Rewind payout should scale with the **deepest level reached** (exponential), not with
  exploration-grinding or deaths (the current formula literally pays you to die).
- Add **2–3 uncapped multiplicative Void nodes** — the thing you pour 50 prestiges into.
  Keep all 8 existing Void upgrades as the cheap early tier.
- Infinite procedural depth is already built; just make the rewards keep pace → truly infinite.

## C. Make it legible in the first 30 seconds  *(the onboarding fix — the critic's #1)*
- Visible, filling exploration bar + counters from second 1 ("Exploring The Lobby…").
- **One obvious, bright primary action to tap** (never gray). Teaches "tapping = stuff happens."
- A persistent one-line goal banner: "Find a Level Key → fill the bar → ESCAPE deeper."
- Reveal advanced tabs (Void / Gear / Craft / Shop) only when first relevant — not all at once.
- First entity = a **taught moment** (explain avoid → firesalt → damage), not a surprise.

## D. Turn "taxes" into decisions
- Telegraph penalties; give agency. Soften death's 30% exploration hit. Surface the
  Lucky-Coin insurance choice *before* death. Make sanity drain a visible budget the player
  weighs ("push for the key, or retreat to recover?").

## E. Kill the small confusions
- **Rename the currency collision:** "Void Fragments" (earned) vs "Void Shards" (paid) —
  players will confuse them. Rename the paid one.
- Tooltips everywhere (the data already carries `description` fields — just surface them).

---

## THE ONE OPEN DESIGN DECISION → I need your call
**HP vs Sanity.** The experts split:
- **Idle designer:** *merge* them into a single bar ("Resolve"). In the code they're
  mechanically identical — both drain, both auto-heal at 25%, either hitting 0 = death.
  The player makes no distinct decision between them. Merging is cleaner and creates real
  risk/reward.
- **Backrooms director:** *keep both.* Entities threaten the **body** (Hound: 12 dmg) vs the
  **mind** (Ink Crawler: 30 sanity) differently, and that duality is deeply thematic. The fix
  isn't deleting Sanity — it's making it a *real* threat instead of an auto-managed leak.

Both agree the current **auto-heal makes them meaningless**. So the fork is: **merge to one
bar**, or **keep two but make each genuinely matter** (and remove the auto-heal either way).

---

## How we build it (so this never wastes your time again)
Smallest high-leverage slice first. You approve each one. We commit each one. The game runs
end-to-end after every step. No big-bang anything.

1. **Compounding math (A)** — the single change that makes it *feel* like an idle game.
2. **Onboarding / clarity (C)** — make it legible in 30 seconds.
3. **Prestige engine (B).**
4. **Decisions-not-taxes + confusions (D, E).**

(Reasonable to start with #1 *or* #2 — your call.)
