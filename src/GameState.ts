import {
  ENTITIES,
  UPGRADES,
  RESOURCES,
  VOID_UPGRADES,
  PRESTIGE_TIERS,
  ABILITIES,
  GEAR_POOL,
  GEAR_TIER_VALUE,
  GEAR_TIER_COLORS,
  EQUIP_SLOTS,
  RECIPES,
  SHOP_ITEMS,
  SHARD_MILESTONES,
  getLevel,
  getFloorOre,
  type LevelDef,
  type EquipSlot,
  type GearDef,
  type GearTier,
} from './data/GameData';
import { MAX_OFFLINE_TICKS } from './config';

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
  resources: Record<string, number>;
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
  // Shop (Phase 5)
  voidShards: number;
  purchasedItems: Record<string, boolean>;
  activeCosmetic: string | null;
  offlineBoostActive: boolean;
  autoScavengeActive: boolean;
  claimedShardMilestones: string[];
  // Starter pack permanent bonuses
  survivorsKitOwned: boolean;
  explorersKitOwned: boolean;
  scavengersKitOwned: boolean;
  // Preferences
  autoEscape: boolean;
}

export interface GameStats {
  totalExploration: number;
  entitiesEncountered: number;
  resourcesFound: number;
  deaths: number;
  levelsEscaped: number;
}

export interface GameEvent {
  type: 'ambient' | 'resource' | 'entity' | 'damage' | 'death' | 'system' | 'milestone' | 'event';
  message: string;
  color: string;
  iconKey?: string;
}

