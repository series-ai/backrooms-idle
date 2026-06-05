export interface LevelDef {
  id: number;
  name: string;
  subtitle: string;
  description: string;
  bgColor: number;
  textColor: string;
  danger: number;
  explorationRequired: number;
  resourceDrops: ResourceDrop[];
  entityIds: string[];
  ambientMessages: string[];
}

export interface ResourceDrop {
  resourceId: string;
  weight: number;
  minAmount: number;
  maxAmount: number;
}

export interface ResourceDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  usable: boolean;
  useLabel?: string;
  useEffect?: string;
}

export interface EntityDef {
  id: string;
  name: string;
  damage: number;
  sanityDamage: number;
  encounterMessage: string;
  surviveMessage: string;
  defeatMessage: string;
}

export type UpgradeEffect = 'exploreSpeed' | 'findRate' | 'findAmount' | 'doubleChance';

export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  baseCost: number;
  costMultiplier: number;
  maxLevel: number;
  effectPerLevel: number;   // percent per level (also used for the multiplicative math)
  effectUnit: string;
  costResource: string;
  effect: UpgradeEffect;
}

export interface VoidUpgradeDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  costPerLevel: number;
  maxLevel: number;
  effectPerLevel: number;
  effectUnit: string;
}

export const RESOURCES: Record<string, ResourceDef> = {
  almond_water: {
    id: 'almond_water',
    name: 'Almond Water',
    icon: '\u{1F4A7}',
    description: 'Upgrades Sharp Instinct (find more often).',
    usable: false,
  },
  canned_food: {
    id: 'canned_food',
    name: 'Canned Food',
    icon: '\u{1F96B}',
    description: 'Upgrades Clear Head (explore faster).',
    usable: false,
  },
  batteries: {
    id: 'batteries',
    name: 'Batteries',
    icon: '\u{1F50B}',
    description: 'Upgrades Sharp Eyes (find more loot).',
    usable: false,
  },
  cloth_scraps: {
    id: 'cloth_scraps',
    name: 'Cloth Scraps',
    icon: '\u{1F9F5}',
    description: 'Upgrades Quick Feet (explore faster).',
    usable: false,
  },
  scrap_metal: {
    id: 'scrap_metal',
    name: 'Scrap Metal',
    icon: '\u{2699}\u{FE0F}',
    description: 'Upgrades Heavy Hauls (bigger stacks).',
    usable: false,
  },
  firesalt: {
    id: 'firesalt',
    name: 'Firesalt',
    icon: '\u{1F525}',
    description: 'Upgrades Firesalt Charm (bigger stacks).',
    usable: false,
  },
  lucky_coins: {
    id: 'lucky_coins',
    name: 'Lucky Coins',
    icon: '\u{1FA99}',
    description: 'Upgrades Scavenger (double loot chance).',
    usable: false,
  },
  level_keys: {
    id: 'level_keys',
    name: 'Level Keys',
    icon: '\u{1F511}',
    description: 'Needed to escape to the next level.',
    usable: false,
  },
};

export const RESOURCE_ORDER = [
  'almond_water',
  'canned_food',
  'batteries',
  'cloth_scraps',
  'scrap_metal',
  'firesalt',
  'lucky_coins',
  'level_keys',
];

export const ENTITIES: Record<string, EntityDef> = {
  smiler: {
    id: 'smiler',
    name: 'Smiler',
    damage: 8,
    sanityDamage: 5,
    encounterMessage: 'A wide grin appears in the darkness...',
    surviveMessage: 'You avert your eyes and back away slowly.',
    defeatMessage: 'You toss firesalt. It shrieks and fades.',
  },
  hound: {
    id: 'hound',
    name: 'Hound',
    damage: 12,
    sanityDamage: 3,
    encounterMessage: 'Rapid footsteps echo behind you. Closer.',
    surviveMessage: 'You press against the wall. It runs past.',
    defeatMessage: 'The firesalt hits it. It yelps and flees.',
  },
  skin_stealer: {
    id: 'skin_stealer',
    name: 'Skin-Stealer',
    damage: 15,
    sanityDamage: 15,
    encounterMessage: 'Someone calls your name... but you are alone.',
    surviveMessage: 'You stay silent. The voice moves on.',
    defeatMessage: 'Firesalt reveals its true form. It retreats.',
  },
  partygoer: {
    id: 'partygoer',
    name: 'Partygoer',
    damage: 18,
    sanityDamage: 20,
    encounterMessage: '=) Hey! Come join the party! =)',
    surviveMessage: 'You resist the urge to follow. It fades.',
    defeatMessage: 'Firesalt sizzles against it. The smile drops.',
  },
  wretched: {
    id: 'wretched',
    name: 'The Wretched',
    damage: 30,
    sanityDamage: 25,
    encounterMessage: 'An inhuman shriek pierces the silence.',
    surviveMessage: 'You hide. It passes, clawing the walls.',
    defeatMessage: 'Desperate firesalt throw. It howls and retreats.',
  },
  crimson_watcher: {
    id: 'crimson_watcher',
    name: 'Crimson Watcher',
    damage: 22,
    sanityDamage: 18,
    encounterMessage: 'Red light pulses from around the corner. Something watches.',
    surviveMessage: 'You freeze. The red light fades slowly.',
    defeatMessage: 'Firesalt flares bright white. The red retreats.',
  },
  ink_crawler: {
    id: 'ink_crawler',
    name: 'Ink Crawler',
    damage: 12,
    sanityDamage: 30,
    encounterMessage: 'Words crawl off the pages and skitter toward you.',
    surviveMessage: 'You shut your eyes. The whispers stop.',
    defeatMessage: 'Firesalt burns the ink away. Pages scatter.',
  },
  archivist: {
    id: 'archivist',
    name: 'The Archivist',
    damage: 25,
    sanityDamage: 35,
    encounterMessage: '"You are not catalogued." A figure turns from the shelves.',
    surviveMessage: 'You pretend to read. It loses interest.',
    defeatMessage: 'Firesalt on the books. It screams and vanishes.',
  },
  frost_shade: {
    id: 'frost_shade',
    name: 'Frost Shade',
    damage: 35,
    sanityDamage: 20,
    encounterMessage: 'Your breath turns to ice. Something moves in the fog.',
    surviveMessage: 'You hold still until the cold passes.',
    defeatMessage: 'Firesalt melts through the ice. It shatters.',
  },
};

