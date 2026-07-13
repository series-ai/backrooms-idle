import { fmt } from '../num';

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
  icon: string;          // emoji fallback for the encounter display
  iconKey?: string;      // loaded PNG icon id (preferred when set)
  damage: number;        // dormant (combat layer) — kept for the future
  sanityDamage: number;  // dormant
  encounterMessage: string;
  surviveMessage: string;   // shown when it leaves on its own
  defeatMessage: string;    // shown when you drive it off
}

export type UpgradeEffect = 'cooldown' | 'power' | 'autoMine' | 'explorerAuto' | 'bonusOre' | 'quality' | 'qualityYield' | 'mint' | 'flatPower' | 'critChance' | 'autoCapture' | 'hypeDuration' | 'tapExplorer' | 'critDamage' | 'easyAccess' | 'quiet' | 'repel' | 'autoRepel';

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

/**
 * Inventory key for a resource at a tier. Tier 1 keeps the bare id (existing
 * saves keep working); tier 2+ gets its own pool ("almond_water_t2") so deep
 * laps can't pay for their upgrades out of the cheap tier-1 stockpile.
 */
export function resourceKey(resource: string, tier: number): string {
  return tier <= 1 ? resource : `${resource}_t${tier}`;
}

/** Split an inventory key back into base resource + tier. */
export function parseResourceKey(key: string): { resource: string; tier: number } {
  const m = key.match(/^(.+)_t(\d+)$/);
  if (m && RESOURCES[m[1]]) return { resource: m[1], tier: parseInt(m[2], 10) };
  return { resource: key, tier: 1 };
}

