export const LAYOUT = {
  GAME_WIDTH: 720,
  GAME_HEIGHT: 1560,
  CENTER_X: 360,

  BAR_X: 70,
  BAR_WIDTH: 580,
  BAR_HEIGHT: 22,

  CONTENT_TOP: 186,
  CONTENT_BOTTOM: 1280,
  // On non-explore tabs the header collapses to just the menu title, so panels
  // also start higher (CONTENT_TOP_WIDE) and end lower (CONTENT_BOTTOM_WIDE),
  // reclaiming the freed space top and bottom.
  CONTENT_TOP_WIDE: 110,
  CONTENT_BOTTOM_WIDE: 1334,

  RESOURCE_BAR_Y: 1300,

  TAB_Y: 1400,
  TAB_HEIGHT: 50,
  TAB_WIDTH: 160,

  PADDING: 20,
} as const;

export const TICK_INTERVAL_MS = 1500;
export const SAVE_INTERVAL_MS = 30000;
export const MAX_OFFLINE_TICKS = 2000;