export const LEVELS: LevelDef[] = [
  {
    id: 0,
    name: 'LEVEL 0',
    subtitle: 'The Lobby',
    description:
      'Endless yellow rooms. Fluorescent lights buzz overhead. The carpet is damp.',
    bgColor: 0x6b6030,
    textColor: '#E8DCA0',
    danger: 1,
    explorationRequired: 100,
    resourceDrops: [
      { resourceId: 'almond_water', weight: 25, minAmount: 1, maxAmount: 2 },
      { resourceId: 'cloth_scraps', weight: 22, minAmount: 1, maxAmount: 3 },
      { resourceId: 'canned_food', weight: 18, minAmount: 1, maxAmount: 1 },
      { resourceId: 'batteries', weight: 12, minAmount: 1, maxAmount: 1 },
      { resourceId: 'scrap_metal', weight: 10, minAmount: 1, maxAmount: 1 },
      { resourceId: 'level_keys', weight: 3, minAmount: 1, maxAmount: 1 },
    ],
    entityIds: ['smiler', 'hound'],
    ambientMessages: [
      'The fluorescent lights flicker above you.',
      'You hear a distant humming sound.',
      'The carpet squelches underfoot.',
      'Another identical yellow room. And another.',
      'Was that shadow always there?',
      'The wallpaper is peeling in the corner.',
      'You smell almonds.',
      'A light buzzes and goes dark. Then flickers back.',
      'You find scratch marks on the wall.',
      'The air feels thick and stale.',
      'A door that leads to another identical hallway.',
      'You swear the ceiling is lower than before.',
    ],
  },
  {
    id: 1,
    name: 'LEVEL 1',
    subtitle: 'Habitable Zone',
    description:
      'Dark warehouses and concrete. Some areas look almost lived-in.',
    bgColor: 0x2a2a2a,
    textColor: '#B0B0B0',
    danger: 2,
    explorationRequired: 250,
    resourceDrops: [
      { resourceId: 'scrap_metal', weight: 25, minAmount: 1, maxAmount: 3 },
      { resourceId: 'batteries', weight: 20, minAmount: 1, maxAmount: 2 },
      { resourceId: 'almond_water', weight: 15, minAmount: 1, maxAmount: 2 },
      { resourceId: 'canned_food', weight: 12, minAmount: 1, maxAmount: 2 },
      { resourceId: 'cloth_scraps', weight: 10, minAmount: 1, maxAmount: 2 },
      { resourceId: 'firesalt', weight: 6, minAmount: 1, maxAmount: 1 },
      { resourceId: 'level_keys', weight: 3, minAmount: 1, maxAmount: 1 },
    ],
    entityIds: ['hound', 'skin_stealer'],
    ambientMessages: [
      'Empty crates line the walls.',
      'You find a makeshift campsite. Long abandoned.',
      'Metal shelving stretches into the darkness.',
      "Graffiti on the wall: \"DON'T TRUST THEM\"",
      'A distant clang echoes through the warehouse.',
      'Old supplies are scattered on the floor.',
      'Someone was here. Recently.',
      'You find a torn journal page. Frantic writing.',
      'The concrete floor is cracked and uneven.',
      'A cold draft blows from somewhere above.',
    ],
  },
  {
    id: 2,
    name: 'LEVEL 2',
    subtitle: 'Pipe Dreams',
    description:
      'Concrete tunnels lined with pipes. Unknown fluids drip from above.',
    bgColor: 0x1c2833,
    textColor: '#7FB3D3',
    danger: 3,
    explorationRequired: 500,
    resourceDrops: [
      { resourceId: 'scrap_metal', weight: 20, minAmount: 2, maxAmount: 4 },
      { resourceId: 'batteries', weight: 20, minAmount: 1, maxAmount: 3 },
      { resourceId: 'firesalt', weight: 12, minAmount: 1, maxAmount: 2 },
      { resourceId: 'almond_water', weight: 12, minAmount: 1, maxAmount: 2 },
      { resourceId: 'cloth_scraps', weight: 10, minAmount: 1, maxAmount: 2 },
      { resourceId: 'lucky_coins', weight: 5, minAmount: 1, maxAmount: 1 },
      { resourceId: 'canned_food', weight: 8, minAmount: 1, maxAmount: 1 },
      { resourceId: 'level_keys', weight: 3, minAmount: 1, maxAmount: 1 },
    ],
    entityIds: ['smiler', 'skin_stealer', 'partygoer'],
    ambientMessages: [
      'Pipes groan and shudder overhead.',
      'A dark liquid drips onto your shoulder.',
      'The tunnel splits three ways. You pick one.',
      'You hear rushing water behind the walls.',
      'Steam hisses from a cracked pipe.',
      'The temperature drops suddenly.',
      'Rust flakes off the pipe you brush against.',
      'You find old tools scattered on the ground.',
      'The tunnel narrows. You squeeze through.',
      'Something splashes in the distance.',
    ],
  },
  {
    id: 3,
    name: 'THE POOLROOMS',
    subtitle: 'Liminal Waters',
    description:
      'Pristine blue pools stretch into infinity. Beautiful... but wrong.',
    bgColor: 0x14544a,
    textColor: '#A0F0E0',
    danger: 2,
    explorationRequired: 400,
    resourceDrops: [
      { resourceId: 'almond_water', weight: 25, minAmount: 2, maxAmount: 4 },
      { resourceId: 'lucky_coins', weight: 18, minAmount: 1, maxAmount: 2 },
      { resourceId: 'firesalt', weight: 12, minAmount: 1, maxAmount: 2 },
      { resourceId: 'canned_food', weight: 15, minAmount: 1, maxAmount: 2 },
      { resourceId: 'cloth_scraps', weight: 10, minAmount: 1, maxAmount: 2 },
      { resourceId: 'batteries', weight: 8, minAmount: 1, maxAmount: 1 },
      { resourceId: 'level_keys', weight: 3, minAmount: 1, maxAmount: 1 },
    ],
    entityIds: ['partygoer'],
    ambientMessages: [
      'The water is perfectly still. Almost too still.',
      'White tiles gleam under fluorescent light.',
      'Your footsteps echo across the pool deck.',
      'The water looks inviting. You resist.',
      "A splash from somewhere you can't see.",
      'The ceiling is impossibly high above the pools.',
      'You find a towel neatly folded on a chair.',
      'The chlorine smell is overwhelming.',
      "Reflections in the water don't match the room.",
      'A sign reads: "NO LIFEGUARD ON DUTY"',
    ],
  },
  {
    id: 4,
    name: 'LEVEL 3',
    subtitle: 'Electrical Station',
    description:
      'Banks of humming machinery. Sparks fly from exposed wiring.',
    bgColor: 0x0d0d1a,
    textColor: '#8080FF',
    danger: 4,
    explorationRequired: 750,
    resourceDrops: [
      { resourceId: 'batteries', weight: 25, minAmount: 2, maxAmount: 5 },
      { resourceId: 'scrap_metal', weight: 20, minAmount: 2, maxAmount: 4 },
      { resourceId: 'firesalt', weight: 12, minAmount: 1, maxAmount: 2 },
      { resourceId: 'lucky_coins', weight: 10, minAmount: 1, maxAmount: 2 },
      { resourceId: 'almond_water', weight: 8, minAmount: 1, maxAmount: 2 },
      { resourceId: 'cloth_scraps', weight: 8, minAmount: 1, maxAmount: 2 },
      { resourceId: 'canned_food', weight: 5, minAmount: 1, maxAmount: 1 },
      { resourceId: 'level_keys', weight: 2, minAmount: 1, maxAmount: 1 },
    ],
    entityIds: ['wretched', 'partygoer', 'skin_stealer'],
    ambientMessages: [
      'Sparks fly from a panel on the wall.',
      'The machinery hums louder. Then quiets.',
      'Warning lights flash in the corridor.',
      'You smell ozone and burnt plastic.',
      'Cables hang from the ceiling like vines.',
      'A screen flickers: ERROR ERROR ERROR',
      'The floor vibrates beneath your feet.',
      'You find a dead flashlight. Batteries gone.',
      'Electric arcs dance between two conductors.',
      'The lights cut out. Then slam back on.',
    ],
  },
  {
    id: 5,
    name: 'LEVEL 4',
    subtitle: 'Abandoned Office',
    description:
      'Rows of cubicles and filing cabinets. Computers display only static.',
    bgColor: 0x1a1a1a,
    textColor: '#909090',
    danger: 5,
    explorationRequired: 1000,
    resourceDrops: [
      { resourceId: 'almond_water', weight: 12, minAmount: 1, maxAmount: 3 },
      { resourceId: 'canned_food', weight: 12, minAmount: 1, maxAmount: 3 },
      { resourceId: 'batteries', weight: 12, minAmount: 2, maxAmount: 4 },
      { resourceId: 'scrap_metal', weight: 12, minAmount: 2, maxAmount: 5 },
      { resourceId: 'firesalt', weight: 12, minAmount: 1, maxAmount: 3 },
      { resourceId: 'lucky_coins', weight: 12, minAmount: 1, maxAmount: 3 },
      { resourceId: 'cloth_scraps', weight: 12, minAmount: 2, maxAmount: 4 },
      { resourceId: 'level_keys', weight: 2, minAmount: 1, maxAmount: 1 },
    ],
    entityIds: ['wretched', 'partygoer', 'skin_stealer', 'hound', 'smiler'],
    ambientMessages: [
      'A phone rings. You let it go to voicemail.',
      'Post-it notes cover a cubicle wall. All blank.',
      'A computer shows static. Then a face. Then static.',
      'Filing cabinets stand open. All empty.',
      'The office chairs spin slowly on their own.',
      'A printer whirs to life. It prints nothing.',
      'You find a coffee mug. Still warm.',
      'Ceiling tiles are missing. Darkness above.',
      'The elevator button glows but nothing comes.',
      'A clock on the wall. The hands move backward.',
    ],
  },
  /* --- Prestige-gated levels --- */
  {
    id: 6,
    name: 'LEVEL 5',
    subtitle: 'The Crimson Halls',
    description:
      'Blood-red walls stretch endlessly. The air tastes like copper.',
    bgColor: 0x3a0a0a,
    textColor: '#FF6666',
    danger: 4,
    explorationRequired: 1200,
    resourceDrops: [
      { resourceId: 'firesalt', weight: 22, minAmount: 2, maxAmount: 4 },
      { resourceId: 'scrap_metal', weight: 18, minAmount: 2, maxAmount: 5 },
      { resourceId: 'almond_water', weight: 15, minAmount: 1, maxAmount: 3 },
      { resourceId: 'batteries', weight: 12, minAmount: 1, maxAmount: 3 },
      { resourceId: 'lucky_coins', weight: 10, minAmount: 1, maxAmount: 2 },
      { resourceId: 'cloth_scraps', weight: 8, minAmount: 1, maxAmount: 2 },
      { resourceId: 'canned_food', weight: 8, minAmount: 1, maxAmount: 2 },
      { resourceId: 'level_keys', weight: 2, minAmount: 1, maxAmount: 1 },
    ],
    entityIds: ['crimson_watcher', 'wretched', 'skin_stealer'],
    ambientMessages: [
      'The walls pulse faintly. Like a heartbeat.',
      'Your footsteps leave marks in something wet and red.',
      'A distant scream echoes. Or was it laughter?',
      'The ceiling drips. You don\'t look up.',
      'Handprints on the wall. Too many fingers.',
      'The red gets deeper the further you go.',
      'You find a mirror. Your reflection is delayed.',
      'Something warm runs down the walls.',
      'The lights here are red. Everything is red.',
      'A door is nailed shut from the inside.',
    ],
  },
  {
    id: 7,
    name: 'LEVEL 6',
    subtitle: 'The Library',
    description:
      'Infinite shelves of books in languages that don\'t exist. Knowledge here has teeth.',
    bgColor: 0x1a1412,
    textColor: '#D4A574',
    danger: 5,
    explorationRequired: 1500,
    resourceDrops: [
      { resourceId: 'batteries', weight: 18, minAmount: 2, maxAmount: 5 },
      { resourceId: 'lucky_coins', weight: 16, minAmount: 1, maxAmount: 3 },
      { resourceId: 'canned_food', weight: 14, minAmount: 1, maxAmount: 3 },
      { resourceId: 'firesalt', weight: 14, minAmount: 1, maxAmount: 3 },
      { resourceId: 'cloth_scraps', weight: 10, minAmount: 2, maxAmount: 4 },
      { resourceId: 'almond_water', weight: 10, minAmount: 1, maxAmount: 2 },
      { resourceId: 'scrap_metal', weight: 10, minAmount: 1, maxAmount: 3 },
      { resourceId: 'level_keys', weight: 2, minAmount: 1, maxAmount: 1 },
    ],
    entityIds: ['ink_crawler', 'archivist', 'partygoer'],
    ambientMessages: [
      'Books whisper when you walk past.',
      'A page turns on its own. You didn\'t touch it.',
      'The Dewey Decimal system here uses symbols you\'ve never seen.',
      'You find a book with your name as the author.',
      'The shelves rearrange when you\'re not looking.',
      'A reading lamp flickers. Someone was just here.',
      'You open a book. The words rearrange into warnings.',
      'Dust falls from shelves that go up forever.',
      'A card catalogue drawer opens. It\'s full of teeth.',
      'The silence here is aggressive.',
    ],
  },
  {
    id: 8,
    name: 'LEVEL 7',
    subtitle: 'The Frozen Sublevel',
    description:
      'Sub-zero temperatures. Ice coats every surface. Your breath freezes mid-air.',
    bgColor: 0x0a1a2a,
    textColor: '#88CCFF',
    danger: 6,
    explorationRequired: 2000,
    resourceDrops: [
      { resourceId: 'scrap_metal', weight: 18, minAmount: 3, maxAmount: 6 },
      { resourceId: 'firesalt', weight: 18, minAmount: 2, maxAmount: 4 },
      { resourceId: 'almond_water', weight: 14, minAmount: 2, maxAmount: 4 },
      { resourceId: 'batteries', weight: 12, minAmount: 2, maxAmount: 4 },
      { resourceId: 'lucky_coins', weight: 12, minAmount: 1, maxAmount: 3 },
      { resourceId: 'canned_food', weight: 10, minAmount: 1, maxAmount: 3 },
      { resourceId: 'cloth_scraps', weight: 10, minAmount: 2, maxAmount: 4 },
      { resourceId: 'level_keys', weight: 2, minAmount: 1, maxAmount: 1 },
    ],
    entityIds: ['frost_shade', 'wretched', 'crimson_watcher'],
    ambientMessages: [
      'Your breath crystallizes and falls like glass.',
      'Ice cracks beneath your feet. Something stirs below.',
      'Frost patterns on the wall form faces.',
      'The temperature drops again. You can barely move.',
      'Icicles hang from pipes. Some are red.',
      'You find frozen footprints. They lead in circles.',
      'A frozen door. Through the ice, you see movement.',
      'Your fingers are numb. Keep moving.',
      'The ice is perfectly clear. You see rooms below.',
      'A frozen clock. The hands are at 3:33.',
    ],
  },
];

