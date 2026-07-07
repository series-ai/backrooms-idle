import Phaser from 'phaser';
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { TICK_INTERVAL_MS, SAVE_INTERVAL_MS } from '../config';
import { GameState, type GameEvent } from '../GameState';
import { haptic, bindHapticsSetting } from '../haptics';
import { UIManager } from '../ui/UIManager';
import { ORE_SEQUENCE } from '../data/GameData';

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
    // Resources — all 31 explorable resources (one per floor, cycling by tier)
    for (const id of ORE_SEQUENCE) {
      this.load.image(`icon_${id}`, `icons/resources/${id}.png`);
    }
    // Dormant currencies — firesalt/keys moved out of the resources folder
    this.load.image('icon_firesalt', 'icons/equipment/firesalt.png');
    this.load.image('icon_level_keys', 'icons/equipment/level_keys.png');

    // Upgrades (8)
    this.load.image('icon_quick_feet', 'icons/upgrades/quick_feet.png');
    this.load.image('icon_sharp_eyes', 'icons/upgrades/sharp_eyes.png');
    this.load.image('icon_thick_skin', 'icons/upgrades/thick_skin.png');
    this.load.image('icon_iron_will', 'icons/upgrades/iron_will.png');
    this.load.image('icon_quiet_steps', 'icons/upgrades/quiet_steps.png');
    this.load.image('icon_scavenger', 'icons/upgrades/scavenger.png');
    this.load.image('icon_regeneration', 'icons/upgrades/regeneration.png');
    this.load.image('icon_meditation', 'icons/upgrades/meditation.png');

    // Entities (the danger layer's encounter art)
    this.load.image('icon_smiler', 'icons/entities/smiler.png');
    this.load.image('icon_hound', 'icons/entities/hound.png');
    this.load.image('icon_skin_stealer', 'icons/entities/skin_stealer.png');
    this.load.image('icon_partygoer', 'icons/entities/partygoer.png');
    this.load.image('icon_wretched', 'icons/entities/the_wretched.png');
    this.load.image('icon_clump', 'icons/entities/clump.png');
    this.load.image('icon_doll_face', 'icons/entities/doll_face.png');
    this.load.image('icon_scrambles', 'icons/entities/scrambles.png');
    this.load.image('icon_corpus_vitis', 'icons/entities/corpus_vitis.png');
    this.load.image('icon_lucky_crane', 'icons/entities/lucky_crane.png');
    this.load.image('icon_moth', 'icons/entities/moth.png');   // flying collectible + Moth resource
    this.load.image('icon_crimson_watcher', 'icons/entities/CrimsonWatcher.png');
    this.load.image('icon_ink_crawler', 'icons/entities/InkCrawler.png');
    this.load.image('icon_archivist', 'icons/entities/TheArchivist.png');
    this.load.image('icon_frost_shade', 'icons/entities/FrostShade.png');

    // Abilities (3)
    this.load.image('icon_scavenge', 'icons/abilities/scavenge.png');
    this.load.image('icon_barricade', 'icons/abilities/barricade.png');
    this.load.image('icon_signal_flare', 'icons/abilities/signal_flare.png');

    // Equipment / gear (the craftable loadout in the GEAR menu)
    this.load.image('icon_gas_mask', 'icons/equipment/gas_mask.png');
    this.load.image('icon_hazmat_suit', 'icons/equipment/hazmat_suit.png');
    this.load.image('icon_steel_toe_boots', 'icons/equipment/steel_toe_boots.png');
    this.load.image('icon_worn_flashlight', 'icons/equipment/worn_flashlight.png');
    this.load.image('icon_firesalt_pouch', 'icons/equipment/firesalt_pouch.png');
    this.load.image('icon_lucky_foot', 'icons/equipment/lucky_rabbits_foot.png');
    this.load.image('icon_crowbar', 'icons/equipment/crowbar.png');
    this.load.image('icon_combat_knife', 'icons/equipment/combat_knife.png');
    this.load.image('icon_vhs_camera', 'icons/equipment/vhs_camera.png');
    this.load.image('icon_watch', 'icons/equipment/watch.png');
    // Weapon slot gear
    this.load.image('icon_pipe_pistol', 'icons/equipment/PipePistol.png');
    this.load.image('icon_scrap_shotgun', 'icons/equipment/ScrapShotgun.png');
    this.load.image('icon_salvaged_ar', 'icons/equipment/SalvagedAR.png');
    this.load.image('icon_impossible_gun', 'icons/equipment/ImpossibleGun.png');
    // Scrap currency (gear header)
    this.load.image('icon_scrap', 'icons/equipment/Scrap.png');

    // Pets (texture key = pet id; see PETS in GameData)
    this.load.image('icon_pet_static', 'icons/pets/Static.png');
    this.load.image('icon_pet_snapshot', 'icons/pets/Snapshot.png');
    this.load.image('icon_pet_balloon', 'icons/pets/PartyBalloon.png');
    this.load.image('icon_pet_cat', 'icons/pets/BlackCat.png');

    // Prestige (5)
    this.load.image('icon_void_fragment', 'icons/prestige/void_fragment.png');
    this.load.image('icon_void_shard', 'icons/prestige/void_shard.png');
    this.load.image('icon_rewind_button', 'icons/prestige/rewind_button.png');
    this.load.image('icon_depth_counter', 'icons/prestige/depth_counter.png');

    // Player character sprite sheets (buddy1..buddy6). Each sheet is a uniform
    // 128px grid, 1024×3840 (8 cols × 30 rows). buddy1 = the starting character;
    // buddy2..6 are alternate "suits" earned via upgrades later. See
    // public/sprites/OuterBuddies/buddy_spritesheet.json for the full frame map.
    for (let i = 1; i <= 6; i++) {
      this.load.spritesheet(`buddy${i}`, `sprites/OuterBuddies/buddy${i}.png`, {
        frameWidth: 128,
        frameHeight: 128,
      });
    }
  }

  /* ================================================================ */
  /*  Create                                                           */
  /* ================================================================ */

  async create(): Promise<void> {
    this.state = new GameState();
    bindHapticsSetting(() => this.state.hapticsEnabled);
    this.tickAcc = 0;
    this.saveAcc = 0;
    this.firstResourceFired = false;
    this.firstEntityFired = false;
    this.firstEscapeFired = false;

    // Load saved progress
    await this.loadGame();

    // Player run-cycle animations (one per buddy "suit").
    // The run frames live on row 13 of the 8-wide sheet: run01..run04 =
    // frame indices 104..107 (row 13 × 8 cols + column). Weapon variants live on
    // the rows below (run_shotgun 112+, run_AR 120+, run_pistol 128+, run_gun 136+)
    // for a future weapon-upgrade path.
    // Frame indices (row × 8 cols): spawn01..04 = 16..19 (row 2),
    // run01..04 = 104..107 (row 13), chat01..03 = 80..82 (row 10),
    // stand00 = 56 (row 7, used as a static frame).
    for (let i = 1; i <= 6; i++) {
      const spawnKey = `buddy${i}_spawn`;
      if (!this.anims.exists(spawnKey)) {
        this.anims.create({
          key: spawnKey,
          frames: this.anims.generateFrameNumbers(`buddy${i}`, { frames: [16, 17, 18, 19] }),
          frameRate: 8,
          repeat: 0,
        });
      }
      const runKey = `buddy${i}_run`;
      if (!this.anims.exists(runKey)) {
        this.anims.create({
          key: runKey,
          frames: this.anims.generateFrameNumbers(`buddy${i}`, { frames: [104, 105, 106, 107] }),
          frameRate: 4,
          repeat: -1,
        });
      }
      const chatKey = `buddy${i}_chat`;
      if (!this.anims.exists(chatKey)) {
        this.anims.create({
          key: chatKey,
          frames: this.anims.generateFrameNumbers(`buddy${i}`, { frames: [80, 81, 82] }),
          frameRate: 5,
          repeat: 0,
        });
      }
      // Armed run cycles — one per weaponStyle (equipped WEAPON gear swaps these
      // in for the bare-handed run). Rows 14-17 of the sheet.
      const weaponRows: Record<string, number> = { shotgun: 112, AR: 120, pistol: 128, gun: 136 };
      for (const [style, first] of Object.entries(weaponRows)) {
        const key = `buddy${i}_run_${style}`;
        if (!this.anims.exists(key)) {
          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(`buddy${i}`, { frames: [first, first + 1, first + 2, first + 3] }),
            frameRate: 4,
            repeat: -1,
          });
        }
      }
    }

    // Build UI
    this.ui = new UIManager(this, this.state, {
      onHeal: () => this.handleHeal(),
      onEat: () => this.handleEat(),
      onSearch: () => this.handleSearch(),
      onCollectMoth: () => this.handleCollectMoth(),
      onCollectPhantom: () => this.handleCollectPhantom(),
      onActivateHype: () => this.handleActivateHype(),
      onBuyUpgrade: (id) => this.handleBuyUpgrade(id),
      onEscape: () => this.handleEscape(),
      onTravel: (lvl) => this.handleTravel(lvl),
      onTabChanged: (tab) => this.handleTabChanged(tab),
      onRewind: () => this.handleRewind(),
      onBuyVoidUpgrade: (id) => this.handleBuyVoidUpgrade(id),
      onUseAbility: (id) => this.handleUseAbility(id),
      onToggleAutoEscape: () => this.handleToggleAutoEscape(),
      onToggleHideMaxed: () => this.handleToggleHideMaxed(),
      onToggleHaptics: () => this.handleToggleHaptics(),
      onCraftGear: (id) => this.handleCraftGear(id),
      onEquipGear: (id) => this.handleEquipGear(id),
      onDismantleGear: (id) => this.handleDismantleGear(id),
      onLevelGear: (id) => this.handleLevelGear(id),
      onBuyShopUpgrade: (id) => this.handleBuyShopUpgrade(id),
      onClaimAchievement: (id) => this.handleClaimAchievement(id),
      onResetProgress: () => this.handleResetProgress(),
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

    // Count down node respawn (real-time, finer than the 1.5s tick).
    this.state.advanceRespawn(delta);

    // Entity give-up timer: if the encounter times out, it wanders off unrewarded.
    for (const evt of this.state.advanceEntity(delta)) {
      this.ui.addLogMessage(evt);
    }

    // Lighting phases: cross-fade the mood and announce the shift.
    const light = this.state.advanceLighting(delta);
    if (light.changed) {
      this.ui.applyLighting(light.lighting);
      const line = light.lighting === 'bright'
        ? { msg: 'The fluorescents surge. Moths gather to the light.', color: '#FFE9A8' }
        : light.lighting === 'dark'
          ? { msg: 'The lights gutter out. Your searching sounds louder.', color: '#8888AA' }
          : { msg: 'The lights settle back into their tired hum.', color: '#AAAAAA' };
      this.ui.addLogMessage({ type: 'ambient', message: line.msg, color: line.color });
      RundotGameAPI.analytics.recordCustomEvent('lighting_changed', { lighting: light.lighting });
    }

    // Hype timers (cooldown → available → active). React to the transitions.
    const hype = this.state.advanceHype(delta);
    if (hype.becameAvailable) this.ui.showHypePrompt();
    if (hype.selfActivated) {
      this.ui.startHype();
      this.ui.addLogMessage({
        type: 'system',
        message: `Explorer self-hyped! ×${this.state.hypeMultiplier} auto search for ${this.state.hypeDuration / 1000}s`,
        color: '#FFD24A',
      });
      haptic('medium');
    }
    if (hype.ended) this.ui.endHype();

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
        RundotGameAPI.analytics.recordCustomEvent('entity_encounter', {
          level: this.state.currentLevel,
          entity: this.state.activeEntityId ?? 'unknown',
        });
        haptic('warning');
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
          had_coin_insurance: (this.state.resources['lucky_coins']?.gte(5)) ?? false,
        });
      }

      if (evt.type === 'milestone') {
        RundotGameAPI.analytics.recordCustomEvent('milestone_reached', {
          level: this.state.currentLevel,
          message: evt.message,
        });
        haptic('success');
      }

      if (evt.type === 'event') {
        RundotGameAPI.analytics.recordCustomEvent('rare_event', {
          level: this.state.currentLevel,
          message: evt.message,
        });
      }
    }

    // Surface any Void Shards earned this tick (e.g. auto-escape reaching a new floor)
    this.drainShardAwards();
    // ...and any pet level-ups (the Lion grows on the drone's crits too).
    this.notePetEvents(result.events);

    // Show the drone's auto-search damage each tick (gold if it was a crit).
    if (result.autoDamage) {
      this.ui.showSearchHit(result.autoDamage, !!result.autoCrit, !!result.autoSuperCrit);
    }

    // Update resource display and ability cooldowns
    this.ui.updateResourceBar();
    this.ui.refreshAbilities();
    // Refresh only the visible panel's live affordability (no-op when off-screen).
    this.ui.tickRefresh();
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
      haptic('light');
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
      haptic('light');
    }
  }

  private handleSearch(): void {
    const hit = this.state.manualSearch();
    // Nothing to hit mid-respawn — no floating number, no haptic.
    if (!hit.struck) return;
    for (const evt of hit.events) this.ui.addLogMessage(evt);
    this.notePetEvents(hit.events);   // a crit can level Static
    this.ui.showSearchHit(hit.damage, hit.crit, hit.superCrit);
    this.ui.updateResourceBar();
    haptic(hit.superCrit ? 'heavy' : hit.crit ? 'medium' : 'light');
  }

  private handleActivateHype(): void {
    if (!this.state.activateHype()) return;
    this.ui.startHype();
    this.ui.addLogMessage({
      type: 'system',
      message: `HYPE! ×${this.state.hypeMultiplier} auto search for ${this.state.hypeDuration / 1000}s`,
      color: '#FFD24A',
    });
    haptic('medium');
    RundotGameAPI.analytics.recordCustomEvent('hype_activated');
  }

  private handleCollectMoth(): number {
    const { gain, events } = this.state.collectMoth();
    this.ui.updateResourceBar();
    this.ui.addLogMessage({ type: 'system', message: `+${gain} Moth${gain > 1 ? 's' : ''}`, color: '#C9B6FF' });
    for (const evt of events) this.ui.addLogMessage(evt);
    this.notePetEvents(events);   // a catch can level the Lamp Trap
    if (!events.some((e) => e.type === 'pet')) haptic('light');
    RundotGameAPI.analytics.recordCustomEvent('moth_collected');
    return gain;
  }

  /** Staring down a phantom (dark phases): bank the burst, calm the noise. */
  private handleCollectPhantom(): number {
    const { gain, events } = this.state.collectPhantom();
    for (const evt of events) this.ui.addLogMessage(evt);
    this.ui.updateResourceBar();
    RundotGameAPI.analytics.recordCustomEvent('phantom_caught', {
      level: this.state.currentLevel,
      lifetime: this.state.lifetimePhantomsCaught,
    });
    haptic('medium');
    return gain;
  }

  /**
   * React to pet level-up events ('pet' type): refresh the explore-page pet row
   * and save immediately — level-ups are rare and permanent. (The events have
   * already been logged by the caller.)
   */
  private notePetEvents(events: GameEvent[]): void {
    const pet = events.find((e) => e.type === 'pet');
    if (!pet) return;
    this.ui.refreshPetRow();
    RundotGameAPI.analytics.recordCustomEvent('pet_level_up', { message: pet.message });
    haptic('success');
    this.saveGame();
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
      this.drainShardAwards();   // maxing an upgrade pays a Void Shard
      RundotGameAPI.analytics.recordCustomEvent('upgrade_purchased', {
        upgrade: id,
        level: this.state.getUpgradeLevel(id),
      });
      haptic('success');
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
      haptic('success');
      this.drainShardAwards();   // reaching a new floor pays a Void Shard
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
      haptic('light');
      this.ui.refreshForNewLevel();
      this.ui.showTab('explore');
      this.saveGame();
    }
  }

  private handleTabChanged(tab: string): void {
    RundotGameAPI.analytics.recordCustomEvent('tab_switched', { tab });
    haptic('light');
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
    this.ui.playRewindEffect(earned, earned > 0 ? this.state.rewindShardBonus : 0, () => {
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
    haptic('light');
    this.saveGame();
  }

  private handleToggleHideMaxed(): void {
    this.state.hideMaxedUpgrades = !this.state.hideMaxedUpgrades;
    this.ui.refreshHideMaxed();
    this.saveGame();
  }

  private handleToggleHaptics(): void {
    this.state.hapticsEnabled = !this.state.hapticsEnabled;
    RundotGameAPI.analytics.recordCustomEvent('haptics_toggled', {
      enabled: this.state.hapticsEnabled,
    });
    // A pulse when switching ON confirms the phone buzzes; OFF stays silent
    // through the helper's own gate.
    haptic('light');
    this.saveGame();
  }

  private handleUseAbility(id: string): void {
    const events = this.state.useAbility(id);
    if (events.length > 0) {
      for (const evt of events) {
        this.ui.addLogMessage(evt);
      }
      this.notePetEvents(events);   // Scavenge breaks nodes → quality finds can level the Magpie
      this.ui.updateResourceBar();
      this.ui.refreshAbilities();
      RundotGameAPI.analytics.recordCustomEvent('ability_used', {
        ability: id,
        level: this.state.currentLevel,
      });
      haptic('light');
      this.saveGame();
    }
  }

  private handleCraftGear(id: string): void {
    if (this.state.craftGear(id)) {
      this.ui.addLogMessage({
        type: 'event',
        message: `Crafted & equipped: ${id.replace(/_/g, ' ')}!`,
        color: '#FFD24A',
      });
      this.ui.updateResourceBar();
      this.ui.refreshGearPanel();
      this.ui.syncBuddyAppearance();
      RundotGameAPI.analytics.recordCustomEvent('gear_crafted', {
        gear: id,
        level: this.state.currentLevel,
        lifetime_crafted: this.state.lifetimeGearCrafted,
      });
      haptic('success');
      this.saveGame();
    }
  }

  private handleEquipGear(id: string): void {
    if (this.state.equipGear(id)) {
      this.ui.addLogMessage({
        type: 'system',
        message: `Equipped: ${id.replace(/_/g, ' ')}`,
        color: '#CCCCCC',
      });
      this.ui.refreshGearPanel();
      this.ui.syncBuddyAppearance();
      RundotGameAPI.analytics.recordCustomEvent('gear_equipped', { gear: id });
      haptic('light');
      this.saveGame();
    }
  }

  private handleDismantleGear(id: string): void {
    const gained = this.state.dismantleGear(id);
    if (gained <= 0) return;
    this.ui.addLogMessage({
      type: 'system',
      message: `Dismantled ${id.replace(/_/g, ' ')} → +${gained} Scrap`,
      color: '#C0C8D0',
    });
    this.ui.refreshGearPanel();
    RundotGameAPI.analytics.recordCustomEvent('gear_dismantled', { gear: id, scrap_gained: gained, scrap_total: this.state.scrap });
    haptic('medium');
    this.saveGame();
  }

  private handleLevelGear(id: string): void {
    if (!this.state.levelGear(id)) return;
    const lvl = this.state.getGearLevel(id);
    this.ui.addLogMessage({
      type: 'event',
      message: `${id.replace(/_/g, ' ')} upgraded to Lv ${lvl} (+${lvl * 10}% effects)`,
      color: '#FFD24A',
    });
    this.ui.refreshGearPanel();
    this.ui.syncBuddyAppearance();   // levels feed Gear Rating → the runner's look
    RundotGameAPI.analytics.recordCustomEvent('gear_leveled', { gear: id, gear_level: lvl, scrap_left: this.state.scrap });
    haptic('light');
    this.saveGame();
  }

  private handleBuyShopUpgrade(id: string): void {
    if (this.state.buyShopUpgrade(id)) {
      this.ui.addLogMessage({
        type: 'system',
        message: `Shop upgrade: ${id.replace(/_/g, ' ')}!`,
        color: '#CC88FF',
      });
      this.ui.refreshShopPanel();
      this.ui.refreshPetRow();   // a pet unlock (e.g. Lamp Trap) appears on the explore page
      RundotGameAPI.analytics.recordCustomEvent('shop_upgrade_purchased', {
        upgrade: id,
        level: this.state.getShopLevel(id),
        shards_remaining: this.state.voidShards,
      });
      haptic('success');
      this.saveGame();
    }
  }

  private handleClaimAchievement(id: string): void {
    const before = this.state.voidShards;
    if (this.state.claimAchievement(id)) {
      const earned = this.state.voidShards - before;
      this.ui.addLogMessage({
        type: 'event',
        message: `Achievement claimed: ${id.replace(/_/g, ' ')}! +${earned} Void Shard${earned === 1 ? '' : 's'}`,
        color: '#CC88FF',
        iconKey: 'void_shard',
      });
      this.ui.refreshAchievementsPanel();
      RundotGameAPI.analytics.recordCustomEvent('achievement_claimed', {
        achievement: id,
        tier: this.state.getAchievementLevel(id),
        shards_remaining: this.state.voidShards,
      });
      haptic('success');
      this.saveGame();
    }
  }

  /** Surface any queued Void Shard awards (from maxing upgrades / reaching new floors). */
  private drainShardAwards(): void {
    const awards = this.state.collectShardAwards();
    for (const evt of awards) {
      this.ui.addLogMessage(evt);
      haptic('success');
    }
    if (awards.length > 0) this.ui.refreshShopPanel();
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
      haptic('success');
      this.saveGame();
    }
  }

  private async handleResetProgress(): Promise<void> {
    RundotGameAPI.analytics.recordCustomEvent('progress_reset', {
      level: this.state.currentLevel,
      total_depth: this.state.totalDepth,
      prestiges: this.state.prestigeCount,
    });
    haptic('warning');
    try {
      await RundotGameAPI.appStorage.removeItem('backrooms_save');
    } catch (err) {
      RundotGameAPI.log(`[Reset] Error: ${err}`);
    }
    // Rebuild from a clean slate — create() runs loadGame() which now finds no save.
    this.scene.restart();
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
