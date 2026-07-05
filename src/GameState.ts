import {
  UPGRADES,
  RESOURCES,
  ORE_SEQUENCE,
  VOID_UPGRADES,
  LEGACY_VOID_REFUND,
  REWIND_MIN_FLOOR,
  rewindFragmentsFor,
  ABILITIES,
  GEAR,
  GEAR_SLOTS,
  GEAR_LEVEL_MAX,
  GEAR_LEVEL_BONUS,
  GEAR_LEVEL_REFUND,
  gearScrapValue,
  gearLevelCost,
  gearLevelInvested,
  ENTITIES,
  SHOP_UPGRADES,
  ACHIEVEMENTS,
  FLOOR_BASE_STAGES,
  PETS,
  type AchievementStat,
  getLevel,
  getFloorOre,
  tierSuffix,
  ensureUpgradesForFloor,
  type LevelDef,
  type GearSlot,
  type GearEffect,
  type WeaponStyle,
  type EntityDef,
} from './data/GameData';
import { MAX_OFFLINE_TICKS, TICK_INTERVAL_MS } from './config';
import { type Big, D, roundD } from './num';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SaveData {
  version: number;
  currentLevel: number;
  unlockedLevels: number[];
  health: number;
  maxHealth: number;
  sanity: number;
  maxSanity: number;
  exploration: number;
  explorationPerLevel: Record<number, number>;
  resources: Record<string, string>;   // Big values serialized as decimal strings
  upgrades: Record<string, number>;
  stats: GameStats;
  ghostWalkTicks: number;
  adrenalineTicks: number;
  lastSaveTime: number;
  // Prestige (permanent)
  prestigeCount: number;
  voidFragments: number;
  voidUpgrades: Record<string, number>;
  totalDepth: number;
  maxLevelUnlocked: number;
  // Abilities
  abilityCooldowns: Record<string, number>;
  barricadeTicks: number;
  signalFlareTicks: number;
  // Milestones & discoveries
  claimedMilestones: Record<number, number[]>;
  memoryFragments: number;
  // Gear (crafted loadout — EQUIPPED pieces survive a rewind; the rest scraps)
  gearOwned: string[];
  gearEquipped: Record<string, string | null>;
  gearLevels?: Record<string, number>;   // gear id → Scrap level (lives on the item)
  dismantledGear?: string[];             // scrapped this run — can't re-craft until Rewind
  scrap?: number;                        // salvage currency (permanent, survives Rewind)
  // Void Shard shop
  voidShards: number;
  shopUpgrades: Record<string, number>;
  shardMaxedUpgrades: string[];   // run-upgrade ids that have already paid out a shard for maxing
  highestLevelReached: number;    // deepest level index that has paid out a shard for advancing
  // Achievements (lifetime — never reset on rewind)
  lifetimeResourcesCollected: number;
  lifetimeCritsLanded: number;
  lifetimeCreaturesCaught: number;
  lifetimeHypeTriggered: number;
  lifetimeStructuresBuilt: number;             // floor-base stages constructed (Base Builder)
  lifetimePetLevelsGained: number;             // pet level-ups, excluding unlocks (Pet Trainer)
  lifetimeSuperCritsLanded: number;            // Static crit-on-crit hits (Super Crits)
  lifetimeGearCrafted: number;                 // gear items ever crafted (Gear Head)
  lifetimeEntitiesRepelled: number;            // entities driven off (Night Watch)
  lifetimePhantomsCaught: number;              // phantoms clicked in the dark (Eyes in the Dark)
  achievementClaims: Record<string, number>;   // achievement id → tiers claimed
  // Danger layer (an active encounter is NOT saved — it just despawns on reload)
  noise: number;                               // 0-100; at 100 an entity finds you
  // Floor bases (permanent — never reset on rewind)
  floorBases: Record<number, number>;          // floor location (0-30) → base stage built
  // Pets (permanent — never reset on rewind)
  petLevels: Record<string, number>;           // pet id → level (absent/0 = not unlocked)
  // Preferences
  autoEscape: boolean;
  hideMaxedUpgrades?: boolean;
}

export interface GameStats {
  totalExploration: number;
  entitiesEncountered: number;
  resourcesFound: number;
  qualityFinds: number;
  mintFinds: number;
  easyAccessFinds: number;
  deaths: number;
  levelsEscaped: number;
}

export interface GameEvent {
  type: 'ambient' | 'resource' | 'entity' | 'damage' | 'death' | 'system' | 'milestone' | 'event' | 'pet';
  message: string;
  color: string;
  iconKey?: string;
  value?: number;   // for resource events: the amount gained (drives floating "+N")
  quality?: boolean; // for resource events: a "quality" find (yielded +1 extra)
  mint?: boolean;    // for resource events: a "mint" find (yielded +9 extra)
}

export interface TickResult {
  events: GameEvent[];
  autoDamage?: Big;         // auto-search damage dealt this tick (for a floating number)
  autoCrit?: boolean;       // whether that auto-search was a lucky find (crit)
  autoSuperCrit?: boolean;  // whether that crit rolled into a SUPER crit (Static)
}

/** Result of one active tap on the node: damage dealt + whether it was a lucky find (crit). */
export interface SearchHit {
  events: GameEvent[];
  damage: Big;
  crit: boolean;
  superCrit: boolean;   // crit that rolled into a SUPER crit (Static)
  struck: boolean;      // false if there was no node to hit (mid-respawn)
}

export interface OfflineSummary {
  minutes: number;
  resourcesFound: number;
  explorationGained: number;
}

/** The halls' ambient lighting — pure atmosphere with teeth (see advanceLighting). */
export type LightingState = 'bright' | 'normal' | 'dark';

/* ------------------------------------------------------------------ */
/*  GameState                                                          */
/* ------------------------------------------------------------------ */

export class GameState {
  currentLevel = 0;
  unlockedLevels: number[] = [0];
  health = 100;
  maxHealth = 100;
  sanity = 100;
  maxSanity = 100;
  exploration = 0;                 // ore mined on the current floor (toward `required`)
  explorationPerLevel: Record<number, number> = {};
  nodeDamage: Big = D(0);          // Integrity (HP) dealt to the current node — transient, not saved
  nodeIsQuality = false;           // current node pre-rolled as a quality find (+1) — shown before it breaks
  nodeIsMint = false;              // current node pre-rolled as MINT (+9, ×1.5 HP) — shown before it breaks
  nodeIsEasyAccess = false;        // current node pre-rolled as EASY ACCESS (×0.5 HP) — independent of grade
  respawnMsLeft = 0;               // >0 while the broken node is regrowing — transient, not saved
  resources: Record<string, Big> = {};
  upgrades: Record<string, number> = {};
  stats: GameStats = {
    totalExploration: 0,
    entitiesEncountered: 0,
    resourcesFound: 0,
    qualityFinds: 0,
    mintFinds: 0,
    easyAccessFinds: 0,
    deaths: 0,
    levelsEscaped: 0,
  };
  ghostWalkTicks = 0;
  adrenalineTicks = 0;
  lastSaveTime: number = Date.now();

  // Prestige (permanent — never reset)
  prestigeCount = 0;
  voidFragments = 0;
  voidUpgrades: Record<string, number> = {};
  totalDepth = 0;
  maxLevelUnlocked = 5; // base game goes to level index 5

  // Abilities
  abilityCooldowns: Record<string, number> = {};
  barricadeTicks = 0;
  signalFlareTicks = 0;

  // Milestones & discoveries
  claimedMilestones: Record<number, number[]> = {};
  memoryFragments = 0;

  // Gear — the crafted scavenger loadout. You escape a Rewind with what's ON
  // you: equipped pieces (and their Scrap levels) survive; benched pieces are
  // auto-dismantled into Scrap. Dismantled gear can't be re-crafted until the
  // next Rewind (it's parts now) — that keeps craft→scrap loops from farming.
  gearOwned: string[] = [];
  gearEquipped: Record<GearSlot, string | null> = { weapon: null, tool: null, light: null, pack: null, charm: null };
  gearLevels: Record<string, number> = {};   // gear id → level (each = +10% base effects)
  dismantledGear: string[] = [];             // scrapped this run
  // Scrap — the salvage currency. PERMANENT (survives Rewind, like Void Shards).
  scrap = 0;
  lastRewindScrap = 0;   // benched gear auto-scrapped by the last rewind (transient, for the summary)

  // Void Shard shop — permanent across all rewinds
  voidShards = 0;
  shopUpgrades: Record<string, number> = {};
  shardMaxedUpgrades: string[] = [];   // run-upgrades that have already granted their max-out shard
  highestLevelReached = 0;             // deepest level that has granted its advance shard
  /** Shard-award toasts queued by escape()/buyUpgrade(), drained by the scene. */
  pendingShardEvents: GameEvent[] = [];

  // Achievements — lifetime progress + claimed tiers (persist across rewinds)
  lifetimeResourcesCollected = 0;
  lifetimeCritsLanded = 0;
  lifetimeCreaturesCaught = 0;
  lifetimeHypeTriggered = 0;
  lifetimeStructuresBuilt = 0;
  lifetimePetLevelsGained = 0;
  lifetimeSuperCritsLanded = 0;
  lifetimeGearCrafted = 0;
  lifetimeEntitiesRepelled = 0;
  achievementClaims: Record<string, number> = {};

  // Danger layer — searching is LOUD. Noise builds with every search (faster on
  // high-danger floors); at 100% an entity from this floor's roster finds you.
  // While it's here the node is blocked (the drone hides, taps hit the ENTITY):
  // drive it off for a resource burst, or wait it out and lose the time.
  noise = 0;                                  // 0-100 (%)
  activeEntityId: string | null = null;       // entity harassing you — transient, not saved
  entityPresence: Big = D(0);                 // remaining "presence" to drive off
  entityPresenceMax: Big = D(1);
  entityLeaveMsLeft = 0;                      // it gives up on its own when this hits 0

  // Lighting — the halls drift between bright / normal / dark phases (transient,
  // never saved). Dark: noise builds ×1.5 and phantoms appear (click for a
  // bonus). Bright: moths visit 2× as often. Deeper floors skew darker.
  lighting: LightingState = 'normal';
  lightingMsLeft = 45_000;                    // current phase's remaining time
  lifetimePhantomsCaught = 0;                 // Eyes in the Dark achievement

  // Floor bases — permanent per-floor construction (never reset). Keyed by floor
  // LOCATION (currentLevel % 31), so a base keeps paying out on deeper tier laps.
  floorBases: Record<number, number> = {};

  // Pets — permanent companions (never reset). Unlocked at level 1 by their
  // same-id shop purchase; level up by catching creatures (see PETS).
  petLevels: Record<string, number> = {};

  // Preferences
  autoEscape = true;
  hideMaxedUpgrades = false;

  constructor() {
    for (const key of Object.keys(RESOURCES)) {
      this.resources[key] = D(0);
    }
    this.resources['almond_water'] = D(5);
    for (const u of UPGRADES) {
      this.upgrades[u.id] = 0;
    }
    for (const v of VOID_UPGRADES) {
      this.voidUpgrades[v.id] = 0;
    }
    for (const s of SHOP_UPGRADES) {
      this.shopUpgrades[s.id] = 0;
    }
    for (const a of ABILITIES) {
      this.abilityCooldowns[a.id] = 0;
    }
  }