export interface TickResult {
  events: GameEvent[];
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
  nodeDamage = 0;                  // durability dealt to the current ore node
  resources: Record<string, number> = {};
  upgrades: Record<string, number> = {};
  stats: GameStats = {
    totalExploration: 0,
    entitiesEncountered: 0,
    resourcesFound: 0,
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

  // Shop (Phase 5) — permanent across all rewinds
  voidShards = 0;
  purchasedItems: Record<string, boolean> = {};
  activeCosmetic: string | null = null;
  offlineBoostActive = false;
  autoScavengeActive = false;
  claimedShardMilestones: string[] = [];
  survivorsKitOwned = false;
  explorersKitOwned = false;
  scavengersKitOwned = false;

  // Preferences
  autoEscape = true;

  constructor() {
    for (const key of Object.keys(RESOURCES)) {
      this.resources[key] = 0;
    }
    this.resources['almond_water'] = 5;
    for (const u of UPGRADES) {
      this.upgrades[u.id] = 0;
    }
    for (const v of VOID_UPGRADES) {
      this.voidUpgrades[v.id] = 0;
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

  getUpgradeLevel(id: string): number {
    return this.upgrades[id] ?? 0;
  }

  getUpgradeCost(id: string): number {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def) return Infinity;
    return Math.floor(def.baseCost * Math.pow(def.costMultiplier, this.getUpgradeLevel(id)));
  }

  canAffordUpgrade(id: string): boolean {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    if (this.getUpgradeLevel(id) >= def.maxLevel) return false;
    return (this.resources[def.costResource] ?? 0) >= this.getUpgradeCost(id);
  }

  buyUpgrade(id: string): boolean {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def || !this.canAffordUpgrade(id)) return false;
    this.resources[def.costResource] -= this.getUpgradeCost(id);
    this.upgrades[id] = this.getUpgradeLevel(id) + 1;
    return true;
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

  // Multiplicative + uncapped: each level multiplies, so the next purchase always
  // matters and exploration visibly accelerates.
  private upgradeMult(effect: string): number {
    let m = 1;
    for (const u of UPGRADES) {
      if (u.effect === effect) {
        const lvl = this.getUpgradeLevel(u.id);
        if (lvl > 0) m *= Math.pow(1 + u.effectPerLevel / 100, lvl);
      }
    }
    return m;
  }

  /** Durability damage per tap. */
  get clickPower(): number { return this.upgradeMult('power'); }
  /** Idle durability damage per tick. */
  get autoMineRate(): number { return 0.25 * this.upgradeMult('autoMine'); }
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
  get bonusOreChance(): number {
    let c = 0;
    for (const u of UPGRADES) {
      if (u.effect === 'bonusOre') c += (u.effectPerLevel / 100) * this.getUpgradeLevel(u.id);
    }
    return Math.min(0.9, c);
  }
  get healthRegen(): number {
    return this.getUpgradeLevel('regeneration') * 0.5;
  }
  get sanityRegen(): number {
    return this.getUpgradeLevel('meditation') * 0.5;
  }

  /** Base max HP including void bonuses + starter pack (before per-run upgrades) */
  get baseMaxHealth(): number {
    return 100 + this.getVoidLevel('hardened_soul') * 10
      + (this.survivorsKitOwned ? 20 : 0);
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
    if (this.resources['almond_water'] <= 0) return false;
    this.resources['almond_water']--;
    this.health = Math.min(this.maxHealth, this.health + 15);
    return true;
  }

  useCannedFood(): boolean {
    if (this.resources['canned_food'] <= 0) return false;
    this.resources['canned_food']--;
    this.sanity = Math.min(this.maxSanity, this.sanity + 20);
    return true;
  }

  /** One tap on the ore node (active mining). Cooldown is enforced by the UI. */
  manualSearch(): GameEvent[] {
    const events: GameEvent[] = [];
    this.nodeDamage += this.clickPower;
    this.resolveNode(events);
    return events;
  }

  /** Break any fully-damaged ore nodes into ore (active or idle). */
  private resolveNode(events: GameEvent[]): void {
    const ore = this.floorOre;
    const dur = this.nodeDurabilityMax;
    let loops = 0;
    while (this.nodeDamage >= dur && loops++ < 500) {
      this.nodeDamage -= dur;
      let gain = 1;
      if (Math.random() < this.bonusOreChance) gain += 1;
      this.resources[ore.resource] = (this.resources[ore.resource] ?? 0) + gain;   // inventory (uncapped)
      this.stats.resourcesFound += gain;
      this.exploration = Math.min(ore.required, this.exploration + gain);           // descend progress (capped)
      events.push({ type: 'resource', message: `+${gain} ${RESOURCES[ore.resource].name}`, color: '#7CFF7C', iconKey: ore.resource });
    }
  }

  /* ---- Level escape / travel ---- */

  canEscape(): boolean {
    // Descend as soon as the level is fully explored — no key, no combat gate.
    return this.explorationPct >= 100;
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
    this.nodeDamage = 0;
    this.stats.levelsEscaped++;
    this.totalDepth++;
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
    this.nodeDamage = 0;
    return true;
  }

  /* ---- Abilities ---- */

  canUseAbility(id: string): boolean {
    const def = ABILITIES.find(a => a.id === id);
    if (!def) return false;
    if ((this.abilityCooldowns[id] ?? 0) > 0) return false;
    return (this.resources[def.costResource] ?? 0) >= def.costAmount;
  }

  getAbilityCooldown(id: string): number {
    return this.abilityCooldowns[id] ?? 0;
  }

  useAbility(id: string): GameEvent[] {
    const def = ABILITIES.find(a => a.id === id);
    if (!def || !this.canUseAbility(id)) return [];

    const events: GameEvent[] = [];
    this.resources[def.costResource] -= def.costAmount;
    this.abilityCooldowns[id] = def.cooldownTicks;

    if (id === 'scavenge') {
      this.nodeDamage += this.clickPower * 6;
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

    // 1. Idle auto-mining (slow trickle of the floor's ore).
    this.nodeDamage += this.autoMineRate;
    this.resolveNode(events);

    // 2. Atmosphere only — entities drift past, ambient flavor. No random loot.
    const roll = Math.random();
    if (roll < 0.18 && lvl.entityIds.length > 0) {
      const entityId = lvl.entityIds[Math.floor(Math.random() * lvl.entityIds.length)];
      const entity = ENTITIES[entityId];
      if (entity) {
        this.stats.entitiesEncountered++;
        events.push({ type: 'entity', message: entity.encounterMessage, color: '#FF8800', iconKey: entityId });
      }
    } else if (roll < 0.45) {
      const msgs = lvl.ambientMessages;
      events.push({ type: 'ambient', message: msgs[Math.floor(Math.random() * msgs.length)], color: lvl.textColor });
    }

    return { events };
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
      ing => (this.resources[ing.resourceId] ?? 0) >= ing.amount,
    );
  }

  craft(recipeId: string): GameEvent[] {
    const recipe = RECIPES.find(r => r.id === recipeId);
    if (!recipe || !this.canCraft(recipeId)) return [];

    const events: GameEvent[] = [];

    // Consume ingredients
    for (const ing of recipe.ingredients) {
      this.resources[ing.resourceId] -= ing.amount;
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

  /* ---- Shop purchases ---- */

  canBuyShopItem(itemId: string): boolean {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return false;
    if (this.voidShards < item.cost) return false;
    if (item.oneTime && this.purchasedItems[itemId]) return false;
    return true;
  }

  buyShopItem(itemId: string): GameEvent[] {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item || !this.canBuyShopItem(itemId)) return [];

    const events: GameEvent[] = [];
    this.voidShards -= item.cost;

    if (item.oneTime) {
      this.purchasedItems[itemId] = true;
    }

    switch (itemId) {
      // Starter packs
      case 'survivors_kit':
        this.survivorsKitOwned = true;
        this.maxHealth = this.baseMaxHealth + this.getUpgradeLevel('tough_body') * 10;
        this.health = Math.min(this.health + 20, this.maxHealth);
        events.push({ type: 'event', message: `${item.name} activated! +20 base Max HP, +10 almond water per run.`, color: '#FFD700' });
        break;
      case 'explorers_kit':
        this.explorersKitOwned = true;
        events.push({ type: 'event', message: `${item.name} activated! +15% base explore speed.`, color: '#FFD700' });
        break;
      case 'scavengers_kit':
        this.scavengersKitOwned = true;
        events.push({ type: 'event', message: `${item.name} activated! +15% base find rate.`, color: '#FFD700' });
        break;

      // Convenience
      case 'resource_bundle': {
        const resKeys = Object.keys(RESOURCES).filter(k => k !== 'level_keys');
        for (const k of resKeys) {
          this.resources[k] = (this.resources[k] ?? 0) + 10;
        }
        events.push({ type: 'event', message: '+10 of each resource!', color: '#88FF88' });
        break;
      }
      case 'instant_prestige':
        // Handled externally — GameScene calls rewind() after this
        events.push({ type: 'event', message: 'Instant Prestige activated!', color: '#CC88FF' });
        break;
      case 'offline_boost':
        this.offlineBoostActive = true;
        events.push({ type: 'event', message: 'Next offline session will process 2x ticks!', color: '#88CCFF' });
        break;
      case 'auto_scavenge':
        this.autoScavengeActive = true;
        events.push({ type: 'event', message: 'Auto-Scavenge active for this run!', color: '#88FFAA' });
        break;

      // Cosmetics
      case 'crimson_wallpaper':
      case 'poolrooms_wallpaper':
      case 'static_wallpaper':
        this.activeCosmetic = itemId;
        events.push({ type: 'event', message: `${item.name} equipped!`, color: '#FFD700' });
        break;
      case 'gold_text':
        this.purchasedItems['gold_text'] = true;
        events.push({ type: 'event', message: 'Gold Text Theme unlocked!', color: '#FFD700' });
        break;
    }

    return events;
  }

  /** Check and claim any newly earned shard milestones */
  checkShardMilestones(): GameEvent[] {
    const events: GameEvent[] = [];
    for (const milestone of SHARD_MILESTONES) {
      if (this.claimedShardMilestones.includes(milestone.id)) continue;
      if (milestone.check(this)) {
        this.claimedShardMilestones.push(milestone.id);
        this.voidShards += milestone.reward;
        events.push({
          type: 'event',
          message: `ACHIEVEMENT: ${milestone.description}! +${milestone.reward} Void Shards`,
          color: '#CC88FF',
        });
      }
    }
    return events;
  }

  /* ---- Offline progress ---- */

  processOfflineTime(elapsedMs: number): { events: GameEvent[]; summary: OfflineSummary } {
    const events: GameEvent[] = [];
    const boostMult = this.offlineBoostActive ? 2 : 1;
    const ticks = Math.min(Math.floor(elapsedMs / 1500) * boostMult, this.offlineTickCap * boostMult);
    if (this.offlineBoostActive) {
      this.offlineBoostActive = false; // consumed
      events.push({ type: 'event', message: 'Offline Boost active! 2x offline progress.', color: '#88CCFF' });
    }
    const summary: OfflineSummary = { minutes: Math.floor(elapsedMs / 60000), resourcesFound: 0, explorationGained: 0 };
    if (ticks <= 0) return { events, summary };

    // Auto-mine the floor's ore for the elapsed (capped) ticks.
    const ore = this.floorOre;
    const before = this.resources[ore.resource] ?? 0;
    this.nodeDamage += this.autoMineRate * ticks;
    const mineEvents: GameEvent[] = [];
    this.resolveNode(mineEvents);
    summary.resourcesFound = Math.floor((this.resources[ore.resource] ?? 0) - before);

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

    // Award 1 Void Shard per prestige
    this.voidShards += 1;

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
      this.resources[key] = 0;
    }
    const packRatLvl = this.getVoidLevel('pack_rat');
    this.resources['almond_water'] = 5 + packRatLvl * 3 + (this.survivorsKitOwned ? 10 : 0);
    this.resources['canned_food'] = packRatLvl * 2;

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

    // Reset per-run shop effects
    this.autoScavengeActive = false;

    // Reset run stats (but NOT totalDepth or prestige stats)
    this.stats = {
      totalExploration: 0,
      entitiesEncountered: 0,
      resourcesFound: 0,
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
      resources: { ...this.resources },
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
      // Shop (Phase 5)
      voidShards: this.voidShards,
      purchasedItems: { ...this.purchasedItems },
      activeCosmetic: this.activeCosmetic,
      offlineBoostActive: this.offlineBoostActive,
      autoScavengeActive: this.autoScavengeActive,
      claimedShardMilestones: [...this.claimedShardMilestones],
      survivorsKitOwned: this.survivorsKitOwned,
      explorersKitOwned: this.explorersKitOwned,
      scavengersKitOwned: this.scavengersKitOwned,
      // Preferences
      autoEscape: this.autoEscape,
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
    this.resources = data.resources;
    this.upgrades = data.upgrades;
    this.stats = data.stats;
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

    // Shop (Phase 5)
    this.voidShards = data.voidShards ?? 0;
    this.purchasedItems = data.purchasedItems ?? {};
    this.activeCosmetic = data.activeCosmetic ?? null;
    this.offlineBoostActive = data.offlineBoostActive ?? false;
    this.autoScavengeActive = data.autoScavengeActive ?? false;
    this.claimedShardMilestones = data.claimedShardMilestones ?? [];
    this.survivorsKitOwned = data.survivorsKitOwned ?? false;
    this.explorersKitOwned = data.explorersKitOwned ?? false;
    this.scavengersKitOwned = data.scavengersKitOwned ?? false;

    // Preferences
    this.autoEscape = data.autoEscape ?? true;

    // Recalculate max HP/Sanity from both void and run upgrades
    this.maxHealth = Math.max(this.maxHealth, this.baseMaxHealth + this.getUpgradeLevel('tough_body') * 10);
    this.maxSanity = Math.max(this.maxSanity, this.baseMaxSanity + this.getUpgradeLevel('strong_mind') * 10);
  }
}
