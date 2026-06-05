import Phaser from 'phaser';
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { TICK_INTERVAL_MS, SAVE_INTERVAL_MS } from '../config';
import { GameState } from '../GameState';
import { UIManager } from '../ui/UIManager';

/* ------------------------------------------------------------------ */
/*  Lifecycle telemetry (module scope — runs once per import)          */
/* ------------------------------------------------------------------ */

RundotGameAPI.lifecycles.onPause(() =>
  RundotGameAPI.analytics.recordCustomEvent('game_paused'),
);
RundotGameAPI.lifecycles.onResume(() =>
  RundotGameAPI.analytics.recordCustomEvent('game_resumed'),
);
RundotGameAPI.lifecycles.onSleep(() =>
  RundotGameAPI.analytics.recordCustomEvent('game_sleep'),
);
RundotGameAPI.lifecycles.onQuit(() =>
  RundotGameAPI.analytics.recordCustomEvent('game_quit'),
);

/* ------------------------------------------------------------------ */
/*  Scene                                                              */
/* ------------------------------------------------------------------ */

export default class GameScene extends Phaser.Scene {
  private state!: GameState;
  private ui!: UIManager;
  private tickAcc = 0;
  private saveAcc = 0;
  private firstResourceFired = false;
  private firstEntityFired = false;
  private firstEscapeFired = false;

  constructor() {
    super('game');
  }

  preload(): void {
    this.load.image('wallpaper', 'wallpaper.png');

    // --- Icon assets ---
    // Resources (8)
    this.load.image('icon_almond_water', 'icons/resources/almond_water.png');
    this.load.image('icon_batteries', 'icons/resources/batteries.png');
    this.load.image('icon_canned_food', 'icons/resources/canned_food.png');
    this.load.image('icon_cloth_scraps', 'icons/resources/cloth_scraps.png');
    this.load.image('icon_firesalt', 'icons/resources/firesalt.png');
    this.load.image('icon_level_keys', 'icons/resources/level_keys.png');
    this.load.image('icon_lucky_coins', 'icons/resources/lucky_coins.png');
    this.load.image('icon_scrap_metal', 'icons/resources/scrap_metal.png');

    // Upgrades (8)
    this.load.image('icon_quick_feet', 'icons/upgrades/quick_feet.png');
    this.load.image('icon_sharp_eyes', 'icons/upgrades/sharp_eyes.png');
    this.load.image('icon_thick_skin', 'icons/upgrades/thick_skin.png');
    this.load.image('icon_iron_will', 'icons/upgrades/iron_will.png');
    this.load.image('icon_quiet_steps', 'icons/upgrades/quiet_steps.png');
    this.load.image('icon_scavenger', 'icons/upgrades/scavenger.png');
    this.load.image('icon_regeneration', 'icons/upgrades/regeneration.png');
    this.load.image('icon_meditation', 'icons/upgrades/meditation.png');

    // Entities (5)
    this.load.image('icon_smiler', 'icons/entities/smiler.png');
    this.load.image('icon_hound', 'icons/entities/hound.png');
    this.load.image('icon_skin_stealer', 'icons/entities/skin_stealer.png');
    this.load.image('icon_partygoer', 'icons/entities/partygoer.png');
    this.load.image('icon_wretched', 'icons/entities/the_wretched.png');

    // Abilities (3)
    this.load.image('icon_scavenge', 'icons/abilities/scavenge.png');
    this.load.image('icon_barricade', 'icons/abilities/barricade.png');
    this.load.image('icon_signal_flare', 'icons/abilities/signal_flare.png');

    // Equipment (6)
    this.load.image('icon_gas_mask', 'icons/equipment/gas_mask.png');
    this.load.image('icon_hazmat_suit', 'icons/equipment/hazmat_suit.png');
    this.load.image('icon_steel_toe_boots', 'icons/equipment/steel_toe_boots.png');
    this.load.image('icon_worn_flashlight', 'icons/equipment/worn_flashlight.png');
    this.load.image('icon_firesalt_pouch', 'icons/equipment/firesalt_pouch.png');
    this.load.image('icon_lucky_foot', 'icons/equipment/lucky_rabbits_foot.png');

    // Prestige (5)
    this.load.image('icon_void_fragment', 'icons/prestige/void_fragment.png');
    this.load.image('icon_void_shard', 'icons/prestige/void_shard.png');
    this.load.image('icon_rewind_button', 'icons/prestige/rewind_button.png');
    this.load.image('icon_vhs_tape', 'icons/prestige/vhs_tape.png');
    this.load.image('icon_depth_counter', 'icons/prestige/depth_counter.png');
  }