/** Display name for an inventory key ("almond_water_t2" → "Almond Water II"). */
export function resourceKeyName(key: string): string {
  const { resource, tier } = parseResourceKey(key);
  return `${RESOURCES[resource]?.name ?? resource}${tierSuffix(tier)}`;
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

/* ------------------------------------------------------------------ */
/*  Floor bases — permanent per-floor construction                      */
/* ------------------------------------------------------------------ */
//
// Every node break on a floor rolls 1-in-`chance` to construct that floor's
// NEXT base stage (sequential — you can't build the safe room before securing
// a small room). Bonuses are cumulative, apply ONLY to that floor (keyed by
// location, so they carry across tier laps), and are permanent: a Rewind
// never clears them.

export interface FloorBaseStage {
  name: string;
  chance: number;        // 1-in-N roll per node break to construct this stage
  desc: string;          // bonus line shown in the log on construction
  yieldBonus?: number;   // +N resources per node break
  qualityBonus?: number; // + quality chance (fraction)
  respawnMult?: number;  // × node respawn time
  mintBonus?: number;    // + mint chance (fraction)
  presenceMult?: number; // × entity presence on this floor (danger layer)
  leaveMult?: number;    // × entity give-up time on this floor (danger layer)
}

export const FLOOR_BASE_STAGES: FloorBaseStage[] = [
  { name: 'Secured Room', chance: 100, desc: '+1 resource', yieldBonus: 1 },
  { name: 'Supply Cache', chance: 250, desc: '+5% quality', qualityBonus: 0.05 },
  { name: 'Outpost', chance: 500, desc: '30% faster respawn', respawnMult: 0.7 },
  { name: 'Safe Room of Operations', chance: 750, desc: '+3% Mint', mintBonus: 0.03 },
  // The danger-layer stage: a manned lookout makes this floor's entities weaker
  // and more skittish — permanent, so old haunts stay safe.
  { name: 'Watchtower', chance: 1000, desc: 'entities 25% weaker & give up 25% sooner', presenceMult: 0.75, leaveMult: 0.75 },
];

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
  baseCost: number;    // Void Fragments for level 0 → 1
  costGrowth: number;  // per-level cost multiplier: round(baseCost × costGrowth^level)
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
    icon: '\u{1F600}',
    iconKey: 'smiler',
    damage: 8,
    sanityDamage: 5,
    encounterMessage: 'A wide grin appears in the darkness...',
    surviveMessage: 'You avert your eyes. The grin backs into the dark.',
    defeatMessage: 'The grin flickers, thins, and goes out.',
  },
  hound: {
    id: 'hound',
    name: 'Hound',
    icon: '\u{1F43A}',
    iconKey: 'hound',
    damage: 12,
    sanityDamage: 3,
    encounterMessage: 'Rapid footsteps echo behind you. Closer.',
    surviveMessage: 'You press against the wall. It runs past.',
    defeatMessage: 'It yelps and bolts into the corridors.',
  },
  skin_stealer: {
    id: 'skin_stealer',
    name: 'Skin-Stealer',
    icon: '\u{1FAE5}',
    iconKey: 'skin_stealer',
    damage: 15,
    sanityDamage: 15,
    encounterMessage: 'Someone calls your name... but you are alone.',
    surviveMessage: 'You stay silent. The voice moves on.',
    defeatMessage: 'Caught in the light, it sheds its face and flees.',
  },
  partygoer: {
    id: 'partygoer',
    name: 'Partygoer',
    icon: '\u{1F388}',
    iconKey: 'partygoer',
    damage: 18,
    sanityDamage: 20,
    encounterMessage: '=) Hey! Come join the party! =)',
    surviveMessage: 'You resist the urge to follow. It fades.',
    defeatMessage: 'The smile drops. The party moves on without you.',
  },
  wretched: {
    id: 'wretched',
    name: 'The Wretched',
    icon: '\u{1F480}',
    iconKey: 'wretched',
    damage: 30,
    sanityDamage: 25,
    encounterMessage: 'An inhuman shriek pierces the silence.',
    surviveMessage: 'You hide. It passes, clawing the walls.',
    defeatMessage: 'It howls and drags itself back into the dark.',
  },
  crimson_watcher: {
    id: 'crimson_watcher',
    name: 'Crimson Watcher',
    icon: '\u{1F534}',
    iconKey: 'crimson_watcher',
    damage: 22,
    sanityDamage: 18,
    encounterMessage: 'Red light pulses from around the corner. Something watches.',
    surviveMessage: 'You freeze. The red light fades slowly.',
    defeatMessage: 'The red light gutters out like a dying bulb.',
  },
  ink_crawler: {
    id: 'ink_crawler',
    name: 'Ink Crawler',
    icon: '\u{1F58B}\u{FE0F}',
    iconKey: 'ink_crawler',
    damage: 12,
    sanityDamage: 30,
    encounterMessage: 'Words crawl off the pages and skitter toward you.',
    surviveMessage: 'You shut your eyes. The whispers stop.',
    defeatMessage: 'The ink scatters back into the margins.',
  },
  archivist: {
    id: 'archivist',
    name: 'The Archivist',
    icon: '\u{1F4DA}',
    iconKey: 'archivist',
    damage: 25,
    sanityDamage: 35,
    encounterMessage: '"You are not catalogued." A figure turns from the shelves.',
    surviveMessage: 'You pretend to read. It loses interest.',
    defeatMessage: 'It files you under MISSED and returns to the stacks.',
  },
  frost_shade: {
    id: 'frost_shade',
    name: 'Frost Shade',
    icon: '\u{2744}\u{FE0F}',
    iconKey: 'frost_shade',
    damage: 35,
    sanityDamage: 20,
    encounterMessage: 'Your breath turns to ice. Something moves in the fog.',
    surviveMessage: 'You hold still until the cold passes.',
    defeatMessage: 'The cold recoils and the fog thins.',
  },

  // ---- Staged-art entities (icons in icons/entities/) ----
  clump: {
    id: 'clump',
    name: 'The Clump',
    icon: '\u{1F9DF}',
    iconKey: 'clump',
    damage: 20,
    sanityDamage: 15,
    encounterMessage: 'A mass of tangled limbs drags itself toward you.',
    surviveMessage: 'The Clump loses your scent and slumps still.',
    defeatMessage: 'The Clump collapses into parts and scatters.',
  },
  doll_face: {
    id: 'doll_face',
    name: 'Doll Face',
    icon: '\u{1F3AD}',
    iconKey: 'doll_face',
    damage: 14,
    sanityDamage: 22,
    encounterMessage: 'A porcelain face turns to you. It was on a mannequin.',
    surviveMessage: 'Doll Face tilts its head, then goes rigid again.',
    defeatMessage: 'Doll Face cracks down the middle and goes dark.',
  },
  scrambles: {
    id: 'scrambles',
    name: 'Scrambles',
    icon: '\u{1F577}\u{FE0F}',
    iconKey: 'scrambles',
    damage: 10,
    sanityDamage: 12,
    encounterMessage: 'Something skitters out of the vents. Fast.',
    surviveMessage: 'Scrambles rattles back into the ductwork.',
    defeatMessage: 'Scrambles flees into a wall gap, hissing.',
  },
  corpus_vitis: {
    id: 'corpus_vitis',
    name: 'Corpus Vitis',
    icon: '\u{1F33F}',
    iconKey: 'corpus_vitis',
    damage: 16,
    sanityDamage: 18,
    encounterMessage: 'The vines are moving. The vines were never vines.',
    surviveMessage: 'The growth stills, pretending to be plants again.',
    defeatMessage: 'The vine-thing withers back into the beds.',
  },
  lucky_crane: {
    id: 'lucky_crane',
    name: 'Lucky Crane',
    icon: '\u{1F3B0}',
    iconKey: 'lucky_crane',
    damage: 12,
    sanityDamage: 25,
    encounterMessage: 'An arcade claw unfolds from the dark, reaching for you.',
    surviveMessage: 'The claw retracts. A coin clatters somewhere.',
    defeatMessage: 'The crane sparks and droops. You keep the prize: you.',
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
  { id: 7, name: 'THE MACHINE YARD', subtitle: 'Something Still Moves', description: 'Heaps of rusted machinery and scrap rise in the gloom like dunes.', bgColor: 0x2a2a2e, textColor: '#A8A8B0', danger: 3, explorationRequired: 350, resourceDrops: [], entityIds: ['skin_stealer', 'wretched', 'scrambles'], ambientMessages: ['Metal groans somewhere in the dark.', 'Rust flakes coat everything you touch.', 'A heap of scrap shifts on its own.', 'You find tools, still oily.', 'Something metal scrapes, far off.'] },
  // 8 — copper_wire
  { id: 8, name: 'THE BOILER ROOMS', subtitle: 'It Breathes in the Pipes', description: 'Concrete tunnels lined with pipes. Unknown fluids drip from above.', bgColor: 0x1c2833, textColor: '#7FB3D3', danger: 3, explorationRequired: 500, resourceDrops: [], entityIds: ['smiler', 'skin_stealer', 'partygoer'], ambientMessages: ['Pipes groan and shudder overhead.', 'A dark liquid drips onto your shoulder.', 'The tunnel splits three ways. You pick one.', 'Steam hisses from a cracked pipe.', 'Rust flakes off the pipe you brush against.', 'Something splashes in the distance.'] },
  // 9 — duct_tape
  { id: 9, name: 'MAINTENANCE TUNNELS', subtitle: 'No One Maintains It', description: 'Cramped utility crawlways where everything is patched with tape and prayer.', bgColor: 0x2e2a20, textColor: '#C0B890', danger: 4, explorationRequired: 600, resourceDrops: [], entityIds: ['wretched', 'skin_stealer', 'scrambles'], ambientMessages: ['Tape holds a pipe that should not hold.', 'Every surface is patched and re-patched.', 'A valve drips no matter how tight.', 'The tunnels narrow, then narrow again.', 'Someone wrote "TEMPORARY" on everything.'] },
  // 10 — glass_shard
  { id: 10, name: 'THE GREENHOUSE', subtitle: 'It Grew Toward You', description: 'A vast collapsed arcade, the floor a carpet of broken glass under dead skylights.', bgColor: 0x1a2a2e, textColor: '#A8D0D8', danger: 4, explorationRequired: 700, resourceDrops: [], entityIds: ['corpus_vitis', 'partygoer', 'ink_crawler'], ambientMessages: ['Glass crunches no matter where you step.', 'Your reflection scatters across a thousand shards.', 'A skylight gives way somewhere distant.', 'The shards are arranged, almost deliberately.', 'You bleed a little. You do not remember when.'] },
  // 11 — batteries
  { id: 11, name: 'ELECTRICAL STATION', subtitle: 'Live to the Touch', description: 'Banks of humming machinery. Sparks fly from exposed wiring.', bgColor: 0x0d0d1a, textColor: '#8080FF', danger: 4, explorationRequired: 750, resourceDrops: [], entityIds: ['wretched', 'partygoer', 'skin_stealer'], ambientMessages: ['Sparks fly from a panel on the wall.', 'The machinery hums louder. Then quiets.', 'Warning lights flash in the corridor.', 'You smell ozone and burnt plastic.', 'Cables hang from the ceiling like vines.', 'The lights cut out. Then slam back on.'] },
  // 12 — lamp
  { id: 12, name: 'THE SHOWROOM', subtitle: 'Someone Was Just Sitting Here', description: 'An infinite furniture showroom, every room staged and lit by countless lamps.', bgColor: 0x2a241a, textColor: '#E0C890', danger: 5, explorationRequired: 850, resourceDrops: [], entityIds: ['doll_face', 'partygoer', 'skin_stealer'], ambientMessages: ['Every lamp is on. No one turned them on.', 'The furniture is arranged for guests.', 'A price tag reads a number that hurts to look at.', 'You sink into a couch. It is warm.', 'Each room is staged. Each room is empty.'] },
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
  { id: 26, name: 'THE CATACOMBS', subtitle: 'The Bones Remember', description: 'Shelves of bone tablets. The inscriptions change when you look away.', bgColor: 0x1a1412, textColor: '#D4C4A4', danger: 8, explorationRequired: 2200, resourceDrops: [], entityIds: ['clump', 'archivist', 'ink_crawler', 'crimson_watcher'], ambientMessages: ['Bone tablets line the walls, inscribed.', 'The carvings rearrange when you blink.', 'A skull watches from a niche.', 'Your footsteps echo like a tally.', 'The dust here is pale and fine and old.'] },
  // 27 — mannequin
  { id: 27, name: 'THE MALL', subtitle: 'The Mannequins Moved', description: 'A dead department store, mannequins posed mid-gesture in the gloom.', bgColor: 0x201a24, textColor: '#C0A0C0', danger: 8, explorationRequired: 2300, resourceDrops: [], entityIds: ['doll_face', 'clump', 'partygoer', 'smiler'], ambientMessages: ['A mannequin faces you. It did not before.', 'Escalators run to floors that do not exist.', 'A fountain trickles in the empty atrium.', 'The mannequins are posed like they are waiting.', 'A mall map says "YOU ARE HERE." You are not.'] },
  // 28 — pool_water
  { id: 28, name: 'THE POOLROOMS', subtitle: 'Do Not Touch the Water', description: 'Pristine blue pools stretch into infinity. Beautiful... but wrong.', bgColor: 0x14544a, textColor: '#A0F0E0', danger: 7, explorationRequired: 2400, resourceDrops: [], entityIds: ['partygoer'], ambientMessages: ['The water is perfectly still. Almost too still.', 'White tiles gleam under fluorescent light.', 'Your footsteps echo across the pool deck.', 'The water looks inviting. You resist.', 'Reflections in the water do not match the room.', 'A sign reads: "NO LIFEGUARD ON DUTY"'] },
  // 29 — liquid_pain
  { id: 29, name: 'THE RED HALLS', subtitle: 'It Tastes Like Copper', description: 'Blood-red walls stretch endlessly. The air tastes like copper.', bgColor: 0x3a0a0a, textColor: '#FF6666', danger: 8, explorationRequired: 2500, resourceDrops: [], entityIds: ['crimson_watcher', 'wretched', 'skin_stealer'], ambientMessages: ['The walls pulse faintly. Like a heartbeat.', 'A distant scream echoes. Or was it laughter?', 'The ceiling drips. You do not look up.', 'Handprints on the wall. Too many fingers.', 'You find a mirror. Your reflection is delayed.', 'The lights here are red. Everything is red.'] },
  // 30 — lucky_coins
  { id: 30, name: 'THE FOUNTAIN', subtitle: 'Make No Wishes', description: 'A grand wishing fountain in a dead arcade, its water full of coins and want.', bgColor: 0x1a2418, textColor: '#E0D070', danger: 8, explorationRequired: 2600, resourceDrops: [], entityIds: ['lucky_crane', 'partygoer', 'archivist', 'crimson_watcher'], ambientMessages: ['Coins glitter under black water.', 'The fountain whispers when you near it.', 'A wish surfaces, not yours.', 'Arcade machines flicker to attract no one.', 'Every coin you take, two appear.'] },
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
  // Quality chance, the floor-9 rung of the ladder (base/growth keep climbing per
  // the scaling rule). Cost = round(25 × 1.45^level) in Duct Tape: 25,36,53,76,…
  // Locked until floor 9 (its resource).
  {
    id: 'tape_it', name: 'Tape It', icon: '\u{1F9F7}',
    description: '+1% quality resource chance per level',
    baseCost: 25, costMultiplier: 1.45, maxLevel: 20,
    effectPerLevel: 1, effectUnit: '% quality chance', costResource: 'duct_tape', effect: 'quality',
    unlockFloor: 9,
  },
  // Floors 10-14 continue the ladder per the scaling rule: growth 1.45 → 1.5 →
  // 1.5 → 1.55 → 1.55 → 1.6, base +3-4 per floor, each rotating the lever.
  // Crit chance again (after floor 3's Lucky Find) — the shards catch the light.
  // Cost = round(30 × 1.5^level) in Glass Shard. Locked until floor 10.
  {
    id: 'prism_sight', name: 'Prism Sight', icon: '\u{1F537}',
    description: '+1% Crit Chance per level',
    baseCost: 30, costMultiplier: 1.5, maxLevel: 15,
    effectPerLevel: 1, effectUnit: '% crit', costResource: 'glass_shard', effect: 'critChance',
    unlockFloor: 10,
  },
  // Per-Explorer auto power, floor-11 rung (after floor 4's Heavy Sweep).
  // Cost = round(34 × 1.5^level) in Batteries. Locked until floor 11.
  {
    id: 'battery_pack', name: 'Battery Pack', icon: '\u{1F50B}',
    description: '+4 auto search power per Explorer per level',
    baseCost: 34, costMultiplier: 1.5, maxLevel: 15,
    effectPerLevel: 4, effectUnit: '/s', costResource: 'batteries', effect: 'explorerAuto',
    unlockFloor: 11,
  },
  // Hype duration again (after floor 2's Rally Cry) but a full +1s per level.
  // Cost = round(38 × 1.55^level) in Lamp. Locked until floor 12.
  {
    id: 'bright_idea', name: 'Bright Idea', icon: '\u{1FA94}',
    description: '+1s Explorer hype duration per level',
    baseCost: 38, costMultiplier: 1.55, maxLevel: 15,
    effectPerLevel: 1, effectUnit: 's hype', costResource: 'lamp', effect: 'hypeDuration',
    unlockFloor: 12,
  },
  // Flat tap + auto power (the Moth Powers channel), floor-13 rung.
  // Cost = round(42 × 1.55^level) in Radio. Locked until floor 13.
  {
    id: 'dead_air', name: 'Dead Air', icon: '\u{1F4FB}',
    description: '+6 auto search & tap power per level',
    baseCost: 42, costMultiplier: 1.55, maxLevel: 15,
    effectPerLevel: 6, effectUnit: ' power', costResource: 'radio', effect: 'flatPower',
    unlockFloor: 13,
  },
  // Easy Access again (after floor 8's Stocked Shelves) at double the step.
  // Cost = round(46 × 1.6^level) in CCTV Camera. Locked until floor 14.
  {
    id: 'watchful_eye', name: 'Watchful Eye', icon: '\u{1F4F9}',
    description: '+1% Easy Access chance for all resources per level',
    baseCost: 46, costMultiplier: 1.6, maxLevel: 15,
    effectPerLevel: 1, effectUnit: '% easy access', costResource: 'CCTV_camera', effect: 'easyAccess',
    unlockFloor: 14,
  },
  // The danger-layer counters (floors 15-16, growth stepping 1.6 → 1.65).
  // Quieter searching — every search generates 2% less Noise per level.
  // Cost = round(50 × 1.65^level) in Computer. Locked until floor 15.
  {
    id: 'soft_soles', name: 'Soft Soles', icon: '\u{1F45F}',
    description: '-2% Noise from searching per level',
    baseCost: 50, costMultiplier: 1.65, maxLevel: 15,
    effectPerLevel: 2, effectUnit: '% quieter', costResource: 'computer', effect: 'quiet',
    unlockFloor: 15,
  },
  // Harder drive-offs — taps hit entities 5% harder per level (effect 'repel').
  // Cost = round(55 × 1.65^level) in VHS Tape. Locked until floor 16.
  {
    id: 'camera_flash', name: 'Camera Flash', icon: '\u{1F4F8}',
    description: '+5% damage against entities per level',
    baseCost: 55, costMultiplier: 1.65, maxLevel: 15,
    effectPerLevel: 5, effectUnit: '% entity damage', costResource: 'vhs_tape', effect: 'repel',
    unlockFloor: 16,
  },
  // The IDLE answer to entities: Explorers keep working through an encounter,
  // applying this % of auto-search power against the entity each tick (effect
  // 'autoRepel' — stacks with the Black Cat). Un-upgraded play keeps the wait.
  // Cost = round(60 × 1.7^level) in Notebook Page. Locked until floor 17.
  {
    id: 'escape_plan', name: 'Escape Plan', icon: '\u{1F4C4}',
    description: 'Explorers keep working in encounters: +7% auto power vs entities per level',
    baseCost: 60, costMultiplier: 1.7, maxLevel: 15,
    effectPerLevel: 7, effectUnit: '% auto vs entities', costResource: 'notebook_page', effect: 'autoRepel',
    unlockFloor: 17,
  },
  // Floors 18-30 continue the ladder: base +5-9 per floor, growth stepping up
  // 0.05 every 2 floors (1.7 → 1.75 → 1.8 → 1.85 → 1.9 → 1.95 → 2.0), each
  // floor's resource feeding a second/third rung of an earlier lever at a
  // bigger step. Per-Explorer auto, third rung (after +2 Heavy Sweep, +4
  // Battery Pack). Cost = round(65 × 1.7^level) in Maps. Locked until floor 18.
  {
    id: 'charted_routes', name: 'Charted Routes', icon: '\u{1F5FA}\u{FE0F}',
    description: '+6 auto search power per Explorer per level',
    baseCost: 65, costMultiplier: 1.7, maxLevel: 15,
    effectPerLevel: 6, effectUnit: '/s', costResource: 'maps', effect: 'explorerAuto',
    unlockFloor: 18,
  },
  // Flat tap + auto power, fourth rung (after +2 Moth, +5 Master Scav, +6 Dead
  // Air). Cost = round(70 × 1.75^level) in Canned Food. Locked until floor 19.
  {
    id: 'stockpile', name: 'Stockpile', icon: '\u{1F96B}',
    description: '+8 auto search & tap power per level',
    baseCost: 70, costMultiplier: 1.75, maxLevel: 15,
    effectPerLevel: 8, effectUnit: ' power', costResource: 'canned_food', effect: 'flatPower',
    unlockFloor: 19,
  },
  // Hype duration, third rung (after +0.5s Rally Cry, +1s Bright Idea).
  // Cost = round(76 × 1.75^level) in MRE. Locked until floor 20.
  {
    id: 'field_rations', name: 'Field Rations', icon: '\u{1F371}',
    description: '+1.5s Explorer hype duration per level',
    baseCost: 76, costMultiplier: 1.75, maxLevel: 15,
    effectPerLevel: 1.5, effectUnit: 's hype', costResource: 'mre', effect: 'hypeDuration',
    unlockFloor: 20,
  },
  // Tap + per-Explorer power, second rung (after +3 Splinters).
  // Cost = round(82 × 1.8^level) in Energy Bar. Locked until floor 21.
  {
    id: 'sugar_rush', name: 'Sugar Rush', icon: '\u{1F36B}',
    description: '+5 Explorer and tap power per level',
    baseCost: 82, costMultiplier: 1.8, maxLevel: 15,
    effectPerLevel: 5, effectUnit: ' power', costResource: 'energy_bar', effect: 'tapExplorer',
    unlockFloor: 21,
  },
  // Noise reduction, second rung (after -2% Soft Soles).
  // Cost = round(88 × 1.8^level) in Bandage. Locked until floor 22.
  {
    id: 'wrapped_tight', name: 'Wrapped Tight', icon: '\u{1FA79}',
    description: '-3% Noise from searching per level',
    baseCost: 88, costMultiplier: 1.8, maxLevel: 15,
    effectPerLevel: 3, effectUnit: '% quieter', costResource: 'bandage', effect: 'quiet',
    unlockFloor: 22,
  },
  // Crit chance, third rung (after Lucky Find, Prism Sight).
  // Cost = round(94 × 1.85^level) in Anti-Anxiety Pills. Locked until floor 23.
  {
    id: 'steady_hands', name: 'Steady Hands', icon: '\u{1F48A}',
    description: '+1% Crit Chance per level',
    baseCost: 94, costMultiplier: 1.85, maxLevel: 15,
    effectPerLevel: 1, effectUnit: '% crit', costResource: 'anti_anxiety_pills', effect: 'critChance',
    unlockFloor: 23,
  },
  // Entity tap damage, second rung (after +5% Camera Flash).
  // Cost = round(100 × 1.85^level) in Anti-Radiation Pills. Locked until floor 24.
  {
    id: 'iodine_regimen', name: 'Iodine Regimen', icon: '☢\u{FE0F}',
    description: '+7% damage against entities per level',
    baseCost: 100, costMultiplier: 1.85, maxLevel: 15,
    effectPerLevel: 7, effectUnit: '% entity damage', costResource: 'anti_radiation_pills', effect: 'repel',
    unlockFloor: 24,
  },
  // Easy Access, third rung (after +0.5% Stocked Shelves, +1% Watchful Eye).
  // Cost = round(108 × 1.9^level) in Charcoal. Locked until floor 25.
  {
    id: 'brittle_burn', name: 'Brittle Burn', icon: '⚫',
    description: '+1.5% Easy Access chance for all resources per level',
    baseCost: 108, costMultiplier: 1.9, maxLevel: 15,
    effectPerLevel: 1.5, effectUnit: '% easy access', costResource: 'charcoal', effect: 'easyAccess',
    unlockFloor: 25,
  },
  // Crit damage, second rung (after +0.2x Metal Head).
  // Cost = round(116 × 1.9^level) in Bone Fragments. Locked until floor 26.
  {
    id: 'bone_deep', name: 'Bone Deep', icon: '\u{1F9B4}',
    description: '+0.4x Crit Damage per level',
    baseCost: 116, costMultiplier: 1.9, maxLevel: 15,
    effectPerLevel: 0.4, effectUnit: 'x crit damage', costResource: 'bone_fragments', effect: 'critDamage',
    unlockFloor: 26,
  },
  // Moth auto-capture, second rung (after +1% Trapper).
  // Cost = round(124 × 1.95^level) in Mannequin. Locked until floor 27.
  {
    id: 'silent_decoys', name: 'Silent Decoys', icon: '\u{1F9CD}',
    description: '+2% auto-capture chance per level',
    baseCost: 124, costMultiplier: 1.95, maxLevel: 15,
    effectPerLevel: 2, effectUnit: '% auto-capture', costResource: 'mannequin', effect: 'autoCapture',
    unlockFloor: 27,
  },
  // Quality chance, third rung (after +0.25% Quality Sense, +1% Tape It).
  // Cost = round(132 × 1.95^level) in Pool Water. Locked until floor 28.
  {
    id: 'still_waters', name: 'Still Waters', icon: '\u{1F4A7}',
    description: '+1.5% quality resource chance per level',
    baseCost: 132, costMultiplier: 1.95, maxLevel: 20,
    effectPerLevel: 1.5, effectUnit: '% quality chance', costResource: 'pool_water', effect: 'quality',
    unlockFloor: 28,
  },
  // Explorers-vs-entities auto power, second rung (after +7% Escape Plan).
  // Cost = round(141 × 2^level) in Liquid Pain. Locked until floor 29.
  {
    id: 'pain_tolerance', name: 'Pain Tolerance', icon: '\u{1FA78}',
    description: 'Explorers keep working in encounters: +10% auto power vs entities per level',
    baseCost: 141, costMultiplier: 2, maxLevel: 15,
    effectPerLevel: 10, effectUnit: '% auto vs entities', costResource: 'liquid_pain', effect: 'autoRepel',
    unlockFloor: 29,
  },
  // The FIRST mint-chance upgrade (effect 'mint' — mint finds yield 10x; the
  // getter already sums it, only bases/gear/pets fed it until now).
  // Cost = round(150 × 2^level) in Lucky Coins. Locked until floor 30.
  {
    id: 'mint_condition', name: 'Mint Condition', icon: '\u{1FA99}',
    description: '+0.5% Mint resource chance per level (10x yield)',
    baseCost: 150, costMultiplier: 2, maxLevel: 15,
    effectPerLevel: 0.5, effectUnit: '% mint chance', costResource: 'lucky_coins', effect: 'mint',
    unlockFloor: 30,
  },
];

