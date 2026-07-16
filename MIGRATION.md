# PHASER PURGE — React/DOM Mobile-First Migration

Standing order (owner, 2026-07-13): the canvas UI shipped illegibly on mobile.
Pure React/DOM/TS replaces it. This file is the single source of truth for
progress; update the checklist every session. Work on anything else UI-related
is out of order until this is DONE.

## Doctrine
- Mobile-first: author at ~390px logical width, fluid up to a 520px max column.
- FLUID DESIGN MODE: all sizes are clamp(floor, dvh/vw-preferred, ceiling) tokens —
  they interpolate continuously across every device resolution. No breakpoint
  sizing; media queries exist ONLY for discrete show/hide of detail content.
  Touch targets (--tap-min) and legibility floors never scale down.
- Zero hardcoded layout values in components — all from `src/ui-react/tokens.css`.
- Text is real DOM text. Minimum body size 14px physical, touch targets ≥ 44px.
- `GameState` / `GameData` / `num` / RUN SDK code is ported untouched; only the
  presentation layer is rewritten.
- Legacy Phaser build stays bootable via `?legacy=1` ONLY until parity, then both
  `src/scenes/GameScene.ts` and `src/ui/UIManager.ts` are deleted along with the
  phaser dependency.

## Checklist
- [x] Enforcement: CLAUDE.md mandate + this file (2026-07-13)
- [x] Scaffold: React + TS + vite plugin, `?legacy=1` escape hatch (2026-07-15)
- [x] Design tokens (type scale, spacing, colors, radii) in tokens.css (2026-07-15)
- [x] GameController: SDK boot, tick loop, autosave, offline progress, subscribe API (2026-07-15)
- [x] Explore screen v1 — header, descend banner (tap to descend), node with hold-to-search,
      integrity + % readout, base box, noise bar, TEAM row, nav cards, flavor line,
      welcome-back modal (2026-07-15; juice/pets-popup/offer-pill still pending)
- [x] Tab bar + screen routing (stubs on unmigrated tabs) (2026-07-15)
- [x] Shop — premium bundles (owned/locked states), shard packs + first-pack ×2 note,
      RUN balance readout, RUN PLUS card, shard-shop upgrade list (2026-07-15)
- [x] Upgrades — full list, locked ??????, hide-maxed toggle, cost icons, maxed states (2026-07-15)
- [x] Daily reward modal (📅 header button, claim/view modes) + global toast layer (2026-07-15)
- [x] Gear — craft/equip/level/scrap (two-tap confirm), locked ??????, effect summaries,
      Scrap + bag readout (2026-07-15)
- [x] Items — all resource pools incl. tiers, almond water DRINK (2026-07-15)
- [x] Void — fragments, Rewind with confirm + preview, void upgrade list (2026-07-15)
- [x] Achievements — progress bars, tier claims (2026-07-15)
- [x] Modals: settings (haptics, reset w/ purchase-keep notes, hard reset), stats,
      daily reward, welcome back, pet popup (2026-07-15)
- [x] Explore juice: runner sprite (CSS steps run cycle, suit follows Gear Rating),
      lighting cross-fades (bright/dark hall art) (2026-07-15)
- [x] HYPE: prompt pill on the runner, tap to activate, active ×N badge (2026-07-15)
- [x] Moths: scheduled flights (Moth Lure rate), tap-to-catch, Lamp Trap auto-capture,
      Lv10 ×2 — full economy parity (2026-07-15)
- [x] Floating damage numbers (crit/super-crit styling) + node pop on hit (2026-07-15)
- [x] Phantom collectible: dark-phase spawns from the floor's roster, tap to stare down
      (+resources, −20 Noise), fades if ignored (2026-07-15)
- [x] Companion runners (Another Explorer, up to 3 shown) + bright-phase dust motes (2026-07-15)
- [x] Tab notification pips (all six triggers incl. Rewind-ready) (2026-07-15)
- [x] Entity/gear/upgrade icon resolver — PNG art always wins; CamelCase files mapped (2026-07-15)
- NOTE: buddy tap-to-chat intentionally dropped — the runner tap is the HYPE control now.
- [x] Parity audit vs UIManager (2026-07-15): restored node grade tags (MINT/QUALITY/
      EASY ACCESS), weapon-armed runner rows, tier-2+ glow on node art, bag-full craft
      prompt, RESOURCE_ORDER sorting in Items. Confirmed already-dead in Phaser (not
      ported on purpose): abilities buttons, auto-escape toggle (state never read),
      milestones/memoryFragments (saved but unused), damage flash (health dormant).
- [x] Monetization parity: offer pill (floor 3+, countdown, 1h snooze), purchases,
      subscription, daily claim, flee-toll toast (2026-07-15)
- [ ] Device QA on a real phone (fonts ≥ 14px physical everywhere)
- [ ] DELETE Phaser: GameScene.ts, UIManager.ts, phaser dep, legacy flag