  /* ================================================================ */
  /*  Create                                                           */
  /* ================================================================ */

  async create(): Promise<void> {
    this.state = new GameState();
    this.tickAcc = 0;
    this.saveAcc = 0;
    this.firstResourceFired = false;
    this.firstEntityFired = false;
    this.firstEscapeFired = false;

    // Load saved progress
    await this.loadGame();

    // Build UI
    this.ui = new UIManager(this, this.state, {
      onHeal: () => this.handleHeal(),
      onEat: () => this.handleEat(),
      onSearch: () => this.handleSearch(),
      onBuyUpgrade: (id) => this.handleBuyUpgrade(id),
      onEscape: () => this.handleEscape(),
      onTravel: (lvl) => this.handleTravel(lvl),
      onTabChanged: (tab) => this.handleTabChanged(tab),
      onRewind: () => this.handleRewind(),
      onBuyVoidUpgrade: (id) => this.handleBuyVoidUpgrade(id),
      onUseAbility: (id) => this.handleUseAbility(id),
      onToggleAutoEscape: () => this.handleToggleAutoEscape(),
      onCraft: (id) => this.handleCraft(id),
      onBuyShopItem: (id) => this.handleBuyShopItem(id),
      onOpenStore: () => this.handleOpenStore(),
    });
    this.ui.createAll();

    // Initial log
    this.ui.addLogMessage({
      type: 'system',
      message: this.state.level.description,
      color: this.state.level.textColor,
    });
    this.ui.addLogMessage({
      type: 'system',
      message: 'You begin exploring...',
      color: '#AAAAAA',
    });

    RundotGameAPI.analytics.recordCustomEvent('game_started', {
      level: this.state.currentLevel,
    });
    RundotGameAPI.analytics.trackFunnelStep(1, 'game_started', 'session', 1);
  }

  /* ================================================================ */
  /*  Update loop                                                      */
  /* ================================================================ */

  update(_time: number, delta: number): void {
    if (!this.ui) return;

    // Smooth status bar animation every frame
    this.ui.updateStatusBars();

    // Tick accumulator
    this.tickAcc += delta;
    if (this.tickAcc >= TICK_INTERVAL_MS) {
      this.tickAcc -= TICK_INTERVAL_MS;
      this.processTick();
    }

    // Save accumulator
    this.saveAcc += delta;
    if (this.saveAcc >= SAVE_INTERVAL_MS) {
      this.saveAcc -= SAVE_INTERVAL_MS;
      this.saveGame();
    }
  }

  /* ================================================================ */
  /*  Tick processing                                                  */
  /* ================================================================ */