/* ------------------------------------------------------------------ */
/*  Endless upgrade tiers (floors 31+)                                 */
/* ------------------------------------------------------------------ */
// Past floor 30 the resource list laps forever (tier II, III, … — same 31
// resource ids, recolored) and so does the upgrade ladder: every floor N ≥ 31
// generates the next-tier version of the upgrade its resource fed on lap 1
// ("Trapper II", "Bone Deep III", …), appended to UPGRADES on demand. Ids are
// deterministic ("<tier-1 id>_t<tier>") so saves, sumEffect() and the UI's
// generic loops keep working unchanged.
//   - Cost continues the authored trend (base grew ~×1.089/floor from 25@f9
//     to 150@f30): base = round(150 × 1.09^(N−30)); growth stays at the 2.0
//     ceiling the lap-1 ladder was stepping toward.
//   - FLAT power effects scale with node HP (floorHp(N) / floorHp(tier-1
//     floor)) so a tier-T rung lands as hard on its floor as tier 1 did on
//     its own; the description's number is rewritten to match.
//   - Percent / seconds effects keep their tier-1 step — extra copies stack
//     across laps (caps like the 90% Easy Access ceiling still apply).

const STATIC_UPGRADE_COUNT = UPGRADES.length;
let upgradesGeneratedThrough = ORE_SEQUENCE.length - 1;   // floors 0-30 are hand-authored

