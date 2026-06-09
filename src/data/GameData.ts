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

export type UpgradeEffect = 'cooldown' | 'power' | 'autoMine' | 'explorerAuto' | 'bonusOre' | 'quality' | 'qualityYield' | 'mint' | 'flatPower' | 'critChance' | 'autoCapture' | 'hypeDuration' | 'tapExplorer' | 'critDamage' | 'easyAccess';

/* ------------------------------------------------------------------ */
/*  Floor ores — each level is ONE ore you mine toward a target.       */
/* ------------------------------------------------------------------ */

/**
 * The resource each floor yields, in descend order. There are 31 distinct
 * resources; floors 0-30 use them at Tier 1. Floor 31 loops back to the start
 * at Tier 2 (red outline), floor 62 at Tier 3, and so on forever.
 */
export const ORE_SEQUENCE = [
  'almond_water', 'wallpaper_strip', 'carpet_swatch', 'ceiling_tile', 'fluorescent_tube',
  'cloth_scraps', 'scrap_wood', 'scrap_metal', 'copper_wire', 'duct_tape',
  'glass_shard', 'batteries', 'lamp', 'radio', 'CCTV_camera',
  'computer', 'vhs_tape', 'notebook_page', 'maps', 'canned_food',
  'mre', 'energy_bar', 'bandage', 'anti_anxiety_pills', 'anti_radiation_pills',
  'charcoal', 'bone_fragments', 'mannequin', 'pool_water', 'liquid_pain',
  'lucky_coins',
];

export interface FloorOre {
  resource: string;
  tier: number;       // 1 for floors 0-30, 2 for 31-61, ... (visual outline + name suffix)
  required: number;   // ore needed to unlock descend
  durability: number; // taps to break ONE ore node (before Mining Power)
}

// Node HP per floor. The first few are hand-tuned to keep an early difficulty
// spike; past the table, HP grows by a gentle per-floor multiplier (HP_GROWTH)
// so the curve scales forever WITHOUT the exponential "doubling wall". Pure ×2
// outran the player's power; ×1.5 keeps numbers climbing into the millions while
// staying roughly in reach (paired with multiplicative power upgrades).
//                        f0   f1   f2   f3    f4
const NODE_HP: number[] = [10, 30, 60, 120, 250];   // hand-tuned intro
const HP_GROWTH = 1.5;                               // per-floor multiplier for the tail (the knob)

export function floorHp(levelId: number): number {
  if (levelId >= 0 && levelId < NODE_HP.length) return NODE_HP[levelId];
  const lastIdx = NODE_HP.length - 1;
  return Math.round(NODE_HP[lastIdx] * Math.pow(HP_GROWTH, levelId - lastIdx));
}

export function getFloorOre(levelId: number): FloorOre {
  const n = ORE_SEQUENCE.length;
  return {
    resource: ORE_SEQUENCE[levelId % n],
    tier: Math.floor(levelId / n) + 1,  // every full lap of the list bumps the tier
    required: 10 + levelId * 20,        // Floor 0: 10, Floor 1: 30, Floor 2: 50, ...
    durability: floorHp(levelId),       // node HP — hand-tuned per floor (NODE_HP)
  };
}

/**
 * Outline color for a resource tier. Tier 1 = no outline (null). Tier 2+ cycles
 * through this palette so depth always re-skins the same icons in a new color.
 */
export const TIER_OUTLINE_COLORS: number[] = [
  0xff4444, // Tier 2 — red
  0xffa726, // Tier 3 — orange
  0x66bb6a, // Tier 4 — green
  0x29b6f6, // Tier 5 — cyan
  0xab47bc, // Tier 6 — purple
  0xec407a, // Tier 7 — pink
  0xffd54f, // Tier 8 — gold
];

export function getTierColor(tier: number): number | null {
  if (tier <= 1) return null;
  return TIER_OUTLINE_COLORS[(tier - 2) % TIER_OUTLINE_COLORS.length];
}