  private processTick(): void {
    const result = this.state.processTick();

    for (const evt of result.events) {
      this.ui.addLogMessage(evt);

      // Telemetry for specific events
      if (evt.type === 'resource') {
        if (!this.firstResourceFired) {
          this.firstResourceFired = true;
          RundotGameAPI.analytics.recordCustomEvent('first_resource_found');
          RundotGameAPI.analytics.trackFunnelStep(2, 'first_resource', 'session', 1);
        }
        RundotGameAPI.analytics.recordCustomEvent('resource_found');
      }

      if (evt.type === 'entity') {
        if (!this.firstEntityFired) {
          this.firstEntityFired = true;
          RundotGameAPI.analytics.recordCustomEvent('first_entity_encounter');
          RundotGameAPI.analytics.trackFunnelStep(3, 'first_entity', 'session', 1);
        }
      }

      if (evt.type === 'damage') {
        this.ui.flashDamage();
        RundotGameAPI.analytics.recordCustomEvent('entity_damage', {
          level: this.state.currentLevel,
        });
      }

      if (evt.type === 'death') {
        this.ui.flashDeath();
        RundotGameAPI.analytics.recordCustomEvent('player_died', {
          level: this.state.currentLevel,
          deaths: this.state.stats.deaths,
          had_coin_insurance: (this.state.resources['lucky_coins'] ?? 0) >= 5,
        });
      }

      if (evt.type === 'milestone') {
        RundotGameAPI.analytics.recordCustomEvent('milestone_reached', {
          level: this.state.currentLevel,
          message: evt.message,
        });
        RundotGameAPI.triggerHapticAsync('success' as never);
      }

      if (evt.type === 'event') {
        RundotGameAPI.analytics.recordCustomEvent('rare_event', {
          level: this.state.currentLevel,
          message: evt.message,
        });
      }
    }

    // Check shard milestones
    const milestoneEvts = this.state.checkShardMilestones();
    for (const evt of milestoneEvts) {
      this.ui.addLogMessage(evt);
      RundotGameAPI.analytics.recordCustomEvent('shard_milestone_claimed', {
        message: evt.message,
      });
    }

    // Update resource display and ability cooldowns
    this.ui.updateResourceBar();
    this.ui.refreshAbilities();

    // Auto-escape: if enabled and conditions met, advance to next level
    if (this.state.autoEscape && this.state.canEscape()) {
      this.handleEscape();
    }
  }

  /* ================================================================ */
  /*  UI callbacks                                                     */
  /* ================================================================ */

  private handleHeal(): void {
    if (this.state.useAlmondWater()) {
      this.ui.addLogMessage({
        type: 'system',
        message: 'You drink almond water. (+15 HP)',
        color: '#44FF44',
      });
      this.ui.updateResourceBar();
      RundotGameAPI.analytics.recordCustomEvent('item_used', { item: 'almond_water' });
      RundotGameAPI.triggerHapticAsync('light' as never);
    }
  }

  private handleEat(): void {
    if (this.state.useCannedFood()) {
      this.ui.addLogMessage({
        type: 'system',
        message: 'You eat canned food. (+20 Sanity)',
        color: '#4488FF',
      });
      this.ui.updateResourceBar();
      RundotGameAPI.analytics.recordCustomEvent('item_used', { item: 'canned_food' });
      RundotGameAPI.triggerHapticAsync('light' as never);
    }
  }

  private handleSearch(): void {
    const events = this.state.manualSearch();
    for (const evt of events) this.ui.addLogMessage(evt);
    this.ui.updateResourceBar();
    RundotGameAPI.triggerHapticAsync('light' as never);
  }

  private handleBuyUpgrade(id: string): void {
    if (this.state.buyUpgrade(id)) {
      this.ui.addLogMessage({
        type: 'system',
        message: `Upgraded: ${id.replace(/_/g, ' ')}!`,
        color: '#FFD700',
      });
      this.ui.refreshUpgradePanel();
      this.ui.updateResourceBar();
      RundotGameAPI.analytics.recordCustomEvent('upgrade_purchased', {
        upgrade: id,
        level: this.state.getUpgradeLevel(id),
      });
      RundotGameAPI.triggerHapticAsync('success' as never);
      this.saveGame();
    }
  }

  private handleEscape(): void {
    if (this.state.escape()) {
      if (!this.firstEscapeFired) {
        this.firstEscapeFired = true;
        RundotGameAPI.analytics.trackFunnelStep(4, 'first_escape', 'session', 1);
      }
      RundotGameAPI.analytics.recordCustomEvent('level_escaped', {
        to_level: this.state.currentLevel,
        total_escapes: this.state.stats.levelsEscaped,
      });
      RundotGameAPI.triggerHapticAsync('success' as never);
      this.ui.refreshForNewLevel();
      this.ui.showTab('explore');
      this.saveGame();
    }
  }