  /* ---- Computed helpers ---- */

  get level(): LevelDef {
    return getLevel(this.currentLevel);
  }

  /** Descend progress = ore mined on this floor toward its requirement. */
  get explorationPct(): number {
    return Math.min(100, (this.exploration / this.required) * 100);
  }

  /* ---- Mining: this floor's ore + how it breaks ---- */
  get floorOre() { return getFloorOre(this.currentLevel); }
  get required(): number { return this.floorOre.required; }
  get nodeDurabilityMax(): number { return Math.max(1, this.floorOre.durability); }

  /* ---- Integrity (node HP) — the active "feel" layer ----------------- *
   * Node HP is now hand-authored per floor (see floorHp/NODE_HP in GameData), so
   * the displayed Integrity is exactly the tuned value. The magnitude multiplier
   * below is neutralized (growth 1 → nodeScale always 1): HP = durability and tap
   * damage = power, both clean integers. (Kept as a seam in case a separate
   * cosmetic magnitude is wanted later.) */
  private static readonly SCALE_BASE = 1;
  private static readonly SCALE_GROWTH = 1;

  /** Magnitude multiplier for the current floor (drives how big the numbers look). */
  get nodeScale(): Big {
    return D(GameState.SCALE_BASE).mul(D(GameState.SCALE_GROWTH).pow(this.currentLevel));
  }

  /** A MINT node is tougher — more HP — but pays out far more on break. */
  private static readonly MINT_HP_MULT = 1.5;
  /** An EASY ACCESS (brittle) node has half durability — easier to mine. */
  private static readonly EASY_ACCESS_HP_MULT = 0.5;
  /**
   * HP multiplier for the CURRENT node: mint (×1.5) and easy-access (×0.5) stack
   * independently (a node can be both). The floor in nodeIntegrityMax keeps the
   * result a clean integer — no decimals shown.
   */
  get nodeHpMultiplier(): number {
    return (this.nodeIsMint ? GameState.MINT_HP_MULT : 1)
      * (this.nodeIsEasyAccess ? GameState.EASY_ACCESS_HP_MULT : 1);
  }

  /** Permanent node-HP multiplier from Boxed Supplies (shop): ×0.75 on EVERY floor. */
  get boxedSuppliesMult(): number {
    return this.getShopLevel('boxed_supplies') > 0 ? 0.75 : 1;
  }

  /** Total Integrity (HP) of one node on this floor — floored to a whole number, min 1. */
  get nodeIntegrityMax(): Big {
    return D(this.nodeDurabilityMax).mul(this.nodeScale).mul(this.nodeHpMultiplier)
      .mul(this.boxedSuppliesMult).floor().max(D(1));
  }

  /** Damage one manual tap deals to a node's Integrity (before a crit roll). Always an int. */
  get searchPower(): Big {
    return roundD(this.clickPower.mul(this.nodeScale));
  }

  /** Idle Integrity damage per tick (before crit/hype). Always an int. */
  get autoSearchPower(): Big {
    return roundD(this.autoMineRate.mul(this.nodeScale));
  }

  /**
   * Chance a search is a "lucky find" (crit). Base 0% — granted by crit-chance
   * upgrades (effect 'critChance') and equipped gear. Capped 60%.
   */
  get critChance(): number {
    return Math.min(0.6, (this.sumEffect('critChance') + this.gearEffect('critChance')) / 100);
  }

  /** Damage multiplier on a lucky find: ×3 base + Metal Head + gear + Fragment Sight (void). */
  get critMult(): number {
    return 3 + this.sumEffect('critDamage') + this.gearEffect('critDamage')
      + this.getVoidLevel('fragment_sight') * 0.25;
  }

  /** Average damage multiplier from crits + super crits (folds them into offline auto). */
  get critMultiplierAvg(): number {
    const avgCritMult = this.critMult * (1 + this.superCritChance * (this.superCritMult - 1));
    return 1 + this.critChance * (avgCritMult - 1);
  }

  /* ---- Pets (permanent — survive Rewind) ---- */

  /** A pet's level; 0 = not unlocked. */
  getPetLevel(id: string): number { return this.petLevels[id] ?? 0; }

  /** Lamp Trap level — its auto-catch bonus is +1% per level. */
  get lampTrapLevel(): number { return this.getPetLevel('lamp_trap'); }

  /**
   * Denominator of a pet's NEXT level-up roll (1-in-N per growth trigger) —
   * steepens ×levelChanceGrowth per level: round(levelChance × growth^(level − 1)).
   * 0 = no roll (locked/maxed).
   */
  petLevelUpOdds(id: string): number {
    const pet = PETS.find((p) => p.id === id);
    const lvl = this.getPetLevel(id);
    if (!pet || lvl <= 0 || lvl >= pet.maxLevel) return 0;
    return Math.round(pet.levelChance * Math.pow(pet.levelChanceGrowth, lvl - 1));
  }

  /**
   * Roll a pet's level-up (1-in-petLevelUpOdds; no-op while locked/maxed). On
   * success the level is banked (permanent) and a 'pet' event is pushed —
   * milestone levels announce the milestone, others the per-level bonus.
   */
  private tryPetLevelUp(id: string, events: GameEvent[]): void {
    const pet = PETS.find((p) => p.id === id);
    const odds = this.petLevelUpOdds(id);
    if (!pet || odds <= 0 || Math.random() >= 1 / odds) return;
    const lvl = this.getPetLevel(id) + 1;
    this.petLevels[id] = lvl;
    this.lifetimePetLevelsGained += 1;   // Pet Trainer achievement
    const ms = pet.milestones.find((m) => m.level === lvl);
    const bonus = +(lvl * pet.bonusPerLevel).toFixed(2);   // strip float noise (0.25 steps)
    events.push({
      type: 'pet',
      message: `${pet.name} grew to Lv ${lvl}!${ms ? ` ${ms.desc}!` : ` +${bonus}% ${pet.bonusLabel}.`}`,
      color: '#FFE08A',
      iconKey: pet.iconKey,
    });
  }

  /** Static level — Super Crit chance is +1% per level. */
  get petStaticLevel(): number { return this.getPetLevel('pet_static'); }

  /** Snapshot level — Mint chance is +0.25% per level (+milestone bumps). */
  get petSnapshotLevel(): number { return this.getPetLevel('pet_snapshot'); }

  /** Party Balloon level — +5% Explorer power per level while hyped (+milestone bumps). */
  get petBalloonLevel(): number { return this.getPetLevel('pet_balloon'); }

  /** Black Cat level — +4% auto power vs entities per level (+milestone bumps). */
  get petCatLevel(): number { return this.getPetLevel('pet_cat'); }

  /** Chance a LANDED crit rolls again into a Super Crit (Static: +1%/lvl). */
  get superCritChance(): number { return Math.min(1, this.petStaticLevel / 100); }

  /**
   * Extra damage multiplier a Super Crit applies ON TOP of the crit multiplier:
   * ×2 base, +1× at Static Lv 10, +1× more (Ultra) at Lv 20. ×1 while no Static.
   */
  get superCritMult(): number {
    if (this.petStaticLevel <= 0) return 1;
    return 2 + (this.petStaticLevel >= 10 ? 1 : 0) + (this.petStaticLevel >= 20 ? 1 : 0);
  }

  /** Chance (0–1) a passing moth is auto-captured without a click — Trapper + Lamp Trap + gear. */
  get autoCaptureChance(): number {
    return Math.min(1, (this.sumEffect('autoCapture') + this.lampTrapLevel + this.gearEffect('mothCatch')) / 100);
  }

  /** Multiplier on how OFTEN moths visit — Moth Lure (void) + bright lighting (2×). */
  get mothRateMult(): number {
    return (1 + this.getVoidLevel('moth_lure') * 0.1) * (this.lighting === 'bright' ? 2 : 1);
  }

  /* ---- Gear (crafted loadout — resets on Rewind) ---- */

  /** True once this gear item has been crafted (this run). */
  gearIsOwned(id: string): boolean { return this.gearOwned.includes(id); }

  /** True while this gear item is in its slot. */
  gearIsEquipped(id: string): boolean {
    const def = GEAR.find((g) => g.id === id);
    return !!def && this.gearEquipped[def.slot] === id;
  }

  /** Gear stays hidden ("??????") until its unlockFloor has been reached. */
  isGearUnlocked(id: string): boolean {
    const def = GEAR.find((g) => g.id === id);
    if (!def) return false;
    return this.unlockedLevels.includes(def.unlockFloor);
  }

  canAffordGear(id: string): boolean {
    const def = GEAR.find((g) => g.id === id);
    if (!def) return false;
    return def.cost.every((c) => (this.resources[c.resourceId] ?? D(0)).gte(c.amount));
  }

  canCraftGear(id: string): boolean {
    return this.isGearUnlocked(id) && !this.gearIsOwned(id)
      && !this.gearIsDismantled(id) && this.canAffordGear(id);
  }

  /** True once this item has been scrapped this run (parts now — craftable again after Rewind). */
  gearIsDismantled(id: string): boolean { return this.dismantledGear.includes(id); }

  /** True if any gear is craftable right now — drives the Gear tab alert dot. */
  hasCraftableGear(): boolean {
    return GEAR.some((g) => this.canCraftGear(g.id));
  }

  /** Craft a gear item: pay its resource cost, own it forever (this run), auto-equip it. */
  craftGear(id: string): boolean {
    const def = GEAR.find((g) => g.id === id);
    if (!def || !this.canCraftGear(id)) return false;
    for (const c of def.cost) {
      this.resources[c.resourceId] = (this.resources[c.resourceId] ?? D(0)).sub(c.amount);
    }
    this.gearOwned.push(id);
    this.gearEquipped[def.slot] = id;   // fresh gear goes straight on
    this.lifetimeGearCrafted += 1;      // Gear Head achievement
    return true;
  }

  /** Equip an owned gear item into its slot (swapping out whatever was there). */
  equipGear(id: string): boolean {
    const def = GEAR.find((g) => g.id === id);
    if (!def || !this.gearIsOwned(id) || this.gearIsEquipped(id)) return false;
    this.gearEquipped[def.slot] = id;
    return true;
  }

  /** Sum one gear effect across the equipped loadout (Scrap levels amplify each piece). */
  gearEffect(key: GearEffect): number {
    let total = 0;
    for (const slot of GEAR_SLOTS) {
      const id = this.gearEquipped[slot];
      if (!id) continue;
      const def = GEAR.find((g) => g.id === id);
      total += (def?.effects[key] ?? 0) * this.gearLevelMult(id);
    }
    // yield feeds resource counts directly — keep it an integer.
    return key === 'yield' ? Math.round(total) : total;
  }

  /* ---- Scrap & gear levels (permanent — Scrap survives Rewind; levels live on the item) ---- */

  getGearLevel(id: string): number { return this.gearLevels[id] ?? 0; }

  /** Effect multiplier from an item's Scrap level: +10% of base per level. */
  gearLevelMult(id: string): number { return 1 + GEAR_LEVEL_BONUS * this.getGearLevel(id); }