/** Effects whose per-level value is a flat power amount (must scale with depth). */
const FLAT_POWER_EFFECTS: UpgradeEffect[] = ['flatPower', 'power', 'autoMine', 'explorerAuto', 'tapExplorer'];

function genUpgradeForFloor(floorId: number): UpgradeDef | null {
  const pos = floorId % ORE_SEQUENCE.length;
  const tier = Math.floor(floorId / ORE_SEQUENCE.length) + 1;
  const res = ORE_SEQUENCE[pos];
  // Template = the last hand-authored upgrade paid in this floor's resource
  // (skipping Master Scav's cycling cost). Every position 0-30 has one.
  let template: UpgradeDef | null = null;
  for (let i = STATIC_UPGRADE_COUNT - 1; i >= 0; i--) {
    if (UPGRADES[i].costResource === res && !UPGRADES[i].costResourceCycle) { template = UPGRADES[i]; break; }
  }
  if (!template) return null;
  const flat = FLAT_POWER_EFFECTS.includes(template.effect);
  const perLevel = flat
    ? Math.max(1, Math.round(template.effectPerLevel * (floorHp(floorId) / floorHp(template.unlockFloor ?? 0))))
    : template.effectPerLevel;
  return {
    id: `${template.id}_t${tier}`,
    name: `${template.name}${tierSuffix(tier)}`,
    icon: template.icon,
    // Flat effects: swap the first "+number" in the tier-1 blurb for the
    // scaled value ("+6 auto search…" → "+2.61M auto search…").
    description: flat ? template.description.replace(/\+[\d.]+/, `+${fmt(perLevel)}`) : template.description,
    baseCost: Math.round(150 * Math.pow(1.09, floorId - 30)),
    costMultiplier: 2, maxLevel: template.maxLevel,
    effectPerLevel: perLevel, effectUnit: template.effectUnit,
    // Paid in the TIERED pool ("almond_water_t2") — tier-1 stock can't fund it.
    costResource: resourceKey(res, tier), effect: template.effect,
    unlockFloor: floorId,
  };
}