  private handleTravel(levelId: number): void {
    const from = this.state.currentLevel;
    if (this.state.travelTo(levelId)) {
      RundotGameAPI.analytics.recordCustomEvent('level_traveled', {
        from,
        to: levelId,
      });
      RundotGameAPI.triggerHapticAsync('light' as never);
      this.ui.refreshForNewLevel();
      this.ui.showTab('explore');
      this.saveGame();
    }
  }

  private handleTabChanged(tab: string): void {
    RundotGameAPI.analytics.recordCustomEvent('tab_switched', { tab });
    RundotGameAPI.triggerHapticAsync('light' as never);
  }

  private handleRewind(): void {
    if (!this.state.canRewind()) return;
    const fragments = this.state.calculateRewindFragments();

    RundotGameAPI.analytics.recordCustomEvent('prestige_rewind', {
      prestige_number: this.state.prestigeCount + 1,
      fragments_earned: fragments,
      total_depth: this.state.totalDepth,
      levels_cleared: this.state.stats.levelsEscaped,
    });

    // Perform the rewind
    const earned = this.state.rewind();

    // Play VHS effect, then rebuild the scene
    this.ui.playRewindEffect(earned, () => {
      // Restart the scene to fully rebuild UI (tab bar may change)
      this.saveGame();
      this.scene.restart();
    });
  }

  private handleToggleAutoEscape(): void {
    this.state.autoEscape = !this.state.autoEscape;
    this.ui.refreshAutoEscape();
    this.ui.addLogMessage({
      type: 'system',
      message: this.state.autoEscape ? 'Auto-escape: ON' : 'Auto-escape: OFF',
      color: this.state.autoEscape ? '#88FF88' : '#888888',
    });
    RundotGameAPI.analytics.recordCustomEvent('auto_escape_toggled', {
      enabled: this.state.autoEscape,
    });
    RundotGameAPI.triggerHapticAsync('light' as never);
    this.saveGame();
  }

  private handleUseAbility(id: string): void {
    const events = this.state.useAbility(id);
    if (events.length > 0) {
      for (const evt of events) {
        this.ui.addLogMessage(evt);
      }
      this.ui.updateResourceBar();
      this.ui.refreshAbilities();
      RundotGameAPI.analytics.recordCustomEvent('ability_used', {
        ability: id,
        level: this.state.currentLevel,
      });
      RundotGameAPI.triggerHapticAsync('light' as never);
      this.saveGame();
    }
  }

  private handleCraft(recipeId: string): void {
    const events = this.state.craft(recipeId);
    if (events.length > 0) {
      for (const evt of events) {
        this.ui.addLogMessage(evt);
      }
      this.ui.updateResourceBar();
      this.ui.refreshGearPanel();
      RundotGameAPI.analytics.recordCustomEvent('item_crafted', {
        recipe: recipeId,
        level: this.state.currentLevel,
      });
      RundotGameAPI.triggerHapticAsync('success' as never);
      this.saveGame();
    }
  }

  private handleBuyShopItem(itemId: string): void {
    // Special case: instant prestige — buy then rewind
    if (itemId === 'instant_prestige') {
      if (!this.state.canBuyShopItem(itemId)) return;
      if (!this.state.canRewind()) {
        this.ui.addLogMessage({
          type: 'system',
          message: 'You need to reach Level 4 before you can Rewind.',
          color: '#FF8888',
        });
        return;
      }
      const buyEvents = this.state.buyShopItem(itemId);
      for (const evt of buyEvents) this.ui.addLogMessage(evt);
      RundotGameAPI.analytics.recordCustomEvent('shop_purchase', { item: itemId, cost: 8 });
      // Trigger rewind
      this.handleRewind();
      return;
    }

    const events = this.state.buyShopItem(itemId);
    if (events.length > 0) {
      for (const evt of events) this.ui.addLogMessage(evt);
      this.ui.updateResourceBar();
      this.ui.refreshShopPanel();

      // Check shard milestones after purchase
      const milestoneEvents = this.state.checkShardMilestones();
      for (const evt of milestoneEvents) this.ui.addLogMessage(evt);
      if (milestoneEvents.length > 0) this.ui.refreshShopPanel();

      const item = this.state.purchasedItems[itemId] !== undefined ? itemId : 'unknown';
      RundotGameAPI.analytics.recordCustomEvent('shop_purchase', {
        item,
        shards_remaining: this.state.voidShards,
      });
      RundotGameAPI.triggerHapticAsync('success' as never);
      this.saveGame();
    }
  }