  /** Scrap cost of an item's NEXT level, or null at the Lv cap. */
  gearLevelUpCost(id: string): number | null {
    const def = GEAR.find((g) => g.id === id);
    const lvl = this.getGearLevel(id);
    if (!def || lvl >= GEAR_LEVEL_MAX) return null;
    return gearLevelCost(def, lvl);
  }

  canLevelGear(id: string): boolean {
    const cost = this.gearLevelUpCost(id);
    return this.gearIsOwned(id) && cost !== null && this.scrap >= cost;
  }

  /** Spend Scrap to raise an owned item one level (+10% of its base effects). */
  levelGear(id: string): boolean {
    if (!this.canLevelGear(id)) return false;
    this.scrap -= this.gearLevelUpCost(id)!;
    this.gearLevels[id] = this.getGearLevel(id) + 1;
    return true;
  }

  /** Scrap paid if this item were dismantled: base value + 70% of level investment. */
  gearDismantleValue(id: string): number {
    const def = GEAR.find((g) => g.id === id);
    if (!def) return 0;
    return gearScrapValue(def) + Math.floor(GEAR_LEVEL_REFUND * gearLevelInvested(def, this.getGearLevel(id)));
  }

  /**
   * Dismantle a BENCHED gear item (equipped gear must be swapped out first):
   * bank its Scrap and lose the piece until the next Rewind.
   */
  dismantleGear(id: string): number {
    if (!this.gearIsOwned(id) || this.gearIsEquipped(id)) return 0;
    const value = this.gearDismantleValue(id);
    this.gearOwned = this.gearOwned.filter((g) => g !== id);
    delete this.gearLevels[id];
    this.dismantledGear.push(id);
    this.scrap += value;
    return value;
  }

  /** Scrap the NEXT Rewind would salvage from benched gear (Void menu preview). */
  get pendingRewindScrap(): number {
    let total = 0;
    for (const id of this.gearOwned) {
      if (!this.gearIsEquipped(id)) total += this.gearDismantleValue(id);
    }
    return total;
  }

  /* ---- Gear Rating → the runner's look (buddy sheet + weapon-in-hand) ---- */

  /** Gear Rating: 1 point per equipped piece + 1 per Scrap level on it. */
  get gearRating(): number {
    let rating = 0;
    for (const slot of GEAR_SLOTS) {
      const id = this.gearEquipped[slot];
      if (id) rating += 1 + this.getGearLevel(id);
    }
    return rating;
  }

  /** Avatar sheet (1..6) from Gear Rating — every 5 rating = the next style, looping forever. */
  get buddySuit(): number { return 1 + (Math.floor(this.gearRating / 5) % 6); }

  /** Which weapon the runner carries in the run animation (null = unarmed). */
  get buddyWeaponStyle(): WeaponStyle | null {
    const id = this.gearEquipped['weapon'];
    if (!id) return null;
    return GEAR.find((g) => g.id === id)?.weaponStyle ?? null;
  }

  /* ---- Danger layer: Noise & entity encounters ---- *
   * Noise is % per search, scaled by the floor's danger rating. At 100% an
   * entity spawns with a "presence" pool proportional to the floor's node HP;
   * taps drain it (the node is blocked meanwhile, and the drone hides). Driving
   * it off pays a resource burst; ignoring it costs ENTITY_LEAVE_MS of idling. */
  private static readonly ENTITY_LEAVE_MS = 45_000;
  private static readonly NOISE_DECAY_PER_TICK = 0.5;   // fades while the drone is silent

  get entityActive(): boolean { return this.activeEntityId !== null; }

  /** The entity currently harassing you (null when the halls are quiet). */
  get activeEntity(): EntityDef | null {
    return this.activeEntityId ? ENTITIES[this.activeEntityId] ?? null : null;
  }

  /** Fraction (0-1) of searching noise removed — Soft Soles + gear. Capped 75%. */
  get noiseReduction(): number {
    return Math.min(0.75, (this.sumEffect('quiet') + this.gearEffect('quiet')) / 100);
  }

  /** Noise multiplier from the lighting: things hear you better in the dark. */
  get lightingNoiseMult(): number { return this.lighting === 'dark' ? 1.5 : 1; }

  /** Noise one TAP adds (%). Deeper danger = louder halls; the dark amplifies. */
  get noisePerTap(): number {
    return (0.22 + 0.025 * this.level.danger) * (1 - this.noiseReduction) * this.lightingNoiseMult;
  }

  /** Noise one drone TICK adds (%) — slower than tapping, so idle play is calmer. */
  get noisePerTick(): number {
    return (0.35 + 0.045 * this.level.danger) * (1 - this.noiseReduction) * this.lightingNoiseMult;
  }

  /** Damage multiplier against entities — Camera Flash + gear 'repel'. */
  get repelMult(): number {
    return 1 + (this.sumEffect('repel') + this.gearEffect('repel')) / 100;
  }

  /**
   * Fraction (0-1) of AUTO power that keeps working against an entity each tick
   * — the idle counterplay: Escape Plan (+7%/lvl) + the Black Cat (+4%/lvl).
   * 0 by default, so un-upgraded encounters still stop the drone cold.
   */
  get autoRepelPct(): number {
    return (this.sumEffect('autoRepel') + this.petCatLevel * 4) / 100;
  }

  /** Entity-presence multiplier from this floor's base (Watchtower). */
  get basePresenceMult(): number {
    return this.builtBaseStages.reduce((m, st) => m * (st.presenceMult ?? 1), 1);
  }

  /**
   * How long an entity harasses you before giving up: 45s base, −3s per Umbral
   * Veil (void), ×0.75 at Black Cat Lv 10, × this floor's Watchtower. Min 5s.
   */
  get entityLeaveMs(): number {
    const base = GameState.ENTITY_LEAVE_MS - this.getVoidLevel('umbral_veil') * 3000;
    const catMult = this.petCatLevel >= 10 ? 0.75 : 1;
    const baseMult = this.builtBaseStages.reduce((m, st) => m * (st.leaveMult ?? 1), 1);
    return Math.max(5000, base * catMult * baseMult);
  }

  /** Raise noise; at 100 the floor's roster rolls an entity. */
  private addNoise(amount: number, events: GameEvent[]): void {
    if (this.entityActive) return;   // it already found you
    this.noise = Math.min(100, this.noise + amount);
    if (this.noise >= 100) this.spawnEntity(events);
  }

  /** An entity finds you: presence scales with node HP AND danger; noise resets. */
  private spawnEntity(events: GameEvent[]): void {
    const roster = this.level.entityIds.filter((id) => ENTITIES[id]);
    if (roster.length === 0) { this.noise = 0; return; }
    const entity = ENTITIES[roster[Math.floor(Math.random() * roster.length)]];
    this.activeEntityId = entity.id;
    this.entityPresenceMax = this.nodeIntegrityMax
      .mul((1 + this.level.danger / 4) * this.basePresenceMult).floor().max(D(1));
    this.entityPresence = this.entityPresenceMax;
    this.entityLeaveMsLeft = this.entityLeaveMs;
    this.noise = 0;
    this.stats.entitiesEncountered += 1;
    events.push({ type: 'entity', message: entity.encounterMessage, color: '#FF6666', iconKey: entity.iconKey });
  }

  /** Drive-off resolved: burst of the floor resource (scaled by danger + yield bonuses). */
  private repelEntity(events: GameEvent[]): void {
    const entity = this.activeEntity;
    if (!entity) return;
    const ore = this.floorOre;
    const catMult = this.petCatLevel >= 20 ? 2 : 1;   // Cat Lv 20: ×2 drive-off rewards
    const gain = Math.round((2 + this.level.danger) * (1 + this.flatYieldBonus)) * catMult;
    this.resources[ore.resource] = (this.resources[ore.resource] ?? D(0)).add(gain);
    this.stats.resourcesFound += gain;
    this.lifetimeResourcesCollected += gain;
    this.exploration = Math.min(ore.required, this.exploration + gain);
    this.lifetimeEntitiesRepelled += 1;   // Night Watch achievement
    this.clearEntity();
    events.push({ type: 'entity', message: entity.defeatMessage, color: '#7CFF7C', iconKey: entity.iconKey });
    events.push({ type: 'resource', message: `+ ${RESOURCES[ore.resource].name}${tierSuffix(ore.tier)}`, color: '#7CFF7C', iconKey: ore.resource, value: gain });
    this.tryPetLevelUp('pet_cat', events);   // the Cat grows on drive-offs
  }

  private clearEntity(): void {
    this.activeEntityId = null;
    this.entityPresence = D(0);
    this.entityLeaveMsLeft = 0;
    this.noise = 0;
  }

  /**
   * Advance the encounter's give-up timer (called every frame). When it runs
   * out the entity leaves on its own — no reward, message only.
   */
  advanceEntity(deltaMs: number): GameEvent[] {
    if (!this.entityActive) return [];
    this.entityLeaveMsLeft -= deltaMs;
    if (this.entityLeaveMsLeft > 0) return [];
    const entity = this.activeEntity;
    this.clearEntity();
    return entity
      ? [{ type: 'entity', message: entity.surviveMessage, color: '#AAAAAA', iconKey: entity.iconKey }]
      : [];
  }

  /* ---- Lighting phases ---- *
   * The halls drift between bright / normal / dark on a 40-90s cycle. It's the
   * mood layer with mechanical teeth: dark amplifies noise ×1.5 and lets
   * PHANTOMS drift in (click one for a bonus + calm); bright doubles moth
   * visits. Deeper floors roll dark more often. Never persisted — every session
   * opens under normal light. */
  private static readonly LIGHT_PHASE_MIN_MS = 40_000;
  private static readonly LIGHT_PHASE_MAX_MS = 90_000;

  /**
   * Advance the lighting phase timer (called every frame). On rollover, pick
   * the next phase — never the same twice, so every shift is visible.
   */
  advanceLighting(deltaMs: number): { changed: boolean; lighting: LightingState } {
    this.lightingMsLeft -= deltaMs;
    if (this.lightingMsLeft > 0) return { changed: false, lighting: this.lighting };
    const darkW = 0.2 + Math.min(0.2, this.level.danger * 0.02);   // deeper = darker
    const brightW = 0.25;
    let next: LightingState = this.lighting;
    while (next === this.lighting) {
      const r = Math.random();
      next = r < darkW ? 'dark' : r < darkW + brightW ? 'bright' : 'normal';
    }
    this.lighting = next;
    this.lightingMsLeft = GameState.LIGHT_PHASE_MIN_MS
      + Math.random() * (GameState.LIGHT_PHASE_MAX_MS - GameState.LIGHT_PHASE_MIN_MS);
    return { changed: true, lighting: next };
  }

