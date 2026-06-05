import {
  ENTITIES,
  UPGRADES,
  RESOURCES,
  VOID_UPGRADES,
  PRESTIGE_TIERS,
  ABILITIES,
  MILESTONE_THRESHOLDS,
  MEMORY_FRAGMENT_LORE,
  WANDERER_TRADES,
  GEAR_POOL,
  GEAR_TIER_VALUE,
  GEAR_TIER_COLORS,
  EQUIP_SLOTS,
  RECIPES,
  SHOP_ITEMS,
  SHARD_MILESTONES,
  getLevel,
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
  exploration = 0;
  explorationPerLevel: Record<number, number> = {};
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

  get explorationPct(): number {
    return Math.min(100, (this.exploration / this.level.explorationRequired) * 100);
  }

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

  get explorationSpeed(): number { return this.upgradeMult('exploreSpeed'); }
  get findRateBonus(): number { return this.upgradeMult('findRate'); }
  get findAmountMult(): number { return this.upgradeMult('findAmount'); }
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
  get doubleResourceChance(): number {
    let c = 0;
    for (const u of UPGRADES) {
      if (u.effect === 'doubleChance') c += (u.effectPerLevel / 100) * this.getUpgradeLevel(u.id);
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

  /** Tap/hold to explore — advances exploration faster than idle, and may find loot. */
  manualSearch(): GameEvent[] {
    const events: GameEvent[] = [];
    const lvl = this.level;

    // Active exploring advances the bar in ~2% steps (much faster than idle).
    const step = lvl.explorationRequired * 0.02;
    this.exploration = Math.min(lvl.explorationRequired, this.exploration + step);
    this.stats.totalExploration += step;
    this.checkMilestones(events);

    // Chance to turn up a resource on the tap.
    if (Math.random() < 0.45 * this.findRateBonus) {
      const found = this.rollResourceDrop(lvl);
      if (found) {
        let amount = Math.max(1, Math.round(found.amount * this.findAmountMult));
        if (Math.random() < this.doubleResourceChance) amount *= 2;
        this.resources[found.resourceId] = (this.resources[found.resourceId] ?? 0) + amount;
        this.stats.resourcesFound += amount;
        events.push({ type: 'resource', message: `+${amount} ${RESOURCES[found.resourceId].name}`, color: '#7CFF7C', iconKey: found.resourceId });
      }
    }
    return events;
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
      const rolls = 3 + Math.floor(Math.random() * 3);
      let totalFound = 0;
      for (let i = 0; i < rolls; i++) {
        const found = this.rollResourceDrop(this.level);
        if (found) {
          let amount = found.amount;
          if (this.signalFlareTicks > 0) amount *= 2;
          this.resources[found.resourceId] = (this.resources[found.resourceId] ?? 0) + amount;
          this.stats.resourcesFound += amount;
          totalFound += amount;
        }
      }
      events.push({
        type: 'event',
        message: `Scavenged the area! (+${totalFound} resources)`,
        color: '#88FFAA',
        iconKey: 'scavenge',
      });
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

    // 1. Exploration progress
    const exploreAmt = 1 * this.explorationSpeed;
    this.exploration = Math.min(lvl.explorationRequired, this.exploration + exploreAmt);
    this.stats.totalExploration += exploreAmt;

    // 1b. Check milestones
    this.checkMilestones(events);

    // 2. Random events
    const roll = Math.random();
    const entityChance = 0.25 + lvl.danger * 0.04;

    if (roll < 0.25) {
      // Resource find attempt
      if (Math.random() < 0.5 * this.findRateBonus) {
        const found = this.rollResourceDrop(lvl);
        if (found) {
          let amount = Math.max(1, Math.round(found.amount * this.findAmountMult));
          if (Math.random() < this.doubleResourceChance) {
            amount *= 2;
            events.push({
              type: 'resource',
              message: `Double find! +${amount} ${RESOURCES[found.resourceId].name}`,
              color: '#FFD700',
              iconKey: found.resourceId,
            });
          } else {
            events.push({
              type: 'resource',
              message: `Found +${amount} ${RESOURCES[found.resourceId].name}`,
              color: '#44FF44',
              iconKey: found.resourceId,
            });
          }
          this.resources[found.resourceId] = (this.resources[found.resourceId] ?? 0) + amount;
          this.stats.resourcesFound += amount;
        }
      }
    } else if (roll < entityChance) {
      // Entity drifts past — pure atmosphere for now (clickable bonus comes in a later slice)
      const entityId = lvl.entityIds[Math.floor(Math.random() * lvl.entityIds.length)];
      const entity = ENTITIES[entityId];
      if (entity) {
        this.stats.entitiesEncountered++;
        events.push({ type: 'entity', message: entity.encounterMessage, color: '#FF8800', iconKey: entityId });
      }
    } else if (roll < 0.6) {
      // Ambient message
      const msgs = lvl.ambientMessages;
      events.push({
        type: 'ambient',
        message: msgs[Math.floor(Math.random() * msgs.length)],
        color: lvl.textColor,
      });
    }

    // 3. Rare events (hidden rooms, caches, wanderers, memory fragments)
    this.rollRareEvent(events);

    // 4. Nudge to descend once the level is fully explored
    if (this.explorationPct >= 100 && Math.random() < 0.05) {
      events.push({
        type: 'system',
        message: 'You\'ve explored this level. An exit waits deeper...',
        color: '#FFD700',
      });
    }

    return { events };
  }

  /* ---- Resource drop roll ---- */

  private rollResourceDrop(lvl: LevelDef): { resourceId: string; amount: number } | null {
    // Triple key drop weight when fully explored
    const drops = lvl.resourceDrops.map((d) => {
      if (d.resourceId === 'level_keys' && this.explorationPct >= 100) {
        return { ...d, weight: d.weight * 3 };
      }
      return d;
    });

    const totalWeight = drops.reduce((sum, d) => sum + d.weight, 0);
    let r = Math.random() * totalWeight;
    for (const drop of drops) {
      r -= drop.weight;
      if (r <= 0) {
        const amount =
          drop.minAmount + Math.floor(Math.random() * (drop.maxAmount - drop.minAmount + 1));
        return { resourceId: drop.resourceId, amount };
      }
    }
    return null;
  }

  /* ---- Milestones ---- */

  private checkMilestones(events: GameEvent[]): void {
    const pct = this.explorationPct;
    const claimed = this.claimedMilestones[this.currentLevel] ?? [];

    for (const threshold of MILESTONE_THRESHOLDS) {
      if (pct >= threshold && !claimed.includes(threshold)) {
        if (!this.claimedMilestones[this.currentLevel]) {
          this.claimedMilestones[this.currentLevel] = [];
        }
        this.claimedMilestones[this.currentLevel].push(threshold);
        this.awardMilestone(threshold, events);
      }
    }
  }

  private awardMilestone(threshold: number, events: GameEvent[]): void {
    events.push({
      type: 'milestone',
      message: `MILESTONE ${threshold}%`,
      color: '#FFD700',
    });

    // Standard milestone rewards
    let dropCount: number;
    switch (threshold) {
      case 25: dropCount = 3 + Math.floor(Math.random() * 3); break;
      case 50: dropCount = 5 + Math.floor(Math.random() * 4); break;
      case 75: dropCount = 8 + Math.floor(Math.random() * 5); break;
      case 100: dropCount = 5; break;
      default: return;
    }

    let totalFound = 0;
    for (let i = 0; i < dropCount; i++) {
      const found = this.rollResourceDrop(this.level);
      if (found) {
        this.resources[found.resourceId] = (this.resources[found.resourceId] ?? 0) + found.amount;
        this.stats.resourcesFound += found.amount;
        totalFound += found.amount;
      }
    }

    if (threshold === 50) {
      const bonus = 2;
      this.resources['firesalt'] = (this.resources['firesalt'] ?? 0) + bonus;
      events.push({ type: 'resource', message: `Milestone bonus: +${bonus} Firesalt`, color: '#FF8844', iconKey: 'firesalt' });
    }

    events.push({
      type: 'resource',
      message: `Supply cache found! (+${totalFound} resources)`,
      color: '#88FF88',
    });
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

  /* ---- Rare events ---- */

  private rollRareEvent(events: GameEvent[]): void {
    const rareRoll = Math.random();

    if (rareRoll < 0.02) {
      // Hidden Room (2%)
      const drops = 3 + Math.floor(Math.random() * 3);
      let totalFound = 0;
      for (let i = 0; i < drops; i++) {
        const found = this.rollResourceDrop(this.level);
        if (found) {
          this.resources[found.resourceId] = (this.resources[found.resourceId] ?? 0) + found.amount;
          this.stats.resourcesFound += found.amount;
          totalFound += found.amount;
        }
      }
      events.push({ type: 'event', message: 'You find a hidden room behind the wall...', color: '#FFAA44' });
      events.push({ type: 'resource', message: `Searched the room! (+${totalFound} resources)`, color: '#88FF88' });
    } else if (rareRoll < 0.035) {
      // Supply Cache (1.5%)
      const drops = 5 + Math.floor(Math.random() * 4);
      let totalFound = 0;
      for (let i = 0; i < drops; i++) {
        const found = this.rollResourceDrop(this.level);
        if (found) {
          this.resources[found.resourceId] = (this.resources[found.resourceId] ?? 0) + found.amount;
          this.stats.resourcesFound += found.amount;
          totalFound += found.amount;
        }
      }
      events.push({ type: 'event', message: 'You stumble upon an old supply cache!', color: '#FFAA44' });
      events.push({ type: 'resource', message: `Looted the cache! (+${totalFound} resources)`, color: '#88FF88' });
    } else if (rareRoll < 0.045) {
      // Wanderer NPC (1%)
      const trade = WANDERER_TRADES[Math.floor(Math.random() * WANDERER_TRADES.length)];
      events.push({ type: 'event', message: 'A wanderer emerges from the shadows...', color: '#FFCC44' });
      events.push({ type: 'event', message: trade.dialogue, color: '#DDDDAA' });
      if ((this.resources[trade.giveResource] ?? 0) >= trade.giveAmount) {
        this.resources[trade.giveResource] -= trade.giveAmount;
        this.resources[trade.receiveResource] = (this.resources[trade.receiveResource] ?? 0) + trade.receiveAmount;
        const giveRes = RESOURCES[trade.giveResource];
        const receiveRes = RESOURCES[trade.receiveResource];
        events.push({
          type: 'resource',
          message: `Traded ${trade.giveAmount} ${giveRes.name} for ${trade.receiveAmount} ${receiveRes.name}!`,
          color: '#88FF88',
        });
      } else {
        events.push({ type: 'event', message: 'You don\'t have enough to trade. The wanderer vanishes.', color: '#888888' });
      }
    } else if (rareRoll < 0.065) {
      // Unstable Floor (2%)
      const otherLevels = this.unlockedLevels.filter(l => l !== this.currentLevel);
      if (otherLevels.length > 0) {
        const randomLvlId = otherLevels[Math.floor(Math.random() * otherLevels.length)];
        const randomLvl = getLevel(randomLvlId);
        const drops = 2 + Math.floor(Math.random() * 3);
        let totalFound = 0;
        for (let i = 0; i < drops; i++) {
          const found = this.rollResourceDrop(randomLvl);
          if (found) {
            this.resources[found.resourceId] = (this.resources[found.resourceId] ?? 0) + found.amount;
            this.stats.resourcesFound += found.amount;
            totalFound += found.amount;
          }
        }
        events.push({ type: 'event', message: `The floor collapses! You glimpse ${randomLvl.name}...`, color: '#FF88FF' });
        events.push({ type: 'resource', message: `Grabbed ${totalFound} resources before climbing back!`, color: '#88FF88' });
      }
    } else if (rareRoll < 0.07) {
      // Memory Fragment (0.5%)
      this.memoryFragments++;
      const lore = MEMORY_FRAGMENT_LORE[(this.memoryFragments - 1) % MEMORY_FRAGMENT_LORE.length];
      events.push({ type: 'event', message: `MEMORY FRAGMENT #${this.memoryFragments}`, color: '#CC88FF', iconKey: 'vhs_tape' });
      events.push({ type: 'event', message: lore, color: '#9988CC' });

      // 25% chance to award a Void Shard from memory fragments
      if (Math.random() < 0.25) {
        this.voidShards += 1;
        events.push({ type: 'event', message: 'The fragment resonates... +1 Void Shard!', color: '#CC88FF', iconKey: 'void_shard' });
      }
    }
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

    const startExpl = this.exploration;
    for (let i = 0; i < ticks; i++) {
      const lvl = this.level;
      this.exploration = Math.min(
        lvl.explorationRequired,
        this.exploration + 1 * this.explorationSpeed,
      );
      if (Math.random() < 0.15) {
        const found = this.rollResourceDrop(lvl);
        if (found) {
          this.resources[found.resourceId] =
            (this.resources[found.resourceId] ?? 0) + found.amount;
          summary.resourcesFound += found.amount;
        }
      }
      if (this.healthRegen > 0) {
        this.health = Math.min(this.maxHealth, this.health + this.healthRegen);
      }
      if (this.sanityRegen > 0) {
        this.sanity = Math.min(this.maxSanity, this.sanity + this.sanityRegen);
      }
    }
    summary.explorationGained = Math.floor(this.exploration - startExpl);

    // Sync per-level exploration
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
