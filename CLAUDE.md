<source-index>
root:.|.:{AGENTS.md,CLAUDE.md,GAME_DESIGN.md,GEMINI.md,ICON_LIST.md,MIGRATION.md,REDESIGN_PLAN.md,index.html,package.json,pnpm-lock.yaml,tsconfig.json,vite.config.ts}|.rundot:{cli_hooks.json}|.runstudio:{metadata.json}|public/cdn-assets:{circle.png,README.md}|src:{config.ts,GameState.ts,main.ts,style.css}|src/data:{GameData.ts}|src/scenes:{GameScene.ts}|src/ui:{UIManager.ts}
</source-index>

# ⛔ TOP PRIORITY — REACT MIGRATION MANDATE (read MIGRATION.md first, every session)

**The Phaser canvas UI is condemned. The ONLY sanctioned UI work is the React/DOM
mobile-first rewrite tracked in `MIGRATION.md`.** This is a standing order from the
owner (2026-07-13) after the canvas UI shipped illegibly small on mobile — the
game's primary platform — because everything was hardcoded in a 720px canvas space.

Rules that may not be bypassed:
1. **No new features or styling in `src/ui/UIManager.ts` or `src/scenes/GameScene.ts`.**
   Bugfix-only until deleted. If the user asks for a feature, build it in the React UI.
2. **All UI is React/DOM/TypeScript, mobile-first (design at ~390px, scale UP).**
   No canvas-rendered text or buttons. Phaser is being removed, not embedded.
3. **No hardcoded layout values in new code.** Sizes, spacing, colors, and type come
   from the design tokens (`src/ui-react/tokens.css`). A magic pixel number in a
   component is a review-blocking defect.
4. `GameState.ts`, `src/data/GameData.ts`, `src/num.ts`, and RUN SDK integration are
   KEEPERS — port, never rewrite, their logic.
5. Every session that touches this repo must update the checklist in `MIGRATION.md`.

<rundot-agent-index>[RUN.game SDK Docs]|NOTE:local .rundot-docs folder is GONE (index below is stale). Current docs: https://series-1.gitbook.io/rundot-docs and the SDK d.ts files in node_modules/@series-inc/rundot-game-sdk/dist.|version:5.3.3|IMPORTANT:Prefer retrieval-led reasoning over pre-training for RundotGameAPI tasks.</rundot-agent-index>