/**
 * Make sure a generated upgrade def exists for every floor up to floorId
 * (call with deepest-unlocked + 1 so the next rung previews as ?????? like
 * the hand-authored ladder). Idempotent; returns true if anything was added
 * so the UI knows to build rows for the newcomers.
 */
export function ensureUpgradesForFloor(floorId: number): boolean {
  let added = false;
  while (upgradesGeneratedThrough < floorId) {
    upgradesGeneratedThrough++;
    const def = genUpgradeForFloor(upgradesGeneratedThrough);
    if (def) { UPGRADES.push(def); added = true; }
  }
  return added;
}

/* ------------------------------------------------------------------ */
/*  Void (Prestige) Upgrades                                           */
/* ------------------------------------------------------------------ */

// The prestige layer, rebuilt around the LIVE game loop. Rewinding pays Void
// Fragments (deeper runs pay exponentially more — see REWIND_* below); these
// upgrades are PERMANENT and survive every rewind. Void Resonance is the
// "other half of balance": a compounding ×1.25/level on ALL search power that
// lets the player keep pace with the ×1.5-per-floor node-HP curve, run after
// run. Costs follow round(baseCost × costGrowth^level).
export const VOID_UPGRADES: VoidUpgradeDef[] = [
  {
    id: 'void_resonance',
    name: 'Void Resonance',
    icon: '\u{1F300}',
    description: 'ALL search power ×1.25 per level (tap, drone & Explorer — compounds)',
    baseCost: 3, costGrowth: 1.6, maxLevel: 25,
    effectPerLevel: 25,
    effectUnit: '% power (compounding)',
  },
  {
    id: 'deep_pockets',
    name: 'Deep Pockets',
    icon: '\u{1F9F3}',
    description: '+1 resource from every node break per level',
    baseCost: 5, costGrowth: 2.0, maxLevel: 10,
    effectPerLevel: 1,
    effectUnit: ' resource/break',
  },
  {
    id: 'familiar_halls',
    name: 'Familiar Halls',
    icon: '\u{1F6AA}',
    description: 'Start every run 2 floors deep per level (already explored)',
    baseCost: 4, costGrowth: 1.8, maxLevel: 10,
    effectPerLevel: 2,
    effectUnit: ' floors head start',
  },
  {
    id: 'fragment_sight',
    name: 'Fragment Sight',
    icon: '\u{1F441}\u{FE0F}',
    description: '+0.25x Crit Damage per level',
    baseCost: 5, costGrowth: 1.6, maxLevel: 12,
    effectPerLevel: 0.25,
    effectUnit: 'x crit damage',
  },
  {
    id: 'void_hunger',
    name: 'Void Hunger',
    icon: '\u{1F573}\u{FE0F}',
    description: '+0.5x Hype multiplier per level',
    baseCost: 6, costGrowth: 1.7, maxLevel: 10,
    effectPerLevel: 0.5,
    effectUnit: 'x hype',
  },
  {
    id: 'moth_lure',
    name: 'Moth Lure',
    icon: '\u{1F98B}',
    description: 'Moths visit 10% more often per level',
    baseCost: 4, costGrowth: 1.6, maxLevel: 10,
    effectPerLevel: 10,
    effectUnit: '% moth visits',
  },
  {
    id: 'lucid_memory',
    name: 'Lucid Memory',
    icon: '\u{1F4AD}',
    description: '+200 offline progress ticks per level',
    baseCost: 3, costGrowth: 1.5, maxLevel: 10,
    effectPerLevel: 200,
    effectUnit: ' ticks',
  },
  {
    id: 'umbral_veil',
    name: 'Umbral Veil',
    icon: '\u{1F311}',
    description: 'Entities give up 3s sooner per level',
    baseCost: 5, costGrowth: 1.7, maxLevel: 10,
    effectPerLevel: 3,
    effectUnit: 's sooner',
  },
  {
    id: 'void_conduit',
    name: 'Void Conduit',
    icon: '\u{1F4A0}',
    description: 'Every Rewind also grants +1 Void Shard per level',
    baseCost: 10, costGrowth: 2.0, maxLevel: 5,
    effectPerLevel: 1,
    effectUnit: ' shard/rewind',
  },
];

/**
 * Fragments a retired void upgrade cost per level (the old flat costPerLevel).
 * Saves that bought them get those fragments refunded on load, so no spent
 * fragment is ever lost to the redesign.
 */
export const LEGACY_VOID_REFUND: Record<string, number> = {
  hardened_soul: 3, iron_psyche: 3, speed_runner: 4, keen_senses: 4,
  thick_hide: 5, inner_peace: 5, pack_rat: 8, deep_memory: 6,
};

/* ------------------------------------------------------------------ */
/*  Rewind payout                                                      */
/* ------------------------------------------------------------------ */
//
// Fragments earned by a Rewind: each floor from REWIND_MIN_FLOOR down to the
// deepest floor unlocked THIS RUN pays round(REWIND_GROWTH^(floor − min)).
// Exponential so a deeper push always beats re-farming a shallow one —
// matching the ×1.5 node-HP curve the player is fighting.

export const REWIND_MIN_FLOOR = 4;     // also the rewind unlock gate
export const REWIND_GROWTH = 1.18;

export function rewindFragmentsFor(deepestFloor: number): number {
  let total = 0;
  for (let i = REWIND_MIN_FLOOR; i <= deepestFloor; i++) {
    total += Math.round(Math.pow(REWIND_GROWTH, i - REWIND_MIN_FLOOR));
  }
  return total;
}

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
/*  Gear — craftable scavenger loadout                                 */
/* ------------------------------------------------------------------ */
//
// Four slots, one equipped item each. Gear is CRAFTED from floor resources
// (making every floor's ore useful beyond its upgrade), unlocks progressively
// as floors are reached (same ??????-reveal as upgrades), and its bonuses feed
// the LIVE systems: tap/auto power (%, multiplicative — the run-level half of
// the multiplicative-power plan), crit, quality/mint, yield, hype, moths.
// Gear resets on Rewind like run upgrades — Deep Pockets / Void Resonance make
// re-gearing fast, so the two menus interlock.

export type GearSlot = 'weapon' | 'tool' | 'light' | 'pack' | 'charm';

/** Run-animation variants baked into every buddy sheet (run_pistol01.. etc.). */
export type WeaponStyle = 'pistol' | 'shotgun' | 'AR' | 'gun';

export const GEAR_SLOTS: GearSlot[] = ['weapon', 'tool', 'light', 'pack', 'charm'];
export const GEAR_SLOT_ICONS: Record<GearSlot, string> = {
  weapon: '\u{1F52B}', tool: '\u{1F527}', light: '\u{1F526}', pack: '\u{1F392}', charm: '\u{1F340}',
};
export const GEAR_SLOT_LABELS: Record<GearSlot, string> = {
  weapon: 'WEAPON', tool: 'TOOL', light: 'LIGHT', pack: 'PACK', charm: 'CHARM',
};

/**
 * Bonuses gear can grant. Percent values are whole numbers (25 = +25%);
 * critDamage/yield are flat adds. All are summed across the equipped loadout.
 *   tapMult    — % more tap power (multiplies the summed flat power)
 *   autoMult   — % more auto-search power (drone + Explorers)
 *   critChance — +% Lucky Find chance
 *   critDamage — +x crit damage multiplier
 *   quality    — +% quality-find chance
 *   mint       — +% mint-find chance
 *   yield      — +N resources on every node break
 *   hypeDur    — % longer hype bursts
 *   respawn    — % faster node respawn
 *   mothCatch  — +% moth auto-capture
 *   easyAccess — +% Easy Access (½-HP) node chance
 *   quiet      — % less Noise from searching (danger layer)
 *   repel      — +% damage against entities (danger layer)
 */