/** Roman-numeral suffix for a tier (Tier 1 = '', Tier 2 = ' II', ...). */
export function tierSuffix(tier: number): string {
  if (tier <= 1) return '';
  const numerals: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let n = tier;
  let out = '';
  for (const [val, sym] of numerals) {
    while (n >= val) { out += sym; n -= val; }
  }
  return ` ${out}`;
}

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
  // When true, the cost resource cycles through ORE_SEQUENCE by level (level N is
  // paid in ORE_SEQUENCE[N]) instead of always using costResource.
  costResourceCycle?: boolean;
  // If set, the upgrade stays hidden ("?????? Locked") until this floor index has
  // been unlocked — progressively revealing upgrades as the player descends.
  unlockFloor?: number;
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
  // Not floor-based: a moth flutters across the explore screen now and then;
  // click it to collect one. A constant, always-available rare.
  moth: {
    id: 'moth',
    name: 'Moth',
    icon: '\u{1F98B}',
    description: 'Caught fluttering through the halls. Rare, and not tied to any floor.',
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

  // ---- Additional explorable resources (Tier 1 across floors 5-30) ----
  wallpaper_strip: { id: 'wallpaper_strip', name: 'Wallpaper Strip', icon: '\u{1F7E8}', description: 'A peeling curl of the endless yellow wallpaper.', usable: false },
  carpet_swatch: { id: 'carpet_swatch', name: 'Carpet Swatch', icon: '\u{1F7EB}', description: 'A damp scrap torn from the mono-yellow carpet.', usable: false },
  ceiling_tile: { id: 'ceiling_tile', name: 'Ceiling Tile', icon: '⬜', description: 'A water-stained panel pried from the drop ceiling.', usable: false },
  fluorescent_tube: { id: 'fluorescent_tube', name: 'Fluorescent Tube', icon: '\u{1F4A1}', description: 'A humming light tube, still faintly buzzing.', usable: false },
  scrap_wood: { id: 'scrap_wood', name: 'Scrap Wood', icon: '\u{1FAB5}', description: 'Splintered planks salvaged from the structure.', usable: false },
  copper_wire: { id: 'copper_wire', name: 'Copper Wire', icon: '\u{1F50C}', description: 'A coiled bundle of stripped wiring.', usable: false },
  duct_tape: { id: 'duct_tape', name: 'Duct Tape', icon: '\u{1F9F7}', description: 'The universal fix. Half a roll left.', usable: false },
  glass_shard: { id: 'glass_shard', name: 'Glass Shard', icon: '\u{1F537}', description: 'A jagged sliver of broken glass.', usable: false },
  lamp: { id: 'lamp', name: 'Lamp', icon: '\u{1FA94}', description: 'A flickering lamp scavenged from an office.', usable: false },
  radio: { id: 'radio', name: 'Radio', icon: '\u{1F4FB}', description: 'A handheld radio crackling with dead static.', usable: false },
  CCTV_camera: { id: 'CCTV_camera', name: 'CCTV Camera', icon: '\u{1F4F9}', description: 'A salvaged surveillance camera. Still warm.', usable: false },
  computer: { id: 'computer', name: 'Computer', icon: '\u{1F4BB}', description: 'An old terminal humming with a frozen prompt.', usable: false },
  notebook_page: { id: 'notebook_page', name: 'Notebook Page', icon: '\u{1F4C4}', description: 'A torn page covered in someone’s frantic notes.', usable: false },
  maps: { id: 'maps', name: 'Maps', icon: '\u{1F5FA}\u{FE0F}', description: 'Hand-drawn charts of routes that may not exist.', usable: false },
  mre: { id: 'mre', name: 'MRE', icon: '\u{1F371}', description: 'A military meal-ready-to-eat. Tastes of cardboard.', usable: false },
  energy_bar: { id: 'energy_bar', name: 'Energy Bar', icon: '\u{1F36B}', description: 'A crushed protein bar, two years past date.', usable: false },
  bandage: { id: 'bandage', name: 'Bandage', icon: '\u{1FA79}', description: 'A roll of gauze for the inevitable scrapes.', usable: false },
  anti_anxiety_pills: { id: 'anti_anxiety_pills', name: 'Anti-Anxiety Pills', icon: '\u{1F48A}', description: 'Takes the edge off the endless hum.', usable: false },
  anti_radiation_pills: { id: 'anti_radiation_pills', name: 'Anti-Radiation Pills', icon: '☢\u{FE0F}', description: 'Iodine tablets for the glowing deep levels.', usable: false },
  charcoal: { id: 'charcoal', name: 'Charcoal', icon: '⚫', description: 'Lumps of charcoal for fire and filtering.', usable: false },
  bone_fragments: { id: 'bone_fragments', name: 'Bone Fragments', icon: '\u{1F9B4}', description: 'Pale fragments best not thought about.', usable: false },
  mannequin: { id: 'mannequin', name: 'Mannequin', icon: '\u{1F9CD}', description: 'A featureless figure. It was facing you before.', usable: false },
  pool_water: { id: 'pool_water', name: 'Pool Water', icon: '\u{1F4A7}', description: 'Warm, chlorine-tinged water from the Poolrooms.', usable: false },
  liquid_pain: { id: 'liquid_pain', name: 'Liquid Pain', icon: '\u{1FA78}', description: 'A vial of deep red fluid. It pulses faintly.', usable: false },
  vhs_tape: { id: 'vhs_tape', name: 'VHS Tape', icon: '\u{1F4FC}', description: 'An unlabeled tape. You don’t want to watch it.', usable: false },
};

// The Items menu lists exactly the explorable resources. firesalt / level_keys
// are no longer resources (they're dormant tools), so they're not shown here.
export const RESOURCE_ORDER = [...ORE_SEQUENCE, 'moth'];

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