  /**
   * Stare down a phantom (the click-to-catch bonus of dark phases): a burst of
   * the floor resource, −20 Noise (you faced the fear), and the Eyes in the
   * Dark / Mob Farm counters. The UI owns spawning; this banks the catch.
   */
  collectPhantom(): { gain: number; events: GameEvent[] } {
    const events: GameEvent[] = [];
    const ore = this.floorOre;
    const gain = Math.round((1 + this.level.danger) * (1 + this.flatYieldBonus));
    this.resources[ore.resource] = (this.resources[ore.resource] ?? D(0)).add(gain);
    this.stats.resourcesFound += gain;
    this.lifetimeResourcesCollected += gain;
    this.exploration = Math.min(ore.required, this.exploration + gain);
    this.noise = Math.max(0, this.noise - 20);
    this.lifetimePhantomsCaught += 1;   // Eyes in the Dark achievement
    this.lifetimeCreaturesCaught += 1;  // Mob Farm counts any creature caught
    events.push({ type: 'event', message: 'You meet its gaze. It was never there.', color: '#9FB4FF' });
    return { gain, events };
  }

  /* ---- Floor bases (permanent per-floor construction) ---- *
   * Each node break rolls to construct the floor's NEXT base stage (odds in
   * FLOOR_BASE_STAGES). Stages stack bonuses for THIS floor only — extra yield,
   * quality, faster respawn, mint — and survive Rewind. */

  /** Location key for the current floor's base (tier laps share one base). */
  get baseLocation(): number { return this.currentLevel % ORE_SEQUENCE.length; }

  /** Base stage built on the current floor: 0 (none) .. FLOOR_BASE_STAGES.length. */
  get floorBaseStage(): number { return this.floorBases[this.baseLocation] ?? 0; }

  /** The stage definitions already built on this floor (their bonuses are live). */
  private get builtBaseStages() { return FLOOR_BASE_STAGES.slice(0, this.floorBaseStage); }

  /** Extra resources every node break on this floor yields (Secured Room). */
  get floorBaseYield(): number {
    return this.builtBaseStages.reduce((s, st) => s + (st.yieldBonus ?? 0), 0);
  }

  /** Multiplier on every base-construction roll — Stealth Camping (shop) doubles it. */
  get baseChanceMult(): number {
    return this.getShopLevel('stealth_camping') > 0 ? 2 : 1;
  }

  /* ---- Node respawn ---- *
   * After a node breaks it doesn't refill instantly — there's a short delay
   * before the next one appears (so you actually see the Integrity hit zero, even
   * on a one-shot). */
  private static readonly RESPAWN_MS_BASE = 500;
  /** Time (ms) a broken node takes to respawn — shortened by this floor's base (Outpost) and gear. */
  get nodeRespawnTime(): number {
    return GameState.RESPAWN_MS_BASE
      * this.builtBaseStages.reduce((m, st) => m * (st.respawnMult ?? 1), 1)
      * Math.max(0.1, 1 - this.gearEffect('respawn') / 100);
  }
  /** True while the current node is broken and regrowing (no node to search). */
  get isRespawning(): boolean { return this.respawnMsLeft > 0; }

  /**
   * Advance the respawn timer (called every frame with the frame delta). When it
   * elapses, a fresh full node appears (Integrity reset to undamaged).
   */
  advanceRespawn(deltaMs: number): void {
    if (this.respawnMsLeft <= 0) return;
    this.respawnMsLeft -= deltaMs;
    if (this.respawnMsLeft <= 0) {
      this.respawnMsLeft = 0;
      this.spawnFreshNode();   // new node, full Integrity
    }
  }

  /**
   * Stand up a fresh, undamaged node and decide NOW whether it's a quality find.
   * Rolling at spawn (not at break) lets the UI show "QUALITY" above the node so
   * the player is motivated to break it for the +1 extra.
   */
  spawnFreshNode(): void {
    this.nodeDamage = D(0);
    // Grades are mutually exclusive; roll the rarer/better MINT first, then quality.
    this.nodeIsMint = Math.random() < this.mintChance;
    this.nodeIsQuality = !this.nodeIsMint && Math.random() < this.qualityChance;
    // Easy Access (brittle, half HP) is INDEPENDENT — rolled separately so it can
    // coexist with any grade.
    this.nodeIsEasyAccess = Math.random() < this.easyAccessChance;
  }

  /* ---- Hype (timed auto-search boost) ---- *
   * Every cooldown the runner can be tapped to enter HYPE: a big temporary
   * multiplier on auto-search. All three numbers are upgradable later. */
  private static readonly HYPE_COOLDOWN_MS = 120_000;   // 2 min
  private static readonly HYPE_DURATION_MS = 15_000;    // 15 s
  private static readonly SELF_HYPE_ROLL_MS = 5_000;    // Hype Train rolls every 5s while ready
  hypeCooldownMsLeft = GameState.HYPE_COOLDOWN_MS;      // counts down; at 0 hype is available
  hypeAvailable = false;                                // prompt showing, awaiting activation
  hypeActiveMsLeft = 0;                                 // >0 while the buff is running
  selfHypeRollMsLeft = GameState.SELF_HYPE_ROLL_MS;     // Hype Train: time until the next self-hype roll

  get hypeActive(): boolean { return this.hypeActiveMsLeft > 0; }
  /** Hype auto-search multiplier: ×3 base, +0.5× per Void Hunger level. */
  get hypeMultiplier(): number { return 3 + this.getVoidLevel('void_hunger') * 0.5; }
  /** Buff length: (15s + 0.5s/Rally Cry) × gear hypeDur %; ×1.5 at Party Balloon Lv 10. */
  get hypeDuration(): number {
    let base = GameState.HYPE_DURATION_MS + this.sumEffect('hypeDuration') * 1000;
    base *= 1 + this.gearEffect('hypeDur') / 100;
    return this.petBalloonLevel >= 10 ? base * 1.5 : base;
  }
  get hypeCooldown(): number { return GameState.HYPE_COOLDOWN_MS; }   // upgradable later

  /**
   * Advance hype timers (per frame). Returns the transitions the UI reacts to:
   * becameAvailable → show the HYPE! prompt; ended → drop the buff visuals.
   */
  advanceHype(deltaMs: number): { becameAvailable: boolean; ended: boolean; selfActivated: boolean } {
    let becameAvailable = false;
    let ended = false;
    let selfActivated = false;
    if (this.hypeActiveMsLeft > 0) {
      this.hypeActiveMsLeft -= deltaMs;
      if (this.hypeActiveMsLeft <= 0) {
        this.hypeActiveMsLeft = 0;
        ended = true;
        this.hypeCooldownMsLeft = this.hypeCooldown;   // recharge after the buff ends
      }
    } else if (!this.hypeAvailable) {
      this.hypeCooldownMsLeft -= deltaMs;
      if (this.hypeCooldownMsLeft <= 0) {
        this.hypeCooldownMsLeft = 0;
        this.hypeAvailable = true;
        becameAvailable = true;
        this.selfHypeRollMsLeft = GameState.SELF_HYPE_ROLL_MS;   // fresh roll window
      }
    }

    // Hype Train (shop): while hype is READY (available, not yet active), the
    // Explorer rolls every 5s for a chance to auto-activate it. +3%/level.
    if (this.hypeAvailable && !this.hypeActive) {
      const lvl = this.getShopLevel('hype_train');
      if (lvl > 0) {
        this.selfHypeRollMsLeft -= deltaMs;
        if (this.selfHypeRollMsLeft <= 0) {
          this.selfHypeRollMsLeft += GameState.SELF_HYPE_ROLL_MS;
          const def = SHOP_UPGRADES.find((s) => s.id === 'hype_train');
          const chance = (def?.effectPerLevel ?? 0) / 100 * lvl;
          if (Math.random() < chance && this.activateHype()) selfActivated = true;
        }
      }
    }
    return { becameAvailable, ended, selfActivated };
  }

  /** Activate the hype buff if it's available. (Both manual taps and Hype Train self-hype route here.) */
  activateHype(): boolean {
    if (!this.hypeAvailable || this.hypeActive) return false;
    this.hypeAvailable = false;
    this.hypeActiveMsLeft = this.hypeDuration;
    this.lifetimeHypeTriggered += 1;   // Hype Train achievement
    return true;
  }

  getUpgradeLevel(id: string): number {
    return this.upgrades[id] ?? 0;
  }