export type GearEffect = 'tapMult' | 'autoMult' | 'critChance' | 'critDamage' | 'quality' | 'mint' | 'yield' | 'hypeDur' | 'respawn' | 'mothCatch' | 'easyAccess' | 'quiet' | 'repel';

export interface GearDef {
  id: string;
  name: string;
  icon: string;          // emoji fallback
  iconTexture?: string;  // loaded PNG icon id (preferred when set)
  slot: GearSlot;
  unlockFloor: number;   // hidden as ?????? until this floor is unlocked
  cost: { resourceId: string; amount: number }[];
  effects: Partial<Record<GearEffect, number>>;
  description: string;
  weaponStyle?: WeaponStyle;   // weapon slot only: which run animation it puts in your hands
}

// Three items per slot, unlock floors staggered 2–27 so something new to
// build shows up every couple of floors. Costs are paid in the resources of
// the floors around the unlock (deeper item → pricier, in deeper ore).
export const GEAR: GearDef[] = [
  // WEAPON — entity damage (the danger layer) + some tap power. Each one also
  // physically appears in the runner's hands (weaponStyle → run animation).
  { id: 'pipe_pistol', name: 'Pipe Pistol', icon: '\u{1F52B}', iconTexture: 'pipe_pistol', slot: 'weapon', unlockFloor: 5, weaponStyle: 'pistol',
    cost: [{ resourceId: 'cloth_scraps', amount: 40 }, { resourceId: 'fluorescent_tube', amount: 30 }],
    effects: { repel: 20, tapMult: 10 }, description: 'A pipe, a spring, one nail at a time.' },
  { id: 'scrap_shotgun', name: 'Scrap Shotgun', icon: '\u{1F52B}', iconTexture: 'scrap_shotgun', slot: 'weapon', unlockFloor: 11, weaponStyle: 'shotgun',
    cost: [{ resourceId: 'scrap_metal', amount: 60 }, { resourceId: 'duct_tape', amount: 45 }],
    effects: { repel: 45, tapMult: 20 }, description: 'Do not look down the barrel. It looks back.' },
  { id: 'salvaged_ar', name: 'Salvaged AR', icon: '\u{1F52B}', iconTexture: 'salvaged_ar', slot: 'weapon', unlockFloor: 18, weaponStyle: 'AR',
    cost: [{ resourceId: 'maps', amount: 55 }, { resourceId: 'notebook_page', amount: 45 }],
    effects: { repel: 80, tapMult: 35 }, description: "Someone's last stand, refurbished." },
  { id: 'impossible_gun', name: 'Impossible Gun', icon: '\u{1F52B}', iconTexture: 'impossible_gun', slot: 'weapon', unlockFloor: 27, weaponStyle: 'gun',
    cost: [{ resourceId: 'mannequin', amount: 60 }, { resourceId: 'bone_fragments', amount: 70 }],
    effects: { repel: 140, tapMult: 55, critChance: 2 }, description: "It shouldn't fire. It does anyway." },

  // TOOL — tap power (the active half)
  { id: 'crowbar', name: 'Crowbar', icon: '\u{1F527}', iconTexture: 'crowbar', slot: 'tool', unlockFloor: 6,
    cost: [{ resourceId: 'scrap_wood', amount: 45 }, { resourceId: 'cloth_scraps', amount: 25 }],
    effects: { tapMult: 25 }, description: 'Pry it open instead of clawing at it.' },
  { id: 'combat_knife', name: 'Combat Knife', icon: '\u{1F5E1}\u{FE0F}', iconTexture: 'combat_knife', slot: 'tool', unlockFloor: 10,
    cost: [{ resourceId: 'glass_shard', amount: 60 }, { resourceId: 'scrap_metal', amount: 40 }],
    effects: { tapMult: 50, critDamage: 0.5 }, description: 'Someone dropped it. They ran.' },
  { id: 'firesalt_chisel', name: 'Firesalt Chisel', icon: '\u{26CF}\u{FE0F}', iconTexture: 'firesalt', slot: 'tool', unlockFloor: 26,
    cost: [{ resourceId: 'charcoal', amount: 70 }, { resourceId: 'bone_fragments', amount: 50 }],
    effects: { tapMult: 120, critChance: 2 }, description: 'A chisel packed with burning salt.' },

  // LIGHT — auto-search power (the idle half)
  { id: 'worn_flashlight', name: 'Worn Flashlight', icon: '\u{1F526}', iconTexture: 'worn_flashlight', slot: 'light', unlockFloor: 2,
    cost: [{ resourceId: 'wallpaper_strip', amount: 30 }, { resourceId: 'carpet_swatch', amount: 20 }],
    effects: { autoMult: 15 }, description: 'The dark searches back a little less.' },
  { id: 'lamp_rig', name: 'Lamp Rig', icon: '\u{1FA94}', iconTexture: 'lamp', slot: 'light', unlockFloor: 12,
    cost: [{ resourceId: 'lamp', amount: 45 }, { resourceId: 'copper_wire', amount: 60 }],
    effects: { autoMult: 40 }, description: 'Showroom lamps, wired into a floodlight.' },
  { id: 'vhs_camera', name: 'VHS Camera', icon: '\u{1F4F9}', iconTexture: 'vhs_camera', slot: 'light', unlockFloor: 16,
    cost: [{ resourceId: 'vhs_tape', amount: 50 }, { resourceId: 'batteries', amount: 45 }],
    effects: { autoMult: 70, critChance: 2 }, description: 'The viewfinder sees things you miss.' },

  // PACK — yield (big-number fuel)
  { id: 'firesalt_pouch', name: 'Firesalt Pouch', icon: '\u{1F392}', iconTexture: 'firesalt_pouch', slot: 'pack', unlockFloor: 3,
    cost: [{ resourceId: 'ceiling_tile', amount: 35 }, { resourceId: 'almond_water', amount: 20 }],
    effects: { yield: 1 }, description: 'Room for one more of everything.' },
  { id: 'duct_duffel', name: 'Duct-Taped Duffel', icon: '\u{1F9F3}', iconTexture: 'duct_tape', slot: 'pack', unlockFloor: 9,
    cost: [{ resourceId: 'duct_tape', amount: 55 }, { resourceId: 'scrap_metal', amount: 35 }],
    effects: { yield: 2 }, description: 'Held together by tape and prayer.' },
  { id: 'ration_crate', name: 'Ration Crate', icon: '\u{1F371}', iconTexture: 'mre', slot: 'pack', unlockFloor: 20,
    cost: [{ resourceId: 'mre', amount: 60 }, { resourceId: 'canned_food', amount: 50 }],
    effects: { yield: 3, quality: 5 }, description: 'Military-grade storage. Sealed from the inside.' },

  // CHARM — luck and time
  { id: 'lucky_foot', name: "Rabbit's Foot", icon: '\u{1F407}', iconTexture: 'lucky_foot', slot: 'charm', unlockFloor: 4,
    cost: [{ resourceId: 'fluorescent_tube', amount: 30 }, { resourceId: 'ceiling_tile', amount: 25 }],
    effects: { critChance: 3 }, description: 'Not lucky for the rabbit.' },
  { id: 'watch', name: 'Stopped Watch', icon: '\u{231A}', iconTexture: 'watch', slot: 'charm', unlockFloor: 8,
    cost: [{ resourceId: 'copper_wire', amount: 45 }, { resourceId: 'scrap_metal', amount: 30 }],
    effects: { hypeDur: 30, respawn: 10 }, description: 'Right twice a day. Time slips around it.' },
  { id: 'gas_mask', name: 'Gas Mask', icon: '\u{1F637}', iconTexture: 'gas_mask', slot: 'charm', unlockFloor: 14,
    cost: [{ resourceId: 'CCTV_camera', amount: 40 }, { resourceId: 'radio', amount: 35 }],
    effects: { quality: 4, mint: 1 }, description: 'Breathe easy. Notice everything.' },
  { id: 'noise_radio', name: 'White-Noise Radio', icon: '\u{1F4FB}', iconTexture: 'radio', slot: 'charm', unlockFloor: 13,
    cost: [{ resourceId: 'radio', amount: 45 }, { resourceId: 'lamp', amount: 30 }],
    effects: { quiet: 25, repel: 10 }, description: 'Static drowns out the sound of your searching.' },
];