// 31 floor locations, one per resource in ORE_SEQUENCE order (floor N collects
// ORE_SEQUENCE[N % 31]). Deeper tiers reuse these same locations, recolored by
// the resource tier outline. resourceDrops is dormant (no random drops) → [].
export const LEVELS: LevelDef[] = [
  // 0 — almond_water
  { id: 0, name: 'THE LOBBY', subtitle: 'The Hum Never Stops', description: 'Endless yellow rooms. Fluorescent lights buzz overhead. The carpet is damp.', bgColor: 0x6b6030, textColor: '#E8DCA0', danger: 1, explorationRequired: 100, resourceDrops: [], entityIds: ['smiler', 'hound'], ambientMessages: ['The fluorescent lights flicker above you.', 'You hear a distant humming sound.', 'The carpet squelches underfoot.', 'Another identical yellow room. And another.', 'Was that shadow always there?', 'You smell almonds.'] },
  // 1 — wallpaper_strip
  { id: 1, name: 'THE YELLOW CORRIDOR', subtitle: 'It Goes On Forever', description: 'Mile after mile of the same wallpaper, curling off the walls in long strips.', bgColor: 0x7a6a32, textColor: '#E8DC90', danger: 1, explorationRequired: 100, resourceDrops: [], entityIds: ['smiler', 'hound'], ambientMessages: ['The wallpaper peels at the slightest touch.', 'Behind the paper, the wall is the same color.', 'A seam in the pattern repeats every few feet.', 'You smell old paste and dust.', 'The yellow seems to hum.'] },
  // 2 — carpet_swatch
  { id: 2, name: 'THE CARPET HALLS', subtitle: 'Always Wet Underfoot', description: 'The mono-yellow carpet stretches on, soaked through and warm underfoot.', bgColor: 0x5e5a28, textColor: '#D8D080', danger: 1, explorationRequired: 100, resourceDrops: [], entityIds: ['hound', 'skin_stealer'], ambientMessages: ['The carpet squelches with every step.', 'Damp patches spread like they are breathing.', 'You leave footprints that slowly fill back in.', 'Something is wet that should not be.', 'The padding underneath is soft. Too soft.'] },
  // 3 — ceiling_tile
  { id: 3, name: 'THE DROP CEILING', subtitle: 'Something Above the Tiles', description: 'A low crawlspace of sagging acoustic tiles, stained and ready to fall.', bgColor: 0x4a4a40, textColor: '#C8C8B0', danger: 2, explorationRequired: 100, resourceDrops: [], entityIds: ['smiler', 'skin_stealer'], ambientMessages: ['A tile shifts overhead. Dust rains down.', 'The grid sags lower the further you go.', 'Something moves above the tiles.', 'A tile is missing. Only black above.', 'Water stains form the shape of a face.'] },
  // 4 — fluorescent_tube
  { id: 4, name: 'LOW-CEILING LEVEL', subtitle: 'Do Not Stand Up Straight', description: 'Rows of buzzing light tubes stretch into the dark, some flickering, some dead.', bgColor: 0x3a3a30, textColor: '#E0E0A0', danger: 2, explorationRequired: 100, resourceDrops: [], entityIds: ['smiler', 'partygoer'], ambientMessages: ['A tube flickers and dies. Then another.', 'The buzzing is louder here.', 'Your shadow multiplies under the lights.', 'One light pulses in a rhythm. Almost a word.', 'The hum gets inside your teeth.'] },
  // 5 — cloth_scraps
  { id: 5, name: 'HABITABLE ZONE', subtitle: 'They Were Here Recently', description: 'Dark warehouses and concrete. Some areas look almost lived-in.', bgColor: 0x2a2a2a, textColor: '#B0B0B0', danger: 2, explorationRequired: 250, resourceDrops: [], entityIds: ['hound', 'skin_stealer'], ambientMessages: ['Empty crates line the walls.', 'You find a makeshift campsite. Long abandoned.', 'Metal shelving stretches into the darkness.', 'Graffiti on the wall: "DON\'T TRUST THEM"', 'Someone was here. Recently.', 'You find a torn journal page. Frantic writing.'] },
  // 6 — scrap_wood
  { id: 6, name: 'THE CARPENTRY', subtitle: 'Abandoned Mid-Cut', description: 'Endless wooden framing, sawdust underfoot, projects abandoned mid-cut.', bgColor: 0x3a2a18, textColor: '#C8A878', danger: 3, explorationRequired: 300, resourceDrops: [], entityIds: ['hound', 'wretched'], ambientMessages: ['Sawdust drifts in the still air.', 'A saw rests mid-cut in a board.', 'Half-built doorways lead nowhere.', 'The wood is warm, like it was just worked.', 'Nails are scattered in patterns you do not like.'] },
  // 7 — scrap_metal
  { id: 7, name: 'THE MACHINE YARD', subtitle: 'Something Still Moves', description: 'Heaps of rusted machinery and scrap rise in the gloom like dunes.', bgColor: 0x2a2a2e, textColor: '#A8A8B0', danger: 3, explorationRequired: 350, resourceDrops: [], entityIds: ['skin_stealer', 'wretched'], ambientMessages: ['Metal groans somewhere in the dark.', 'Rust flakes coat everything you touch.', 'A heap of scrap shifts on its own.', 'You find tools, still oily.', 'Something metal scrapes, far off.'] },
  // 8 — copper_wire
  { id: 8, name: 'THE BOILER ROOMS', subtitle: 'It Breathes in the Pipes', description: 'Concrete tunnels lined with pipes. Unknown fluids drip from above.', bgColor: 0x1c2833, textColor: '#7FB3D3', danger: 3, explorationRequired: 500, resourceDrops: [], entityIds: ['smiler', 'skin_stealer', 'partygoer'], ambientMessages: ['Pipes groan and shudder overhead.', 'A dark liquid drips onto your shoulder.', 'The tunnel splits three ways. You pick one.', 'Steam hisses from a cracked pipe.', 'Rust flakes off the pipe you brush against.', 'Something splashes in the distance.'] },
  // 9 — duct_tape
  { id: 9, name: 'MAINTENANCE TUNNELS', subtitle: 'No One Maintains It', description: 'Cramped utility crawlways where everything is patched with tape and prayer.', bgColor: 0x2e2a20, textColor: '#C0B890', danger: 4, explorationRequired: 600, resourceDrops: [], entityIds: ['wretched', 'skin_stealer'], ambientMessages: ['Tape holds a pipe that should not hold.', 'Every surface is patched and re-patched.', 'A valve drips no matter how tight.', 'The tunnels narrow, then narrow again.', 'Someone wrote "TEMPORARY" on everything.'] },
  // 10 — glass_shard
  { id: 10, name: 'THE GREENHOUSE', subtitle: 'It Grew Toward You', description: 'A vast collapsed arcade, the floor a carpet of broken glass under dead skylights.', bgColor: 0x1a2a2e, textColor: '#A8D0D8', danger: 4, explorationRequired: 700, resourceDrops: [], entityIds: ['partygoer', 'ink_crawler'], ambientMessages: ['Glass crunches no matter where you step.', 'Your reflection scatters across a thousand shards.', 'A skylight gives way somewhere distant.', 'The shards are arranged, almost deliberately.', 'You bleed a little. You do not remember when.'] },
  // 11 — batteries
  { id: 11, name: 'ELECTRICAL STATION', subtitle: 'Live to the Touch', description: 'Banks of humming machinery. Sparks fly from exposed wiring.', bgColor: 0x0d0d1a, textColor: '#8080FF', danger: 4, explorationRequired: 750, resourceDrops: [], entityIds: ['wretched', 'partygoer', 'skin_stealer'], ambientMessages: ['Sparks fly from a panel on the wall.', 'The machinery hums louder. Then quiets.', 'Warning lights flash in the corridor.', 'You smell ozone and burnt plastic.', 'Cables hang from the ceiling like vines.', 'The lights cut out. Then slam back on.'] },
  // 12 — lamp
  { id: 12, name: 'THE SHOWROOM', subtitle: 'Someone Was Just Sitting Here', description: 'An infinite furniture showroom, every room staged and lit by countless lamps.', bgColor: 0x2a241a, textColor: '#E0C890', danger: 5, explorationRequired: 850, resourceDrops: [], entityIds: ['partygoer', 'skin_stealer'], ambientMessages: ['Every lamp is on. No one turned them on.', 'The furniture is arranged for guests.', 'A price tag reads a number that hurts to look at.', 'You sink into a couch. It is warm.', 'Each room is staged. Each room is empty.'] },
  // 13 — radio
  { id: 13, name: 'THE BROADCAST STATION', subtitle: 'It Says Your Name', description: 'A derelict broadcast station, every speaker hissing with static and half-words.', bgColor: 0x1a1e26, textColor: '#90B0C0', danger: 5, explorationRequired: 950, resourceDrops: [], entityIds: ['wretched', 'ink_crawler'], ambientMessages: ['Static resolves into a voice, then back.', 'A reel-to-reel spins with nothing on it.', 'The dial moves on its own.', 'You hear your name between stations.', 'Every channel is the same breathing.'] },
  // 14 — CCTV_camera
  { id: 14, name: 'THE SECURITY WING', subtitle: 'It Saw You First', description: 'Endless banks of monitors, each showing a room you just left.', bgColor: 0x14181a, textColor: '#88A0A0', danger: 5, explorationRequired: 1050, resourceDrops: [], entityIds: ['crimson_watcher', 'skin_stealer'], ambientMessages: ['A monitor shows the room you are standing in.', 'A camera tracks you as you pass.', 'One screen shows a hallway that is not here. Yet.', 'The timestamps are all wrong.', 'You wave at a camera. The screen waves back.'] },
  // 15 — computer
  { id: 15, name: 'THE ABANDONED OFFICE', subtitle: 'Everyone Just Left', description: 'Rows of cubicles and filing cabinets. Computers display only static.', bgColor: 0x1a1a1a, textColor: '#909090', danger: 5, explorationRequired: 1000, resourceDrops: [], entityIds: ['wretched', 'partygoer', 'skin_stealer', 'hound', 'smiler'], ambientMessages: ['A phone rings. You let it go to voicemail.', 'Post-it notes cover a cubicle wall. All blank.', 'A computer shows static. Then a face. Then static.', 'Filing cabinets stand open. All empty.', 'You find a coffee mug. Still warm.', 'A clock on the wall. The hands move backward.'] },
  // 16 — vhs_tape
  { id: 16, name: 'THE VIDEO STORE', subtitle: 'Do Not Watch the Tape', description: 'A derelict video store, shelves of unlabeled tapes humming faintly.', bgColor: 0x1a1424, textColor: '#B090C0', danger: 5, explorationRequired: 1100, resourceDrops: [], entityIds: ['partygoer', 'ink_crawler'], ambientMessages: ['Every tape is unlabeled. Or labeled in your hand.', 'A TV in the corner plays a tape you did not insert.', 'The NEW RELEASES are decades old.', 'Rewinding sounds like whispering.', 'One tape is warm. Recently watched.'] },
  // 17 — notebook_page
  { id: 17, name: 'THE LIBRARY', subtitle: 'It Knows Your Name', description: 'Infinite shelves of books in languages that do not exist. Knowledge here has teeth.', bgColor: 0x1a1412, textColor: '#D4A574', danger: 5, explorationRequired: 1500, resourceDrops: [], entityIds: ['ink_crawler', 'archivist', 'partygoer'], ambientMessages: ['Books whisper when you walk past.', 'A page turns on its own. You did not touch it.', 'You find a book with your name as the author.', 'The shelves rearrange when you are not looking.', 'You open a book. The words rearrange into warnings.', 'The silence here is aggressive.'] },
  // 18 — maps
  { id: 18, name: 'THE ENCAMPMENT', subtitle: 'The Maps Lie', description: 'An abandoned survivors\' camp, every surface papered with hand-drawn maps of the endless halls.', bgColor: 0x1e2218, textColor: '#B0C088', danger: 6, explorationRequired: 1300, resourceDrops: [], entityIds: ['skin_stealer', 'partygoer'], ambientMessages: ['Bedrolls lie abandoned around a cold fire pit.', 'Hand-drawn maps are pinned to every wall.', 'A map marks a safe route. It is scratched out.', 'Someone charted these halls for years.', 'The maps disagree with each other. And with the halls.'] },
  // 19 — canned_food
  { id: 19, name: 'THE STOCKROOM', subtitle: 'Something Shops Here', description: 'The back room of a supermarket that never ends, shelves stocked and silent.', bgColor: 0x1a2418, textColor: '#A0C088', danger: 6, explorationRequired: 1400, resourceDrops: [], entityIds: ['hound', 'wretched'], ambientMessages: ['The shelves restock when you look away.', 'Every can has the same blank label.', 'A freezer hums with nothing inside.', 'The aisles loop back on themselves.', 'Something is shopping in the next aisle.'] },
  // 20 — mre
  { id: 20, name: 'THE BUNKER', subtitle: 'Sealed From the Inside', description: 'A military supply depot sealed against an emergency that already happened.', bgColor: 0x22241a, textColor: '#B0B088', danger: 6, explorationRequired: 1500, resourceDrops: [], entityIds: ['wretched', 'crimson_watcher'], ambientMessages: ['Crates of rations stacked to the ceiling.', 'A klaxon light spins with no sound.', 'The blast door is sealed from this side.', 'Someone counted the supplies. Obsessively.', 'A cot is still warm under the blanket.'] },
  // 21 — energy_bar
  { id: 21, name: 'THE BREAK ROOM', subtitle: 'No One Clocked Out', description: 'A flickering employee lounge, vending machines glowing in the dark.', bgColor: 0x22201a, textColor: '#C0B080', danger: 6, explorationRequired: 1600, resourceDrops: [], entityIds: ['partygoer', 'skin_stealer'], ambientMessages: ['A vending machine drops a snack, unasked.', 'The microwave runs with nothing inside.', 'A schedule on the wall has only your name.', 'The coffee is fresh. The pot is cold.', '"CLEAN UP AFTER YOURSELF," the sign insists.'] },
  // 22 — bandage
  { id: 22, name: 'THE INFIRMARY', subtitle: 'The Beds Are Still Warm', description: 'A field hospital of empty gurneys and curtains that move on their own.', bgColor: 0x1c2222, textColor: '#A0C0B0', danger: 7, explorationRequired: 1700, resourceDrops: [], entityIds: ['wretched', 'skin_stealer'], ambientMessages: ['A curtain sways. No draft.', 'A heart monitor beeps somewhere. Steady.', 'The gurneys are made up, waiting.', 'Bloody handprints lead to a sealed door.', 'A chart bears your name and no diagnosis.'] },
  // 23 — anti_anxiety_pills
  { id: 23, name: 'THE PHARMACY', subtitle: 'It Knows What Is Wrong With You', description: 'A ward of pill cabinets, every drawer labeled with symptoms you have.', bgColor: 0x1e2026, textColor: '#A0A8C0', danger: 7, explorationRequired: 1800, resourceDrops: [], entityIds: ['partygoer', 'wretched'], ambientMessages: ['Every drawer is labeled with a feeling.', 'Pills are sorted by a logic you almost grasp.', 'A prescription waits, made out to you.', 'The cabinets rattle softly, like teeth.', '"DO NOT EXCEED THE DOSE," underlined twice.'] },
  // 24 — anti_radiation_pills
  { id: 24, name: 'THE REACTOR', subtitle: 'Do Not Linger', description: 'A contaminated sublevel where the air glows faintly and the cold bites.', bgColor: 0x1a2210, textColor: '#C0E070', danger: 8, explorationRequired: 2000, resourceDrops: [], entityIds: ['crimson_watcher', 'wretched', 'frost_shade'], ambientMessages: ['A dosimeter clicks faster the deeper you go.', 'The frost here glows a sickly green.', 'Warning trefoils peel off every wall.', 'Your skin prickles in the cold light.', 'Something survived down here. It should not have.'] },
  // 25 — charcoal
  { id: 25, name: 'THE INCINERATOR', subtitle: 'Something Burned Here', description: 'A scorched maze of furnaces, the walls black with old soot and heat.', bgColor: 0x18120e, textColor: '#C09060', danger: 8, explorationRequired: 2100, resourceDrops: [], entityIds: ['wretched', 'crimson_watcher'], ambientMessages: ['A furnace ticks as it cools. Or heats.', 'Soot coats your hands, your throat.', 'Embers glow in a grate no one tends.', 'The heat comes in waves, like breath.', 'Charcoal crunches into black dust underfoot.'] },
  // 26 — bone_fragments
  { id: 26, name: 'THE CATACOMBS', subtitle: 'The Bones Remember', description: 'Shelves of bone tablets. The inscriptions change when you look away.', bgColor: 0x1a1412, textColor: '#D4C4A4', danger: 8, explorationRequired: 2200, resourceDrops: [], entityIds: ['archivist', 'ink_crawler', 'crimson_watcher'], ambientMessages: ['Bone tablets line the walls, inscribed.', 'The carvings rearrange when you blink.', 'A skull watches from a niche.', 'Your footsteps echo like a tally.', 'The dust here is pale and fine and old.'] },
  // 27 — mannequin
  { id: 27, name: 'THE MALL', subtitle: 'The Mannequins Moved', description: 'A dead department store, mannequins posed mid-gesture in the gloom.', bgColor: 0x201a24, textColor: '#C0A0C0', danger: 8, explorationRequired: 2300, resourceDrops: [], entityIds: ['partygoer', 'skin_stealer', 'smiler'], ambientMessages: ['A mannequin faces you. It did not before.', 'Escalators run to floors that do not exist.', 'A fountain trickles in the empty atrium.', 'The mannequins are posed like they are waiting.', 'A mall map says "YOU ARE HERE." You are not.'] },
  // 28 — pool_water
  { id: 28, name: 'THE POOLROOMS', subtitle: 'Do Not Touch the Water', description: 'Pristine blue pools stretch into infinity. Beautiful... but wrong.', bgColor: 0x14544a, textColor: '#A0F0E0', danger: 7, explorationRequired: 2400, resourceDrops: [], entityIds: ['partygoer'], ambientMessages: ['The water is perfectly still. Almost too still.', 'White tiles gleam under fluorescent light.', 'Your footsteps echo across the pool deck.', 'The water looks inviting. You resist.', 'Reflections in the water do not match the room.', 'A sign reads: "NO LIFEGUARD ON DUTY"'] },
  // 29 — liquid_pain
  { id: 29, name: 'THE RED HALLS', subtitle: 'It Tastes Like Copper', description: 'Blood-red walls stretch endlessly. The air tastes like copper.', bgColor: 0x3a0a0a, textColor: '#FF6666', danger: 8, explorationRequired: 2500, resourceDrops: [], entityIds: ['crimson_watcher', 'wretched', 'skin_stealer'], ambientMessages: ['The walls pulse faintly. Like a heartbeat.', 'A distant scream echoes. Or was it laughter?', 'The ceiling drips. You do not look up.', 'Handprints on the wall. Too many fingers.', 'You find a mirror. Your reflection is delayed.', 'The lights here are red. Everything is red.'] },
  // 30 — lucky_coins
  { id: 30, name: 'THE FOUNTAIN', subtitle: 'Make No Wishes', description: 'A grand wishing fountain in a dead arcade, its water full of coins and want.', bgColor: 0x1a2418, textColor: '#E0D070', danger: 8, explorationRequired: 2600, resourceDrops: [], entityIds: ['partygoer', 'archivist', 'crimson_watcher'], ambientMessages: ['Coins glitter under black water.', 'The fountain whispers when you near it.', 'A wish surfaces, not yours.', 'Arcade machines flicker to attract no one.', 'Every coin you take, two appear.'] },
];

