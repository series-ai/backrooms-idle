const GAME_WIDTH = 720;
const GAME_HEIGHT = 1560;

// The dark background cards (header / content / resource bar / footer) stack
// vertically with this much wallpaper showing through between them.
const CARD_GAP = 10;
// Cards extend this far past their content bounds on each side (see
// createBackground / setContentBounds in UIManager).
const CARD_BLEED = 10;

// Explore-tab content bounds. The content card itself spans
// CONTENT_TOP - CARD_BLEED .. CONTENT_BOTTOM + CARD_BLEED.
const CONTENT_TOP = 186;
const CONTENT_BOTTOM = 1280;

// Resource readout card (explore tab only), directly below the content card.
const RESOURCE_BAR_HEIGHT = 52;
const RESOURCE_BAR_TOP = CONTENT_BOTTOM + CARD_BLEED + CARD_GAP;

// Footer panel behind the tab buttons, running to the bottom of the screen.
// Its top edge is fixed across tabs (one CARD_GAP under the resource card),
// so the seam never jumps when switching tabs.
const FOOTER_TOP = RESOURCE_BAR_TOP + RESOURCE_BAR_HEIGHT + CARD_GAP;

// Two-row tab grid, centered vertically in the footer panel. The resulting
// margin below row 2 (~39px) keeps phone home-indicator / browser chrome off
// the buttons.
const TAB_ROW_HEIGHT = 56;
const TAB_ROW_GAP = 8;

export const LAYOUT = {
  GAME_WIDTH,
  GAME_HEIGHT,
  CENTER_X: GAME_WIDTH / 2,

  BAR_X: 70,
  BAR_WIDTH: 580,
  BAR_HEIGHT: 22,

  CONTENT_TOP,
  CONTENT_BOTTOM,
  // On non-explore tabs the header collapses to just the menu title and the
  // resource bar is hidden, so panels start higher (CONTENT_TOP_WIDE) and run
  // down to the footer (CONTENT_BOTTOM_WIDE), reclaiming the freed space.
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
  TAB_Y: (FOOTER_TOP + GAME_HEIGHT) / 2,

  PADDING: 20,
} as const;

export const TICK_INTERVAL_MS = 1500;
export const SAVE_INTERVAL_MS = 30000;
export const MAX_OFFLINE_TICKS = 2000;
