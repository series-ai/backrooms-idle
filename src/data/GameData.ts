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

export type UpgradeEffect = 'cooldown' | 'power' | 'autoMine' | 'bonusOre';

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

export function getFloorOre(levelId: number): FloorOre {
  const n = ORE_SEQUENCE.length;
  return {
    resource: ORE_SEQUENCE[levelId % n],
    tier: Math.floor(levelId / n) + 1,  // every full lap of the list bumps the tier
    required: 10 + levelId * 20,        // Floor 0: 10, Floor 1: 30, Floor 2: 50, ...
    durability: 3 + levelId,            // deeper nodes are tougher
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
export const RESOURCE_ORDER = [...ORE_SEQUENCE];

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
export const UPGRADES: UpgradeDef[] = [
  {
    id: 'mining_speed', name: 'Explore Speed', icon: '\u{26A1}',
    description: 'Lower the cooldown between taps',
    baseCost: 5, costMultiplier: 1.7, maxLevel: 9999,
    effectPerLevel: 6, effectUnit: '% faster', costResource: 'almond_water', effect: 'cooldown',
  },
  {
    id: 'mining_power', name: 'Keen Search', icon: '\u{1F50D}',
    description: 'Each tap explores more',
    baseCost: 4, costMultiplier: 1.8, maxLevel: 9999,
    effectPerLevel: 20, effectUnit: '% power', costResource: 'batteries', effect: 'power',
  },
  {
    id: 'auto_miner', name: 'Auto-Explore', icon: '\u{1F916}',
    description: 'Explore slowly on its own',
    baseCost: 6, costMultiplier: 1.9, maxLevel: 9999,
    effectPerLevel: 25, effectUnit: '% auto', costResource: 'cloth_scraps', effect: 'autoMine',
  },
  {
    id: 'rich_veins', name: 'Lucky Find', icon: '\u{1F340}',
    description: 'Chance for +1 bonus resource',
    baseCost: 5, costMultiplier: 2.0, maxLevel: 40,
    effectPerLevel: 2, effectUnit: '% bonus', costResource: 'lucky_coins', effect: 'bonusOre',
  },
  {
    id: 'swift_hands', name: 'Quick Hands', icon: '\u{1F90C}',
    description: 'Lower the cooldown between taps',
    baseCost: 5, costMultiplier: 1.75, maxLevel: 9999,
    effectPerLevel: 5, effectUnit: '% faster', costResource: 'canned_food', effect: 'cooldown',
  },
  {
    id: 'heavy_pick', name: 'Sharp Eyes', icon: '\u{1F441}\u{FE0F}',
    description: 'Each tap explores more',
    baseCost: 5, costMultiplier: 1.85, maxLevel: 9999,
    effectPerLevel: 18, effectUnit: '% power', costResource: 'scrap_metal', effect: 'power',
  },
  {
    id: 'prospecting', name: 'Pathfinding', icon: '\u{1F9ED}',
    description: 'Explore slowly on its own',
    baseCost: 5, costMultiplier: 1.9, maxLevel: 9999,
    effectPerLevel: 22, effectUnit: '% auto', costResource: 'firesalt', effect: 'autoMine',
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
