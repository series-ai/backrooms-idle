import {
  UPGRADES,
  RESOURCES,
  ORE_SEQUENCE,
  VOID_UPGRADES,
  PRESTIGE_TIERS,
  ABILITIES,
  GEAR_POOL,
  GEAR_TIER_VALUE,
  GEAR_TIER_COLORS,
  EQUIP_SLOTS,
  RECIPES,
  SHOP_UPGRADES,
  ACHIEVEMENTS,
  type AchievementStat,
  getLevel,
  getFloorOre,
  tierSuffix,
  type LevelDef,
  type EquipSlot,
  type GearDef,
  type GearTier,
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
  // Equipment
  equipment: Record<string, string | null>;
  defeatedBosses: Record<number, boolean>;
  torchTicks: number;
  firesaltBombActive: boolean;
  // Void Shard shop
  voidShards: number;
  shopUpgrades: Record<string, number>;
  shardMaxedUpgrades: string[];   // run-upgrade ids that have already paid out a shard for maxing
  highestLevelReached: number;    // deepest level index that has paid out a shard for advancing
  // Achievements (lifetime — never reset on rewind)
  lifetimeResourcesCollected: number;
  achievementClaims: Record<string, number>;   // achievement id → tiers claimed
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
  type: 'ambient' | 'resource' | 'entity' | 'damage' | 'death' | 'system' | 'milestone' | 'event';
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
}

/** Result of one active tap on the node: damage dealt + whether it was a lucky find (crit). */
export interface SearchHit {
  events: GameEvent[];
  damage: Big;
  crit: boolean;
  struck: boolean;   // false if there was no node to hit (mid-respawn)
}