// Every collectible resource feeds an upgrade. All effects are MULTIPLICATIVE and
// uncapped — the escalating cost paces you, not a hard maxLevel.
export const UPGRADES: UpgradeDef[] = [
  {
    id: 'quick_feet', name: 'Quick Feet', icon: '\u{1F45F}',
    description: 'Explore faster',
    baseCost: 5, costMultiplier: 1.8, maxLevel: 9999,
    effectPerLevel: 15, effectUnit: '% speed', costResource: 'cloth_scraps', effect: 'exploreSpeed',
  },
  {
    id: 'sharp_eyes', name: 'Sharp Eyes', icon: '\u{1F441}',
    description: 'Find resources more often',
    baseCost: 3, costMultiplier: 1.8, maxLevel: 9999,
    effectPerLevel: 18, effectUnit: '% find rate', costResource: 'batteries', effect: 'findRate',
  },
  {
    id: 'heavy_hauls', name: 'Heavy Hauls', icon: '\u{1F9F2}',
    description: 'Find bigger stacks',
    baseCost: 6, costMultiplier: 1.9, maxLevel: 9999,
    effectPerLevel: 12, effectUnit: '% haul', costResource: 'scrap_metal', effect: 'findAmount',
  },
  {
    id: 'scavenger', name: 'Scavenger', icon: '\u{1F392}',
    description: 'Chance for double finds',
    baseCost: 4, costMultiplier: 1.9, maxLevel: 30,
    effectPerLevel: 3, effectUnit: '% double', costResource: 'lucky_coins', effect: 'doubleChance',
  },
  {
    id: 'clear_head', name: 'Clear Head', icon: '\u{1F9E0}',
    description: 'Explore faster',
    baseCost: 5, costMultiplier: 1.85, maxLevel: 9999,
    effectPerLevel: 10, effectUnit: '% speed', costResource: 'canned_food', effect: 'exploreSpeed',
  },
  {
    id: 'sharp_instinct', name: 'Sharp Instinct', icon: '\u{1F50D}',
    description: 'Find resources more often',
    baseCost: 5, costMultiplier: 1.85, maxLevel: 9999,
    effectPerLevel: 10, effectUnit: '% find rate', costResource: 'almond_water', effect: 'findRate',
  },
  {
    id: 'firesalt_charm', name: 'Firesalt Charm', icon: '\u{1F525}',
    description: 'Find bigger stacks',
    baseCost: 4, costMultiplier: 2.0, maxLevel: 9999,
    effectPerLevel: 14, effectUnit: '% haul', costResource: 'firesalt', effect: 'findAmount',
  },
];