  private async handleOpenStore(): Promise<void> {
    RundotGameAPI.analytics.recordCustomEvent('shop_store_opened');
    try {
      await RundotGameAPI.iap.openStore();
      // After returning from store, refresh the balance
      const balance = await RundotGameAPI.iap.getHardCurrencyBalance();
      if (balance > 0) {
        // Convert hard currency to Void Shards (1:1 ratio)
        const result = await RundotGameAPI.iap.spendCurrency('void_shards', balance);
        if (result && result.success !== false) {
          this.state.voidShards += balance;
          this.ui.addLogMessage({
            type: 'event',
            message: `+${balance} Void Shards purchased!`,
            color: '#CC88FF',
          });
          this.ui.refreshShopPanel();
          RundotGameAPI.analytics.recordCustomEvent('shards_purchased', {
            amount: balance,
            total: this.state.voidShards,
          });
          RundotGameAPI.triggerHapticAsync('success' as never);
          this.saveGame();
        }
      }
    } catch {
      // Store might not be available in sandbox — silently handle
      this.ui.addLogMessage({
        type: 'system',
        message: 'Store is not available right now.',
        color: '#888888',
      });
    }
  }

  private handleBuyVoidUpgrade(id: string): void {
    if (this.state.buyVoidUpgrade(id)) {
      this.ui.addLogMessage({
        type: 'system',
        message: `Void upgrade: ${id.replace(/_/g, ' ')}!`,
        color: '#CC88FF',
      });
      this.ui.updateResourceBar();
      this.ui.refreshVoidPanel();
      RundotGameAPI.analytics.recordCustomEvent('void_upgrade_purchased', {
        upgrade: id,
        level: this.state.getVoidLevel(id),
        fragments_remaining: this.state.voidFragments,
      });
      RundotGameAPI.triggerHapticAsync('success' as never);
      this.saveGame();
    }
  }

  /* ================================================================ */
  /*  Save / Load                                                      */
  /* ================================================================ */

  private async saveGame(): Promise<void> {
    try {
      const data = this.state.toSaveData();
      await RundotGameAPI.appStorage.setItem('backrooms_save', JSON.stringify(data));
    } catch (err) {
      RundotGameAPI.log(`[Save] Error: ${err}`);
    }
  }

  private async loadGame(): Promise<void> {
    try {
      const raw = await RundotGameAPI.appStorage.getItem('backrooms_save');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && data.version === 1) {
        this.state.loadSaveData(data);

        // Offline progress
        if (data.lastSaveTime) {
          const elapsed = Date.now() - data.lastSaveTime;
          if (elapsed > 5000) {
            const { events: offlineEvents, summary } = this.state.processOfflineTime(elapsed);
            this.time.delayedCall(500, () => {
              for (const evt of offlineEvents) {
                this.ui.addLogMessage(evt);
              }
              this.ui.updateResourceBar();
              if (summary.minutes > 0) {
                this.ui.showWelcomeBack(summary);
                RundotGameAPI.analytics.recordCustomEvent('offline_progress', {
                  elapsed_min: summary.minutes,
                  resources: summary.resourcesFound,
                  exploration: summary.explorationGained,
                });
              }
            });
          }
        }
      }
    } catch (err) {
      RundotGameAPI.log(`[Load] Error: ${err}`);
    }
  }
}