export interface OfflineSummary {
  minutes: number;
  resourcesFound: number;
  explorationGained: number;
}

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

  // Equipment (Phase 4)
  equipment: Record<EquipSlot, string | null> = { head: null, body: null, feet: null, accessory: null };
  defeatedBosses: Record<number, boolean> = {};
  torchTicks = 0;
  firesaltBombActive = false;

  // Void Shard shop — permanent across all rewinds
  voidShards = 0;
  shopUpgrades: Record<string, number> = {};
  shardMaxedUpgrades: string[] = [];   // run-upgrades that have already granted their max-out shard
  highestLevelReached = 0;             // deepest level that has granted its advance shard
  /** Shard-award toasts queued by escape()/buyUpgrade(), drained by the scene. */
  pendingShardEvents: GameEvent[] = [];

  // Achievements — lifetime progress + claimed tiers (persist across rewinds)
  lifetimeResourcesCollected = 0;
  achievementClaims: Record<string, number> = {};

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

  /** Total Integrity (HP) of one node on this floor — floored to a whole number, min 1. */
  get nodeIntegrityMax(): Big {
    return D(this.nodeDurabilityMax).mul(this.nodeScale).mul(this.nodeHpMultiplier).floor().max(D(1));
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
   * Chance a search is a "lucky find" (crit). Base 0% — granted only by
   * crit-chance upgrades (effect 'critChance', value in % per level). Capped 60%.
   */
  get critChance(): number {
    return Math.min(0.6, this.sumEffect('critChance') / 100);
  }

  /** Damage multiplier on a lucky find: base ×3, +0.2× per Metal Head level. */
  get critMult(): number { return 3 + this.sumEffect('critDamage'); }

  /** Average damage multiplier from crits (used to fold crits into offline auto). */
  get critMultiplierAvg(): number { return 1 + this.critChance * (this.critMult - 1); }

  /** Chance (0–1) a passing moth is auto-captured without a click — from Trapper. */
  get autoCaptureChance(): number {
    return Math.min(1, this.sumEffect('autoCapture') / 100);
  }

  /* ---- Node respawn ---- *
   * After a node breaks it doesn't refill instantly — there's a short delay
   * before the next one appears (so you actually see the Integrity hit zero, even
   * on a one-shot). Upgrades will shorten this later. */
  private static readonly RESPAWN_MS_BASE = 500;
  /** Time (ms) a broken node takes to respawn. (Future upgrades will reduce it.) */
  get nodeRespawnTime(): number { return GameState.RESPAWN_MS_BASE; }
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
  get hypeMultiplier(): number { return 3; }                          // upgradable later
  /** Buff length: base 15s + 0.5s per Rally Cry level (effect in seconds). */
  get hypeDuration(): number { return GameState.HYPE_DURATION_MS + this.sumEffect('hypeDuration') * 1000; }
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

  /** Activate the hype buff if it's available. */
  activateHype(): boolean {
    if (!this.hypeAvailable || this.hypeActive) return false;
    this.hypeAvailable = false;
    this.hypeActiveMsLeft = this.hypeDuration;
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

  /** Sum of a specific gear effect across all equipped gear */
  getGearBonus(effectKey: string): number {
    let total = 0;
    for (const slot of EQUIP_SLOTS) {
      const gearId = this.equipment[slot];
      if (!gearId) continue;
      const gear = GEAR_POOL.find(g => g.id === gearId);
      if (gear && gear.effects[effectKey]) total += gear.effects[effectKey];
    }
    return total;
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

  /** Search power per tap (before the floor magnitude scale). Base 1 + flat + tap-only. */
  get clickPower(): Big { return D(1 + this.flatPower + this.tapPower + this.searchUpgradeBonus + this.tapExplorerPower); }

  /**
   * Explorers the player commands. Each runs auto-searches. Only 1 today; later
   * upgrades will raise this and every per-Explorer bonus scales with it.
   */
  get explorerCount(): number { return 1; }

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
    let total = this.droneAuto;
    for (let i = 0; i < this.explorerCount; i++) total += this.explorerAuto(i);
    // The achievement bonus (and other multipliers) make this fractional — auto
    // search is always a whole number, so round to the nearest int.
    return Math.round(total * this.achievementAutoBonus);
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
  get damageReduction(): number {
    return Math.min(0.85, this.getUpgradeLevel('thick_skin') * 0.10
      + this.getVoidLevel('thick_hide') * 0.03
      + this.getGearBonus('damageReduction') * 0.01);
  }
  get sanityDrainReduction(): number {
    return Math.min(0.85, this.getUpgradeLevel('iron_will') * 0.10
      + this.getVoidLevel('inner_peace') * 0.03
      + this.getGearBonus('sanityReduction') * 0.01);
  }
  get entityAvoidChance(): number {
    return Math.min(0.60, this.getUpgradeLevel('quiet_steps') * 0.08
      + this.getGearBonus('entityAvoidance') * 0.01);
  }
  /** Chance a broken node yields +1 bonus ore. */
  /**
   * Future per-floor output bonus to quality (improving a floor will raise its
   * quality yield). 0 until that feature lands — this is the seam for it.
   */
  get levelQualityBonus(): number { return 0; }

  /**
   * Chance a collected resource is a "quality" find — yields +1 extra (2 instead
   * of 1). Starts at 0%; raised by upgrades (effect 'quality') and, later, by
   * improving floors (levelQualityBonus). Capped at 90%.
   */
  get qualityChance(): number {
    let c = this.levelQualityBonus;
    for (const u of UPGRADES) {
      if (u.effect === 'quality' || u.effect === 'bonusOre') c += (u.effectPerLevel / 100) * this.getUpgradeLevel(u.id);
    }
    return Math.min(0.9, c);
  }

  /** Extra resources a QUALITY find yields: base +1, plus Quality Find upgrade (+1/lvl). */
  get qualityBonus(): number { return 1 + this.sumEffect('qualityYield'); }

  /** Future per-floor output bonus to mint chance — seam, 0 until floor-improving lands. */
  get levelMintBonus(): number { return 0; }

  /**
   * Chance a collected resource is MINT — yields +9 extra (10 total) but the node
   * has ×1.5 HP. Rarer/better than quality. Starts at 0%; raised by upgrades
   * (effect 'mint') and, later, by improving floors. Capped at 90%.
   */
  get mintChance(): number {
    let c = this.levelMintBonus;
    for (const u of UPGRADES) {
      if (u.effect === 'mint') c += (u.effectPerLevel / 100) * this.getUpgradeLevel(u.id);
    }
    return Math.min(0.9, c);
  }

  /**
   * Chance a node spawns with EASY ACCESS (brittle) — half durability, easier to
   * mine. Starts at 0%; raised by Stocked Shelves (effect 'easyAccess'). Capped 90%.
   * Independent of quality/mint (a node can be easy-access AND mint).
   */
  get easyAccessChance(): number {
    return Math.min(0.9, this.sumEffect('easyAccess') / 100);
  }
  get healthRegen(): number {
    return this.getUpgradeLevel('regeneration') * 0.5;
  }
  get sanityRegen(): number {
    return this.getUpgradeLevel('meditation') * 0.5;
  }

  /** Base max HP including void bonuses (before per-run upgrades) */
  get baseMaxHealth(): number {
    return 100 + this.getVoidLevel('hardened_soul') * 10;
  }
  /** Base max Sanity including void bonuses */
  get baseMaxSanity(): number {
    return 100 + this.getVoidLevel('iron_psyche') * 10;
  }
  /** Effective offline tick cap including void bonuses */
  get offlineTickCap(): number {
    return MAX_OFFLINE_TICKS + this.getVoidLevel('deep_memory') * 200;
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
    // No node to hit while one is respawning.
    if (this.isRespawning) return { events, damage: D(0), crit: false, struck: false };
    const crit = Math.random() < this.critChance;
    // critMult can be fractional (Metal Head +0.2x); round so damage is always an int.
    const damage = roundD(this.searchPower.mul(crit ? this.critMult : 1));
    this.nodeDamage = this.nodeDamage.add(damage);
    this.resolveNode(events);
    return { events, damage, crit, struck: true };
  }

  /** Collect one Moth (the floor-independent click-to-catch rare). */
  collectMoth(): void {
    this.resources['moth'] = (this.resources['moth'] ?? D(0)).add(1);
    this.stats.resourcesFound += 1;
    this.lifetimeResourcesCollected += 1;
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
    else if (quality) { gain += this.qualityBonus; this.stats.qualityFinds += 1; }
    if (this.nodeIsEasyAccess) this.stats.easyAccessFinds += 1;   // brittle node mined (independent of grade)
    this.resources[ore.resource] = (this.resources[ore.resource] ?? D(0)).add(gain);   // inventory (uncapped)
    this.stats.resourcesFound += gain;
    this.lifetimeResourcesCollected += gain;
    this.exploration = Math.min(ore.required, this.exploration + gain);                 // descend progress (capped)
    events.push({ type: 'resource', message: `+ ${RESOURCES[ore.resource].name}${tierSuffix(ore.tier)}`, color: '#7CFF7C', iconKey: ore.resource, value: gain, quality, mint });

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
    // New level starts at 0 (never visited)
    this.exploration = this.explorationPerLevel[this.currentLevel] ?? 0;
    this.respawnMsLeft = 0;
    this.spawnFreshNode();
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
    let autoDamage: Big | undefined;

    // 1. Idle auto-search (drone). Skipped while a node is respawning. The batch
    //    can roll a lucky find (crit) just like a manual tap — same chance/×.
    if (!this.isRespawning) {
      autoCrit = Math.random() < this.critChance;
      const hypeMult = this.hypeActive ? this.hypeMultiplier : 1;
      // crit (Metal Head can make it fractional) + hype multipliers → round to an int.
      const dmg = roundD(this.autoSearchPower.mul(autoCrit ? this.critMult : 1).mul(hypeMult));
      if (dmg.gt(0)) autoDamage = dmg;   // only surface a number when the drone is active
      this.nodeDamage = this.nodeDamage.add(dmg);
      this.resolveNode(events);
    }

    // 2. Atmosphere only — ambient flavor. No random loot. (Entities are coming
    //    back later; their flavor text is removed for now.)
    if (Math.random() < 0.45) {
      const msgs = lvl.ambientMessages;
      events.push({ type: 'ambient', message: msgs[Math.floor(Math.random() * msgs.length)], color: lvl.textColor });
    }

    return { events, autoDamage, autoCrit };
  }

  /* ---- Gear drops & equipping ---- */

  rollGearDrop(forceTier?: GearTier): GearDef | null {
    const eligible = GEAR_POOL.filter(g => this.currentLevel >= g.minLevelId);
    if (eligible.length === 0) return null;

    let tier: GearTier;
    if (forceTier) {
      tier = forceTier;
    } else {
      const danger = this.level.danger;
      const tierRoll = Math.random() * 100;
      if (tierRoll < danger) tier = 'legendary';
      else if (tierRoll < danger * 3) tier = 'rare';
      else if (tierRoll < danger * 6) tier = 'uncommon';
      else tier = 'common';
    }

    let pool = eligible.filter(g => g.tier === tier);
    if (pool.length === 0) pool = eligible;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  tryEquipGear(gear: GearDef, events: GameEvent[]): void {
    const current = this.equipment[gear.slot];
    const tierColor = GEAR_TIER_COLORS[gear.tier];

    if (!current) {
      this.equipment[gear.slot] = gear.id;
      events.push({
        type: 'event',
        message: `Found ${gear.name} (${gear.tier})! Equipped.`,
        color: tierColor,
        iconKey: gear.id,
      });
    } else {
      const currentGear = GEAR_POOL.find(g => g.id === current);
      if (currentGear && GEAR_TIER_VALUE[gear.tier] > GEAR_TIER_VALUE[currentGear.tier]) {
        this.equipment[gear.slot] = gear.id;
        events.push({
          type: 'event',
          message: `Found ${gear.name} (${gear.tier})! Replaced ${currentGear.name}.`,
          color: tierColor,
          iconKey: gear.id,
        });
      } else {
        events.push({
          type: 'event',
          message: `Found ${gear.name} (${gear.tier}) but kept current ${gear.slot} gear.`,
          color: '#888888',
          iconKey: gear.id,
        });
      }
    }
  }

  /* ---- Crafting ---- */

  canCraft(recipeId: string): boolean {
    const recipe = RECIPES.find(r => r.id === recipeId);
    if (!recipe) return false;
    return recipe.ingredients.every(
      ing => (this.resources[ing.resourceId] ?? D(0)).gte(ing.amount),
    );
  }

  craft(recipeId: string): GameEvent[] {
    const recipe = RECIPES.find(r => r.id === recipeId);
    if (!recipe || !this.canCraft(recipeId)) return [];

    const events: GameEvent[] = [];

    // Consume ingredients
    for (const ing of recipe.ingredients) {
      this.resources[ing.resourceId] = (this.resources[ing.resourceId] ?? D(0)).sub(ing.amount);
    }

    // Apply effect
    switch (recipe.effectType) {
      case 'healHP':
        this.health = Math.min(this.maxHealth, this.health + recipe.effectValue);
        events.push({ type: 'event', message: `Crafted ${recipe.name}: +${recipe.effectValue} HP`, color: '#88FF88' });
        break;
      case 'healSanity':
        this.sanity = Math.min(this.maxSanity, this.sanity + recipe.effectValue);
        events.push({ type: 'event', message: `Crafted ${recipe.name}: +${recipe.effectValue} Sanity`, color: '#88AAFF' });
        break;
      case 'fullHP':
        this.health = this.maxHealth;
        events.push({ type: 'event', message: `Crafted ${recipe.name}: Full HP!`, color: '#88FF88' });
        break;
      case 'fullSanity':
        this.sanity = this.maxSanity;
        events.push({ type: 'event', message: `Crafted ${recipe.name}: Full Sanity!`, color: '#88AAFF' });
        break;
      case 'buff':
        if (recipe.buffId === 'torch') {
          this.torchTicks = recipe.effectValue;
          events.push({ type: 'event', message: `Crafted ${recipe.name}: Fewer entities!`, color: '#FFAA44' });
        } else if (recipe.buffId === 'barricade') {
          this.barricadeTicks = recipe.effectValue;
          events.push({ type: 'event', message: `Crafted ${recipe.name}: Damage blocked!`, color: '#8888FF' });
        } else if (recipe.buffId === 'firesaltBomb') {
          this.firesaltBombActive = true;
          events.push({ type: 'event', message: `Crafted ${recipe.name}: Next entity auto-killed!`, color: '#FF4444' });
        }
        break;
    }

    return events;
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
    const fillSec = this.nodeDurabilityMax / effRate;     // seconds to drain one node
    const cycleSec = fillSec + this.nodeRespawnTime / 1000;
    const cycles = Math.floor(elapsedSec / cycleSec);
    if (cycles > 0) {
      // Fold in the average quality (+qualityBonus) and mint (+9) bonuses so offline ≈ live.
      const count = Math.round(cycles * (1 + this.qualityChance * this.qualityBonus + 9 * this.mintChance));
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

  /** Can rewind if player has reached level index 4+ (Electrical Station) */
  canRewind(): boolean {
    return this.currentLevel >= 4 || this.stats.levelsEscaped >= 4;
  }

  /** Calculate how many void fragments the player would earn from a rewind */
  calculateRewindFragments(): number {
    const fromLevels = this.stats.levelsEscaped * 2;
    const fromExploration = Math.floor(this.stats.totalExploration / 100);
    const totalUpgrades = Object.values(this.upgrades).reduce((s, v) => s + v, 0);
    const fromUpgrades = Math.floor(totalUpgrades * 0.5);
    const fromDeaths = Math.floor(this.stats.deaths * 0.3);
    return Math.max(1, Math.floor(fromLevels + fromExploration + fromUpgrades + fromDeaths));
  }

  /** Perform the rewind: reset run state, award fragments + shard, apply void bonuses */
  rewind(): number {
    const fragments = this.calculateRewindFragments();
    this.voidFragments += fragments;
    this.prestigeCount++;

    // Update max level unlocked based on prestige tiers
    for (const tier of PRESTIGE_TIERS) {
      if (this.prestigeCount >= tier.prestigeRequired && tier.unlocksLevelId !== null) {
        this.maxLevelUnlocked = Math.max(this.maxLevelUnlocked, tier.unlocksLevelId);
      }
    }

    // Reset run state
    this.currentLevel = 0;
    this.unlockedLevels = [0];
    this.exploration = 0;
    this.explorationPerLevel = {};

    // Reset resources with Pack Rat bonus
    for (const key of Object.keys(RESOURCES)) {
      this.resources[key] = D(0);
    }
    const packRatLvl = this.getVoidLevel('pack_rat');
    this.resources['almond_water'] = D(5 + packRatLvl * 3);
    this.resources['canned_food'] = D(packRatLvl * 2);

    // Reset upgrades
    for (const u of UPGRADES) {
      this.upgrades[u.id] = 0;
    }

    // Reset HP/Sanity to base (with void bonuses)
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

    // Reset equipment & bosses (gear resets on prestige)
    this.equipment = { head: null, body: null, feet: null, accessory: null };
    this.defeatedBosses = {};
    this.torchTicks = 0;
    this.firesaltBombActive = false;

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

  getVoidUpgradeCost(id: string): number {
    const def = VOID_UPGRADES.find((v) => v.id === id);
    if (!def) return Infinity;
    return def.costPerLevel;
  }

  canAffordVoidUpgrade(id: string): boolean {
    const def = VOID_UPGRADES.find((v) => v.id === id);
    if (!def) return false;
    if (this.getVoidLevel(id) >= def.maxLevel) return false;
    return this.voidFragments >= def.costPerLevel;
  }

  buyVoidUpgrade(id: string): boolean {
    const def = VOID_UPGRADES.find((v) => v.id === id);
    if (!def || !this.canAffordVoidUpgrade(id)) return false;
    this.voidFragments -= def.costPerLevel;
    this.voidUpgrades[id] = this.getVoidLevel(id) + 1;

    // Apply immediate effects for HP/Sanity void upgrades
    if (id === 'hardened_soul') {
      this.maxHealth = this.baseMaxHealth + this.getUpgradeLevel('tough_body') * 10;
    } else if (id === 'iron_psyche') {
      this.maxSanity = this.baseMaxSanity + this.getUpgradeLevel('strong_mind') * 10;
    }
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
      // Equipment
      equipment: { ...this.equipment },
      defeatedBosses: { ...this.defeatedBosses },
      torchTicks: this.torchTicks,
      firesaltBombActive: this.firesaltBombActive,
      // Void Shard shop
      voidShards: this.voidShards,
      shopUpgrades: { ...this.shopUpgrades },
      shardMaxedUpgrades: [...this.shardMaxedUpgrades],
      highestLevelReached: this.highestLevelReached,
      // Achievements (lifetime)
      lifetimeResourcesCollected: this.lifetimeResourcesCollected,
      achievementClaims: { ...this.achievementClaims },
      // Preferences
      autoEscape: this.autoEscape,
      hideMaxedUpgrades: this.hideMaxedUpgrades,
    };
  }

  loadSaveData(data: SaveData): void {
    this.currentLevel = data.currentLevel;
    this.unlockedLevels = data.unlockedLevels;
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

    // Equipment
    const savedEquip = data.equipment ?? {};
    this.equipment = {
      head: savedEquip['head'] ?? null,
      body: savedEquip['body'] ?? null,
      feet: savedEquip['feet'] ?? null,
      accessory: savedEquip['accessory'] ?? null,
    };
    this.defeatedBosses = data.defeatedBosses ?? {};
    this.torchTicks = data.torchTicks ?? 0;
    this.firesaltBombActive = data.firesaltBombActive ?? false;

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
    this.achievementClaims = data.achievementClaims ?? {};

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