/* ------------------------------------------------------------------ */
/*  Void (Prestige) Upgrades                                           */
/* ------------------------------------------------------------------ */

export const VOID_UPGRADES: VoidUpgradeDef[] = [
  {
    id: 'hardened_soul',
    name: 'Hardened Soul',
    icon: '\u{2764}\u{FE0F}',
    description: '+base Max HP per run',
    costPerLevel: 3,
    maxLevel: 20,
    effectPerLevel: 10,
    effectUnit: ' Max HP',
  },
  {
    id: 'iron_psyche',
    name: 'Iron Psyche',
    icon: '\u{1F9E0}',
    description: '+base Max Sanity per run',
    costPerLevel: 3,
    maxLevel: 20,
    effectPerLevel: 10,
    effectUnit: ' Max Sanity',
  },
  {
    id: 'speed_runner',
    name: 'Speed Runner',
    icon: '\u{26A1}',
    description: '+base explore speed per run',
    costPerLevel: 4,
    maxLevel: 20,
    effectPerLevel: 5,
    effectUnit: '% speed',
  },
  {
    id: 'keen_senses',
    name: 'Keen Senses',
    icon: '\u{1F50D}',
    description: '+base find rate per run',
    costPerLevel: 4,
    maxLevel: 20,
    effectPerLevel: 5,
    effectUnit: '% find rate',
  },
  {
    id: 'thick_hide',
    name: 'Thick Hide',
    icon: '\u{1F6E1}\u{FE0F}',
    description: '+base damage reduction per run',
    costPerLevel: 5,
    maxLevel: 10,
    effectPerLevel: 3,
    effectUnit: '% reduction',
  },
  {
    id: 'inner_peace',
    name: 'Inner Peace',
    icon: '\u{1F54A}\u{FE0F}',
    description: '+base sanity drain reduction per run',
    costPerLevel: 5,
    maxLevel: 10,
    effectPerLevel: 3,
    effectUnit: '% reduction',
  },
  {
    id: 'pack_rat',
    name: 'Pack Rat',
    icon: '\u{1F9F3}',
    description: 'Start with extra supplies each run',
    costPerLevel: 8,
    maxLevel: 5,
    effectPerLevel: 1,
    effectUnit: ' bundle',
  },
  {
    id: 'deep_memory',
    name: 'Deep Memory',
    icon: '\u{1F4FC}',
    description: '+offline progress cap',
    costPerLevel: 6,
    maxLevel: 10,
    effectPerLevel: 200,
    effectUnit: ' ticks',
  },
];

/* ------------------------------------------------------------------ */
/*  Prestige Tier Unlocks                                              */
/* ------------------------------------------------------------------ */

export interface PrestigeTier {
  prestigeRequired: number;
  unlocksLevelId: number | null;
  description: string;
}

