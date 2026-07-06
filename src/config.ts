const GAME_WIDTH = 720;

// Design height (a ~19.5:9 phone). The real canvas height is derived from the
// device's safe-viewport aspect ratio at boot (initLayout) so Phaser's FIT
// scaling fills the screen edge to edge instead of letterboxing. Clamped so
// the fixed-height explore column always fits and desktop windows still get a
// sane portrait canvas.
const DEFAULT_GAME_HEIGHT = 1560;
const MIN_GAME_HEIGHT = 1300;
const MAX_GAME_HEIGHT = 1840;

// The dark background cards (header / content / resource bar / footer) stack
// vertically with this much wallpaper showing through between them.
const CARD_GAP = 10;
// Cards extend this far past their content bounds on each side (see
// createBackground / setContentBounds in UIManager).
const CARD_BLEED = 10;

// Explore-tab content top. The bottom is derived from the footer stack so the
// content card absorbs whatever height the device gives us.
const CONTENT_TOP = 186;

// Resource readout card (explore tab only), directly below the content card.
const RESOURCE_BAR_HEIGHT = 52;

// Footer panel behind the tab buttons: fixed height, pinned to the bottom of
// the canvas whatever the canvas height is. Host chrome / home indicator are
// kept off the buttons by the safe-area insets applied in main.ts.
const FOOTER_HEIGHT = 198;

// Two-row tab grid, centered vertically in the footer panel.
const TAB_ROW_HEIGHT = 56;
const TAB_ROW_GAP = 8;

function computeLayout(gameHeight: number) {
  const FOOTER_TOP = gameHeight - FOOTER_HEIGHT;
  const RESOURCE_BAR_TOP = FOOTER_TOP - CARD_GAP - RESOURCE_BAR_HEIGHT;
  const CONTENT_BOTTOM = RESOURCE_BAR_TOP - CARD_GAP - CARD_BLEED;

  return {
    GAME_WIDTH,
    GAME_HEIGHT: gameHeight,
    CENTER_X: GAME_WIDTH / 2,

    BAR_X: 70,
    BAR_WIDTH: 580,
    BAR_HEIGHT: 22,

    CONTENT_TOP,
    CONTENT_BOTTOM,
    // On non-explore tabs the header collapses to just the menu title and the
    // resource bar is hidden, so panels start higher (CONTENT_TOP_WIDE) and
    // run down to the footer (CONTENT_BOTTOM_WIDE), reclaiming the freed space.
    CONTENT_TOP_WIDE: 110,
    CONTENT_BOTTOM_WIDE: FOOTER_TOP - CARD_GAP - CARD_BLEED,

    CARD_GAP,
    CARD_BLEED,

    RESOURCE_BAR_TOP,
    RESOURCE_BAR_HEIGHT,
    RESOURCE_BAR_CENTER: RESOURCE_BAR_TOP + RESOURCE_BAR_HEIGHT / 2,

    FOOTER_TOP,

    TAB_ROW_HEIGHT,
    TAB_ROW_GAP,
    TAB_Y: FOOTER_TOP + FOOTER_HEIGHT / 2,

    PADDING: 20,
  };
}

export const LAYOUT: ReturnType<typeof computeLayout> = computeLayout(DEFAULT_GAME_HEIGHT);

/**
 * Size the internal canvas to the device: keep the 720px design width and pick
 * the height matching the safe viewport's aspect ratio, so FIT scaling fills
 * the screen without letterbox bars. Must run before `new Phaser.Game` — all
 * scenes/UI read LAYOUT at create time, never at module scope.
 */
export function initLayout(safeWidth: number, safeHeight: number): void {
  if (safeWidth <= 0 || safeHeight <= 0) return;
  const raw = Math.round((GAME_WIDTH * safeHeight) / safeWidth);
  const gameHeight = Math.min(MAX_GAME_HEIGHT, Math.max(MIN_GAME_HEIGHT, raw));
  Object.assign(LAYOUT, computeLayout(gameHeight));
}

export const TICK_INTERVAL_MS = 1500;
export const SAVE_INTERVAL_MS = 30000;
export const MAX_OFFLINE_TICKS = 2000;