/** Short human line for a gear item's effects ("+25% tap power · +1 yield"). */
export function gearEffectSummary(gear: GearDef): string {
  const parts: string[] = [];
  const e = gear.effects;
  if (e.tapMult) parts.push(`+${e.tapMult}% tap power`);
  if (e.autoMult) parts.push(`+${e.autoMult}% auto search`);
  if (e.critChance) parts.push(`+${e.critChance}% crit`);
  if (e.critDamage) parts.push(`+${e.critDamage}x crit dmg`);
  if (e.quality) parts.push(`+${e.quality}% quality`);
  if (e.mint) parts.push(`+${e.mint}% mint`);
  if (e.yield) parts.push(`+${e.yield} yield`);
  if (e.hypeDur) parts.push(`+${e.hypeDur}% hype time`);
  if (e.respawn) parts.push(`${e.respawn}% faster respawn`);
  if (e.mothCatch) parts.push(`+${e.mothCatch}% moth catch`);
  if (e.easyAccess) parts.push(`+${e.easyAccess}% easy access`);
  if (e.quiet) parts.push(`-${e.quiet}% noise`);
  if (e.repel) parts.push(`+${e.repel}% vs entities`);
  return parts.join(' · ');
}

/* ---- Scrap — the salvage currency (permanent, survives Rewind) ---- *
 * Earned ONLY by dismantling gear: benched pieces by hand mid-run, and
 * everything not on your body automatically when you Rewind. Spent on gear
 * levels (each level = +10% of the item's base effects).                  */

export const GEAR_LEVEL_MAX = 5;
/** Bag slots for benched gear (equipped pieces don't count). Upgradeable later. */
export const GEAR_INVENTORY_BASE = 4;
/** Extra effect per gear level: Lv N = base effects × (1 + N × this). */
export const GEAR_LEVEL_BONUS = 0.1;
/** Scrap refunded from a dismantled item's level investment (the rest is lost). */
export const GEAR_LEVEL_REFUND = 0.7;

/** Scrap paid for dismantling a gear item — deeper gear is worth more metal. */
export function gearScrapValue(g: GearDef): number {
  return 5 * Math.max(2, g.unlockFloor);
}

/** Scrap cost to raise a gear item from `level` to level+1 (level is 0-based). */
export function gearLevelCost(g: GearDef, level: number): number {
  return Math.round(gearScrapValue(g) * Math.pow(1.5, level));
}

/** Total Scrap spent reaching `level` (drives dismantle refunds). */
export function gearLevelInvested(g: GearDef, level: number): number {
  let total = 0;
  for (let l = 0; l < level; l++) total += gearLevelCost(g, l);
  return total;
}

/* ------------------------------------------------------------------ */
/*  Void Shard Shop                                                     */
/* ------------------------------------------------------------------ */
//
// Permanent upgrades bought with Void Shards. Shards are earned ONLY by maxing a
// run upgrade (one-time per upgrade) or advancing to a new deepest level. The shop
// renders with the same card layout as the run-upgrade screen.
//   - Cost is FLAT-stepped: baseCost + costStep × level.
//     Search Upgrade: 10,15,20,…  Hype Train: 15,25,35,45,…

export interface ShopUpgradeDef {
  id: string;
  name: string;
  icon: string;          // emoji fallback shown next to the name
  iconTexture?: string;  // loaded PNG icon id (preferred over the emoji when set)
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
    baseCost: 15, costStep: 10, maxLevel: 10,
    effectPerLevel: 3, effectUnit: '% self-hype',
  },
  // PET unlocks (see PETS below) — one-time purchases; the pets themselves then
  // level through play, not further shard spending.
  {
    id: 'lamp_trap', name: 'Lamp Trap', icon: '\u{1FA94}', iconTexture: 'lamp',
    description: 'Boosts Moth auto-catch and grows from catching Moths. Yours forever.',
    baseCost: 5, costStep: 0, maxLevel: 1,
    effectPerLevel: 1, effectUnit: '% auto-catch',
  },
  {
    id: 'pet_static', name: 'Static', icon: '\u{1F4FA}', iconTexture: 'pet_static',
    description: 'Grants Super Crits — crits on top of crits. Grows from landing crits. Yours forever.',
    baseCost: 25, costStep: 0, maxLevel: 1,
    effectPerLevel: 1, effectUnit: '% super crit',
  },
  {
    id: 'pet_snapshot', name: 'Snapshot', icon: '\u{1F4F7}', iconTexture: 'pet_snapshot',
    description: 'Boosts Mint chance and grows from collecting quality resources. Yours forever.',
    baseCost: 50, costStep: 0, maxLevel: 1,
    effectPerLevel: 0.25, effectUnit: '% mint',
  },
  {
    id: 'pet_balloon', name: 'Party Balloon', icon: '\u{1F388}', iconTexture: 'pet_balloon',
    description: 'Boosts Explorer power while hyped and grows from hyped exploring. Yours forever.',
    baseCost: 350, costStep: 0, maxLevel: 1,
    effectPerLevel: 5, effectUnit: '% hyped power',
  },
  {
    id: 'pet_cat', name: 'Black Cat', icon: '\u{1F408}\u{200D}\u{2B1B}', iconTexture: 'pet_cat',
    description: 'Even the entities fear it — helps drive them off while you idle, grows from every drive-off. Yours forever.',
    baseCost: 75, costStep: 0, maxLevel: 1,
    effectPerLevel: 4, effectUnit: '% auto vs entities',
  },
  // Halves every floor-base construction roll (all four stages): 1/100 → 1/50,
  // 1/250 → 1/125, 1/500 → 1/250, 1/750 → 1/375.
  {
    id: 'stealth_camping', name: 'Stealth Camping', icon: '\u{26FA}',
    description: 'Double your chance of constructing a base — every stage, every floor.',
    baseCost: 100, costStep: 0, maxLevel: 1,
    effectPerLevel: 2, effectUnit: '× base chance',
  },
  {
    id: 'boxed_supplies', name: 'Boxed Supplies', icon: '\u{1F4E6}',
    description: 'Every resource node has 25% less Integrity — on every floor.',
    baseCost: 250, costStep: 0, maxLevel: 1,
    effectPerLevel: 25, effectUnit: '% less Integrity',
  },
  // More Explorers — every per-Explorer bonus (Heavy Sweep, Splinters, Battery
  // Pack, Party Balloon...) counts once per Explorer, so each is a big multiplier.
  {
    id: 'second_explorer', name: 'Another Explorer', icon: '\u{1F3C3}',
    description: 'Another Explorer joins every run — all per-Explorer power stacks again.',
    baseCost: 200, costStep: 300, maxLevel: 2,
    effectPerLevel: 1, effectUnit: ' Explorer',
  },
];

/* ------------------------------------------------------------------ */
/*  Pets                                                                */
/* ------------------------------------------------------------------ */
//
// Pets are permanent companions (never reset — not even by Rewind). Each is
// unlocked by its same-id Void Shard shop purchase at level 1, then has a
// 1-in-N roll to gain a level on its growth trigger (the Lamp Trap grows on
// Moth catches, the Lion on landed crits). Unlocked pets show as small icons
// in a row at the bottom-left of the explore screen, in PETS order; tapping
// one opens a popup of what it's doing.

export interface PetDef {
  id: string;           // matches its unlocking shop upgrade's id
  name: string;
  iconKey: string;      // loaded texture to render...
  icon: string;         // ...with this emoji as the fallback while no art exists
  maxLevel: number;
  // Level-up roll per growth trigger: 1-in-round(levelChance × levelChanceGrowth^(level − 1)).
  // Both pets use ×1.2/level: Lamp 15, 18, 22, 26, …; Lion 250, 300, 360, 432, …
  levelChance: number;
  levelChanceGrowth: number;
  bonusPerLevel: number; // % the bonus stat gains per level (lamp/lion 1, magpie 0.25)
  bonusLabel: string;    // the stat that bonus feeds (popup row + level-up toast)
  growsOn: string;       // growth trigger, shown as "1-in-N per <growsOn>"
  description: string;
  milestones: { level: number; desc: string }[];
}