export const PRESTIGE_TIERS: PrestigeTier[] = [
  { prestigeRequired: 1, unlocksLevelId: null, description: 'Unlocks the VOID tab' },
  { prestigeRequired: 3, unlocksLevelId: 6, description: 'Unlocks The Crimson Halls' },
  { prestigeRequired: 5, unlocksLevelId: 7, description: 'Unlocks The Library' },
  { prestigeRequired: 10, unlocksLevelId: 8, description: 'Unlocks The Frozen Sublevel' },
];

/* ------------------------------------------------------------------ */
/*  Abilities (Phase 3)                                                */
/* ------------------------------------------------------------------ */

export interface AbilityDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  costResource: string;
  costAmount: number;
  cooldownTicks: number;
  durationTicks: number; // 0 = instant effect
}

export const ABILITIES: AbilityDef[] = [
  {
    id: 'scavenge',
    name: 'Scavenge',
    icon: '\u{1F50D}',
    description: 'Find 3-5 resources instantly',
    costResource: 'batteries',
    costAmount: 2,
    cooldownTicks: 60,
    durationTicks: 0,
  },
  {
    id: 'barricade',
    name: 'Barricade',
    icon: '\u{1F6AA}',
    description: 'Block entities for 30s',
    costResource: 'scrap_metal',
    costAmount: 3,
    cooldownTicks: 80,
    durationTicks: 20,
  },
  {
    id: 'signal_flare',
    name: 'Flare',
    icon: '\u{1F4A5}',
    description: 'Double drops for 22s',
    costResource: 'firesalt',
    costAmount: 1,
    cooldownTicks: 50,
    durationTicks: 15,
  },
];

/* ------------------------------------------------------------------ */
/*  Milestone thresholds                                               */
/* ------------------------------------------------------------------ */

export const MILESTONE_THRESHOLDS = [25, 50, 75, 100] as const;

/* ------------------------------------------------------------------ */
/*  Memory Fragment Lore                                               */
/* ------------------------------------------------------------------ */

export const MEMORY_FRAGMENT_LORE: string[] = [
  'A torn note: "The walls are not walls. They are skin."',
  'A cassette recording: heavy breathing, then a click.',
  'A photograph of a hallway. You recognize it. You\'ve never been there.',
  'A child\'s drawing of yellow rooms. The crayon is warm.',
  'A logbook entry: "Day 847. The hum is louder. I can almost understand it."',
  'A faded receipt from a store that doesn\'t exist.',
  'A handwritten map. Every path leads to the same room.',
  'A voice memo: "If you\'re hearing this, turn around. Now."',
  'A polaroid of you. Taken from behind. Today\'s date is written on it.',
  'A journal page: "I thought I escaped. But the carpet... the carpet is the same."',
  'A sticky note: "DON\'T COUNT THE LIGHTS"',
  'A crumpled letter that simply reads: "I\'m sorry I couldn\'t find you."',
  'A VHS tape labeled "HOME." The footage shows empty yellow hallways.',
  'A page torn from a book: "...and the Backrooms shall inherit the lonely..."',
  'A scratched CD. When you hold it up, you see your reflection \u2014 but older.',
];

/* ------------------------------------------------------------------ */
/*  Wanderer NPC Trades                                                */
/* ------------------------------------------------------------------ */

export interface WandererTrade {
  giveResource: string;
  giveAmount: number;
  receiveResource: string;
  receiveAmount: number;
  dialogue: string;
}

export const WANDERER_TRADES: WandererTrade[] = [
  { giveResource: 'cloth_scraps', giveAmount: 5, receiveResource: 'firesalt', receiveAmount: 3, dialogue: '"You look cold. I\'ll trade firesalt for cloth."' },
  { giveResource: 'batteries', giveAmount: 4, receiveResource: 'lucky_coins', receiveAmount: 3, dialogue: '"Power cells? I\'ve got coins. Fair deal?"' },
  { giveResource: 'scrap_metal', giveAmount: 3, receiveResource: 'canned_food', receiveAmount: 4, dialogue: '"Metal for food. You need to eat, friend."' },
  { giveResource: 'canned_food', giveAmount: 3, receiveResource: 'batteries', receiveAmount: 5, dialogue: '"I found a stash of batteries. Trade for food?"' },
  { giveResource: 'almond_water', giveAmount: 4, receiveResource: 'level_keys', receiveAmount: 1, dialogue: '"I know a way out. But I need water first."' },
  { giveResource: 'lucky_coins', giveAmount: 3, receiveResource: 'firesalt', receiveAmount: 4, dialogue: '"Coins? Where we are, fire is worth more."' },
];

/* ------------------------------------------------------------------ */
/*  Procedural Levels (infinite depth beyond hand-crafted levels)      */
/* ------------------------------------------------------------------ */

interface ProceduralTheme {
  subtitle: string;
  bgColor: number;
  textColor: string;
  description: string;
}

const PROCEDURAL_THEMES: ProceduralTheme[] = [
  { subtitle: 'Between Spaces', bgColor: 0x0a0a1a, textColor: '#8866CC', description: 'Reality folds in on itself. The walls breathe.' },
  { subtitle: 'Decay Blooms', bgColor: 0x2a1a0a, textColor: '#CC8844', description: 'Metal flowers grow from corroded pipes. They turn to watch you.' },
  { subtitle: 'White Noise', bgColor: 0x1a1a1a, textColor: '#AAAAAA', description: 'TV static coats every surface. You can hear voices in it.' },
  { subtitle: 'Infinite Reflection', bgColor: 0x0a1a2a, textColor: '#88AACC', description: 'Every surface reflects. But the reflections move independently.' },
  { subtitle: 'Calcium Memory', bgColor: 0x1a1412, textColor: '#D4C4A4', description: 'Shelves of bone tablets. The inscriptions change when you look away.' },
  { subtitle: 'Holy Absence', bgColor: 0x0a0a0a, textColor: '#CCCC88', description: 'A vast space. Something drips from impossibly high above.' },
  { subtitle: 'Flesh Corridors', bgColor: 0x2a0a0a, textColor: '#CC6666', description: 'The walls are warm. And they pulse.' },
  { subtitle: 'The Forgetting', bgColor: 0x1a1a2a, textColor: '#9999CC', description: 'You can\'t remember entering this room. Or the last one.' },
];

const PROCEDURAL_AMBIENT: string[] = [
  'The geometry here doesn\'t make sense.',
  'You\'ve been walking in a straight line. You ended up behind yourself.',
  'The walls hum a song you almost recognize.',
  'Something breathes in rhythm with you.',
  'The ceiling is gone. Above is just... more floor.',
  'Your shadow moves a half-second behind you.',
  'You find footprints. They\'re yours. But you haven\'t been here before.',
  'The lights here don\'t cast shadows. But something else does.',
  'A door opens to a wall. The wall opens to a door.',
  'You hear your own voice echo back. It says different words.',
  'The floor is soft here. You try not to think about why.',
  'Gravity shifts for a moment. You grab the wall. It grabs back.',
  'A clock on the wall shows a time that hasn\'t happened yet.',
  'The air tastes like static.',
  'You find a note in your own handwriting. You don\'t remember writing it.',
  'Something is always just around the corner. But the corner keeps moving.',
];

