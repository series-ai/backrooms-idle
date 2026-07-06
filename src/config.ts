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
  CONTENT_BOTTOM_WIDE: 1386,

  // Bar card center = this + 20. Sits centered in the band between the explore
  // content card's bottom edge (CONTENT_BOTTOM + 10) and tab row 1's top edge —
  // see createBackground/createTabBar/createResourceBar.
  RESOURCE_BAR_Y: 1325,

  // Center of the two-row tab grid. Rows fill 1400..1536, leaving a 24px
  // bottom margin so phone home-indicator/browser chrome never sits on row 2.
  TAB_Y: 1468,
  TAB_HEIGHT: 50,
  TAB_WIDTH: 160,

  PADDING: 20,
} as const;

export const TICK_INTERVAL_MS = 1500;
export const SAVE_INTERVAL_MS = 30000;
export const MAX_OFFLINE_TICKS = 2000;