export const PETS: PetDef[] = [
  {
    id: 'lamp_trap',
    name: 'Lamp Trap',
    iconKey: 'lamp',
    icon: '\u{1FA94}',
    maxLevel: 20,
    levelChance: 15,
    levelChanceGrowth: 1.2,
    bonusPerLevel: 1,
    bonusLabel: 'Moth auto-catch',
    growsOn: 'Moth caught',
    description: 'A humming lamp that lures creatures in.',
    milestones: [
      { level: 10, desc: '×2 Moths per catch' },
      { level: 20, desc: '×2 a future creature (TBD)' },
    ],
  },
  // Super Crits: a landed crit (tap or auto) rolls Static's level as a % chance
  // to multiply AGAIN — ×2 base, +1× at Lv 10, +1× more (Ultra) at Lv 20.
  {
    id: 'pet_static',
    name: 'Static',
    iconKey: 'pet_static',
    icon: '\u{1F4FA}',
    maxLevel: 20,
    levelChance: 250,
    levelChanceGrowth: 1.2,
    bonusPerLevel: 1,
    bonusLabel: 'Super Crit chance',
    growsOn: 'crit landed',
    description: 'A torn scrap of living TV static. It crackles when your luck spikes.',
    milestones: [
      { level: 10, desc: '+1× Super Crit multiplier' },
      { level: 20, desc: '+1× Ultra Crit multiplier' },
    ],
  },
  // Mint hunter: +0.25% Mint chance per level, growing whenever a QUALITY
  // resource is collected (mint finds are a separate grade and don't count).
  {
    id: 'pet_snapshot',
    name: 'Snapshot',
    iconKey: 'pet_snapshot',
    icon: '\u{1F4F7}',
    maxLevel: 20,
    levelChance: 200,
    levelChanceGrowth: 1.2,
    bonusPerLevel: 0.25,
    bonusLabel: 'Mint chance',
    growsOn: 'quality find',
    description: 'A twitchy instant camera that files your best finds in mint condition.',
    milestones: [
      { level: 10, desc: '+3% Quality chance' },
      { level: 20, desc: '+3% Mint chance' },
    ],
  },
  // The entity specialist: while a monster has you cornered, the cat lends
  // +4%/lvl of your auto power against it (stacking with Escape Plan) — the
  // idle counterplay pet. Grows on every drive-off; encounters are minutes
  // apart, so its roll is generous (1-in-3, steepening ×1.25/level).
  // Ordered before the balloon: players always unlock the cat first, so it
  // sits next to Snapshot on the pet bar.
  {
    id: 'pet_cat',
    name: 'Black Cat',
    iconKey: 'pet_cat',
    icon: '\u{1F408}\u{200D}\u{2B1B}',
    maxLevel: 20,
    levelChance: 3,
    levelChanceGrowth: 1.25,
    bonusPerLevel: 4,
    bonusLabel: 'auto power vs entities',
    growsOn: 'entity driven off',
    description: 'It walked out of the dark and decided you were its person. The dark disapproves.',
    milestones: [
      { level: 10, desc: 'Entities give up 25% sooner' },
      { level: 20, desc: 'x2 drive-off rewards' },
    ],
  },
  // Hype specialist: +5% Explorer power per level WHILE HYPED, rolling its
  // level-up on every idle tick that hype is active (~10-15 rolls per burst).
  {
    id: 'pet_balloon',
    name: 'Party Balloon',
    iconKey: 'pet_balloon',
    icon: '\u{1F388}',
    maxLevel: 20,
    levelChance: 200,
    levelChanceGrowth: 1.2,
    bonusPerLevel: 5,
    bonusLabel: 'Explorer power while hyped',
    growsOn: 'hyped search tick',
    description: 'It drifted away from the Partygoers. It can still hear the music.',
    milestones: [
      { level: 10, desc: '+50% hype duration' },
      { level: 20, desc: '+15% resource gathering speed' },
    ],
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

export type AchievementStat = 'resourcesCollected' | 'critsLanded' | 'creaturesCaught' | 'hypeTriggered' | 'structuresBuilt' | 'petLevelsGained' | 'superCritsLanded' | 'depthReached' | 'rewindsDone' | 'gearCrafted' | 'entitiesRepelled' | 'phantomsCaught';

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
  {
    id: 'crit_master',
    name: 'Crit Master',
    description: 'Critical Hits Landed',
    stat: 'critsLanded',
    thresholds: [5, 25, 100, 300, 1000, 3000, 10000, 30000, 100000, 300000],
    reward: 3,
  },
  {
    id: 'mob_farm',
    name: 'Mob Farm',
    description: 'Creatures Caught',
    stat: 'creaturesCaught',
    thresholds: [3, 10, 30, 75, 150, 300, 600],
    reward: 3,
  },
  {
    id: 'hype_man',
    name: 'Hype Man',
    description: 'Total Explorer Hype Triggered',
    stat: 'hypeTriggered',
    thresholds: [5, 20, 60, 200, 600, 2000, 6000, 20000, 60000, 200000],
    reward: 3,
  },
  // Counts floor-base stages constructed (FLOOR_BASE_STAGES finds), lifetime.
  // Thresholds are the triangular numbers — each tier needs one more build than
  // the last tier's gap (+2, +3, +4, …).
  {
    id: 'base_builder',
    name: 'Base Builder',
    description: 'Total Structures Built',
    stat: 'structuresBuilt',
    thresholds: [1, 3, 6, 10, 15, 21, 28, 36, 45, 55],
    reward: 3,
  },
  // Counts pet level-ups (the Lv-1 unlock itself doesn't count). The Lamp Trap
  // alone can supply 19 — deeper tiers expect future pets.
  {
    id: 'pet_trainer',
    name: 'Pet Trainer',
    description: 'Total Pet Levels Gained',
    stat: 'petLevelsGained',
    thresholds: [2, 4, 7, 11, 16, 23, 33, 48, 70, 100],
    reward: 3,
  },
  // Static's crit-on-crit hits — same threshold curve as Pack Rat / Crit Master.
  {
    id: 'super_crits',
    name: 'Super Crits',
    description: 'Super Crit Hits Landed',
    stat: 'superCritsLanded',
    thresholds: [10, 50, 150, 500, 1500, 5000, 15000, 50000, 150000, 500000],
    reward: 3,
  },
  // Lifetime floors descended (totalDepth — never reset by Rewind). 31/62 land
  // on full laps of the floor list; deeper tiers are the long game.
  {
    id: 'deep_diver',
    name: 'Deep Diver',
    description: 'Total Floors Descended',
    stat: 'depthReached',
    thresholds: [5, 15, 31, 62, 124, 250, 500, 1000, 2000],
    reward: 3,
  },
  // Rewinds performed — pays extra (reward step 5) since each one is a full reset.
  {
    id: 'tape_rewinder',
    name: 'Tape Rewinder',
    description: 'Total Rewinds Performed',
    stat: 'rewindsDone',
    thresholds: [1, 2, 3, 5, 8, 12, 20],
    reward: 5,
  },
  // Lifetime gear crafted. Gear resets on Rewind, so re-crafting a loadout each
  // run keeps feeding this past the item roster.
  {
    id: 'gear_head',
    name: 'Gear Head',
    description: 'Total Gear Crafted',
    stat: 'gearCrafted',
    thresholds: [1, 4, 8, 12, 20, 35, 60],
    reward: 3,
  },
  // Entities driven off (the danger layer's active-play reward loop).
  {
    id: 'night_watch',
    name: 'Night Watch',
    description: 'Entities Driven Off',
    stat: 'entitiesRepelled',
    thresholds: [1, 5, 15, 40, 100, 250, 600],
    reward: 3,
  },
  // Phantoms clicked during dark phases (the lighting layer's bonus loop).
  {
    id: 'eyes_dark',
    name: 'Eyes in the Dark',
    description: 'Phantoms Stared Down',
    stat: 'phantomsCaught',
    thresholds: [3, 10, 30, 75, 150, 300, 600],
    reward: 3,
  },
];