function generateProceduralLevel(id: number): LevelDef {
  const depth = id - LEVELS.length + 1; // 1-based depth past hand-crafted levels
  const themeIndex = (id - LEVELS.length) % PROCEDURAL_THEMES.length;
  const theme = PROCEDURAL_THEMES[themeIndex];

  const danger = Math.min(10, 6 + Math.floor(depth / 2));
  const explorationRequired = 2000 + depth * 500;

  // Deterministic entity selection based on level id
  const allEntityIds = Object.keys(ENTITIES);
  const entityCount = Math.min(allEntityIds.length, 4 + Math.floor(depth / 4));
  const entityIds: string[] = [];
  for (let i = 0; i < entityCount; i++) {
    const idx = (id * 7 + i * 3) % allEntityIds.length;
    const eid = allEntityIds[idx];
    if (!entityIds.includes(eid)) entityIds.push(eid);
  }
  // Ensure at least 3 entities
  let fill = 0;
  while (entityIds.length < 3) {
    const eid = allEntityIds[fill % allEntityIds.length];
    if (!entityIds.includes(eid)) entityIds.push(eid);
    fill++;
  }

  // Resource drops scale with depth
  const dScale = Math.floor(depth / 3);
  const resourceDrops: ResourceDrop[] = [
    { resourceId: 'scrap_metal', weight: 18, minAmount: 3 + dScale, maxAmount: 6 + dScale },
    { resourceId: 'firesalt', weight: 18, minAmount: 2 + dScale, maxAmount: 4 + dScale },
    { resourceId: 'almond_water', weight: 14, minAmount: 2 + dScale, maxAmount: 4 + dScale },
    { resourceId: 'batteries', weight: 12, minAmount: 2 + dScale, maxAmount: 4 + dScale },
    { resourceId: 'lucky_coins', weight: 12, minAmount: 1 + dScale, maxAmount: 3 + dScale },
    { resourceId: 'canned_food', weight: 10, minAmount: 1 + dScale, maxAmount: 3 + dScale },
    { resourceId: 'cloth_scraps', weight: 10, minAmount: 2 + dScale, maxAmount: 4 + dScale },
    { resourceId: 'level_keys', weight: 2, minAmount: 1, maxAmount: 1 },
  ];

  return {
    id,
    name: `SUBLEVEL ${id}`,
    subtitle: theme.subtitle,
    description: theme.description,
    bgColor: theme.bgColor,
    textColor: theme.textColor,
    danger,
    explorationRequired,
    resourceDrops,
    entityIds,
    ambientMessages: PROCEDURAL_AMBIENT,
  };
}

/** Get level data by id — hand-crafted for 0-8, procedurally generated beyond */
export function getLevel(id: number): LevelDef {
  if (id < LEVELS.length) return LEVELS[id];
  return generateProceduralLevel(id);
}

/* ------------------------------------------------------------------ */
/*  Equipment System (Phase 4A)                                        */
/* ------------------------------------------------------------------ */

export type EquipSlot = 'head' | 'body' | 'feet' | 'accessory';
export type GearTier = 'common' | 'uncommon' | 'rare' | 'legendary';

export const EQUIP_SLOTS: EquipSlot[] = ['head', 'body', 'feet', 'accessory'];
export const EQUIP_SLOT_ICONS: Record<EquipSlot, string> = {
  head: '\u{26D1}\u{FE0F}', body: '\u{1F9E5}', feet: '\u{1F45F}', accessory: '\u{1F4FF}',
};

export const GEAR_TIER_VALUE: Record<GearTier, number> = { common: 0, uncommon: 1, rare: 2, legendary: 3 };
export const GEAR_TIER_COLORS: Record<GearTier, string> = {
  common: '#CCCCCC', uncommon: '#66CC66', rare: '#6688FF', legendary: '#FFD700',
};

export interface GearDef {
  id: string;
  name: string;
  icon: string;
  slot: EquipSlot;
  tier: GearTier;
  minLevelId: number;
  effects: Record<string, number>;
  description: string;
}

export const GEAR_POOL: GearDef[] = [
  // HEAD
  { id: 'hard_hat', name: 'Hard Hat', icon: '\u{26D1}\u{FE0F}', slot: 'head', tier: 'common', minLevelId: 0,
    effects: { damageReduction: 5 }, description: '-5% dmg taken' },
  { id: 'gas_mask', name: 'Gas Mask', icon: '\u{1F637}', slot: 'head', tier: 'uncommon', minLevelId: 2,
    effects: { sanityReduction: 20 }, description: '-20% sanity drain' },
  { id: 'night_vision', name: 'Night Vision', icon: '\u{1F97D}', slot: 'head', tier: 'rare', minLevelId: 4,
    effects: { findRate: 20 }, description: '+20% find rate' },
  { id: 'wardens_helm', name: "Warden's Helm", icon: '\u{1F451}', slot: 'head', tier: 'legendary', minLevelId: 6,
    effects: { damageReduction: 15, entityAvoidance: 10 }, description: '-15% dmg, +10% avoid' },

  // BODY
  { id: 'leather_jacket', name: 'Leather Jacket', icon: '\u{1F9E5}', slot: 'body', tier: 'common', minLevelId: 1,
    effects: { damageReduction: 8 }, description: '-8% dmg taken' },
  { id: 'kevlar_vest', name: 'Kevlar Vest', icon: '\u{1F9BA}', slot: 'body', tier: 'rare', minLevelId: 4,
    effects: { damageReduction: 20 }, description: '-20% dmg taken' },
  { id: 'hazmat_suit', name: 'Hazmat Suit', icon: '\u{2623}\u{FE0F}', slot: 'body', tier: 'legendary', minLevelId: 5,
    effects: { sanityReduction: 30, damageReduction: 10 }, description: '-30% sanity, -10% dmg' },

  // FEET
  { id: 'running_shoes', name: 'Running Shoes', icon: '\u{1F45F}', slot: 'feet', tier: 'common', minLevelId: 0,
    effects: { exploreSpeed: 8 }, description: '+8% speed' },
  { id: 'steel_toe_boots', name: 'Steel-Toe Boots', icon: '\u{1F97E}', slot: 'feet', tier: 'uncommon', minLevelId: 1,
    effects: { damageReduction: 15 }, description: '-15% dmg taken' },
  { id: 'sprint_boots', name: 'Sprint Boots', icon: '\u{26A1}', slot: 'feet', tier: 'rare', minLevelId: 4,
    effects: { exploreSpeed: 20, entityAvoidance: 5 }, description: '+20% speed, +5% avoid' },

  // ACCESSORY
  { id: 'worn_flashlight', name: 'Worn Flashlight', icon: '\u{1F526}', slot: 'accessory', tier: 'common', minLevelId: 0,
    effects: { exploreSpeed: 10 }, description: '+10% speed' },
  { id: 'firesalt_pouch', name: 'Firesalt Pouch', icon: '\u{1F392}', slot: 'accessory', tier: 'uncommon', minLevelId: 3,
    effects: { findRate: 10, damageReduction: 5 }, description: '+10% find, -5% dmg' },
  { id: 'lucky_foot', name: "Rabbit's Foot", icon: '\u{1F407}', slot: 'accessory', tier: 'rare', minLevelId: 3,
    effects: { findRate: 15 }, description: '+15% find rate' },
  { id: 'void_amulet', name: 'Void Amulet', icon: '\u{1F52E}', slot: 'accessory', tier: 'legendary', minLevelId: 7,
    effects: { damageReduction: 10, sanityReduction: 10, findRate: 10 }, description: '-10% dmg/san, +10% find' },
];