  getUpgradeCost(id: string): Big {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def) return D(Number.MAX_VALUE);
    // baseCost × costMultiplier^level — full precision so it never overflows.
    // Rounded (not floored) so hand-tuned curves land on exact numbers, e.g.
    // Auto Explore's 5,6,7,9,… = round(5 × 1.2^level). (round = +0.5 then floor.)
    return D(def.baseCost).mul(D(def.costMultiplier).pow(this.getUpgradeLevel(id))).add(0.5).floor();
  }

  /**
   * Which resource the NEXT level is paid in. Usually fixed (def.costResource),
   * but cycling upgrades (Master Scav) draw from a different floor resource each
   * level: level N → ORE_SEQUENCE[N].
   */
  getUpgradeCostResource(id: string): string {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def) return '';
    if (def.costResourceCycle) return ORE_SEQUENCE[this.getUpgradeLevel(id) % ORE_SEQUENCE.length];
    return def.costResource;
  }

  /** Locked upgrades stay hidden until their unlockFloor has been reached. */
  isUpgradeUnlocked(id: string): boolean {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def || def.unlockFloor == null) return true;
    return this.unlockedLevels.includes(def.unlockFloor);
  }

  canAffordUpgrade(id: string): boolean {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    if (!this.isUpgradeUnlocked(id)) return false;
    if (this.getUpgradeLevel(id) >= def.maxLevel) return false;
    const res = this.getUpgradeCostResource(id);
    return (this.resources[res] ?? D(0)).gte(this.getUpgradeCost(id));
  }

  /** True if any (non-maxed) upgrade is currently affordable — drives the tab alert dot. */
  hasAffordableUpgrade(): boolean {
    return UPGRADES.some((u) => this.canAffordUpgrade(u.id));
  }

  buyUpgrade(id: string): boolean {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def || !this.canAffordUpgrade(id)) return false;
    const res = this.getUpgradeCostResource(id);
    this.resources[res] = (this.resources[res] ?? D(0)).sub(this.getUpgradeCost(id));
    this.upgrades[id] = this.getUpgradeLevel(id) + 1;
    // Maxing an upgrade pays a one-time Void Shard (permanent — only the first time
    // this upgrade is ever maxed, so re-maxing after a rewind doesn't repeat it).
    if (this.upgrades[id] >= def.maxLevel && !this.shardMaxedUpgrades.includes(id)) {
      this.shardMaxedUpgrades.push(id);
      this.awardShard(`Maxed ${def.name}!`);
    }
    return true;
  }

  /** Grant one Void Shard and queue a toast for the scene to surface. */
  private awardShard(reason: string): void {
    this.voidShards += 1;
    this.pendingShardEvents.push({
      type: 'event', message: `${reason} +1 Void Shard`, color: '#CC88FF', iconKey: 'void_shard',
    });
  }

  /** Drain queued shard-award toasts (called by the scene after buys/escapes/ticks). */
  collectShardAwards(): GameEvent[] {
    if (this.pendingShardEvents.length === 0) return [];
    const out = this.pendingShardEvents;
    this.pendingShardEvents = [];
    return out;
  }

  /* ---- Effective stats from upgrades + void bonuses + gear ---- */

  getVoidLevel(id: string): number {
    return this.voidUpgrades[id] ?? 0;
  }

  /** Sum effectPerLevel × level across all upgrades with a given effect. */
  private sumEffect(effect: string): number {
    let s = 0;
    for (const u of UPGRADES) {
      if (u.effect === effect) s += u.effectPerLevel * this.getUpgradeLevel(u.id);
    }
    return s;
  }

  /** Flat power added to BOTH tap and auto/sec (Moth Powers +2/lvl, Master Scav +5/lvl). */
  get flatPower(): number { return this.sumEffect('flatPower'); }
  /** Tap-only power (Sharp Eye +1/lvl). */
  get tapPower(): number { return this.sumEffect('power'); }

  /** Current level of a Void Shard shop upgrade. */
  getShopLevel(id: string): number { return this.shopUpgrades[id] ?? 0; }

  /**
   * Search Upgrade (shop): +effectPerLevel per level, added to tap power, drone
   * auto, AND per-Explorer auto — so it boosts Tap, auto search, and Explorer power.
   */
  get searchUpgradeBonus(): number {
    const def = SHOP_UPGRADES.find((s) => s.id === 'search_upgrade');
    return this.getShopLevel('search_upgrade') * (def?.effectPerLevel ?? 0);
  }

  /** Tap + per-Explorer power (Splinters +3/lvl, effect 'tapExplorer'). */
  get tapExplorerPower(): number { return this.sumEffect('tapExplorer'); }

  /**
   * Void Resonance: ×1.25 per level on ALL search power (tap, drone, Explorer).
   * The compounding multiplier that keeps power abreast of the ×1.5 HP curve.
   */
  get voidPowerMult(): number {
    return Math.pow(1.25, this.getVoidLevel('void_resonance'));
  }

  /**
   * Search power per tap (before the floor magnitude scale): the summed flat
   * channels, then the multiplicative layers — gear tapMult % and Void Resonance.
   */
  get clickPower(): Big {
    return D(1 + this.flatPower + this.tapPower + this.searchUpgradeBonus + this.tapExplorerPower)
      .mul(1 + this.gearEffect('tapMult') / 100)
      .mul(this.voidPowerMult);
  }

  /**
   * Explorers the player commands. Each runs auto-searches and counts every
   * per-Explorer bonus once. Starts at 1; the shop's Another Explorer adds more.
   */
  get explorerCount(): number { return 1 + this.getShopLevel('second_explorer'); }

  /** Drone auto-search (Auto Explore) + Search Upgrade. Feeds the total only — NOT any Explorer. */
  get droneAuto(): number { return this.sumEffect('autoMine') + this.searchUpgradeBonus; }

  /** Per-Explorer auto power that EVERY Explorer gets (Heavy Sweep +2/lvl each, + Search Upgrade + Splinters). */
  get explorerSharedAuto(): number { return this.sumEffect('explorerAuto') + this.searchUpgradeBonus + this.tapExplorerPower; }

  /**
   * Auto power belonging to a single Explorer: the shared per-Explorer power plus
   * that Explorer's personal bonus. flat-power upgrades (Master Scav, Moth Powers)
   * are credited to Explorer 1 only. `index` is 0-based (only 0 exists today).
   */
  explorerAuto(index = 0): number {
    return this.explorerSharedAuto + (index === 0 ? this.flatPower : 0);
  }

  /**
   * Total claimed achievement tiers across ALL achievements (drives the menu's
   * global auto-search bonus). Pack Rat L2 + another L3 = 5.
   */
  get totalAchievementLevels(): number {
    let s = 0;
    for (const v of Object.values(this.achievementClaims)) s += v;
    return s;
  }

  /** Global auto-search MULTIPLIER from achievements: +0.5% per total claimed tier. */
  get achievementAutoBonus(): number {
    return 1 + this.totalAchievementLevels * 0.005;
  }

  /**
   * Auto-searches per SECOND (the grand total): (drone + every Explorer's auto power)
   * scaled by the achievements auto-search bonus. Heavy Sweep multiplies by Explorer
   * count; Master Scav (Explorer-1 only) is counted once.
   */
  get autoPerSecond(): number {
    let explorers = 0;
    for (let i = 0; i < this.explorerCount; i++) explorers += this.explorerAuto(i);
    // Party Balloon: Explorers hit harder WHILE HYPED (+5%/lvl, on top of the hype ×).
    if (this.hypeActive) explorers *= 1 + this.petBalloonLevel * 0.05;
    let total = (this.droneAuto + explorers) * this.achievementAutoBonus;
    if (this.petBalloonLevel >= 20) total *= 1.15;   // Balloon Lv 20: +15% gathering speed, always on
    // Multiplicative layers: gear autoMult % and Void Resonance (×1.25/lvl).
    total *= (1 + this.gearEffect('autoMult') / 100) * this.voidPowerMult;
    // The multipliers make this fractional — auto search is always a whole
    // number, so round to the nearest int.
    return Math.round(total);
  }
  /**
   * Idle searches per TICK (before the floor magnitude scale). Converted from the
   * per-second auto rate for the tick cadence; a fresh game (no upgrades) is 0.
   */
  get autoMineRate(): Big {
    return D(this.autoPerSecond).mul(TICK_INTERVAL_MS / 1000);
  }
  /** Cooldown (ms) between taps — lowered by Mining Speed / Swift Hands. */
  get mineCooldownMs(): number {
    let m = 1;
    for (const u of UPGRADES) {
      if (u.effect === 'cooldown') m *= Math.pow(1 - u.effectPerLevel / 100, this.getUpgradeLevel(u.id));
    }
    return Math.max(60, 500 * m);
  }
  /** Per-floor quality-chance bonus from this floor's base (Supply Cache). */
  get levelQualityBonus(): number {
    return this.builtBaseStages.reduce((s, st) => s + (st.qualityBonus ?? 0), 0);
  }

  /**
   * Chance a collected resource is a "quality" find — yields +1 extra (2 instead
   * of 1). Starts at 0%; raised by upgrades (effect 'quality') and this floor's
   * base (levelQualityBonus). Capped at 90%.
   */
  get qualityChance(): number {
    let c = this.levelQualityBonus + this.gearEffect('quality') / 100;
    for (const u of UPGRADES) {
      if (u.effect === 'quality' || u.effect === 'bonusOre') c += (u.effectPerLevel / 100) * this.getUpgradeLevel(u.id);
    }
    if (this.petSnapshotLevel >= 10) c += 0.03;   // Snapshot Lv 10 milestone
    return Math.min(0.9, c);
  }

  /** Extra resources a QUALITY find yields: base +1, plus Quality Find upgrade (+1/lvl). */
  get qualityBonus(): number { return 1 + this.sumEffect('qualityYield'); }

  /** Per-floor mint-chance bonus from this floor's base (Safe Room of Operations). */
  get levelMintBonus(): number {
    return this.builtBaseStages.reduce((s, st) => s + (st.mintBonus ?? 0), 0);
  }

  /**
   * Chance a collected resource is MINT — yields +9 extra (10 total) but the node
   * has ×1.5 HP. Rarer/better than quality. Starts at 0%; raised by upgrades
   * (effect 'mint') and this floor's base (levelMintBonus). Capped at 90%.
   */
  get mintChance(): number {
    let c = this.levelMintBonus + this.gearEffect('mint') / 100;
    for (const u of UPGRADES) {
      if (u.effect === 'mint') c += (u.effectPerLevel / 100) * this.getUpgradeLevel(u.id);
    }
    c += this.petSnapshotLevel * 0.0025;          // Snapshot: +0.25%/lvl...
    if (this.petSnapshotLevel >= 20) c += 0.03;   // ...and +3% at its Lv 20 milestone
    return Math.min(0.9, c);
  }

  /**
   * Chance a node spawns with EASY ACCESS (brittle) — half durability, easier to
   * mine. Starts at 0%; raised by Stocked Shelves (effect 'easyAccess'). Capped 90%.
   * Independent of quality/mint (a node can be easy-access AND mint).
   */
  get easyAccessChance(): number {
    return Math.min(0.9, (this.sumEffect('easyAccess') + this.gearEffect('easyAccess')) / 100);
  }

  /**
   * Flat extra resources EVERY node break yields: this floor's base (Secured
   * Room) + equipped pack gear + Deep Pockets (void). Folded into offline too.
   */
  get flatYieldBonus(): number {
    return this.floorBaseYield + this.gearEffect('yield') + this.getVoidLevel('deep_pockets');
  }

  /** Base max HP/Sanity (the survival stats are dormant; kept for the future entity layer). */
  get baseMaxHealth(): number { return 100; }
  get baseMaxSanity(): number { return 100; }
  /** Effective offline tick cap including Lucid Memory (void). */
  get offlineTickCap(): number {
    return MAX_OFFLINE_TICKS + this.getVoidLevel('lucid_memory') * 200;
  }

  /* ---- Consumables ---- */

  useAlmondWater(): boolean {
    if ((this.resources['almond_water'] ?? D(0)).lte(0)) return false;
    this.resources['almond_water'] = this.resources['almond_water'].sub(1);
    this.health = Math.min(this.maxHealth, this.health + 15);
    return true;
  }

  useCannedFood(): boolean {
    if ((this.resources['canned_food'] ?? D(0)).lte(0)) return false;
    this.resources['canned_food'] = this.resources['canned_food'].sub(1);
    this.sanity = Math.min(this.maxSanity, this.sanity + 20);
    return true;
  }

  /** One tap on the ore node (active search). Cooldown is enforced by the UI. */
  manualSearch(): SearchHit {
    const events: GameEvent[] = [];
    // An entity has you cornered: taps hit IT instead of the node.
    if (this.entityActive) return this.searchEntity(events);
    // No node to hit while one is respawning.
    if (this.isRespawning) return { events, damage: D(0), crit: false, superCrit: false, struck: false };
    const crit = Math.random() < this.critChance;
    let superCrit = false;
    if (crit) {
      this.lifetimeCritsLanded += 1;   // Crit Master achievement
      superCrit = Math.random() < this.superCritChance;   // Static: crit on top of the crit
      if (superCrit) this.lifetimeSuperCritsLanded += 1;  // Super Crits achievement
      this.tryPetLevelUp('pet_static', events);           // Static grows on landed crits
    }
    // critMult can be fractional (Metal Head +0.2x); round so damage is always an int.
    const damage = roundD(this.searchPower.mul(crit ? this.critMult : 1).mul(superCrit ? this.superCritMult : 1));
    this.nodeDamage = this.nodeDamage.add(damage);
    this.resolveNode(events);
    this.addNoise(this.noisePerTap, events);   // searching is loud
    return { events, damage, crit, superCrit, struck: true };
  }

  /** A tap during an encounter: same power/crit pipeline, aimed at the entity. */
  private searchEntity(events: GameEvent[]): SearchHit {
    const crit = Math.random() < this.critChance;
    let superCrit = false;
    if (crit) {
      this.lifetimeCritsLanded += 1;
      superCrit = Math.random() < this.superCritChance;
      if (superCrit) this.lifetimeSuperCritsLanded += 1;
      this.tryPetLevelUp('pet_static', events);
    }
    const damage = roundD(this.searchPower.mul(crit ? this.critMult : 1)
      .mul(superCrit ? this.superCritMult : 1).mul(this.repelMult));
    this.entityPresence = this.entityPresence.sub(damage).max(0);
    if (this.entityPresence.lte(0)) this.repelEntity(events);
    return { events, damage, crit, superCrit, struck: true };
  }

  /**
   * Collect one Moth (the floor-independent click-to-catch rare). Returns the
   * Moths actually banked (Lamp Trap Lv10+ doubles every catch) plus any pet
   * level-up events: each catch rolls 1-in-levelChance for the Lamp Trap to grow.
   */
  collectMoth(): { gain: number; events: GameEvent[] } {
    const events: GameEvent[] = [];
    const gain = this.lampTrapLevel >= 10 ? 2 : 1;   // Lv10 milestone: ×2 Moths per catch
    this.resources['moth'] = (this.resources['moth'] ?? D(0)).add(gain);
    this.stats.resourcesFound += gain;
    this.lifetimeResourcesCollected += gain;
    this.lifetimeCreaturesCaught += 1;   // Mob Farm achievement — one CATCH, however much loot
    this.tryPetLevelUp('lamp_trap', events);   // the Lamp grows on catches
    return { gain, events };
  }

  /**
   * Break the current node if its Integrity has hit zero, collecting ONE resource
   * and starting the respawn timer. At most one break per call: the node is then
   * "gone" until it respawns, so overflow damage is discarded (no carry-over to
   * the next node — that's what made the HP bar jump back up). Integrity is parked
   * at zero (nodeDamage = full) for the duration so the empty bar is visible.
   */
  private resolveNode(events: GameEvent[]): void {
    if (this.isRespawning) return;
    const ore = this.floorOre;
    const dur = this.nodeIntegrityMax;
    if (this.nodeDamage.lt(dur)) return;

    // Grade decided when this node spawned (shown as "MINT"/"QUALITY" before break).
    const mint = this.nodeIsMint;
    const quality = !mint && this.nodeIsQuality;
    let gain = 1;
    if (mint) { gain += 9; this.stats.mintFinds += 1; }
    else if (quality) {
      gain += this.qualityBonus;
      this.stats.qualityFinds += 1;
      this.tryPetLevelUp('pet_snapshot', events);   // Snapshot grows on quality finds
    }
    gain += this.flatYieldBonus;   // floor base + pack gear + Deep Pockets pay on EVERY break
    if (this.nodeIsEasyAccess) this.stats.easyAccessFinds += 1;   // brittle node mined (independent of grade)
    this.resources[ore.resource] = (this.resources[ore.resource] ?? D(0)).add(gain);   // inventory (uncapped)
    this.stats.resourcesFound += gain;
    this.lifetimeResourcesCollected += gain;
    this.exploration = Math.min(ore.required, this.exploration + gain);                 // descend progress (capped)
    events.push({ type: 'resource', message: `+ ${RESOURCES[ore.resource].name}${tierSuffix(ore.tier)}`, color: '#7CFF7C', iconKey: ore.resource, value: gain, quality, mint });

    // Every break also works on this floor's base: roll 1-in-N to construct the
    // NEXT stage (sequential; odds per stage in FLOOR_BASE_STAGES, doubled by
    // Stealth Camping). Permanent.
    const built = this.floorBaseStage;
    const nextStage = FLOOR_BASE_STAGES[built];
    if (nextStage && Math.random() < this.baseChanceMult / nextStage.chance) {
      this.floorBases[this.baseLocation] = built + 1;
      this.lifetimeStructuresBuilt += 1;   // Base Builder achievement
      events.push({
        type: 'event',
        message: `Base constructed: ${nextStage.name}! ${nextStage.desc} on this floor — forever.`,
        color: '#FFD24A',
      });
    }

    this.respawnMsLeft = this.nodeRespawnTime;
    this.nodeDamage = dur;   // remaining Integrity = 0 (drained) until respawn completes
  }

  /* ---- Level escape / travel ---- */

  canEscape(): boolean {
    // Descend as soon as the level is fully explored — no key, no combat gate.
    return this.explorationPct >= 100;
  }

  /** True when fully explored AND the next floor is new territory — drives the Explore tab alert dot. */
  canDescendToNew(): boolean {
    return this.canEscape() && !this.unlockedLevels.includes(this.currentLevel + 1);
  }

  escape(): boolean {
    if (!this.canEscape()) return false;
    // Save current level's exploration before moving
    this.explorationPerLevel[this.currentLevel] = this.exploration;
    this.currentLevel++;
    if (!this.unlockedLevels.includes(this.currentLevel)) {
      this.unlockedLevels.push(this.currentLevel);
    }
    // Endless ladder: make sure this floor's upgrade exists, +1 ahead so the
    // next rung previews as ?????? like the hand-authored roster.
    ensureUpgradesForFloor(this.currentLevel + 1);
    // New level starts at 0 (never visited)
    this.exploration = this.explorationPerLevel[this.currentLevel] ?? 0;
    this.respawnMsLeft = 0;
    this.spawnFreshNode();
    this.clearEntity();   // whatever was hunting you stays on its own floor
    this.stats.levelsEscaped++;
    this.totalDepth++;
    // Advancing to genuinely new territory pays a Void Shard (once per depth).
    if (this.currentLevel > this.highestLevelReached) {
      this.highestLevelReached = this.currentLevel;
      this.awardShard(`Reached ${this.level.name}!`);
    }
    return true;
  }

  travelTo(levelId: number): boolean {
    if (!this.unlockedLevels.includes(levelId)) return false;
    if (levelId === this.currentLevel) return false;
    // Save current level's exploration
    this.explorationPerLevel[this.currentLevel] = this.exploration;
    this.currentLevel = levelId;
    // Restore destination level's exploration
    this.exploration = this.explorationPerLevel[levelId] ?? 0;
    this.respawnMsLeft = 0;
    this.spawnFreshNode();
    this.clearEntity();   // whatever was hunting you stays on its own floor
    return true;
  }

  /* ---- Abilities ---- */

  canUseAbility(id: string): boolean {
    const def = ABILITIES.find(a => a.id === id);
    if (!def) return false;
    if ((this.abilityCooldowns[id] ?? 0) > 0) return false;
    return (this.resources[def.costResource] ?? D(0)).gte(def.costAmount);
  }

  getAbilityCooldown(id: string): number {
    return this.abilityCooldowns[id] ?? 0;
  }

  useAbility(id: string): GameEvent[] {
    const def = ABILITIES.find(a => a.id === id);
    if (!def || !this.canUseAbility(id)) return [];

    const events: GameEvent[] = [];
    this.resources[def.costResource] = (this.resources[def.costResource] ?? D(0)).sub(def.costAmount);
    this.abilityCooldowns[id] = def.cooldownTicks;

    if (id === 'scavenge') {
      this.nodeDamage = this.nodeDamage.add(this.searchPower.mul(6));
      this.resolveNode(events);
    } else if (id === 'barricade') {
      this.barricadeTicks = def.durationTicks;
      events.push({
        type: 'event',
        message: 'You barricade the entrance. Entities blocked!',
        color: '#8888FF',
        iconKey: 'barricade',
      });
    } else if (id === 'signal_flare') {
      this.signalFlareTicks = def.durationTicks;
      events.push({
        type: 'event',
        message: 'Signal flare lit! Double resource drops!',
        color: '#FF8844',
        iconKey: 'signal_flare',
      });
    }

    return events;
  }

  /* ---- Core idle tick ---- */

  processTick(): TickResult {
    const events: GameEvent[] = [];
    const lvl = this.level;
    let autoCrit = false;
    let autoSuperCrit = false;
    let autoDamage: Big | undefined;

    // Party Balloon grows from hyped exploring: one roll per tick while hype runs
    // (~10-15 rolls per burst, more with longer hype).
    if (this.hypeActive) this.tryPetLevelUp('pet_balloon', events);

    // 1. Idle auto-search (drone). Skipped while a node is respawning — and
    //    while an ENTITY is present (the drone hides; taps must drive it off or
    //    it leaves on its own). The batch can roll a lucky find (crit) just like
    //    a manual tap — same chance/×, including Static's super-crit roll.
    if (!this.isRespawning && !this.entityActive) {
      autoCrit = Math.random() < this.critChance;
      const superCrit = autoCrit && Math.random() < this.superCritChance;
      const hypeMult = this.hypeActive ? this.hypeMultiplier : 1;
      // crit (Metal Head can make it fractional) + super crit + hype multipliers → round to an int.
      const dmg = roundD(this.autoSearchPower.mul(autoCrit ? this.critMult : 1)
        .mul(superCrit ? this.superCritMult : 1).mul(hypeMult));
      if (dmg.gt(0)) {
        autoDamage = dmg;   // only surface a number when the drone is active
        autoSuperCrit = superCrit;
        if (autoCrit) {
          this.lifetimeCritsLanded += 1;          // Crit Master — only a real hit counts
          if (superCrit) this.lifetimeSuperCritsLanded += 1;   // Super Crits achievement
          this.tryPetLevelUp('pet_static', events); // Static grows on landed crits
        }
        this.addNoise(this.noisePerTick, events);   // the drone is loud too
      } else {
        // A silent tick — the halls settle and noise fades a little.
        this.noise = Math.max(0, this.noise - GameState.NOISE_DECAY_PER_TICK);
      }
      this.nodeDamage = this.nodeDamage.add(dmg);
      this.resolveNode(events);
    } else if (this.entityActive && this.autoRepelPct > 0) {
      // The idle counterplay (Escape Plan + Black Cat): Explorers keep working
      // through the encounter, applying a fraction of auto power to the entity
      // each tick. Hype and Camera Flash apply; crits don't (that's tap flair).
      const hypeMult = this.hypeActive ? this.hypeMultiplier : 1;
      const dmg = roundD(this.autoSearchPower.mul(this.autoRepelPct).mul(this.repelMult).mul(hypeMult));
      if (dmg.gt(0)) {
        autoDamage = dmg;   // surface the floating number so idle repel is visible
        this.entityPresence = this.entityPresence.sub(dmg).max(0);
        if (this.entityPresence.lte(0)) this.repelEntity(events);
      }
    }

    // 2. Atmosphere only — ambient flavor. No random loot. Muted during an
    //    encounter so the entity owns the screen.
    if (!this.entityActive && Math.random() < 0.45) {
      const msgs = lvl.ambientMessages;
      events.push({ type: 'ambient', message: msgs[Math.floor(Math.random() * msgs.length)], color: lvl.textColor });
    }

    return { events, autoDamage, autoCrit, autoSuperCrit };
  }

  /* ---- Void Shard shop ---- */

  /** Cost of the NEXT level of a shop upgrade: baseCost + costStep × level. */
  getShopUpgradeCost(id: string): number {
    const def = SHOP_UPGRADES.find((s) => s.id === id);
    if (!def) return Infinity;
    return def.baseCost + def.costStep * this.getShopLevel(id);
  }

  canAffordShopUpgrade(id: string): boolean {
    const def = SHOP_UPGRADES.find((s) => s.id === id);
    if (!def) return false;
    if (this.getShopLevel(id) >= def.maxLevel) return false;
    return this.voidShards >= this.getShopUpgradeCost(id);
  }

  /** True if any (non-maxed) shop upgrade is currently affordable — drives the tab alert dot. */
  hasAffordableShopUpgrade(): boolean {
    return SHOP_UPGRADES.some((s) => this.canAffordShopUpgrade(s.id));
  }

  buyShopUpgrade(id: string): boolean {
    const def = SHOP_UPGRADES.find((s) => s.id === id);
    if (!def || !this.canAffordShopUpgrade(id)) return false;
    this.voidShards -= this.getShopUpgradeCost(id);
    this.shopUpgrades[id] = this.getShopLevel(id) + 1;
    // A pet-unlocking purchase (same id as a PETS entry) starts that pet at Lv 1.
    if (PETS.some((p) => p.id === id) && this.getPetLevel(id) === 0) this.petLevels[id] = 1;
    return true;
  }

  /* ---- Achievements ---- */

  /** Tiers already claimed for an achievement (0..thresholds.length). */
  getAchievementLevel(id: string): number {
    return this.achievementClaims[id] ?? 0;
  }

  /** Current lifetime value an achievement tracks. */
  getAchievementProgress(stat: AchievementStat): number {
    switch (stat) {
      case 'resourcesCollected': return this.lifetimeResourcesCollected;
      case 'critsLanded': return this.lifetimeCritsLanded;
      case 'creaturesCaught': return this.lifetimeCreaturesCaught;
      case 'hypeTriggered': return this.lifetimeHypeTriggered;
      case 'structuresBuilt': return this.lifetimeStructuresBuilt;
      case 'petLevelsGained': return this.lifetimePetLevelsGained;
      case 'superCritsLanded': return this.lifetimeSuperCritsLanded;
      case 'depthReached': return this.totalDepth;
      case 'rewindsDone': return this.prestigeCount;
      case 'gearCrafted': return this.lifetimeGearCrafted;
      case 'entitiesRepelled': return this.lifetimeEntitiesRepelled;
      case 'phantomsCaught': return this.lifetimePhantomsCaught;
      default: return 0;
    }
  }

  /** Void Shards paid for claiming a tier (0-based level): reward step × (level + 1). */
  getAchievementReward(id: string, level = this.getAchievementLevel(id)): number {
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) return 0;
    return def.reward * (level + 1);
  }

  /** True when the NEXT tier's threshold has been met and there's a tier left to claim. */
  canClaimAchievement(id: string): boolean {
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) return false;
    const lvl = this.getAchievementLevel(id);
    if (lvl >= def.thresholds.length) return false;
    return this.getAchievementProgress(def.stat) >= def.thresholds[lvl];
  }

  /** Claim the next tier: award the (scaled) reward in Void Shards and advance the tier. */
  claimAchievement(id: string): boolean {
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def || !this.canClaimAchievement(id)) return false;
    const lvl = this.getAchievementLevel(id);
    this.achievementClaims[id] = lvl + 1;
    this.voidShards += this.getAchievementReward(id, lvl);
    return true;
  }

  /** True if any achievement tier is claimable right now — drives the tab alert dot. */
  hasClaimableAchievement(): boolean {
    return ACHIEVEMENTS.some((a) => this.canClaimAchievement(a.id));
  }

  /* ---- Offline progress ---- */

  processOfflineTime(elapsedMs: number): { events: GameEvent[]; summary: OfflineSummary } {
    const events: GameEvent[] = [];
    const ticks = Math.min(Math.floor(elapsedMs / 1500), this.offlineTickCap);
    const summary: OfflineSummary = { minutes: Math.floor(elapsedMs / 60000), resourcesFound: 0, explorationGained: 0 };
    if (ticks <= 0) return { events, summary };

    // Drone-only while offline. Each resource takes one fill + one respawn:
    //   fill time = Integrity / auto-damage-per-sec = durability / autoPerSecond
    //   (the floor magnitude cancels), plus the respawn delay. Count whole cycles
    //   that fit in the elapsed (capped) time.
    const autoRate = this.autoPerSecond;
    if (autoRate <= 0) { this.explorationPerLevel[this.currentLevel] = this.exploration; return { events, summary }; }

    const ore = this.floorOre;
    const elapsedSec = ticks * 1.5;                       // capped ticks → seconds
    // Fold the average crit bonus into the auto rate so offline matches live.
    const effRate = autoRate * this.critMultiplierAvg;
    const fillSec = this.nodeDurabilityMax * this.boxedSuppliesMult / effRate;   // seconds to drain one node
    const cycleSec = fillSec + this.nodeRespawnTime / 1000;
    const cycles = Math.floor(elapsedSec / cycleSec);
    if (cycles > 0) {
      // Fold in the average quality (+qualityBonus) and mint (+9) bonuses, plus the
      // floor base's flat yield, so offline ≈ live. (Base CONSTRUCTION rolls don't
      // happen offline — stages only advance while playing.)
      const count = Math.round(cycles * (1 + this.flatYieldBonus + this.qualityChance * this.qualityBonus + 9 * this.mintChance));
      this.resources[ore.resource] = (this.resources[ore.resource] ?? D(0)).add(count);
      this.stats.resourcesFound += count;
      this.lifetimeResourcesCollected += count;
      this.exploration = Math.min(ore.required, this.exploration + count);
      summary.resourcesFound = count;
    }

    this.explorationPerLevel[this.currentLevel] = this.exploration;
    return { events, summary };
  }

  /* ---- Prestige (Rewind) ---- */

  /** Rewind unlocks once the REWIND_MIN_FLOOR gate has been reached this run. */
  canRewind(): boolean {
    return this.currentLevel >= REWIND_MIN_FLOOR || this.stats.levelsEscaped >= REWIND_MIN_FLOOR;
  }

  /** Deepest floor unlocked THIS RUN — what a Rewind pays out on. */
  get deepestFloorThisRun(): number {
    return this.unlockedLevels.length ? Math.max(...this.unlockedLevels) : 0;
  }

  /** Floors the next run starts with pre-explored — Familiar Halls (void). */
  get rewindHeadStart(): number {
    return Math.min(this.getVoidLevel('familiar_halls') * 2, this.highestLevelReached);
  }

  /**
   * Void Fragments a Rewind would pay right now: every floor from the gate down
   * to the run's deepest pays exponentially more (see rewindFragmentsFor) —
   * MINUS the Familiar Halls head start, so floors the Void hands you for free
   * never pay out (no instant-rewind fragment farm).
   */
  calculateRewindFragments(): number {
    return Math.max(0, rewindFragmentsFor(this.deepestFloorThisRun) - rewindFragmentsFor(this.rewindHeadStart));
  }

  /** Void Shards a Rewind also grants — Void Conduit (+1 per level). */
  get rewindShardBonus(): number {
    return this.getVoidLevel('void_conduit');
  }

  /**
   * Perform the rewind: bank fragments (+ Void Conduit shards), then reset the
   * run — floor, resources, run upgrades, gear. Permanent systems (void
   * upgrades, shards, shop, achievements, floor bases, pets) survive.
   * Familiar Halls (void) pre-clears its floors so the run restarts deep.
   */
  rewind(): number {
    const fragments = this.calculateRewindFragments();
    this.voidFragments += fragments;
    this.prestigeCount++;
    // Void Conduit only pays on a PRODUCTIVE rewind (one that earned fragments)
    // — otherwise Familiar Halls + instant rewinds would mint free shards.
    if (this.rewindShardBonus > 0 && fragments > 0) {
      this.voidShards += this.rewindShardBonus;
    }

    // Familiar Halls: start headStart floors deep, those floors pre-explored.
    const headStart = this.rewindHeadStart;
    this.unlockedLevels = [];
    this.explorationPerLevel = {};
    for (let i = 0; i <= headStart; i++) {
      this.unlockedLevels.push(i);
      if (i < headStart) this.explorationPerLevel[i] = getFloorOre(i).required;
    }
    this.currentLevel = headStart;
    this.exploration = 0;

    // Reset resources
    for (const key of Object.keys(RESOURCES)) {
      this.resources[key] = D(0);
    }
    this.resources['almond_water'] = D(5);

    // Reset run upgrades
    for (const u of UPGRADES) {
      this.upgrades[u.id] = 0;
    }

    // Gear: you escape with what's ON you. Equipped pieces (and their Scrap
    // levels) come along; everything benched is auto-dismantled into Scrap.
    const scrapSalvaged = this.pendingRewindScrap;
    const kept = new Set(Object.values(this.gearEquipped).filter(Boolean) as string[]);
    for (const id of this.gearOwned) {
      if (!kept.has(id)) delete this.gearLevels[id];
    }
    this.scrap += scrapSalvaged;
    this.lastRewindScrap = scrapSalvaged;
    this.gearOwned = [...kept];
    this.dismantledGear = [];   // scrapped pieces become craftable again

    // Quiet halls again
    this.clearEntity();

    // Reset HP/Sanity to base (dormant, but keep them clean)
    this.maxHealth = this.baseMaxHealth;
    this.maxSanity = this.baseMaxSanity;
    this.health = this.maxHealth;
    this.sanity = this.maxSanity;

    // Reset temp buffs
    this.ghostWalkTicks = 0;
    this.adrenalineTicks = 0;
    this.barricadeTicks = 0;
    this.signalFlareTicks = 0;

    // Reset abilities
    for (const a of ABILITIES) {
      this.abilityCooldowns[a.id] = 0;
    }

    // Reset milestones (they reset on prestige)
    this.claimedMilestones = {};
    // memoryFragments persist across prestiges
    // floorBases persist too — a constructed base can NEVER be lost
    // petLevels persist too — pets are forever

    // Reset run stats (but NOT totalDepth or prestige stats)
    this.stats = {
      totalExploration: 0,
      entitiesEncountered: 0,
      resourcesFound: 0,
      qualityFinds: 0,
      mintFinds: 0,
      easyAccessFinds: 0,
      deaths: 0,
      levelsEscaped: 0,
    };

    return fragments;
  }

  /* ---- Void Upgrades ---- */

  /** Fragments the NEXT level costs: round(baseCost × costGrowth^level). */
  getVoidUpgradeCost(id: string): number {
    const def = VOID_UPGRADES.find((v) => v.id === id);
    if (!def) return Infinity;
    return Math.round(def.baseCost * Math.pow(def.costGrowth, this.getVoidLevel(id)));
  }

  canAffordVoidUpgrade(id: string): boolean {
    const def = VOID_UPGRADES.find((v) => v.id === id);
    if (!def) return false;
    if (this.getVoidLevel(id) >= def.maxLevel) return false;
    return this.voidFragments >= this.getVoidUpgradeCost(id);
  }

  /** True if any void upgrade is affordable — drives the Void tab alert dot. */
  hasAffordableVoidUpgrade(): boolean {
    return VOID_UPGRADES.some((v) => this.canAffordVoidUpgrade(v.id));
  }

  buyVoidUpgrade(id: string): boolean {
    const def = VOID_UPGRADES.find((v) => v.id === id);
    if (!def || !this.canAffordVoidUpgrade(id)) return false;
    this.voidFragments -= this.getVoidUpgradeCost(id);
    this.voidUpgrades[id] = this.getVoidLevel(id) + 1;
    return true;
  }

  /* ---- Serialisation ---- */

  toSaveData(): SaveData {
    // Make sure current level's exploration is synced before saving
    this.explorationPerLevel[this.currentLevel] = this.exploration;
    return {
      version: 1,
      currentLevel: this.currentLevel,
      unlockedLevels: [...this.unlockedLevels],
      health: this.health,
      maxHealth: this.maxHealth,
      sanity: this.sanity,
      maxSanity: this.maxSanity,
      exploration: this.exploration,
      explorationPerLevel: { ...this.explorationPerLevel },
      resources: Object.fromEntries(
        Object.entries(this.resources).map(([k, v]) => [k, v.toString()]),
      ),
      upgrades: { ...this.upgrades },
      stats: { ...this.stats },
      ghostWalkTicks: this.ghostWalkTicks,
      adrenalineTicks: this.adrenalineTicks,
      lastSaveTime: Date.now(),
      // Prestige
      prestigeCount: this.prestigeCount,
      voidFragments: this.voidFragments,
      voidUpgrades: { ...this.voidUpgrades },
      totalDepth: this.totalDepth,
      maxLevelUnlocked: this.maxLevelUnlocked,
      // Abilities
      abilityCooldowns: { ...this.abilityCooldowns },
      barricadeTicks: this.barricadeTicks,
      signalFlareTicks: this.signalFlareTicks,
      // Milestones & discoveries
      claimedMilestones: JSON.parse(JSON.stringify(this.claimedMilestones)),
      memoryFragments: this.memoryFragments,
      // Gear
      gearOwned: [...this.gearOwned],
      gearEquipped: { ...this.gearEquipped },
      gearLevels: { ...this.gearLevels },
      dismantledGear: [...this.dismantledGear],
      scrap: this.scrap,
      // Void Shard shop
      voidShards: this.voidShards,
      shopUpgrades: { ...this.shopUpgrades },
      shardMaxedUpgrades: [...this.shardMaxedUpgrades],
      highestLevelReached: this.highestLevelReached,
      // Achievements (lifetime)
      lifetimeResourcesCollected: this.lifetimeResourcesCollected,
      lifetimeCritsLanded: this.lifetimeCritsLanded,
      lifetimeCreaturesCaught: this.lifetimeCreaturesCaught,
      lifetimeHypeTriggered: this.lifetimeHypeTriggered,
      lifetimeStructuresBuilt: this.lifetimeStructuresBuilt,
      lifetimePetLevelsGained: this.lifetimePetLevelsGained,
      lifetimeSuperCritsLanded: this.lifetimeSuperCritsLanded,
      lifetimeGearCrafted: this.lifetimeGearCrafted,
      lifetimeEntitiesRepelled: this.lifetimeEntitiesRepelled,
      lifetimePhantomsCaught: this.lifetimePhantomsCaught,
      achievementClaims: { ...this.achievementClaims },
      noise: this.noise,
      // Floor bases (permanent)
      floorBases: { ...this.floorBases },
      // Pets (permanent)
      petLevels: { ...this.petLevels },
      // Preferences
      autoEscape: this.autoEscape,
      hideMaxedUpgrades: this.hideMaxedUpgrades,
    };
  }

  loadSaveData(data: SaveData): void {
    this.currentLevel = data.currentLevel;
    this.unlockedLevels = data.unlockedLevels;
    // Regenerate the endless upgrade ladder for every floor this save has
    // reached (defs are deterministic, so saved levels re-attach by id).
    ensureUpgradesForFloor(Math.max(this.currentLevel, ...this.unlockedLevels) + 1);
    this.health = data.health;
    this.maxHealth = data.maxHealth;
    this.sanity = data.sanity;
    this.maxSanity = data.maxSanity;
    this.exploration = data.exploration;
    this.explorationPerLevel = data.explorationPerLevel ?? {};
    // Rebuild resources as Big. D() accepts old numeric saves and new string saves,
    // so legacy saves load cleanly. Default every known resource to D(0) first.
    this.resources = {};
    for (const key of Object.keys(RESOURCES)) this.resources[key] = D(0);
    const savedRes = (data.resources ?? {}) as Record<string, string | number>;
    for (const key of Object.keys(savedRes)) this.resources[key] = D(savedRes[key]);
    this.upgrades = data.upgrades;
    this.stats = { ...data.stats, qualityFinds: data.stats.qualityFinds ?? 0, mintFinds: data.stats.mintFinds ?? 0, easyAccessFinds: data.stats.easyAccessFinds ?? 0 };   // default new fields for old saves
    this.ghostWalkTicks = data.ghostWalkTicks ?? 0;
    this.adrenalineTicks = data.adrenalineTicks ?? 0;
    this.lastSaveTime = data.lastSaveTime;

    // Prestige
    this.prestigeCount = data.prestigeCount ?? 0;
    this.voidFragments = data.voidFragments ?? 0;
    this.voidUpgrades = data.voidUpgrades ?? {};
    this.totalDepth = data.totalDepth ?? 0;
    this.maxLevelUnlocked = data.maxLevelUnlocked ?? 5;

    // Migration: refund fragments spent on RETIRED void upgrades (the old
    // HP/sanity set), then drop them — nothing a player paid for is lost.
    for (const [id, lvl] of Object.entries(this.voidUpgrades)) {
      if (VOID_UPGRADES.some((v) => v.id === id)) continue;
      this.voidFragments += (LEGACY_VOID_REFUND[id] ?? 4) * (lvl ?? 0);
      delete this.voidUpgrades[id];
    }

    // Ensure void upgrade keys exist
    for (const v of VOID_UPGRADES) {
      if (this.voidUpgrades[v.id] === undefined) this.voidUpgrades[v.id] = 0;
    }

    // Abilities
    this.abilityCooldowns = data.abilityCooldowns ?? {};
    this.barricadeTicks = data.barricadeTicks ?? 0;
    this.signalFlareTicks = data.signalFlareTicks ?? 0;
    for (const a of ABILITIES) {
      if (this.abilityCooldowns[a.id] === undefined) this.abilityCooldowns[a.id] = 0;
    }

    // Milestones & discoveries
    this.claimedMilestones = data.claimedMilestones ?? {};
    this.memoryFragments = data.memoryFragments ?? 0;

    // Gear — only ids that still exist in the roster survive a load (old saves'
    // random-drop equipment ids are silently dropped).
    this.gearOwned = (data.gearOwned ?? []).filter((id) => GEAR.some((g) => g.id === id));
    const savedGear = data.gearEquipped ?? {};
    this.gearEquipped = { weapon: null, tool: null, light: null, pack: null, charm: null };
    for (const slot of GEAR_SLOTS) {
      const id = savedGear[slot];
      if (id && this.gearOwned.includes(id)) this.gearEquipped[slot] = id;
    }
    this.gearLevels = data.gearLevels ?? {};
    this.dismantledGear = data.dismantledGear ?? [];
    this.scrap = data.scrap ?? 0;

    // Void Shard shop
    this.voidShards = data.voidShards ?? 0;
    this.shopUpgrades = data.shopUpgrades ?? {};
    for (const s of SHOP_UPGRADES) {
      if (this.shopUpgrades[s.id] === undefined) this.shopUpgrades[s.id] = 0;
    }
    this.shardMaxedUpgrades = data.shardMaxedUpgrades ?? [];
    // Default deepest-reached to the deepest currently-unlocked level so existing
    // saves don't suddenly re-pay shards for floors already cleared.
    this.highestLevelReached = data.highestLevelReached
      ?? (this.unlockedLevels.length ? Math.max(...this.unlockedLevels) : 0);

    // Achievements (lifetime — never reset)
    this.lifetimeResourcesCollected = data.lifetimeResourcesCollected ?? 0;
    this.lifetimeCritsLanded = data.lifetimeCritsLanded ?? 0;
    this.lifetimeCreaturesCaught = data.lifetimeCreaturesCaught ?? 0;
    this.lifetimeHypeTriggered = data.lifetimeHypeTriggered ?? 0;
    // Saves that built bases before this counter existed: bases are permanent and
    // only ever go up, so the current stage total IS the lifetime build count.
    this.lifetimeStructuresBuilt = data.lifetimeStructuresBuilt
      ?? Object.values(data.floorBases ?? {}).reduce((s, v) => s + v, 0);
    // Same backfill idea for pets: levels only ever go up, so levels beyond each
    // pet's Lv-1 unlock are exactly the level-ups ever gained.
    this.lifetimePetLevelsGained = data.lifetimePetLevelsGained
      ?? Object.values(data.petLevels ?? {}).reduce((s, v) => s + Math.max(0, v - 1), 0);
    this.lifetimeSuperCritsLanded = data.lifetimeSuperCritsLanded ?? 0;
    this.lifetimeGearCrafted = data.lifetimeGearCrafted ?? 0;
    this.lifetimeEntitiesRepelled = data.lifetimeEntitiesRepelled ?? 0;
    this.lifetimePhantomsCaught = data.lifetimePhantomsCaught ?? 0;
    this.achievementClaims = data.achievementClaims ?? {};

    // Danger layer: noise persists; an active encounter never does (fresh calm).
    this.clearEntity();
    this.noise = data.noise ?? 0;

    // Floor bases (permanent — default empty for old saves)
    this.floorBases = data.floorBases ?? {};

    // Pets (permanent — default empty for old saves). A save that bought the
    // lamp_trap shop unlock before pets serialized still gets its pet at Lv 1.
    this.petLevels = data.petLevels ?? {};
    // The zoo pets were re-themed (Lion/Magpie/Bear → Static/Snapshot/Balloon):
    // carry levels and shop purchases from saves made under the old ids.
    const petRenames: Record<string, string> = {
      pet_lion: 'pet_static', pet_magpie: 'pet_snapshot', pet_bear: 'pet_balloon',
    };
    for (const [oldId, newId] of Object.entries(petRenames)) {
      if (this.petLevels[oldId] !== undefined) {
        this.petLevels[newId] = Math.max(this.petLevels[newId] ?? 0, this.petLevels[oldId]);
        delete this.petLevels[oldId];
      }
      if ((this.shopUpgrades[oldId] ?? 0) > 0) this.shopUpgrades[newId] = this.shopUpgrades[oldId];
      delete this.shopUpgrades[oldId];
    }
    for (const p of PETS) {
      if (this.getShopLevel(p.id) > 0 && this.getPetLevel(p.id) === 0) this.petLevels[p.id] = 1;
    }

    // Preferences
    this.autoEscape = data.autoEscape ?? true;
    this.hideMaxedUpgrades = data.hideMaxedUpgrades ?? false;

    // Recalculate max HP/Sanity from both void and run upgrades
    this.maxHealth = Math.max(this.maxHealth, this.baseMaxHealth + this.getUpgradeLevel('tough_body') * 10);
    this.maxSanity = Math.max(this.maxSanity, this.baseMaxSanity + this.getUpgradeLevel('strong_mind') * 10);

    // Stand up the starting node and decide its quality (respawn isn't saved).
    this.spawnFreshNode();
  }
}