// Mining upgrades. Every collectible resource feeds one, so each floor's ore is
// useful. Effects are uncapped — escalating cost paces you, not a hard maxLevel.
// The upgrade roster is being rebuilt from scratch (the old set was scrapped).
// Auto Explore is the first — and currently only — upgrade. A fresh game has NO
// auto-search; this is what grants it, so it's the cheap starter hook.
//   - Effect: +1 auto-search per second per level (drone ticks every 1s).
//   - Cost (Almond Water): 5,6,7,9,10,12,15,18,21,26,31,37,45,53,64
//     = round(5 × 1.2^level), reproduced by baseCost 5 × multiplier 1.2.
export const UPGRADES: UpgradeDef[] = [
  {
    id: 'auto_explore', name: 'Auto Explore', icon: '\u{1F916}',
    description: 'A drone auto searches for resources every 1s (+1 per level)',
    baseCost: 5, costMultiplier: 1.2, maxLevel: 15,
    effectPerLevel: 1, effectUnit: '/s', costResource: 'almond_water', effect: 'autoMine',
  },
  // Spend Moths (the click-to-catch rare). Each level adds +2 to BOTH tap and
  // auto search power. Cost = round(5 × 1.4^level): 5,7,10,…,283 at level 13.
  {
    id: 'moth_powers', name: 'Moth Powers', icon: '\u{1F98B}',
    description: '+2 auto search & tap power per level (+2 per level)',
    baseCost: 5, costMultiplier: 1.4, maxLevel: 15,
    effectPerLevel: 2, effectUnit: ' power', costResource: 'moth', effect: 'flatPower',
  },
  // Paid in a DIFFERENT floor resource each level (cycles all 31), cost
  // round(100 × 1.3^level): 100 Almond Water, 130 Wallpaper Strip, … 1792 Batteries
  // at L12, up to L31. Each level: +5 to both tap and auto search power.
  {
    id: 'master_scav', name: 'Master Scav', icon: '\u{1F392}',
    description: '+5 auto search & tap power per level (+5 per level)',
    baseCost: 100, costMultiplier: 1.3, maxLevel: 31,
    effectPerLevel: 5, effectUnit: ' power', costResource: 'almond_water', effect: 'flatPower',
    costResourceCycle: true,
  },
  // Tap-ONLY power (effect 'power' adds to clickPower, not auto). Cost = round(5 ×
  // 1.2^level) in Wallpaper Strip — same curve as Auto Explore: 5,6,7,9,10,…,64.
  {
    id: 'sharp_eye', name: 'Sharp Eye', icon: '\u{1F441}\u{FE0F}',
    description: '+1 tap power per level',
    baseCost: 5, costMultiplier: 1.2, maxLevel: 15,
    effectPerLevel: 1, effectUnit: ' tap power', costResource: 'wallpaper_strip', effect: 'power',
    unlockFloor: 1,   // hidden until the player reaches the Wallpaper Strip floor
  },
  // Chance to auto-capture a passing moth (no click needed). Cost = round(30 ×
  // 1.2^level) in Wallpaper Strip: 30,36,43,…  Locked until floor 1 (its resource).
  {
    id: 'trapper', name: 'Trapper', icon: '\u{1FAA4}',
    description: '+1% auto-capture chance per level',
    baseCost: 30, costMultiplier: 1.2, maxLevel: 50,
    effectPerLevel: 1, effectUnit: '% auto-capture', costResource: 'wallpaper_strip', effect: 'autoCapture',
    unlockFloor: 1,
  },
  // Extends the hype buff duration. Cost = round(50 × 1.3^level) in Carpet Swatch:
  // 50,65,85,110,…  Locked until floor 2 (its resource).
  {
    id: 'rally_cry', name: 'Rally Cry', icon: '\u{1F4E3}',
    description: '+0.5s Explorer hype duration per level',
    baseCost: 50, costMultiplier: 1.3, maxLevel: 30,
    effectPerLevel: 0.5, effectUnit: 's hype', costResource: 'carpet_swatch', effect: 'hypeDuration',
    unlockFloor: 2,
  },
  // +1% crit chance per level (crits deal ×3). Cost = round(5 × 1.2^level) in
  // Ceiling Tile — same curve as Auto Explore: 5,6,7,9,10,…,64. Locked until floor 3.
  {
    id: 'lucky_find', name: 'Lucky Find', icon: '\u{1F340}',
    description: '+1% Crit Chance per level (3x damage)',
    baseCost: 5, costMultiplier: 1.2, maxLevel: 15,
    effectPerLevel: 1, effectUnit: '% crit', costResource: 'ceiling_tile', effect: 'critChance',
    unlockFloor: 3,
  },
  // Per-EXPLORER auto power (effect 'explorerAuto'): each level gives every Explorer
  // +2 auto/s, so the auto-search total adds 2×level × (Explorer count). Cost = round(5 ×
  // 1.2^level) in Fluorescent Tube — same curve as Auto Explore: 5,6,7,9,10,…,64. Locked until floor 4.
  {
    id: 'heavy_sweep', name: 'Heavy Sweep', icon: '\u{1F9F9}',
    description: '+2 auto search power per Explorer per level',
    baseCost: 5, costMultiplier: 1.2, maxLevel: 15,
    effectPerLevel: 2, effectUnit: '/s', costResource: 'fluorescent_tube', effect: 'explorerAuto',
    unlockFloor: 4,
  },
  // Boosts the YIELD of a quality find (not the chance): base quality is +1, each
  // level adds +1 more. Cost = round(1000 × 1.5^level): 1000, 1500. Locked until floor 4.
  {
    id: 'quality_find', name: 'Quality Find', icon: '\u{2728}',
    description: '+1 resource from quality resources per level',
    baseCost: 1000, costMultiplier: 1.5, maxLevel: 2,
    effectPerLevel: 1, effectUnit: ' quality resource', costResource: 'fluorescent_tube', effect: 'qualityYield',
    unlockFloor: 4,
  },
  // Raises the CHANCE a find is quality (effect 'quality' feeds qualityChance).
  // +0.25% per level. Cost = round(5 × 1.2^level) in Cloth Scraps — same curve as
  // Auto Explore: 5,6,7,9,10,12,15,18,21,26,… Locked until floor 5 (its resource).
  {
    id: 'quality_sense', name: 'Quality Sense', icon: '\u{1F50D}',
    description: '+0.25% quality resource chance per level',
    baseCost: 5, costMultiplier: 1.2, maxLevel: 20,
    effectPerLevel: 0.25, effectUnit: '% quality chance', costResource: 'cloth_scraps', effect: 'quality',
    unlockFloor: 5,
  },
  // +3 to BOTH tap power and per-Explorer auto (effect 'tapExplorer', folded into
  // clickPower and explorerSharedAuto). Cost = round(8 × 1.3^level) in Scrap Wood:
  // 8,10,14,18,23,30,39,50,65,85,110,143,186,… Locked until floor 6 (its resource).
  {
    id: 'splinters', name: 'Splinters', icon: '\u{1FAB5}',
    description: '+3 Explorer and tap power per level',
    baseCost: 8, costMultiplier: 1.3, maxLevel: 15,
    effectPerLevel: 3, effectUnit: ' power', costResource: 'scrap_wood', effect: 'tapExplorer',
    unlockFloor: 6,
  },
  // Raises the crit DAMAGE multiplier (base ×3 from Lucky Find): +0.2× per level
  // (effect 'critDamage', folded into critMult). Cost = round(12 × 1.35^level) in
  // Scrap Metal: 12,16,22,30,40,… Locked until floor 7 (its resource).
  {
    id: 'metal_head', name: 'Metal Head', icon: '\u{1F4A5}',
    description: '+0.2x Crit Damage per level',
    baseCost: 12, costMultiplier: 1.35, maxLevel: 15,
    effectPerLevel: 0.2, effectUnit: 'x crit damage', costResource: 'scrap_metal', effect: 'critDamage',
    unlockFloor: 7,
  },
  // Easy Access (brittle): +0.5%/level chance, rolled per node at spawn, that the
  // node has HALF durability (easier to mine). Independent of quality/mint. Cost =
  // round(15 × 1.4^level) in Copper Wire: 15,21,29,41,58,81,… Locked until floor 8.
  {
    id: 'stocked_shelves', name: 'Stocked Shelves', icon: '\u{1F4E6}',
    description: '+0.5% Easy Access chance for all resources per level',
    baseCost: 15, costMultiplier: 1.4, maxLevel: 15,
    effectPerLevel: 0.5, effectUnit: '% easy access', costResource: 'copper_wire', effect: 'easyAccess',
    unlockFloor: 8,
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

/**
 * Get level data by id. The 31 hand-crafted floors cycle forever; each full lap
 * is a deeper tier (more danger / darker overlay), matching the resource tier
 * outline. Floor N always uses the location aligned to ORE_SEQUENCE[N % 31].
 */
export function getLevel(id: number): LevelDef {
  const loc = LEVELS[id % LEVELS.length];
  const lap = Math.floor(id / LEVELS.length); // 0 = Tier 1
  return {
    ...loc,
    id,
    danger: Math.min(10, loc.danger + lap * 2),
    explorationRequired: loc.explorationRequired + id * 50,
  };
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
/*  Void Shard Shop                                                     */
/* ------------------------------------------------------------------ */
//
// Permanent upgrades bought with Void Shards. Shards are earned ONLY by maxing a
// run upgrade (one-time per upgrade) or advancing to a new deepest level. The shop
// renders with the same card layout as the run-upgrade screen.
//   - Cost is FLAT-stepped: baseCost + costStep × level.
//     Search Upgrade: 10,15,20,…  Hype Train: 15,20,25,…

export interface ShopUpgradeDef {
  id: string;
  name: string;
  icon: string;       // emoji fallback shown next to the name
  description: string;
  baseCost: number;   // Void Shards for level 0 → 1
  costStep: number;   // added per level
  maxLevel: number;
  effectPerLevel: number;
  effectUnit: string;
}

export const SHOP_UPGRADES: ShopUpgradeDef[] = [
  {
    id: 'search_upgrade', name: 'Search Upgrade', icon: '',
    description: '+3 Explorer power, Tap power, auto search power',
    baseCost: 10, costStep: 5, maxLevel: 10,
    effectPerLevel: 3, effectUnit: ' power',
  },
  {
    id: 'hype_train', name: 'Hype Train', icon: '',
    description: 'Explorer roll +3% chance to self-hype every 5s while ready, per level',
    baseCost: 15, costStep: 5, maxLevel: 10,
    effectPerLevel: 3, effectUnit: '% self-hype',
  },
];

/* ------------------------------------------------------------------ */
/*  Achievements                                                        */
/* ------------------------------------------------------------------ */
//
// Tiered goals that pay out Void Shards on CLAIM (manual button, like a shop buy
// in reverse). Each tier has a threshold on a tracked lifetime stat; once met you
// can claim `reward` shards and advance to the next tier. Renders with the same
// card layout as the upgrade/shop panels.

export type AchievementStat = 'resourcesCollected';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  stat: AchievementStat;   // which lifetime value drives progress
  thresholds: number[];    // per-tier requirement (length = max level)
  reward: number;          // Void Shard reward STEP — tier N (1-based) pays reward × N
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'pack_rat',
    name: 'Pack Rat',
    description: 'Total Resources Collected',
    stat: 'resourcesCollected',
    thresholds: [10, 50, 150, 500, 1500, 5000, 15000, 50000, 150000, 500000],
    reward: 3,
  },
];