/* ------------------------------------------------------------------ */
/*  Boss Encounters (Phase 4B)                                         */
/* ------------------------------------------------------------------ */

export interface BossDef {
  id: string;
  name: string;
  levelId: number;
  damage: number;
  sanityDamage: number;
  firesaltCost: number;
  encounterMessage: string;
  defeatMessage: string;
  failMessage: string;
}

export const BOSSES: BossDef[] = [
  { id: 'the_watcher', name: 'The Watcher', levelId: 0,
    damage: 25, sanityDamage: 15, firesaltCost: 0,
    encounterMessage: 'A Smiler appears... but this one is enormous. It watches.',
    defeatMessage: 'You stare it down. It blinks first. A key falls from its jaw.',
    failMessage: 'The Watcher overwhelms you. The corridor reforms around you.' },
  { id: 'the_collector', name: 'The Collector', levelId: 1,
    damage: 15, sanityDamage: 20, firesaltCost: 3,
    encounterMessage: '"Nice things you have there..." A tall figure blocks the exit.',
    defeatMessage: 'Your firesalt burns it. It drops everything \u2014 and more.',
    failMessage: 'It snatches your supplies and vanishes into the dark.' },
  { id: 'pipe_wyrm', name: 'Pipe Wyrm', levelId: 2,
    damage: 35, sanityDamage: 10, firesaltCost: 1,
    encounterMessage: 'The pipes burst. A serpentine form erupts from the walls.',
    defeatMessage: 'You dodge, block, and endure. The Wyrm retreats into the pipes.',
    failMessage: 'The Wyrm is too fast. It coils around you, then releases.' },
  { id: 'the_drowned', name: 'The Drowned', levelId: 3,
    damage: 10, sanityDamage: 40, firesaltCost: 0,
    encounterMessage: 'The water rises. Something surfaces. It was waiting.',
    defeatMessage: 'You hold your breath and your nerve. The water recedes.',
    failMessage: 'The weight of the water crushes your will. You surface, gasping.' },
  { id: 'voltage_phantom', name: 'Voltage Phantom', levelId: 4,
    damage: 40, sanityDamage: 15, firesaltCost: 2,
    encounterMessage: 'Every screen flashes white. A figure of pure electricity forms.',
    defeatMessage: 'Your firesalt grounds the charge. It dissipates with a scream.',
    failMessage: 'The shock throws you backward. The machines laugh.' },
  { id: 'the_manager', name: 'The Manager', levelId: 5,
    damage: 50, sanityDamage: 30, firesaltCost: 3,
    encounterMessage: '"Take a seat. Let\'s discuss your performance." The door locks.',
    defeatMessage: 'You flip the desk. Firesalt erupts. The Manager dissolves into paperwork.',
    failMessage: 'Your performance review is... unsatisfactory. You are escorted out.' },
  { id: 'crimson_sentinel', name: 'Crimson Sentinel', levelId: 6,
    damage: 45, sanityDamage: 25, firesaltCost: 2,
    encounterMessage: 'The red walls part. A figure of dripping crimson steps forward.',
    defeatMessage: 'Your firesalt sears through the red. The Sentinel crumbles.',
    failMessage: 'The crimson overwhelms you. You retreat, stained and shaking.' },
  { id: 'archivist_prime', name: 'The Archivist Prime', levelId: 7,
    damage: 30, sanityDamage: 50, firesaltCost: 2,
    encounterMessage: '"You have read too much. Now the books read you."',
    defeatMessage: 'You burn the catalogue. The Archivist screams in silence.',
    failMessage: 'Knowledge pours into you uninvited. You forget... something important.' },
  { id: 'frost_titan', name: 'Frost Titan', levelId: 8,
    damage: 55, sanityDamage: 20, firesaltCost: 3,
    encounterMessage: 'The temperature plummets. Ice crystallizes into a towering form.',
    defeatMessage: 'Firesalt melts through the ice. The Titan shatters magnificently.',
    failMessage: 'The cold is absolute. You barely escape with feeling in your limbs.' },
];

const PROCEDURAL_BOSS_NAMES = ['Sentinel', 'Warden', 'Herald', 'Phantom', 'Colossus', 'Shade', 'Devourer', 'Wraith'];

function generateProceduralBoss(levelId: number): BossDef {
  const depth = levelId - LEVELS.length + 1;
  const themeIndex = (levelId - LEVELS.length) % PROCEDURAL_THEMES.length;
  const theme = PROCEDURAL_THEMES[themeIndex];
  const prefix = theme.subtitle.split(' ')[0];
  const suffix = PROCEDURAL_BOSS_NAMES[levelId % PROCEDURAL_BOSS_NAMES.length];
  const name = `The ${prefix} ${suffix}`;

  const baseDmg = Math.min(120, 30 + depth * 5);
  const baseSan = Math.min(80, 20 + depth * 3);
  const firesalt = Math.min(5, 2 + Math.floor(depth / 3));

  return {
    id: `boss_${levelId}`,
    name,
    levelId,
    damage: baseDmg,
    sanityDamage: baseSan,
    firesaltCost: firesalt,
    encounterMessage: `The air distorts. ${name} materializes from the void.`,
    defeatMessage: `${name} dissolves. Its essence scatters across the sublevel.`,
    failMessage: `${name} is too powerful. The sublevel shifts around you.`,
  };
}

/** Get boss for a level — hand-crafted for 0-8, procedural for 9+ */
export function getBoss(levelId: number): BossDef {
  const handCrafted = BOSSES.find(b => b.levelId === levelId);
  if (handCrafted) return handCrafted;
  return generateProceduralBoss(levelId);
}

/* ------------------------------------------------------------------ */
/*  Crafting Recipes (Phase 4C)                                        */
/* ------------------------------------------------------------------ */

export interface RecipeDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  ingredients: { resourceId: string; amount: number }[];
  effectType: 'healHP' | 'healSanity' | 'fullHP' | 'fullSanity' | 'buff';
  effectValue: number;
  buffId?: string;
}

export const RECIPES: RecipeDef[] = [
  { id: 'bandages', name: 'Bandages', icon: '\u{1FA79}',
    description: 'Heal 10 HP',
    ingredients: [{ resourceId: 'cloth_scraps', amount: 3 }],
    effectType: 'healHP', effectValue: 10 },
  { id: 'torch', name: 'Torch', icon: '\u{1F525}',
    description: 'Fewer entities (37s)',
    ingredients: [{ resourceId: 'batteries', amount: 2 }, { resourceId: 'cloth_scraps', amount: 1 }],
    effectType: 'buff', effectValue: 25, buffId: 'torch' },
  { id: 'barricade_kit', name: 'Barricade Kit', icon: '\u{1F9F1}',
    description: 'Block damage (15s)',
    ingredients: [{ resourceId: 'scrap_metal', amount: 4 }],
    effectType: 'buff', effectValue: 10, buffId: 'barricade' },
  { id: 'distilled_water', name: 'Distilled Water', icon: '\u{1F4A7}',
    description: 'Full HP heal',
    ingredients: [{ resourceId: 'almond_water', amount: 3 }],
    effectType: 'fullHP', effectValue: 0 },
  { id: 'nerve_tonic', name: 'Nerve Tonic', icon: '\u{1F9EA}',
    description: 'Full Sanity heal',
    ingredients: [{ resourceId: 'canned_food', amount: 2 }, { resourceId: 'almond_water', amount: 1 }],
    effectType: 'fullSanity', effectValue: 0 },
  { id: 'firesalt_bomb', name: 'Firesalt Bomb', icon: '\u{1F4A3}',
    description: 'Auto-kill next entity',
    ingredients: [{ resourceId: 'firesalt', amount: 3 }, { resourceId: 'scrap_metal', amount: 1 }],
    effectType: 'buff', effectValue: 1, buffId: 'firesaltBomb' },
];

/* ------------------------------------------------------------------ */
/*  Shop & Monetization (Phase 5)                                      */
/* ------------------------------------------------------------------ */

export type ShopCategory = 'starter' | 'convenience' | 'cosmetic';

export interface ShopItemDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: ShopCategory;
  cost: number; // Void Shards
  oneTime: boolean; // true = can only buy once
}

export const SHOP_ITEMS: ShopItemDef[] = [
  // Starter Packs (one-time)
  { id: 'survivors_kit', name: "Survivor's Kit", icon: '\u{2764}\u{FE0F}',
    description: '+20 base Max HP permanently, +10 almond water per run',
    category: 'starter', cost: 5, oneTime: true },
  { id: 'explorers_kit', name: "Explorer's Kit", icon: '\u{26A1}',
    description: '+15% base explore speed permanently',
    category: 'starter', cost: 5, oneTime: true },
  { id: 'scavengers_kit', name: "Scavenger's Kit", icon: '\u{1F50D}',
    description: '+15% base find rate permanently',
    category: 'starter', cost: 5, oneTime: true },

  // Convenience (repeatable)
  { id: 'resource_bundle', name: 'Resource Bundle', icon: '\u{1F4E6}',
    description: 'Instantly gain 10 of each resource',
    category: 'convenience', cost: 2, oneTime: false },
  { id: 'instant_prestige', name: 'Instant Prestige', icon: '\u{23EA}',
    description: 'Prestige now with current fragment earnings',
    category: 'convenience', cost: 8, oneTime: false },
  { id: 'offline_boost', name: 'Offline Boost', icon: '\u{1F319}',
    description: 'Next offline session processes 2x ticks',
    category: 'convenience', cost: 3, oneTime: false },
  { id: 'auto_scavenge', name: 'Auto-Scavenge', icon: '\u{1F916}',
    description: 'Auto-uses Scavenge when off cooldown (1 run)',
    category: 'convenience', cost: 10, oneTime: false },

  // Cosmetics (permanent)
  { id: 'crimson_wallpaper', name: 'Crimson Wallpaper', icon: '\u{1F534}',
    description: 'Red-tinted backrooms background',
    category: 'cosmetic', cost: 5, oneTime: true },
  { id: 'poolrooms_wallpaper', name: 'Poolrooms Wallpaper', icon: '\u{1F535}',
    description: 'Blue pool tile background',
    category: 'cosmetic', cost: 5, oneTime: true },
  { id: 'static_wallpaper', name: 'Static Wallpaper', icon: '\u{1F4FA}',
    description: 'TV static overlay effect',
    category: 'cosmetic', cost: 5, oneTime: true },
  { id: 'gold_text', name: 'Gold Text Theme', icon: '\u{1F31F}',
    description: 'All UI text becomes gold-tinted',
    category: 'cosmetic', cost: 3, oneTime: true },
];

/** Milestone shard rewards — one-time achievements that give Void Shards */
export interface ShardMilestoneDef {
  id: string;
  description: string;
  check: (state: { prestigeCount: number; totalDepth: number; stats: { deaths: number; levelsEscaped: number }; memoryFragments: number }) => boolean;
  reward: number;
}

export const SHARD_MILESTONES: ShardMilestoneDef[] = [
  { id: 'first_prestige', description: 'First Rewind', reward: 2,
    check: s => s.prestigeCount >= 1 },
  { id: 'prestige_5', description: '5 Rewinds', reward: 3,
    check: s => s.prestigeCount >= 5 },
  { id: 'prestige_10', description: '10 Rewinds', reward: 5,
    check: s => s.prestigeCount >= 10 },
  { id: 'prestige_25', description: '25 Rewinds', reward: 8,
    check: s => s.prestigeCount >= 25 },
  { id: 'depth_10', description: 'Reach Depth 10', reward: 2,
    check: s => s.totalDepth >= 10 },
  { id: 'depth_25', description: 'Reach Depth 25', reward: 3,
    check: s => s.totalDepth >= 25 },
  { id: 'depth_50', description: 'Reach Depth 50', reward: 5,
    check: s => s.totalDepth >= 50 },
  { id: 'depth_100', description: 'Reach Depth 100', reward: 10,
    check: s => s.totalDepth >= 100 },
  { id: 'memories_5', description: 'Collect 5 Memory Fragments', reward: 2,
    check: s => s.memoryFragments >= 5 },
  { id: 'memories_15', description: 'Collect all 15 Memory Fragments', reward: 5,
    check: s => s.memoryFragments >= 15 },
  { id: 'survivor_50', description: 'Die 50 times', reward: 3,
    check: s => s.stats.deaths >= 50 },
];
