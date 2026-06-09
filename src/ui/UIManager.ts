import Phaser from 'phaser';
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { LAYOUT } from '../config';
import { UPGRADES, RESOURCES, RESOURCE_ORDER, VOID_UPGRADES, PRESTIGE_TIERS, ABILITIES, EQUIP_SLOTS, EQUIP_SLOT_ICONS, GEAR_POOL, GEAR_TIER_COLORS, RECIPES, SHOP_UPGRADES, ACHIEVEMENTS, getTierColor, tierSuffix, getFloorOre, type UpgradeDef, type ShopUpgradeDef, type AchievementDef } from '../data/GameData';
import { fmt, D, type Big } from '../num';
import type { GameEvent, OfflineSummary } from '../GameState';
import { GameState } from '../GameState';

const FONT_FAMILY = 'monospace';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  size: number,
  color: string,
  extra?: Partial<Phaser.Types.GameObjects.Text.TextStyle>,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, content, {
    fontFamily: FONT_FAMILY,
    fontSize: `${size}px`,
    color,
    wordWrap: { width: 640 },
    ...extra,
  });
}

function makeBtn(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  w: number,
  h: number,
  bgColor: number,
  cb: () => void,
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, w, h, bgColor, 1).setOrigin(0.5);
  bg.setStrokeStyle(2, 0x555555);
  const txt = scene.add.text(0, 0, label, {
    fontFamily: FONT_FAMILY,
    fontSize: '22px',
    color: '#FFFFFF',
    align: 'center',
  }).setOrigin(0.5);
  container.add([bg, txt]);
  container.setSize(w, h);
  container.setInteractive({ useHandCursor: true });
  container.on('pointerdown', cb);
  return container;
}

/** Icon native resolution (all icons are 170x170) */
const ICON_NATIVE = 170;

/* ------------------------------------------------------------------ */
/*  UIManager                                                          */
/* ------------------------------------------------------------------ */

export interface UICallbacks {
  onHeal: () => void;
  onEat: () => void;
  onSearch: () => void;
  onCollectMoth: () => void;
  onActivateHype: () => void;
  onBuyUpgrade: (id: string) => void;
  onEscape: () => void;
  onTravel: (levelId: number) => void;
  onTabChanged: (tab: string) => void;
  onRewind: () => void;
  onBuyVoidUpgrade: (id: string) => void;
  onUseAbility: (id: string) => void;
  onToggleAutoEscape: () => void;
  onToggleHideMaxed: () => void;
  onCraft: (recipeId: string) => void;
  onBuyShopUpgrade: (id: string) => void;
  onClaimAchievement: (id: string) => void;
  onResetProgress: () => void;
}

export class UIManager {
  private scene: Phaser.Scene;
  private state: GameState;
  private cb: UICallbacks;

  // Background
  private bgImage!: Phaser.GameObjects.Image;
  private flickerOverlay!: Phaser.GameObjects.Rectangle;
  private damageOverlay!: Phaser.GameObjects.Rectangle;

  // Header
  private levelText!: Phaser.GameObjects.Text;

  // Status bars
  private progBarBg!: Phaser.GameObjects.Rectangle;
  private progFill!: Phaser.GameObjects.Rectangle;
  private progLabel!: Phaser.GameObjects.Text;

  // Focal "showcase" presentation (replaces the scrolling text log)
  private showcaseBig: Phaser.GameObjects.Image | null = null;
  private showcaseKey: string | null = null;
  private showcaseTier = 1;
  /** The player avatar running across the explore screen (run01..run04 cycle). */
  private buddyRunner: Phaser.GameObjects.Sprite | null = null;
  /** Which buddy "suit" is active (1..6); future upgrades swap this. */
  private buddySuit = 1;
  /** What the avatar is currently doing — drives click interactions. */
  private buddyState: 'run' | 'stand' | 'chat' = 'run';
  /** Bouncing "HYPE!" prompt above the runner (shown when hype is available). */
  private hypePrompt?: Phaser.GameObjects.Container;
  /** Static frame for the idle "stand00" pose. */
  private static readonly BUDDY_STAND_FRAME = 56;
  private lastPulseTime = 0;                           // throttles the tap pulse animation
  private flavorMsg?: Phaser.GameObjects.Text;         // reusable entity/ambient flavor line
  private flavorTween?: Phaser.Tweens.Tween;
  private hintText!: Phaser.GameObjects.Text;
  private roomsLabel!: Phaser.GameObjects.Text;
  private exploreBtnZone?: Phaser.GameObjects.Rectangle;
  private holdTimer?: Phaser.Time.TimerEvent;
  // Wandering moth collectible: at most one in flight; self-rescheduling spawner.
  private mothTimer?: Phaser.Time.TimerEvent;
  private activeMoth?: Phaser.GameObjects.Image;
  private durFill?: Phaser.GameObjects.Rectangle;
  private durLabel?: Phaser.GameObjects.Text;   // "N to collect" readout on the durability bar
  private qualityLabel?: Phaser.GameObjects.Text;   // "QUALITY" tag above a pre-rolled quality node

  // Resource bar
  private resTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private floorCleared = false;                        // tracks the "Cleared!" flash on the counter
  private headerCard?: Phaser.GameObjects.Rectangle;   // top header panel (resizes per tab)
  private contentCard?: Phaser.GameObjects.Rectangle;  // main content panel (resizes per tab)
  private resBarCard?: Phaser.GameObjects.Rectangle;   // bottom resource-bar background card
  private resBarIcon?: Phaser.GameObjects.Image;       // current floor's resource icon
  private resBarName?: Phaser.GameObjects.Text;        // current floor's resource name
  private resBarText?: Phaser.GameObjects.Text;        // current floor's resource count

  // Tabs
  private activeTab = 'explore';
  private panels: Map<string, Phaser.GameObjects.Container> = new Map();
  private tabBGs: Map<string, Phaser.GameObjects.Rectangle> = new Map();

  // Upgrade panel refs for live updates
  private upgCostLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private upgCostIcons: Map<string, Phaser.GameObjects.Image> = new Map();
  private upgLvlLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private upgNameLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private upgDescLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private upgBuyBg: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  // Upgrade list: each row is a self-contained container; relayoutUpgrades()
  // stacks the visible ones. This scales to any number of upgrades and supports
  // filtering (e.g. a future "hide maxed" toggle) without touching row internals.
  private upgRows: Map<string, Phaser.GameObjects.Container> = new Map();
  private upgScroll?: Phaser.GameObjects.Container;
  private upgMinScroll = 0;
  private hideMaxedBtn?: Phaser.GameObjects.Container;
  // Drag-to-scroll state (a drag suppresses the button's buy on release).
  private upgDragActive = false;
  private upgDragMoved = false;
  private upgDragStartPointer = 0;
  private upgDragStartScroll = 0;

  // Void panel refs
  private voidFragLabel!: Phaser.GameObjects.Text;
  private voidCostLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private voidLvlLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private voidBuyBtns: Map<string, Phaser.GameObjects.Container> = new Map();
  private rewindBtn!: Phaser.GameObjects.Container;
  private rewindBtnBg!: Phaser.GameObjects.Rectangle;
  private rewindPreviewText!: Phaser.GameObjects.Text;

  // Gear panel refs
  private gearSlotTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private gearSlotIcons: Map<string, Phaser.GameObjects.Image> = new Map();
  private gearBonusText!: Phaser.GameObjects.Text;
  private craftBtns: Map<string, Phaser.GameObjects.Container> = new Map();
  private craftCostTexts: Map<string, Phaser.GameObjects.Text> = new Map();

  // Shop panel refs (mirrors the upgrade panel: scrollable cards + cost buttons)
  private shopShardLabel!: Phaser.GameObjects.Text;
  private shopRows: Map<string, Phaser.GameObjects.Container> = new Map();
  private shopLvlLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private shopCostLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private shopCostIcons: Map<string, Phaser.GameObjects.Image> = new Map();
  private shopBuyBg: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private shopScroll?: Phaser.GameObjects.Container;
  private shopMinScroll = 0;
  private shopDragActive = false;
  private shopDragMoved = false;
  private shopDragStartPointer = 0;
  private shopDragStartScroll = 0;

  // Achievements panel refs (mirrors the shop panel: scrollable cards + claim buttons)
  private achBonusLabel?: Phaser.GameObjects.Text;
  private achLevelsLabel?: Phaser.GameObjects.Text;
  private achLvlLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private achProgLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private achProgFill: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private achBtnBg: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private achBtnLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private achBtnIcons: Map<string, Phaser.GameObjects.Image> = new Map();
  private achScroll?: Phaser.GameObjects.Container;
  private achMinScroll = 0;
  private achDragActive = false;
  private achDragMoved = false;
  private achDragStartPointer = 0;
  private achDragStartScroll = 0;

  // Auto-escape toggle
  private autoEscBg!: Phaser.GameObjects.Rectangle;
  private autoEscTxt!: Phaser.GameObjects.Text;

  // Ability refs
  private abilityBtns: Map<string, Phaser.GameObjects.Container> = new Map();
  private abilityLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private logBottom = 0;
  private exploreDescendBg?: Phaser.GameObjects.Rectangle;   // right arrow (go deeper)
  private exploreDescendTxt?: Phaser.GameObjects.Text;
  private leftArrowBg?: Phaser.GameObjects.Rectangle;        // left arrow (go back up)
  private leftArrowTxt?: Phaser.GameObjects.Text;
  private leftArrowIcon?: Phaser.GameObjects.Image;          // previous floor's resource preview
  private rightArrowIcon?: Phaser.GameObjects.Image;         // next floor's resource preview

  // Void prompt (stuck at max level)
  private voidPromptBanner: Phaser.GameObjects.Container | null = null;
  private voidNotifDot: Phaser.GameObjects.Container | null = null;
  // Red "!" alert dots keyed by tab id (explore = new floor ready, upgrades = affordable).
  private tabNotifDots: Map<string, Phaser.GameObjects.Container> = new Map();

  // Header extras
  private depthText!: Phaser.GameObjects.Text;

  // Settings modal (built on demand; null while closed)
  private settingsModal: Phaser.GameObjects.Container | null = null;
  private statsModal: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene, state: GameState, cb: UICallbacks) {
    this.scene = scene;
    this.state = state;
    this.cb = cb;
  }

  /* ================================================================ */
  /*  Icon helper                                                      */
  /* ================================================================ */

  /**
   * Create a scaled icon Image if the texture exists.
   * Returns null if no texture is loaded for this id (caller falls back to emoji).
   */
  private createIcon(x: number, y: number, id: string, size: number): Phaser.GameObjects.Image | null {
    const key = `icon_${id}`;
    if (!this.scene.textures.exists(key)) return null;
    const img = this.scene.add.image(x, y, key);
    img.setScale(size / ICON_NATIVE);
    img.setDepth(15);
    return img;
  }

  /* ================================================================ */
  /*  Focal showcase — big icon that pops in as events happen          */
  /* ================================================================ */

  private showcaseCenterY(): number {
    return (LAYOUT.CONTENT_TOP + this.logBottom) / 2;
  }

  /** Swap/pop the big focal icon. */
  private popShowcase(iconId: string, tier: number = 1): void {
    const key = `icon_${iconId}`;
    if (!this.scene.textures.exists(key)) return;
    const targetScale = 320 / ICON_NATIVE;

    if (this.showcaseBig && this.showcaseKey === iconId && this.showcaseTier === tier) {
      // Same icon + tier — just re-pop it.
      this.showcaseBig.setScale(targetScale * 0.85);
      this.scene.tweens.add({ targets: this.showcaseBig, scale: targetScale, duration: 200, ease: 'Back.easeOut' });
      return;
    }

    if (this.showcaseBig) this.showcaseBig.destroy();
    this.showcaseBig = this.scene.add.image(LAYOUT.CENTER_X, this.showcaseCenterY(), key).setDepth(14);
    this.showcaseBig.setScale(targetScale * 0.6).setAlpha(0);
    if (this.activeTab !== 'explore') this.showcaseBig.setVisible(false);
    this.showcaseKey = iconId;
    this.showcaseTier = tier;
    this.applyTierGlow(this.showcaseBig, tier);
    this.scene.tweens.add({ targets: this.showcaseBig, scale: targetScale, alpha: 1, duration: 260, ease: 'Back.easeOut' });
  }

  /** Colored outline glow marking the resource's tier (tier 1 = none). */
  private applyTierGlow(img: Phaser.GameObjects.Image, tier: number): void {
    if (!img.preFX) return;            // WebGL-only; canvas fallback skips the glow
    img.preFX.clear();
    const color = getTierColor(tier);
    if (color !== null) img.preFX.addGlow(color, 8, 0, false, 0.1, 18);
  }

  private clearShowcase(): void {
    if (this.showcaseBig) { this.showcaseBig.destroy(); this.showcaseBig = null; }
    this.showcaseKey = null;
  }

  /**
   * Swap the player avatar to a different buddy "suit" (1..6). Hook for a future
   * cosmetic/upgrade path — each suit is its own sprite sheet, identically laid out.
   */
  setBuddySuit(suit: number): void {
    const n = Phaser.Math.Clamp(Math.floor(suit), 1, 6);
    if (n === this.buddySuit || !this.buddyRunner) return;
    this.buddySuit = n;
    this.buddyRunner.setTexture(`buddy${n}`);
    if (this.buddyState === 'run') this.buddyRunner.play(`buddy${n}_run`);
    else if (this.buddyState === 'chat') this.buddyRunner.play(`buddy${n}_chat`);
    else this.buddyRunner.setFrame(UIManager.BUDDY_STAND_FRAME);
  }

  /** Show the bouncing HYPE! prompt (hype just became available). */
  showHypePrompt(): void {
    this.hypePrompt?.setVisible(true);
  }

  /** Hype activated: hide the prompt and make the runner sprint (3× anim speed). */
  startHype(): void {
    this.hypePrompt?.setVisible(false);
    if (this.buddyRunner) {
      this.buddyState = 'run';
      this.buddyRunner.play(`buddy${this.buddySuit}_run`);
      this.buddyRunner.anims.timeScale = 2;
    }
  }

  /** Hype ended: return the runner to normal speed. */
  endHype(): void {
    if (this.buddyRunner) this.buddyRunner.anims.timeScale = 1;
  }

  /**
   * Steer the avatar from a tap anywhere on the explore screen:
   *  - tap ON him → stop and stand; tap again → chat (chat01..03, resting at stand)
   *  - tap OFF him → face the tap (left/right of center) and run
   */
  private onBuddyPointer(pointer: Phaser.Input.Pointer): void {
    if (this.activeTab !== 'explore' || !this.buddyRunner) return;

    if (Phaser.Geom.Rectangle.Contains(this.buddyRunner.getBounds(), pointer.x, pointer.y)) {
      // Tapping the runner activates HYPE when it's available; during the buff he's
      // busy (taps ignored) so the fast run isn't interrupted.
      if (this.state.hypeAvailable) { this.cb.onActivateHype(); return; }
      if (this.state.hypeActive) return;
      if (this.buddyState === 'run') {
        // First tap: stop running, hold the idle pose.
        this.buddyState = 'stand';
        this.buddyRunner.anims.stop();
        this.buddyRunner.setFrame(UIManager.BUDDY_STAND_FRAME);
      } else {
        // Already stopped: he chats, then settles back to standing.
        this.buddyState = 'chat';
        this.buddyRunner.play(`buddy${this.buddySuit}_chat`);
        this.buddyRunner.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          if (this.buddyState === 'chat' && this.buddyRunner) {
            this.buddyState = 'stand';
            this.buddyRunner.setFrame(UIManager.BUDDY_STAND_FRAME);
          }
        });
      }
      return;
    }

    // Tapped off him: aim toward the tap and (re)start running.
    this.buddyRunner.setFlipX(pointer.x < LAYOUT.CENTER_X);
    if (this.buddyState !== 'run') {
      this.buddyState = 'run';
      this.buddyRunner.play(`buddy${this.buddySuit}_run`);
    }
  }

  /* ================================================================ */
  /*  Build all UI                                                     */
  /* ================================================================ */

  createAll(): void {
    this.createBackground();
    this.createHeader();
    this.createStatusBars();
    this.createResourceBar();
    this.createTabBar();
    this.createExplorePanel();
    this.createItemsPanel();
    this.createUpgradePanel();
    this.createVoidPanel();
    this.createGearPanel();
    this.createShopPanel();
    this.createAchievementsPanel();
    this.showTab('explore');
    this.scheduleMoth();
  }

  /* ---- Wandering moth collectible ---- *
   * Every ~3 minutes a moth drifts across the explore screen; click it for +1
   * Moth. Only one is ever alive, and it's always cleaned up (clicked or off-screen)
   * so there's no entity buildup. */

  private scheduleMoth(): void {
    this.mothTimer?.remove();
    // ~40s, jittered, so it isn't perfectly periodic.
    const delay = Phaser.Math.Between(35_000, 45_000);
    this.mothTimer = this.scene.time.delayedCall(delay, () => {
      this.trySpawnMoth();
      this.scheduleMoth();
    });
  }

  private trySpawnMoth(): void {
    // Only while exploring, and never more than one at a time.
    if (this.activeTab !== 'explore' || this.activeMoth) return;
    if (!this.scene.textures.exists('icon_moth')) return;

    // Fly through one of two empty bands: above the showcase, or below it.
    const band = Phaser.Math.Between(0, 1) === 0
      ? Phaser.Math.Between(210, 340)     // above the showcase, under the header
      : Phaser.Math.Between(960, 1180);   // below the showcase, above the tabs
    const startX = LAYOUT.GAME_WIDTH + 60;
    const endX = -60;

    const moth = this.scene.add.image(startX, band, 'icon_moth')
      .setScale(76 / ICON_NATIVE).setDepth(22)
      .setInteractive({ useHandCursor: true });
    moth.on('pointerdown', () => this.catchMoth());
    this.panels.get('explore')?.add(moth);   // rides with the explore panel (hidden off-tab)
    this.activeMoth = moth;

    // Slow right-to-left drift; removed once it exits the screen.
    this.scene.tweens.add({
      targets: moth, x: endX, duration: Phaser.Math.Between(9000, 13000),
      ease: 'Linear', onComplete: () => this.removeMoth(),
    });
    // Gentle vertical waver layered on top → a wavy path.
    this.scene.tweens.add({
      targets: moth, y: band - 28, duration: 1100,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    // Soft flutter.
    this.scene.tweens.add({
      targets: moth, angle: { from: -8, to: 8 }, duration: 320,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Trapper: roll auto-capture once. On success, snag it mid-flight (still
    // visible flying in first) — unless the player clicks it first.
    if (Math.random() < this.state.autoCaptureChance) {
      this.scene.time.delayedCall(Phaser.Math.Between(700, 1800), () => {
        if (this.activeMoth === moth) this.catchMoth();
      });
    }
  }

  private catchMoth(): void {
    const moth = this.activeMoth;
    if (!moth) return;
    this.cb.onCollectMoth();
    // Floating "+1" where it was caught.
    const pop = makeText(this.scene, moth.x, moth.y, '+1', 30, '#C9B6FF', {
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(23);
    this.panels.get('explore')?.add(pop);
    this.scene.tweens.add({
      targets: pop, y: moth.y - 70, alpha: { from: 1, to: 0 },
      duration: 700, ease: 'Cubic.easeOut', onComplete: () => pop.destroy(),
    });
    this.removeMoth();
  }

  private removeMoth(): void {
    if (!this.activeMoth) return;
    this.scene.tweens.killTweensOf(this.activeMoth);
    this.activeMoth.destroy();
    this.activeMoth = undefined;
  }

  /* ---- Background ---- */

  private createBackground(): void {
    const { GAME_WIDTH, GAME_HEIGHT } = LAYOUT;

    // Wallpaper image — scale to cover the portrait game area
    this.bgImage = this.scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'wallpaper')
      .setDepth(0);
    const scaleX = GAME_WIDTH / this.bgImage.width;
    const scaleY = GAME_HEIGHT / this.bgImage.height;
    const coverScale = Math.max(scaleX, scaleY);
    this.bgImage.setScale(coverScale);

    // Dark overlay so UI is readable on top of the yellow wallpaper
    this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0x000000, 0.55,
    ).setDepth(1);

    // Flicker overlay for fluorescent light atmosphere
    this.flickerOverlay = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0xffffcc, 0,
    ).setDepth(2);

    this.scene.tweens.add({
      targets: this.flickerOverlay,
      alpha: { from: 0, to: 0.08 },
      duration: 100,
      yoyo: true,
      repeat: -1,
      delay: 0,
      repeatDelay: Phaser.Math.Between(1500, 4000),
      onRepeat: () => {
        const tween = this.scene.tweens.getTweensOf(this.flickerOverlay)[0];
        if (tween) {
          tween.data[0].duration = Phaser.Math.Between(60, 200);
        }
      },
    });

    // Dark panels behind UI sections for contrast
    // Header card — behind Title + Depth + explore bar + count on Explore; it
    // shrinks to just the title band on other tabs (see setContentBounds).
    this.headerCard = this.scene.add.rectangle(GAME_WIDTH / 2, 87, GAME_WIDTH - 20, 158, 0x0a0a0a, 0.6)
      .setDepth(3)
      .setStrokeStyle(1, 0x333333);
    // Main content panel. Its bottom edge moves with the active tab: on Explore
    // it stops above the resource bar; on other tabs it expands down into that
    // freed space (see setContentBottom, called from showTab).
    this.contentCard = this.scene.add.rectangle(GAME_WIDTH / 2, (LAYOUT.CONTENT_TOP + LAYOUT.CONTENT_BOTTOM) / 2,
      GAME_WIDTH - 20, LAYOUT.CONTENT_BOTTOM - LAYOUT.CONTENT_TOP + 20, 0x0a0a0a, 0.6)
      .setDepth(3)
      .setStrokeStyle(1, 0x333333);
    // Resource-bar card — same inset card style as the header/content panels.
    // Only shown on the explore tab (toggled in showTab) since it reflects the
    // resource you're actively collecting.
    this.resBarCard = this.scene.add.rectangle(GAME_WIDTH / 2, LAYOUT.RESOURCE_BAR_Y + 20, GAME_WIDTH - 20, 52, 0x0a0a0a, 0.6)
      .setDepth(3)
      .setStrokeStyle(1, 0x333333);
    // Footer — one solid panel behind the tab buttons down to the screen bottom
    // (replaces the old overlapping tab + bottom-fill rects).
    const footerTop = LAYOUT.RESOURCE_BAR_Y + 50;
    this.scene.add.rectangle(GAME_WIDTH / 2, (footerTop + GAME_HEIGHT) / 2, GAME_WIDTH, GAME_HEIGHT - footerTop, 0x0a0a0a, 0.6)
      .setDepth(3);

    // Damage flash overlay
    this.damageOverlay = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0xff0000, 0,
    ).setDepth(200);
  }

  /* ---- Header ---- */

  private createHeader(): void {
    const cx = LAYOUT.CENTER_X;
    // Header column (all CENTER-anchored so visual gaps match the y-deltas):
    // Title + Depth as one group; the explore bar + count follow in
    // createStatusBars. Centers at 42 / 76 / 120 / 154.
    this.levelText = makeText(this.scene, cx, 42, this.state.level.name, 36, '#FFFFFF', {
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(10);

    this.depthText = makeText(this.scene, cx, 76, this.depthLabel(), 18, '#8888CC', {
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(10);

    // Settings button — top-right corner of the header card.
    const settingsBtn = makeBtn(this.scene, LAYOUT.GAME_WIDTH - 78, 30, 'SETTINGS', 120, 36, 0x2a2a2a, () => this.openSettings());
    (settingsBtn.getAt(1) as Phaser.GameObjects.Text).setFontSize(16);
    settingsBtn.setDepth(12);

    // Stats button — top-LEFT corner, mirroring Settings (temporary placement).
    const statsBtn = makeBtn(this.scene, 78, 30, 'STATS', 120, 36, 0x2a2a2a, () => this.showStats());
    (statsBtn.getAt(1) as Phaser.GameObjects.Text).setFontSize(16);
    statsBtn.setDepth(12);

    // "Hide maxed" toggle — same style as Settings, tucked just beneath it.
    // Only shown on the Upgrades tab (toggled in showTab).
    this.hideMaxedBtn = makeBtn(this.scene, LAYOUT.GAME_WIDTH - 78, 72, 'HIDE MAXED', 120, 34, 0x2a2a2a, () => this.cb.onToggleHideMaxed());
    (this.hideMaxedBtn.getAt(1) as Phaser.GameObjects.Text).setFontSize(14);
    this.hideMaxedBtn.setDepth(12).setVisible(false);
    this.updateHideMaxedBtn();   // sync initial color/label to state
  }

  /**
   * "DEPTH: current / deepest" (e.g. DEPTH: 1 / 20) when on an earlier floor,
   * or just "DEPTH: 20" when you're at your deepest. '' before the first descent.
   */
  private depthLabel(): string {
    const s = this.state;
    if (s.totalDepth <= 0 && s.prestigeCount <= 0) return '';
    return s.currentLevel >= s.totalDepth
      ? `DEPTH: ${s.totalDepth}`
      : `DEPTH: ${s.currentLevel} / ${s.totalDepth}`;
  }

  /* ---- Status bars ---- */

  private createStatusBars(): void {
    const { BAR_X, BAR_WIDTH, BAR_HEIGHT } = LAYOUT;

    // Green EXPLORATION bar — even 34px rhythm with the header above
    // (Title 42, Depth 76, Bar 110, count 144).
    const y = 110 - BAR_HEIGHT / 2; // bar top (center at 110)
    this.progBarBg = this.scene.add.rectangle(BAR_X + BAR_WIDTH / 2, y + BAR_HEIGHT / 2, BAR_WIDTH, BAR_HEIGHT, 0x16241a)
      .setDepth(10).setStrokeStyle(1, 0x2e4a2e);
    this.progFill = this.scene.add.rectangle(BAR_X, y, 0, BAR_HEIGHT, 0x4caf50).setOrigin(0, 0).setDepth(11);
    this.progLabel = makeText(this.scene, LAYOUT.CENTER_X, y + BAR_HEIGHT / 2, 'EXPLORING 0%', 16, '#FFFFFF', { fontStyle: 'bold' })
      .setOrigin(0.5, 0.5).setDepth(12);

    // Discrete count just under the bar (center at 144).
    this.roomsLabel = makeText(this.scene, LAYOUT.CENTER_X, 144, 'Rooms 0 / 10', 16, '#9fd0a0', {
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(12);
  }

  /* ---- Resource bar ---- */

  private createResourceBar(): void {
    const y = LAYOUT.RESOURCE_BAR_Y;
    const cx = LAYOUT.CENTER_X;
    // (Background is the resource-bar card drawn in createBackground.)

    // Single readout: which resource you're CURRENTLY collecting, its name, and
    // how many you have. Icon + name + count all swap as you descend (see
    // updateResourceBar). Laid out as: [icon] Name ............... count
    const res = this.state.floorOre.resource;
    const cy = y + 20;                         // vertical center of the bar card

    this.resBarIcon = this.createIcon(cx, cy, res, 72) ?? undefined;
    if (this.resBarIcon) this.resBarIcon.setDepth(11);

    this.resBarName = makeText(this.scene, cx, cy, RESOURCES[res].name, 22, '#DDDDDD', {
      fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(11);

    this.resBarText = makeText(this.scene, cx, cy, `${fmt(this.state.resources[res] ?? D(0))}`, 24, '#FFD700', {
      fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(11);

    this.layoutResourceBar();
  }

  /** Center the [icon] Name count cluster as one tight, horizontally-centered group. */
  private layoutResourceBar(): void {
    const cx = LAYOUT.CENTER_X;
    const gap = 14;
    const iconW = this.resBarIcon?.visible ? this.resBarIcon.displayWidth : 0;
    const nameW = this.resBarName?.width ?? 0;
    const countW = this.resBarText?.width ?? 0;
    const total = iconW + (iconW ? gap : 0) + nameW + gap + countW;
    let x = cx - total / 2;
    if (this.resBarIcon && iconW) { this.resBarIcon.x = x + iconW / 2; x += iconW + gap; }
    if (this.resBarName) { this.resBarName.x = x; x += nameW + gap; }
    if (this.resBarText) { this.resBarText.x = x; }
  }

  /* ---- Tab bar ---- */

  private createTabBar(): void {
    const showVoid = this.state.prestigeCount > 0 || this.state.canRewind();

    // Two-row layout with full labels
    const row1: { id: string; label: string }[] = [
      { id: 'explore', label: 'EXPLORE' }, { id: 'items', label: 'ITEMS' }, { id: 'upgrades', label: 'UPGRADES' },
    ];
    const row2: { id: string; label: string }[] = showVoid
      ? [{ id: 'void', label: 'VOID (wip)' }, { id: 'gear', label: 'GEAR (wip)' }, { id: 'shop', label: 'SHOP' }]
      : [{ id: 'gear', label: 'GEAR (wip)' }, { id: 'shop', label: 'SHOP' }];
    // 3rd row — Achievements lives here on its own for now.
    const row3: { id: string; label: string }[] = [
      { id: 'achievements', label: 'ACHIEVEMENTS' },
    ];

    const rowH = 42;
    const rowGap = 8;
    const row1Y = LAYOUT.TAB_Y - rowGap / 2 - rowH / 2;
    const row2Y = LAYOUT.TAB_Y + rowGap / 2 + rowH / 2;
    const row3Y = row2Y + rowH + rowGap;
    const totalPad = 20;

    const buildRow = (tabs: { id: string; label: string }[], centerY: number) => {
      const count = tabs.length;
      const tabW = Math.floor((LAYOUT.GAME_WIDTH - totalPad) / count) - 6;
      const gap = tabW + 6;
      const startX = Math.floor(totalPad / 2);

      for (let i = 0; i < count; i++) {
        const x = startX + i * gap + tabW / 2;
        const bg = this.scene.add.rectangle(x, centerY, tabW, rowH, 0x222222)
          .setDepth(10)
          .setStrokeStyle(1, 0x444444);
        const txt = makeText(this.scene, x, centerY, tabs[i].label, 17, '#888888', {
          fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(11);

        // Shop tab gets the Void Shard icon to the left of its label (icon + text
        // centered together within the button).
        if (tabs[i].id === 'shop') {
          const iconSize = 36;
          const iconGap = 6;
          const icon = this.createIcon(0, centerY, 'void_shard', iconSize);
          if (icon) {
            icon.setDepth(11);
            const total = iconSize + iconGap + txt.width;
            icon.x = x - total / 2 + iconSize / 2;
            txt.setX(icon.x + iconSize / 2 + iconGap + txt.width / 2);
          }
        }

        bg.setInteractive({ useHandCursor: true });
        const tabId = tabs[i].id;
        bg.on('pointerdown', () => {
          this.showTab(tabId);
          this.cb.onTabChanged(tabId);
        });

        this.tabBGs.set(tabId, bg);
        (bg as unknown as Record<string, Phaser.GameObjects.Text>).__tabTxt = txt;

        // Alert dot (red circle + "!") in the tab's top-right corner — shown when
        // that tab has something waiting and you're on a DIFFERENT tab.
        if (tabId === 'upgrades' || tabId === 'explore' || tabId === 'achievements') {
          const dot = this.scene.add.container(x + tabW / 2 - 6, centerY - rowH / 2 + 4).setDepth(12);
          const circle = this.scene.add.circle(0, 0, 11, 0xff3030).setStrokeStyle(2, 0x000000);
          const bang = makeText(this.scene, 0, 0, '!', 15, '#FFFFFF', { fontStyle: 'bold' }).setOrigin(0.5);
          dot.add([circle, bang]);
          dot.setVisible(false);
          this.tabNotifDots.set(tabId, dot);
        }
      }
    };

    buildRow(row1, row1Y);
    buildRow(row2, row2Y);
    buildRow(row3, row3Y);
  }

  /** Show/hide the per-tab alert dots (only when you're on a different tab). */
  private refreshTabNotifs(): void {
    const up = this.tabNotifDots.get('upgrades');
    if (up) up.setVisible(this.activeTab !== 'upgrades' && this.state.hasAffordableUpgrade());
    const ex = this.tabNotifDots.get('explore');
    if (ex) ex.setVisible(this.activeTab !== 'explore' && this.state.canDescendToNew());
    const ach = this.tabNotifDots.get('achievements');
    if (ach) ach.setVisible(this.activeTab !== 'achievements' && this.state.hasClaimableAchievement());
  }

  /* ---- Explore panel (log + action buttons) ---- */

  private createExplorePanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);

    const cx = LAYOUT.CENTER_X;

    this.logBottom = LAYOUT.CONTENT_BOTTOM - 56;
    const iconCy = this.showcaseCenterY();

    // The big focal icon doubles as the explore BUTTON: tap or hold to explore.
    // A transparent hit zone sits on top of the swappable showcase icon.
    this.exploreBtnZone = this.scene.add.rectangle(cx, iconCy, 320, 320, 0xffffff, 0)
      .setDepth(17).setInteractive({ useHandCursor: true });
    this.exploreBtnZone.on('pointerdown', () => this.startHoldExplore());
    this.exploreBtnZone.on('pointerup', () => this.stopHoldExplore());
    this.exploreBtnZone.on('pointerout', () => this.stopHoldExplore());
    panel.add(this.exploreBtnZone);

    // Navigation arrows flanking the icon: ◀ go back a floor, ▶ descend deeper.
    // Each arrow previews the resource of that floor (prev on the left, next on
    // the right) above a small direction glyph. Textures swap in updateStatusBars.
    const left = makeBtn(this.scene, cx - 250, iconCy, '◀', 92, 132, 0x2a2a2a, () => this.goShallower());
    this.leftArrowBg = left.getAt(0) as Phaser.GameObjects.Rectangle;
    this.leftArrowTxt = left.getAt(1) as Phaser.GameObjects.Text;
    this.leftArrowTxt.setPosition(0, 42).setFontSize(20);
    this.leftArrowIcon = this.scene.add.image(0, -26, `icon_${this.state.floorOre.resource}`).setScale(56 / ICON_NATIVE);
    left.add(this.leftArrowIcon);

    const right = makeBtn(this.scene, cx + 250, iconCy, '▶', 92, 132, 0x333355, () => this.goDeeper());
    this.exploreDescendBg = right.getAt(0) as Phaser.GameObjects.Rectangle;
    this.exploreDescendTxt = right.getAt(1) as Phaser.GameObjects.Text;
    this.exploreDescendTxt.setPosition(0, 42).setFontSize(20);
    this.rightArrowIcon = this.scene.add.image(0, -26, `icon_${this.state.floorOre.resource}`).setScale(56 / ICON_NATIVE);
    right.add(this.rightArrowIcon);

    panel.add([left, right]);

    // Integrity bar under the icon — the node's HP. Starts full and DRAINS as you
    // search it; when it empties you collect the resource and it refills (new node).
    // Carries a centered "remaining / max" HP readout for transparency.
    const durW = 240;
    const durH = 22;
    const durBg = this.scene.add.rectangle(cx, iconCy + 168, durW, durH, 0x2a1212, 1).setDepth(16).setStrokeStyle(1, 0x4a2a2a);
    this.durFill = this.scene.add.rectangle(cx - durW / 2, iconCy + 168, durW, durH, 0xffcc44).setOrigin(0, 0.5).setDepth(17);
    this.durLabel = makeText(this.scene, cx, iconCy + 168, '', 13, '#FFFFFF', {
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(18);
    panel.add([durBg, this.durFill, this.durLabel]);

    // "QUALITY" tag above the icon — shown only when the current node was pre-rolled
    // as a quality find, so the player is motivated to break it for the +1 extra.
    this.qualityLabel = makeText(this.scene, cx, iconCy - 140, 'QUALITY', 26, '#FFA500', {
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(18).setVisible(false);
    panel.add(this.qualityLabel);

    // Persistent hint under the icon.
    this.hintText = makeText(this.scene, cx, iconCy + 198, 'Tap or hold to search', 18, '#FFFFFF')
      .setOrigin(0.5).setDepth(16);
    panel.add(this.hintText);

    // The player avatar — you, running endlessly through the backrooms. Sits
    // up top, above the entity/ambient flavor line (flavor is at iconCy - 200),
    // and loops the run cycle so the screen always feels like forward motion.
    // The sprite sheet already bakes in its own shadow.
    const runnerY = iconCy - 330;
    this.buddyRunner = this.scene.add.sprite(cx, runnerY, `buddy${this.buddySuit}`)
      .setScale(1.7).setDepth(16);
    // Play the one-shot spawn ("appearing") animation, then settle into the run
    // loop. If the player taps him during the intro, the click handler takes over.
    this.buddyRunner.play(`buddy${this.buddySuit}_spawn`);
    this.buddyRunner.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      if (this.buddyState === 'run' && this.buddyRunner) this.buddyRunner.play(`buddy${this.buddySuit}_run`);
    });
    panel.add(this.buddyRunner);

    // "HYPE!" prompt — yellow text in a black pill that bounces above the runner
    // when hype is available. Hidden until then; tapping the runner activates it.
    const hype = this.scene.add.container(cx, runnerY - 70).setDepth(20).setVisible(false);
    const pill = this.scene.add.graphics();
    pill.fillStyle(0x000000, 0.92).fillRoundedRect(-42, -18, 84, 36, 18);
    pill.lineStyle(2, 0xFFD24A, 1).strokeRoundedRect(-42, -18, 84, 36, 18);
    const hypeTxt = makeText(this.scene, 0, 0, 'HYPE!', 19, '#FFD24A', { fontStyle: 'bold' }).setOrigin(0.5);
    hype.add([pill, hypeTxt]);
    panel.add(hype);
    this.hypePrompt = hype;
    this.scene.tweens.add({
      targets: hype, y: runnerY - 80, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Clicks steer the avatar: tap off him to point him toward the click and run
    // (left of center = run left, right = run right); tap him to stop (stand00),
    // and keep tapping him to chat. A chat finishes back to standing.
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onBuddyPointer(pointer));

    this.panels.set('explore', panel);

    // Initial focal icon = this floor's ore.
    this.popShowcase(this.state.floorOre.resource, this.state.floorOre.tier);
  }

  /* ---- Tap / hold to search ---- */

  // Auto-repeat cadence while HOLDING. Discrete taps are NOT gated by this — every
  // tap registers as one search, so fast tapping lands every hit.
  private static readonly HOLD_REPEAT_MS = 200;

  private doSearch(): void {
    if (this.activeTab !== 'explore') return;
    this.cb.onSearch();
    this.pulseShowcase();
  }

  private startHoldExplore(): void {
    if (this.activeTab !== 'explore') return;
    // Every discrete press = exactly one search (no cooldown). The timer only
    // drives auto-repeat for a held press; a quick tap releases before it fires.
    this.pulseShowcase(true);
    this.doSearch();
    this.holdTimer?.remove();
    this.holdTimer = this.scene.time.addEvent({
      delay: UIManager.HOLD_REPEAT_MS, loop: true, callback: () => this.doSearch(),
    });
  }

  private stopHoldExplore(): void {
    this.holdTimer?.remove();
    this.holdTimer = undefined;
  }

  /* ---- Floor navigation (the ◀ ▶ arrows) ---- */

  private goShallower(): void {
    const prev = this.state.currentLevel - 1;
    if (prev >= 0 && this.state.unlockedLevels.includes(prev)) this.cb.onTravel(prev);
  }

  private goDeeper(): void {
    const s = this.state;
    const next = s.currentLevel + 1;
    if (s.unlockedLevels.includes(next)) this.cb.onTravel(next);   // already-unlocked deeper floor
    else if (s.canEscape()) this.cb.onEscape();                    // explored enough → descend to new floor
  }

  private pulseShowcase(force = false): void {
    if (!this.showcaseBig) return;
    // Throttle: while HOLDING, ticks fire faster than the animation lasts, which
    // would restart it every frame and make the icon vibrate. Ignore extra ticks
    // until the current pulse has settled — mining still collects. A discrete tap
    // passes force=true so every individual click re-pops the icon.
    const PULSE_THROTTLE_MS = 360;
    const now = this.scene.time.now;
    if (!force && now - this.lastPulseTime < PULSE_THROTTLE_MS) return;
    this.lastPulseTime = now;

    const s = 320 / ICON_NATIVE;
    this.scene.tweens.killTweensOf(this.showcaseBig);
    this.showcaseBig.setScale(s * 0.93);
    this.showcaseBig.angle = 0;
    // Soft scale settle.
    this.scene.tweens.add({ targets: this.showcaseBig, scale: s, duration: 240, ease: 'Back.easeOut' });
    // Damped rotational wobble: each swing smaller than the last, settling upright.
    this.scene.tweens.add({
      targets: this.showcaseBig, angle: [-5, 3, -1.5, 0],
      duration: 320, ease: 'Sine.easeInOut',
      onComplete: () => { if (this.showcaseBig) this.showcaseBig.angle = 0; },
    });
  }

  /**
   * Floating damage number on each search tap — the "big number" juice. A normal
   * hit is a small white number; a lucky find (crit) is a large gold number that
   * pops bigger and drifts higher.
   */
  showSearchHit(damage: Big, crit: boolean): void {
    if (this.activeTab !== 'explore') return;
    const cx = LAYOUT.CENTER_X + Phaser.Math.Between(-50, 50);
    const cy = this.showcaseCenterY() + Phaser.Math.Between(-30, 10);
    const label = crit ? `${fmt(damage)}!` : fmt(damage);
    // Hype mode pumps up the numbers — bigger and chunkier.
    const hyped = this.state.hypeActive;
    const size = Math.round((crit ? 54 : 30) * (hyped ? 1.6 : 1));
    const mote = makeText(this.scene, cx, cy, label, size, crit ? '#FFD24A' : '#FFFFFF', {
      fontStyle: 'bold', stroke: '#000000', strokeThickness: crit ? 6 : 4,
    }).setOrigin(0.5).setDepth(21);
    this.panels.get('explore')?.add(mote);
    this.scene.tweens.add({
      targets: mote,
      x: cx + Phaser.Math.Between(-40, 40),
      y: cy - (crit ? 180 : 120),
      alpha: { from: 1, to: 0 },
      scale: crit ? { from: 1.35, to: 1 } : { from: 1, to: 0.9 },
      duration: crit ? 950 : 680,
      ease: 'Cubic.easeOut',
      onComplete: () => mote.destroy(),
    });
  }

  /* ---- Items panel ---- */

  private createItemsPanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);
    const startY = LAYOUT.CONTENT_TOP_WIDE + 10;
    const rowH = 75;

    // Scrollable container — the resource list is far taller than the screen now.
    const scrollContainer = this.scene.add.container(0, 0);
    const contentH = LAYOUT.CONTENT_BOTTOM_WIDE - LAYOUT.CONTENT_TOP_WIDE - 10;

    for (let i = 0; i < RESOURCE_ORDER.length; i++) {
      const resId = RESOURCE_ORDER[i];
      const res = RESOURCES[resId];
      const y = startY + i * rowH;
      const row = this.scene.add.container(0, 0);

      // Resource icon + name (left) + count (right) — same line
      const icon = this.createIcon(60, y + 14, resId, 100);
      if (icon) {
        row.add(icon);
        const nameTxt = makeText(this.scene, 120, y, res.name, 22, '#EEEEEE');
        row.add(nameTxt);
      } else {
        const nameTxt = makeText(this.scene, 40, y, `${res.icon}  ${res.name}`, 22, '#EEEEEE');
        row.add(nameTxt);
      }
      const countTxt = makeText(this.scene, 680, y + 2, `x${fmt(this.state.resources[resId] ?? D(0))}`, 22, '#FFD700', {
        fontStyle: 'bold',
      }).setOrigin(1, 0);
      row.add(countTxt);
      this.resTexts.set(`item_${resId}`, countTxt);

      // Description (left) + use button (right) — same line
      const descTxt = makeText(this.scene, icon ? 120 : 60, y + 30, res.description, 16, '#AAAAAA');
      row.add(descTxt);

      if (res.usable && res.useLabel) {
        const label = res.useLabel;
        const btn = makeBtn(this.scene, 640, y + 40, label, 100, 32, 0x334433, () => {
          if (resId === 'almond_water') this.cb.onHeal();
          else if (resId === 'canned_food') this.cb.onEat();
        });
        row.add(btn);
      }

      scrollContainer.add(row);
    }

    panel.add(scrollContainer);

    // Clip to the content area so scrolled rows don't bleed over the tab bar.
    const maskGfx = this.scene.add.graphics();
    maskGfx.setVisible(false);
    maskGfx.fillRect(0, LAYOUT.CONTENT_TOP_WIDE, LAYOUT.GAME_WIDTH, contentH);
    panel.setMask(maskGfx.createGeometryMask());

    // Drag to scroll when the list overflows.
    const totalH = RESOURCE_ORDER.length * rowH;
    if (totalH > contentH) {
      const dragZone = this.scene.add.rectangle(
        LAYOUT.CENTER_X, LAYOUT.CONTENT_TOP_WIDE + contentH / 2,
        LAYOUT.GAME_WIDTH, contentH, 0x000000, 0,
      ).setDepth(16).setInteractive();

      let dragging = false;
      let lastY = 0;
      const minScroll = -(totalH - contentH);

      dragZone.on('pointerdown', (_p: Phaser.Input.Pointer) => {
        dragging = true;
        lastY = _p.y;
      });
      this.scene.input.on('pointermove', (_p: Phaser.Input.Pointer) => {
        if (!dragging || !this.panels.get('items')?.visible) return;
        const dy = _p.y - lastY;
        lastY = _p.y;
        scrollContainer.y = Phaser.Math.Clamp(scrollContainer.y + dy, minScroll, 0);
      });
      this.scene.input.on('pointerup', () => { dragging = false; });

      // Mouse-wheel scroll for PC players.
      this.scene.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
        if (!this.panels.get('items')?.visible) return;
        scrollContainer.y = Phaser.Math.Clamp(scrollContainer.y - dy, minScroll, 0);
      });

      panel.add(dragZone);
    }

    this.panels.set('items', panel);
  }

  /* ---- Upgrade panel ---- */

  // One row's internal geometry, defined ONCE (local offsets from the row top).
  // Rows are uniform and positioned by relayoutUpgrades(), so there is no
  // per-index math and nothing can overlap regardless of how many upgrades exist.
  private static readonly UPG_ROW_H = 162;   // includes the gap between cards
  private static readonly UPG_LEFT = 40;
  private static readonly UPG_BTN_W = 640;   // spans the card (676) with even padding
  private static readonly UPG_BTN_H = 56;
  private static readonly UPG_BTN_CY = 112;   // button vertical center within the row

  private createUpgradePanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);
    const contentH = LAYOUT.CONTENT_BOTTOM_WIDE - LAYOUT.CONTENT_TOP_WIDE - 10;

    const scrollContainer = this.scene.add.container(0, 0);
    this.upgScroll = scrollContainer;

    const LX = UIManager.UPG_LEFT;
    const BW = UIManager.UPG_BTN_W;
    const BH = UIManager.UPG_BTN_H;
    const BCY = UIManager.UPG_BTN_CY;

    for (const upg of UPGRADES) {
      // Row container; its y is assigned by relayoutUpgrades(). Children use
      // fixed LOCAL offsets — name / desc / level stacked, then the cost button.
      const row = this.scene.add.container(0, 0);

      const nameTxt = makeText(this.scene, LX, 0, upg.name, 22, '#EEEEEE', { fontStyle: 'bold' });
      const descTxt = makeText(this.scene, LX, 32, upg.description, 14, '#AAAAAA');
      const lvl = this.state.getUpgradeLevel(upg.id);
      const lvlTxt = makeText(this.scene, LX, 58, `Lv ${lvl}/${upg.maxLevel}`, 16, '#9fd0a0');
      this.upgNameLabels.set(upg.id, nameTxt);
      this.upgDescLabels.set(upg.id, descTxt);
      this.upgLvlLabels.set(upg.id, lvlTxt);

      // Cost line = the buy button (a pill): "[icon] owned/cost ResourceName".
      const btnBg = this.scene.add.rectangle(LX + BW / 2, BCY, BW, BH, 0x333333, 1)
        .setStrokeStyle(2, 0x555555)
        .setInteractive({ useHandCursor: true });
      // Buy on RELEASE, and only if this gesture wasn't a scroll-drag.
      btnBg.on('pointerup', () => { if (!this.upgDragMoved) this.cb.onBuyUpgrade(upg.id); });
      const costIcon = this.createIcon(LX + 34, BCY, upg.costResource, 48);
      if (costIcon) this.upgCostIcons.set(upg.id, costIcon);
      const costLabel = makeText(this.scene, LX + 66, BCY, '', 18, '#FFFFFF', { fontStyle: 'bold' })
        .setOrigin(0, 0.5);

      // Each upgrade gets its own card (added first so it sits behind the content).
      // Spans local y -6..138 around the stacked content; the row's extra height
      // (UPG_ROW_H) leaves a gap to the next card.
      const card = this.scene.add.rectangle(LAYOUT.CENTER_X, 70, 676, 152, 0x1e1e1e, 0.9)
        .setStrokeStyle(1, 0x3a3a3a);

      row.add(card);
      row.add([nameTxt, descTxt, lvlTxt, btnBg]);
      if (costIcon) row.add(costIcon);
      row.add(costLabel);

      scrollContainer.add(row);
      this.upgRows.set(upg.id, row);
      this.upgBuyBg.set(upg.id, btnBg);
      this.upgCostLabels.set(upg.id, costLabel);
      this.renderUpgradeRow(upg);
    }

    panel.add(scrollContainer);

    // Clip to the content area.
    const maskGfx = this.scene.add.graphics();
    maskGfx.setVisible(false);
    maskGfx.fillRect(0, LAYOUT.CONTENT_TOP_WIDE, LAYOUT.GAME_WIDTH, contentH);
    panel.setMask(maskGfx.createGeometryMask());

    // Scroll via GLOBAL pointer drag (no covering hit-zone, so the row buttons
    // stay tappable). A move past a small threshold marks the gesture a drag,
    // which cancels the button's buy-on-release. Bounds come from relayout.
    this.scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.activeTab !== 'upgrades') return;
      if (p.y < LAYOUT.CONTENT_TOP_WIDE || p.y > LAYOUT.CONTENT_BOTTOM_WIDE) return;
      this.upgDragActive = true;
      this.upgDragMoved = false;
      this.upgDragStartPointer = p.y;
      this.upgDragStartScroll = scrollContainer.y;
    });
    this.scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.upgDragActive) return;
      const dy = p.y - this.upgDragStartPointer;
      if (Math.abs(dy) > 6) this.upgDragMoved = true;
      scrollContainer.y = Phaser.Math.Clamp(this.upgDragStartScroll + dy, this.upgMinScroll, 0);
    });
    this.scene.input.on('pointerup', () => { this.upgDragActive = false; });
    this.scene.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.activeTab !== 'upgrades' || !this.upgScroll) return;
      this.upgScroll.y = Phaser.Math.Clamp(this.upgScroll.y - dy, this.upgMinScroll, 0);
    });

    this.panels.set('upgrades', panel);
    this.relayoutUpgrades();
  }

  /**
   * Position the visible upgrade rows in a single stack and recompute scroll
   * bounds. Hidden rows (e.g. maxed when hideMaxed is on) claim no space, so the
   * list always packs tight no matter the count or filter.
   */
  private relayoutUpgrades(): void {
    const startY = LAYOUT.CONTENT_TOP_WIDE + 10;
    const contentH = LAYOUT.CONTENT_BOTTOM_WIDE - LAYOUT.CONTENT_TOP_WIDE - 10;
    const rowH = UIManager.UPG_ROW_H;
    let shown = 0;
    for (const upg of UPGRADES) {
      const row = this.upgRows.get(upg.id);
      if (!row) continue;
      const maxed = this.state.getUpgradeLevel(upg.id) >= upg.maxLevel;
      const hidden = this.state.hideMaxedUpgrades && maxed;
      row.setVisible(!hidden);
      if (hidden) continue;
      row.y = startY + shown * rowH;
      shown++;
    }
    this.upgMinScroll = Math.min(0, contentH - shown * rowH);
    if (this.upgScroll) this.upgScroll.y = Phaser.Math.Clamp(this.upgScroll.y, this.upgMinScroll, 0);
  }

  /** Re-apply the (persisted) hide-maxed state to the list + button. */
  refreshHideMaxed(): void {
    this.relayoutUpgrades();
    this.updateHideMaxedBtn();
  }

  /** Reflect the toggle state on the button (label + active tint). */
  private updateHideMaxedBtn(): void {
    if (!this.hideMaxedBtn) return;
    const on = this.state.hideMaxedUpgrades;
    // Green while it offers to HIDE (maxed shown), gray once they're hidden.
    (this.hideMaxedBtn.getAt(0) as Phaser.GameObjects.Rectangle).setFillStyle(on ? 0x2a2a2a : 0x336633);
    (this.hideMaxedBtn.getAt(1) as Phaser.GameObjects.Text).setText(on ? 'SHOW MAXED' : 'HIDE MAXED');
  }

  /* ---- Void panel (prestige upgrades + rewind) ---- */

  private createVoidPanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);
    const startY = LAYOUT.CONTENT_TOP_WIDE + 10;
    const cx = LAYOUT.CENTER_X;

    // Title
    const title = makeText(this.scene, cx, startY, 'THE VOID', 28, '#AA88FF', {
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    panel.add(title);

    // Prestige info
    const prestigeStr = `Rewinds: ${this.state.prestigeCount}  |  Depth: ${this.state.totalDepth}`;
    const prestigeInfo = makeText(this.scene, cx, startY + 38, prestigeStr, 16, '#8888AA')
      .setOrigin(0.5, 0);
    panel.add(prestigeInfo);
    this.voidCostLabels.set('_prestige_info', prestigeInfo);

    // Void fragments display with icon
    const vfIcon = this.createIcon(cx - 130, startY + 74, 'void_fragment', 80);
    if (vfIcon) {
      panel.add(vfIcon);
      this.voidFragLabel = makeText(this.scene, cx - 108, startY + 62, `Void Fragments: ${this.state.voidFragments}`, 20, '#CC88FF', {
        fontStyle: 'bold',
      }).setOrigin(0, 0);
    } else {
      this.voidFragLabel = makeText(this.scene, cx, startY + 62, `Void Fragments: ${this.state.voidFragments}`, 20, '#CC88FF', {
        fontStyle: 'bold',
      }).setOrigin(0.5, 0);
    }
    panel.add(this.voidFragLabel);

    // Scrollable container for void upgrades
    const scrollContainer = this.scene.add.container(0, 0);
    const upgStartY = startY + 100;
    const rowH = 85;

    for (let i = 0; i < VOID_UPGRADES.length; i++) {
      const vup = VOID_UPGRADES[i];
      const y = upgStartY + i * rowH;
      const row = this.scene.add.container(0, 0);

      const lvl = this.state.getVoidLevel(vup.id);
      const nameTxt = makeText(this.scene, 40, y, `${vup.icon}  ${vup.name}`, 18, '#DDDDFF', {
        fontStyle: 'bold',
      });
      const lvlTxt = makeText(this.scene, 640, y, `Lv.${lvl}/${vup.maxLevel}`, 14, '#8888AA')
        .setOrigin(1, 0);
      this.voidLvlLabels.set(vup.id, lvlTxt);

      const currentEffect = lvl * vup.effectPerLevel;
      const descStr = `${vup.description}  |  +${currentEffect}${vup.effectUnit}`;
      const descTxt = makeText(this.scene, 60, y + 22, descStr, 13, '#9999BB');
      this.voidCostLabels.set(`desc_${vup.id}`, descTxt);

      const costStr = lvl >= vup.maxLevel ? 'MAXED' : `Cost: ${vup.costPerLevel} fragments`;
      const costTxt = makeText(this.scene, 60, y + 42, costStr, 14, '#AAAACC');
      this.voidCostLabels.set(vup.id, costTxt);

      const canBuy = this.state.canAffordVoidUpgrade(vup.id);
      const buyBtn = makeBtn(this.scene, 600, y + 48, canBuy ? 'BUY' : '---', 100, 28, canBuy ? 0x443366 : 0x222233, () => {
        this.cb.onBuyVoidUpgrade(vup.id);
      });
      this.voidBuyBtns.set(vup.id, buyBtn);

      row.add([nameTxt, lvlTxt, descTxt, costTxt, buyBtn]);

      const divider = this.scene.add.rectangle(cx, y + 74, 620, 1, 0x333355).setDepth(15);
      row.add(divider);

      scrollContainer.add(row);
    }

    // Rewind button — below upgrades
    const rewindY = upgStartY + VOID_UPGRADES.length * rowH + 20;
    const rewindDivider = this.scene.add.rectangle(cx, rewindY - 10, 620, 2, 0x553388).setDepth(15);
    scrollContainer.add(rewindDivider);

    const rewindLabel = makeText(this.scene, cx, rewindY, 'REWIND THE TAPE', 22, '#CC88FF', {
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    scrollContainer.add(rewindLabel);

    const canRewind = this.state.canRewind();
    const previewFrags = canRewind ? this.state.calculateRewindFragments() : 0;
    this.rewindPreviewText = makeText(this.scene, cx, rewindY + 30,
      canRewind ? `Reset everything. Earn ${previewFrags} void fragments.` : 'Reach Level 4 to unlock.',
      16, '#9999BB',
    ).setOrigin(0.5, 0);
    scrollContainer.add(this.rewindPreviewText);

    // Prestige tier info
    let tierY = rewindY + 55;
    for (const tier of PRESTIGE_TIERS) {
      const unlocked = this.state.prestigeCount >= tier.prestigeRequired;
      const tierTxt = makeText(this.scene, cx, tierY,
        `${unlocked ? '\u2713' : '\u25CB'} Rewind ${tier.prestigeRequired}x: ${tier.description}`,
        14, unlocked ? '#88FF88' : '#666688',
      ).setOrigin(0.5, 0);
      scrollContainer.add(tierTxt);
      tierY += 22;
    }

    const rewindBtnY = tierY + 20;
    const rewindBtnBg = this.scene.add.rectangle(0, 0, 420, 56, canRewind ? 0x553388 : 0x222233)
      .setOrigin(0.5).setStrokeStyle(2, canRewind ? 0x8855CC : 0x333344);
    const rwIcon = this.createIcon(-120, 0, 'rewind_button', 80);
    const rewindBtnTxt = this.scene.add.text(rwIcon ? 10 : 0, 0, rwIcon ? 'REWIND' : '\u23EA REWIND', {
      fontFamily: FONT_FAMILY,
      fontSize: '24px',
      color: canRewind ? '#FFFFFF' : '#555566',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const rewindChildren: Phaser.GameObjects.GameObject[] = [rewindBtnBg, rewindBtnTxt];
    if (rwIcon) rewindChildren.push(rwIcon);
    this.rewindBtn = this.scene.add.container(cx, rewindBtnY, rewindChildren);
    this.rewindBtn.setSize(420, 56);
    this.rewindBtn.setInteractive({ useHandCursor: true });
    this.rewindBtn.on('pointerdown', () => {
      if (this.state.canRewind()) this.cb.onRewind();
    });
    this.rewindBtnBg = rewindBtnBg;
    scrollContainer.add(this.rewindBtn);

    panel.add(scrollContainer);

    // Mask and scroll
    const contentH = LAYOUT.CONTENT_BOTTOM_WIDE - LAYOUT.CONTENT_TOP_WIDE - 10;
    const maskGfx = this.scene.add.graphics();
    maskGfx.setVisible(false);
    maskGfx.fillRect(0, LAYOUT.CONTENT_TOP_WIDE, LAYOUT.GAME_WIDTH, contentH);
    panel.setMask(maskGfx.createGeometryMask());

    const totalH = rewindBtnY + 60 - startY;
    if (totalH > contentH) {
      const dragZone = this.scene.add.rectangle(
        cx, LAYOUT.CONTENT_TOP_WIDE + contentH / 2,
        LAYOUT.GAME_WIDTH, contentH, 0x000000, 0,
      ).setDepth(16).setInteractive();

      let dragging = false;
      let lastPointerY = 0;
      const minScroll = -(totalH - contentH);

      dragZone.on('pointerdown', (_p: Phaser.Input.Pointer) => {
        dragging = true;
        lastPointerY = _p.y;
      });
      this.scene.input.on('pointermove', (_p: Phaser.Input.Pointer) => {
        if (!dragging || !this.panels.get('void')?.visible) return;
        const dy = _p.y - lastPointerY;
        lastPointerY = _p.y;
        scrollContainer.y = Phaser.Math.Clamp(scrollContainer.y + dy, minScroll, 0);
      });
      this.scene.input.on('pointerup', () => { dragging = false; });

      panel.add(dragZone);
    }

    this.panels.set('void', panel);
  }

  refreshVoidPanel(): void {
    this.voidFragLabel.setText(`Void Fragments: ${this.state.voidFragments}`);

    const prestigeInfo = this.voidCostLabels.get('_prestige_info');
    if (prestigeInfo) {
      prestigeInfo.setText(`Rewinds: ${this.state.prestigeCount}  |  Depth: ${this.state.totalDepth}`);
    }

    for (const vup of VOID_UPGRADES) {
      const lvl = this.state.getVoidLevel(vup.id);
      const lvlTxt = this.voidLvlLabels.get(vup.id);
      if (lvlTxt) lvlTxt.setText(`Lv.${lvl}/${vup.maxLevel}`);

      const descTxt = this.voidCostLabels.get(`desc_${vup.id}`);
      if (descTxt) {
        const currentEffect = lvl * vup.effectPerLevel;
        descTxt.setText(`${vup.description}  |  +${currentEffect}${vup.effectUnit}`);
      }

      const costTxt = this.voidCostLabels.get(vup.id);
      if (costTxt) {
        costTxt.setText(lvl >= vup.maxLevel ? 'MAXED' : `Cost: ${vup.costPerLevel} fragments`);
      }

      const btn = this.voidBuyBtns.get(vup.id);
      if (btn) {
        const canBuy = this.state.canAffordVoidUpgrade(vup.id);
        const bg = btn.getAt(0) as Phaser.GameObjects.Rectangle;
        const txt = btn.getAt(1) as Phaser.GameObjects.Text;
        bg.setFillStyle(canBuy ? 0x443366 : 0x222233);
        txt.setText(lvl >= vup.maxLevel ? 'MAX' : canBuy ? 'BUY' : '---');
      }
    }

    // Update rewind button
    const canRewind = this.state.canRewind();
    const previewFrags = canRewind ? this.state.calculateRewindFragments() : 0;
    this.rewindPreviewText.setText(
      canRewind ? `Reset everything. Earn ${previewFrags} void fragments.` : 'Reach Level 4 to unlock.',
    );
    this.rewindBtnBg.setFillStyle(canRewind ? 0x553388 : 0x222233);
    this.rewindBtnBg.setStrokeStyle(2, canRewind ? 0x8855CC : 0x333344);
    const rewindTxt = this.rewindBtn.getAt(1) as Phaser.GameObjects.Text;
    rewindTxt.setColor(canRewind ? '#FFFFFF' : '#555566');
  }

  /* ---- Gear panel (equipment + crafting) ---- */

  private createGearPanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);
    const scrollContainer = this.scene.add.container(0, 0);
    const cx = LAYOUT.CENTER_X;
    let curY = LAYOUT.CONTENT_TOP_WIDE + 10;

    // Equipment title
    const eqTitle = makeText(this.scene, cx, curY, 'EQUIPMENT', 22, '#AAAAAA', {
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    scrollContainer.add(eqTitle);
    curY += 34;

    // Equipment slots (4 rows)
    for (const slot of EQUIP_SLOTS) {
      const slotIcon = EQUIP_SLOT_ICONS[slot];
      const gearId = this.state.equipment[slot];
      const gear = gearId ? GEAR_POOL.find(g => g.id === gearId) : null;

      let label: string;
      let color: string;
      const textX = 40;
      if (gear) {
        const hasGearIcon = this.scene.textures.exists(`icon_${gear.id}`);
        if (hasGearIcon) {
          label = `${slotIcon} ${slot.toUpperCase()}: ${gear.name} (${gear.tier}) \u2014 ${gear.description}`;
          const gIcon = this.createIcon(textX + 16, curY + 12, gear.id, 80);
          if (gIcon) {
            scrollContainer.add(gIcon);
            this.gearSlotIcons.set(slot, gIcon);
          }
        } else {
          label = `${slotIcon} ${slot.toUpperCase()}: ${gear.icon} ${gear.name} (${gear.tier}) \u2014 ${gear.description}`;
        }
        color = GEAR_TIER_COLORS[gear.tier];
      } else {
        label = `${slotIcon} ${slot.toUpperCase()}: -- empty --`;
        color = '#555555';
      }

      const slotTxt = makeText(this.scene, textX, curY, label, 17, color, {
        wordWrap: { width: 640 },
      });
      scrollContainer.add(slotTxt);
      this.gearSlotTexts.set(slot, slotTxt);
      curY += 36;
    }

    // Gear bonuses summary
    curY += 4;
    this.gearBonusText = makeText(this.scene, 40, curY, '', 14, '#88FF88', {
      wordWrap: { width: 640 },
    });
    this.updateGearBonusText();
    scrollContainer.add(this.gearBonusText);
    curY += this.gearBonusText.height + 16;

    // Divider
    const divider = this.scene.add.rectangle(cx, curY, 620, 2, 0x444444).setDepth(15);
    scrollContainer.add(divider);
    curY += 16;

    // Crafting title
    const craftTitle = makeText(this.scene, cx, curY, 'CRAFTING', 22, '#AAAAAA', {
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    scrollContainer.add(craftTitle);
    curY += 34;

    // Crafting recipes
    for (const recipe of RECIPES) {
      const row = this.scene.add.container(0, 0);

      // Recipe name + description
      const nameTxt = makeText(this.scene, 40, curY, `${recipe.icon}  ${recipe.name}`, 18, '#EEEEEE', {
        fontStyle: 'bold',
      });
      row.add(nameTxt);

      const descTxt = makeText(this.scene, 40, curY + 24, recipe.description, 14, '#AAAAAA');
      row.add(descTxt);

      // Ingredients
      const ingStr = recipe.ingredients
        .map(ing => `${ing.amount} ${RESOURCES[ing.resourceId].icon}`)
        .join(' + ');
      const costTxt = makeText(this.scene, 40, curY + 44, `Cost: ${ingStr}`, 14, '#CCCCCC');
      row.add(costTxt);
      this.craftCostTexts.set(recipe.id, costTxt);

      // Craft button
      const canCraft = this.state.canCraft(recipe.id);
      const craftBtn = makeBtn(this.scene, 600, curY + 36, canCraft ? 'CRAFT' : '---', 110, 32,
        canCraft ? 0x336633 : 0x333333, () => this.cb.onCraft(recipe.id));
      row.add(craftBtn);
      this.craftBtns.set(recipe.id, craftBtn);

      scrollContainer.add(row);

      // Divider
      const recipeDivider = this.scene.add.rectangle(cx, curY + 70, 620, 1, 0x333333).setDepth(15);
      scrollContainer.add(recipeDivider);
      curY += 80;
    }

    panel.add(scrollContainer);

    // Mask and scroll
    const contentH = LAYOUT.CONTENT_BOTTOM_WIDE - LAYOUT.CONTENT_TOP_WIDE - 10;
    const maskGfx = this.scene.add.graphics();
    maskGfx.setVisible(false);
    maskGfx.fillRect(0, LAYOUT.CONTENT_TOP_WIDE, LAYOUT.GAME_WIDTH, contentH);
    panel.setMask(maskGfx.createGeometryMask());

    const totalH = curY - LAYOUT.CONTENT_TOP_WIDE;
    if (totalH > contentH) {
      const dragZone = this.scene.add.rectangle(
        cx, LAYOUT.CONTENT_TOP_WIDE + contentH / 2,
        LAYOUT.GAME_WIDTH, contentH, 0x000000, 0,
      ).setDepth(16).setInteractive();

      let dragging = false;
      let lastPointerY = 0;
      const minScroll = -(totalH - contentH);

      dragZone.on('pointerdown', (_p: Phaser.Input.Pointer) => {
        dragging = true;
        lastPointerY = _p.y;
      });
      this.scene.input.on('pointermove', (_p: Phaser.Input.Pointer) => {
        if (!dragging || !this.panels.get('gear')?.visible) return;
        const dy = _p.y - lastPointerY;
        lastPointerY = _p.y;
        scrollContainer.y = Phaser.Math.Clamp(scrollContainer.y + dy, minScroll, 0);
      });
      this.scene.input.on('pointerup', () => { dragging = false; });

      panel.add(dragZone);
    }

    this.panels.set('gear', panel);
  }

  private updateGearBonusText(): void {
    const bonuses: string[] = [];
    const keys: [string, string][] = [
      ['exploreSpeed', 'speed'], ['findRate', 'find'], ['damageReduction', 'dmg red'],
      ['sanityReduction', 'san red'], ['entityAvoidance', 'avoid'],
    ];
    for (const [key, label] of keys) {
      const val = this.state.getGearBonus(key);
      if (val > 0) bonuses.push(`+${val}% ${label}`);
    }
    this.gearBonusText.setText(bonuses.length > 0 ? `Gear bonuses: ${bonuses.join(', ')}` : 'No gear equipped');
  }

  refreshGearPanel(): void {
    // Update equipment slots
    for (const slot of EQUIP_SLOTS) {
      const txt = this.gearSlotTexts.get(slot);
      if (!txt) continue;
      const slotIcon = EQUIP_SLOT_ICONS[slot];
      const gearId = this.state.equipment[slot];
      const gear = gearId ? GEAR_POOL.find(g => g.id === gearId) : null;

      // Remove old gear icon image if any
      const oldIcon = this.gearSlotIcons.get(slot);
      if (oldIcon) {
        oldIcon.destroy();
        this.gearSlotIcons.delete(slot);
      }

      if (gear) {
        const hasGearIcon = this.scene.textures.exists(`icon_${gear.id}`);
        if (hasGearIcon) {
          txt.setText(`${slotIcon} ${slot.toUpperCase()}: ${gear.name} (${gear.tier}) \u2014 ${gear.description}`);
          // Recreate the gear icon image at the text's position
          const gIcon = this.createIcon(txt.x + 16, txt.y + 12, gear.id, 80);
          if (gIcon) {
            // Add to the gear panel's scroll container
            const gearPanel = this.panels.get('gear');
            if (gearPanel) {
              const scrollCont = gearPanel.getAt(0) as Phaser.GameObjects.Container;
              scrollCont.add(gIcon);
            }
            this.gearSlotIcons.set(slot, gIcon);
          }
        } else {
          txt.setText(`${slotIcon} ${slot.toUpperCase()}: ${gear.icon} ${gear.name} (${gear.tier}) \u2014 ${gear.description}`);
        }
        txt.setColor(GEAR_TIER_COLORS[gear.tier]);
      } else {
        txt.setText(`${slotIcon} ${slot.toUpperCase()}: -- empty --`);
        txt.setColor('#555555');
      }
    }

    // Update gear bonus summary
    this.updateGearBonusText();

    // Update craft buttons
    for (const recipe of RECIPES) {
      const btn = this.craftBtns.get(recipe.id);
      if (btn) {
        const canCraft = this.state.canCraft(recipe.id);
        const bg = btn.getAt(0) as Phaser.GameObjects.Rectangle;
        const txt = btn.getAt(1) as Phaser.GameObjects.Text;
        bg.setFillStyle(canCraft ? 0x336633 : 0x333333);
        txt.setText(canCraft ? 'CRAFT' : '---');
      }
    }
  }

  /* ---- Shop panel (Phase 5) ---- */

  private createShopPanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);
    const contentH = LAYOUT.CONTENT_BOTTOM_WIDE - LAYOUT.CONTENT_TOP_WIDE - 10;
    const cx = LAYOUT.CENTER_X;

    const scrollContainer = this.scene.add.container(0, 0);
    this.shopScroll = scrollContainer;

    const LX = UIManager.UPG_LEFT;
    const BW = UIManager.UPG_BTN_W;
    const BH = UIManager.UPG_BTN_H;
    const BCY = UIManager.UPG_BTN_CY;
    const rowH = UIManager.UPG_ROW_H;

    // Header (scrolls with the list): shard balance + how to earn.
    const headerY = LAYOUT.CONTENT_TOP_WIDE + 10;
    const vsIcon = this.createIcon(cx - 150, headerY + 16, 'void_shard', 60);
    if (vsIcon) scrollContainer.add(vsIcon);
    this.shopShardLabel = makeText(this.scene, vsIcon ? cx - 120 : cx, headerY,
      `Void Shards: ${this.state.voidShards}`, 22, '#CC88FF', { fontStyle: 'bold' })
      .setOrigin(vsIcon ? 0 : 0.5, 0);
    scrollContainer.add(this.shopShardLabel);
    const earnInfo = makeText(this.scene, cx, headerY + 36,
      'Earn a Void Shard by maxing an upgrade or reaching a new floor.',
      13, '#8888AA').setOrigin(0.5, 0);
    scrollContainer.add(earnInfo);

    const firstCardY = headerY + 70;

    for (let i = 0; i < SHOP_UPGRADES.length; i++) {
      const sup = SHOP_UPGRADES[i];
      // Card row — mirrors the upgrade panel (name / desc / level stacked, cost button below).
      const row = this.scene.add.container(0, firstCardY + i * rowH);

      const nameTxt = makeText(this.scene, LX, 0, sup.icon ? `${sup.icon}  ${sup.name}` : sup.name, 22, '#EEEEEE', { fontStyle: 'bold' });
      const descTxt = makeText(this.scene, LX, 32, sup.description, 14, '#AAAAAA', { wordWrap: { width: 620 } });
      const lvl = this.state.getShopLevel(sup.id);
      const lvlTxt = makeText(this.scene, LX, 58, `Lv ${lvl}/${sup.maxLevel}`, 16, '#c8a8ff');
      this.shopLvlLabels.set(sup.id, lvlTxt);

      const btnBg = this.scene.add.rectangle(LX + BW / 2, BCY, BW, BH, 0x333333, 1)
        .setStrokeStyle(2, 0x555555)
        .setInteractive({ useHandCursor: true });
      btnBg.on('pointerup', () => { if (!this.shopDragMoved) this.cb.onBuyShopUpgrade(sup.id); });
      const costIcon = this.createIcon(LX + 34, BCY, 'void_shard', 44);
      if (costIcon) this.shopCostIcons.set(sup.id, costIcon);
      const costLabel = makeText(this.scene, LX + BW / 2, BCY, '', 18, '#FFFFFF', { fontStyle: 'bold' })
        .setOrigin(0.5, 0.5);

      const card = this.scene.add.rectangle(LAYOUT.CENTER_X, 70, 676, 152, 0x1e1e1e, 0.9)
        .setStrokeStyle(1, 0x3a3a3a);

      row.add(card);
      row.add([nameTxt, descTxt, lvlTxt, btnBg]);
      if (costIcon) row.add(costIcon);
      row.add(costLabel);

      scrollContainer.add(row);
      this.shopRows.set(sup.id, row);
      this.shopBuyBg.set(sup.id, btnBg);
      this.shopCostLabels.set(sup.id, costLabel);
      this.renderShopRow(sup);
    }

    panel.add(scrollContainer);

    // Clip to the content area.
    const maskGfx = this.scene.add.graphics();
    maskGfx.setVisible(false);
    maskGfx.fillRect(0, LAYOUT.CONTENT_TOP_WIDE, LAYOUT.GAME_WIDTH, contentH);
    panel.setMask(maskGfx.createGeometryMask());

    const totalH = (firstCardY + SHOP_UPGRADES.length * rowH) - (LAYOUT.CONTENT_TOP_WIDE + 10);
    this.shopMinScroll = Math.min(0, contentH - totalH);

    // Drag-to-scroll (same gesture model as the upgrade panel, gated to this tab).
    this.scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.activeTab !== 'shop') return;
      if (p.y < LAYOUT.CONTENT_TOP_WIDE || p.y > LAYOUT.CONTENT_BOTTOM_WIDE) return;
      this.shopDragActive = true;
      this.shopDragMoved = false;
      this.shopDragStartPointer = p.y;
      this.shopDragStartScroll = scrollContainer.y;
    });
    this.scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.shopDragActive) return;
      const dy = p.y - this.shopDragStartPointer;
      if (Math.abs(dy) > 6) this.shopDragMoved = true;
      scrollContainer.y = Phaser.Math.Clamp(this.shopDragStartScroll + dy, this.shopMinScroll, 0);
    });
    this.scene.input.on('pointerup', () => { this.shopDragActive = false; });
    this.scene.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.activeTab !== 'shop' || !this.shopScroll) return;
      this.shopScroll.y = Phaser.Math.Clamp(this.shopScroll.y - dy, this.shopMinScroll, 0);
    });

    this.panels.set('shop', panel);
  }

  /** Refresh one shop-upgrade card's level + cost button (MAXED state hides the icon). */
  private renderShopRow(sup: ShopUpgradeDef): void {
    const lvl = this.state.getShopLevel(sup.id);
    const maxed = lvl >= sup.maxLevel;
    const canBuy = this.state.canAffordShopUpgrade(sup.id);
    const cost = this.state.getShopUpgradeCost(sup.id);

    this.shopLvlLabels.get(sup.id)?.setText(`Lv ${lvl}/${sup.maxLevel}`);

    const bg = this.shopBuyBg.get(sup.id);
    if (bg) bg.setFillStyle(maxed ? 0x2a2a2a : canBuy ? 0x443366 : 0x333333);
    this.shopCostIcons.get(sup.id)?.setVisible(!maxed);
    const label = this.shopCostLabels.get(sup.id);
    if (label) {
      if (maxed) label.setText('MAXED').setColor('#c8a8ff');
      else label.setText(`${cost} Void Shards`).setColor(canBuy ? '#FFFFFF' : '#AAAAAA');
    }
  }

  refreshShopPanel(): void {
    this.shopShardLabel.setText(`Void Shards: ${this.state.voidShards}`);
    for (const sup of SHOP_UPGRADES) this.renderShopRow(sup);
  }

  /* ---- Achievements panel (cards + claim buttons; mirrors the shop panel) ---- */

  private createAchievementsPanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);
    const contentH = LAYOUT.CONTENT_BOTTOM_WIDE - LAYOUT.CONTENT_TOP_WIDE - 10;

    const scrollContainer = this.scene.add.container(0, 0);
    this.achScroll = scrollContainer;

    // Achievement cards are TALLER than upgrade/shop cards to fit a progress bar
    // between the level line and the claim button. (Local geometry, not the UPG_* set.)
    const LX = UIManager.UPG_LEFT;
    const BW = UIManager.UPG_BTN_W;        // 640 — shared horizontal span
    const BH = 50;                         // claim button height
    const CARD_H = 188;
    const CARD_CY = 88;                    // card local center (spans -6..182)
    const BAR_Y = 88;                      // progress bar center
    const BAR_H = 22;
    const BCY = 138;                       // claim button center
    const rowH = CARD_H + 14;              // card + gap
    const startY = LAYOUT.CONTENT_TOP_WIDE + 10;

    // Header (scrolls with the cards): the global auto-search bonus every claimed
    // tier grants (+0.5% each, summed across ALL achievements). Total on the left,
    // the "N levels x 0.5%" breakdown on the right.
    this.achBonusLabel = makeText(this.scene, LX, startY, '', 18, '#9fd0a0', { fontStyle: 'bold' })
      .setOrigin(0, 0);
    this.achLevelsLabel = makeText(this.scene, LX + BW, startY, '', 16, '#8aa88a')
      .setOrigin(1, 0);
    scrollContainer.add([this.achBonusLabel, this.achLevelsLabel]);
    const firstCardY = startY + 44;

    for (let i = 0; i < ACHIEVEMENTS.length; i++) {
      const ach = ACHIEVEMENTS[i];
      const row = this.scene.add.container(0, firstCardY + i * rowH);

      const nameTxt = makeText(this.scene, LX, 0, ach.name, 22, '#EEEEEE', { fontStyle: 'bold' });
      const descTxt = makeText(this.scene, LX, 30, ach.description, 14, '#AAAAAA', { wordWrap: { width: 620 } });
      const lvlTxt = makeText(this.scene, LX, 56, `Lv ${this.state.getAchievementLevel(ach.id)}/${ach.thresholds.length}`, 16, '#c8a8ff');
      this.achLvlLabels.set(ach.id, lvlTxt);

      // Progress bar toward the NEXT tier: track + green fill (scaled by ratio) + a
      // centered "current / threshold" label. Always visible so the requirement is clear.
      const barBg = this.scene.add.rectangle(LX + BW / 2, BAR_Y, BW, BAR_H, 0x111111, 1)
        .setStrokeStyle(1, 0x444444);
      const barFill = this.scene.add.rectangle(LX, BAR_Y, BW, BAR_H, 0x3a9a3a, 1).setOrigin(0, 0.5);
      this.achProgFill.set(ach.id, barFill);
      const progTxt = makeText(this.scene, LX + BW / 2, BAR_Y, '', 14, '#FFFFFF', { fontStyle: 'bold' })
        .setOrigin(0.5);
      this.achProgLabels.set(ach.id, progTxt);

      // Claim button.
      const btnBg = this.scene.add.rectangle(LX + BW / 2, BCY, BW, BH, 0x333333, 1)
        .setStrokeStyle(2, 0x555555)
        .setInteractive({ useHandCursor: true });
      btnBg.on('pointerup', () => { if (!this.achDragMoved) this.cb.onClaimAchievement(ach.id); });
      const rewardIcon = this.createIcon(LX + BW - 40, BCY, 'void_shard', 38);
      if (rewardIcon) this.achBtnIcons.set(ach.id, rewardIcon);
      const btnLabel = makeText(this.scene, LX + BW / 2, BCY, '', 18, '#FFFFFF', { fontStyle: 'bold' })
        .setOrigin(0.5, 0.5);

      const card = this.scene.add.rectangle(LAYOUT.CENTER_X, CARD_CY, 676, CARD_H, 0x1e1e1e, 0.9)
        .setStrokeStyle(1, 0x3a3a3a);

      row.add(card);
      row.add([nameTxt, descTxt, lvlTxt, barBg, barFill, progTxt, btnBg]);
      if (rewardIcon) row.add(rewardIcon);
      row.add(btnLabel);

      scrollContainer.add(row);
      this.achBtnBg.set(ach.id, btnBg);
      this.achBtnLabels.set(ach.id, btnLabel);
      this.renderAchievementRow(ach);
    }

    panel.add(scrollContainer);

    const maskGfx = this.scene.add.graphics();
    maskGfx.setVisible(false);
    maskGfx.fillRect(0, LAYOUT.CONTENT_TOP_WIDE, LAYOUT.GAME_WIDTH, contentH);
    panel.setMask(maskGfx.createGeometryMask());

    this.achMinScroll = Math.min(0, contentH - (44 + ACHIEVEMENTS.length * rowH));

    this.scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.activeTab !== 'achievements') return;
      if (p.y < LAYOUT.CONTENT_TOP_WIDE || p.y > LAYOUT.CONTENT_BOTTOM_WIDE) return;
      this.achDragActive = true;
      this.achDragMoved = false;
      this.achDragStartPointer = p.y;
      this.achDragStartScroll = scrollContainer.y;
    });
    this.scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.achDragActive) return;
      const dy = p.y - this.achDragStartPointer;
      if (Math.abs(dy) > 6) this.achDragMoved = true;
      scrollContainer.y = Phaser.Math.Clamp(this.achDragStartScroll + dy, this.achMinScroll, 0);
    });
    this.scene.input.on('pointerup', () => { this.achDragActive = false; });
    this.scene.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.activeTab !== 'achievements' || !this.achScroll) return;
      this.achScroll.y = Phaser.Math.Clamp(this.achScroll.y - dy, this.achMinScroll, 0);
    });

    this.panels.set('achievements', panel);
  }

  /** Refresh one achievement card: level, progress bar/label, and claim button. */
  private renderAchievementRow(ach: AchievementDef): void {
    const lvl = this.state.getAchievementLevel(ach.id);
    const maxed = lvl >= ach.thresholds.length;
    const claimable = this.state.canClaimAchievement(ach.id);
    const progress = this.state.getAchievementProgress(ach.stat);

    this.achLvlLabels.get(ach.id)?.setText(`Lv ${lvl}/${ach.thresholds.length}`);

    // Progress bar + label toward the next tier (full + "MAXED" when all tiers done).
    const fill = this.achProgFill.get(ach.id);
    const progLabel = this.achProgLabels.get(ach.id);
    if (maxed) {
      if (fill) { fill.scaleX = 1; fill.setFillStyle(0x6a5a9a); }
      progLabel?.setText('MAXED');
    } else {
      const threshold = ach.thresholds[lvl];
      const ratio = Math.max(0, Math.min(1, progress / threshold));
      if (fill) { fill.scaleX = ratio; fill.setFillStyle(claimable ? 0x4cc24c : 0x3a9a3a); }
      progLabel?.setText(`${fmt(D(progress))} / ${fmt(D(threshold))}`);
    }

    // Claim button.
    const bg = this.achBtnBg.get(ach.id);
    if (bg) bg.setFillStyle(maxed ? 0x2a2a2a : claimable ? 0x336633 : 0x333333);
    const icon = this.achBtnIcons.get(ach.id);
    if (icon) icon.setVisible(!maxed);
    const label = this.achBtnLabels.get(ach.id);
    if (label) {
      if (maxed) label.setText('ALL CLAIMED').setColor('#c8a8ff');
      else label.setText(`CLAIM  +${this.state.getAchievementReward(ach.id)}`).setColor(claimable ? '#9fffa0' : '#777777');
    }
  }

  refreshAchievementsPanel(): void {
    const levels = this.state.totalAchievementLevels;
    this.achBonusLabel?.setText(`Auto Search Bonus: +${(levels * 0.5).toFixed(1)}%`);
    this.achLevelsLabel?.setText(`${levels} levels x 0.5%`);
    for (const ach of ACHIEVEMENTS) this.renderAchievementRow(ach);
  }

  /* ================================================================ */
  /*  Tab switching                                                    */
  /* ================================================================ */

  showTab(tab: string): void {
    this.activeTab = tab;
    for (const [id, panel] of this.panels) {
      panel.setVisible(id === tab);
    }
    // Update tab button visuals
    for (const [id, bg] of this.tabBGs) {
      const isActive = id === tab;
      bg.setFillStyle(isActive ? 0x444444 : 0x222222);
      bg.setStrokeStyle(1, isActive ? 0x888888 : 0x444444);
      const txt = (bg as unknown as Record<string, Phaser.GameObjects.Text>).__tabTxt;
      if (txt) txt.setColor(isActive ? '#FFFFFF' : '#888888');
    }

    if (tab === 'upgrades') this.refreshUpgradePanel();
    if (tab === 'items') this.refreshItemCounts();
    if (tab === 'void') this.refreshVoidPanel();
    if (tab === 'gear') this.refreshGearPanel();
    if (tab === 'shop') this.refreshShopPanel();
    if (tab === 'achievements') this.refreshAchievementsPanel();
    this.refreshTabNotifs();   // hide the current tab's dot, re-show others' as needed

    // Toggle showcase icon visibility with explore tab
    if (this.showcaseBig) this.showcaseBig.setVisible(tab === 'explore');
    if (tab !== 'explore') this.stopHoldExplore();

    // The bottom resource readout reflects the resource you're actively
    // collecting, so it only belongs on the explore page.
    const onExplore = tab === 'explore';
    this.resBarCard?.setVisible(onExplore);
    this.resBarName?.setVisible(onExplore);
    this.resBarText?.setVisible(onExplore);
    if (onExplore) this.updateResourceBar();        // refreshes icon + relayout
    else this.resBarIcon?.setVisible(false);

    // Explore uses the full header + a resource bar below the content; other tabs
    // collapse the header to a title band and reclaim the space top and bottom.
    const cTop = onExplore ? LAYOUT.CONTENT_TOP : LAYOUT.CONTENT_TOP_WIDE;
    const cBottom = onExplore ? LAYOUT.CONTENT_BOTTOM : LAYOUT.CONTENT_BOTTOM_WIDE;
    this.setContentBounds(cTop, cBottom);

    // Header: full floor status on Explore; just the menu title (centered in the
    // slim header band) elsewhere.
    this.levelText.setText(onExplore ? this.state.level.name : this.headerTitle(tab))
      .setY(onExplore ? 42 : (8 + (cTop - 12)) / 2);
    this.depthText.setVisible(onExplore);
    this.progBarBg.setVisible(onExplore);
    this.progFill.setVisible(onExplore);
    this.progLabel.setVisible(onExplore);
    this.roomsLabel.setVisible(onExplore);

    // "Hide maxed" toggle belongs to the Upgrades tab only.
    this.hideMaxedBtn?.setVisible(tab === 'upgrades');

    // Hide void notification dot when viewing VOID tab
    if (tab === 'void' && this.voidNotifDot) this.voidNotifDot.setVisible(false);
  }

  /** Header title shown on non-explore tabs (the menu name). */
  private headerTitle(tab: string): string {
    switch (tab) {
      case 'items': return 'ITEMS';
      case 'upgrades': return 'UPGRADES';
      case 'void': return 'THE VOID';
      case 'gear': return 'GEAR';
      case 'shop': return 'SHOP';
      case 'achievements': return 'ACHIEVEMENTS';
      default: return this.state.level.name;
    }
  }

  /**
   * Resize the header + content cards to a tab's vertical bounds. The content card
   * spans `top`..`bottom`; the header card fills the strip above it (down to
   * `top - 12`). On Explore that's the full header; on menus it's a slim title band.
   */
  private setContentBounds(top: number, bottom: number): void {
    const W = LAYOUT.GAME_WIDTH;
    if (this.contentCard) {
      this.contentCard.setPosition(W / 2, (top + bottom) / 2);
      this.contentCard.setSize(W - 20, bottom - top + 20);
    }
    if (this.headerCard) {
      const hTop = 8;                 // header card starts just below the screen top
      const hBottom = top - 12;       // ...and ends just above the content card
      this.headerCard.setPosition(W / 2, (hTop + hBottom) / 2);
      this.headerCard.setSize(W - 20, hBottom - hTop);
    }
  }

  /* ================================================================ */
  /*  Log                                                              */
  /* ================================================================ */

  addLogMessage(evt: GameEvent): void {
    // The focal explore icon is ALWAYS the floor's resource — never a monster.
    // Only resource events re-pop it; entities/ambient are flavor text only.
    if (evt.iconKey && evt.type === 'resource') this.popShowcase(evt.iconKey, this.state.floorOre.tier);

    if (this.activeTab !== 'explore') return;

    if (evt.type === 'resource') {
      // Resource feedback = "+N ResourceName!" that pops in (scale/fade up), holds
      // a beat, then vanishes — in place, no long upward float.
      if (evt.value) {
        const resName = evt.iconKey ? (RESOURCES[evt.iconKey]?.name ?? '') : '';
        // Fixed spot just below the focal icon — centered, no drift.
        const mx = LAYOUT.CENTER_X;
        const my = this.showcaseCenterY() + 120;
        // Special finds read big: mint = mint-green ✨ (biggest), quality = orange ✨,
        // normal = plain gold. Sparkles + a bigger pop scale the rarer it is.
        const special = evt.mint || evt.quality;
        const label = special ? `✨ +${evt.value} ${resName}! ✨` : `+${evt.value} ${resName}!`;
        const color = evt.mint ? '#5FFFC4' : evt.quality ? '#FFA500' : '#FFD700';
        const popScale = evt.mint ? 1.4 : evt.quality ? 1.25 : 1;
        const mote = makeText(this.scene, mx, my, label, 18, color, {
          fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(20).setScale(0.4).setAlpha(0);
        this.panels.get('explore')?.add(mote);
        this.scene.tweens.add({
          targets: mote, scale: popScale, alpha: 1, duration: 140, ease: 'Back.easeOut',
          onComplete: () => this.scene.tweens.add({
            targets: mote, alpha: 0, delay: 260, duration: 280, ease: 'Sine.easeIn',
            onComplete: () => mote.destroy(),
          }),
        });
      }
      return;
    }

    // Entity / ambient flavor = a line above the icon that stays put (no upward
    // drift) and lingers long enough to read, then fades. One reusable label so
    // a new line replaces the old instead of overlapping it.
    if (!this.flavorMsg) {
      this.flavorMsg = makeText(this.scene, LAYOUT.CENTER_X, this.showcaseCenterY() - 200, '', 20, evt.color, {
        align: 'center', wordWrap: { width: 600 }, fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(19);
      this.panels.get('explore')?.add(this.flavorMsg);
    }
    this.flavorMsg.setText(evt.message).setColor(evt.color).setAlpha(1);
    this.flavorTween?.stop();
    this.flavorTween = this.scene.tweens.add({
      targets: this.flavorMsg, alpha: 0,
      delay: 3500, duration: 800, ease: 'Sine.easeIn',
    });
  }

  /* ================================================================ */
  /*  Live updates                                                     */
  /* ================================================================ */

  updateStatusBars(): void {
    // Everything here is explore-screen content (exploration bar, node Integrity,
    // floor arrows). Other tabs show only the menu title — see showTab.
    if (this.activeTab !== 'explore') return;
    const { BAR_WIDTH, BAR_X } = LAYOUT;
    const s = this.state;
    const ore = s.floorOre;
    const oreName = (RESOURCES[ore.resource]?.name ?? ore.resource) + tierSuffix(ore.tier);
    const done = s.exploration >= ore.required;

    const progW = BAR_WIDTH * Math.max(0, s.explorationPct / 100);
    this.progFill.width = Phaser.Math.Linear(this.progFill.width, progW, 0.15);
    this.progFill.x = BAR_X;
    this.progLabel.setText(done ? `${oreName} — DESCEND!` : `Exploring for ${oreName}`);
    // Counter shows N / required while exploring; on clearing it flashes
    // "Cleared!" once, then hides.
    if (done) {
      if (!this.floorCleared) {
        this.floorCleared = true;
        this.roomsLabel.setText('Cleared!').setVisible(true);
        this.scene.time.delayedCall(1300, () => {
          if (this.floorCleared) this.roomsLabel.setVisible(false);
        });
      }
    } else {
      this.floorCleared = false;
      this.roomsLabel.setVisible(true).setText(`${Math.min(ore.required, Math.floor(s.exploration))} / ${ore.required}`);
    }

    // Integrity (node HP) bar — DRAINS as you search. Lerped so it glides, and
    // tinted from amber → red as the node gets close to breaking.
    const integ = s.nodeIntegrityMax;
    const remaining = integ.sub(s.nodeDamage).max(0);
    const remainPct = Math.max(0, Math.min(1, remaining.div(integ).toNumber()));
    if (this.durFill) {
      this.durFill.width = Phaser.Math.Linear(this.durFill.width, 240 * remainPct, 0.25);
      this.durFill.setFillStyle(remainPct > 0.5 ? 0xffcc44 : remainPct > 0.25 ? 0xff9933 : 0xff5544);
    }
    // Explicit HP readout. During respawn this naturally reads "0 / max".
    if (this.durLabel) {
      this.durLabel.setText(`${fmt(remaining)} / ${fmt(integ)}`);
    }

    // Grade tag above the icon: "MINT" (mint green) or "QUALITY" (orange), shown only
    // on a live pre-rolled node (hidden mid-respawn) so the player breaks it on purpose.
    if (this.qualityLabel) {
      const live = !s.isRespawning;
      const show = live && (s.nodeIsMint || s.nodeIsQuality);
      if (show) {
        this.qualityLabel.setText(s.nodeIsMint ? 'MINT' : 'QUALITY');
        this.qualityLabel.setColor(s.nodeIsMint ? '#5FFFC4' : '#FFA500');
        if (!this.qualityLabel.visible) {
          this.qualityLabel.setVisible(true);
          this.scene.tweens.add({
            targets: this.qualityLabel, scale: { from: 1, to: 1.12 },
            duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          });
        }
      } else if (this.qualityLabel.visible) {
        this.scene.tweens.killTweensOf(this.qualityLabel);
        this.qualityLabel.setScale(1).setVisible(false);
      }
    }

    // Right arrow (go deeper): GREEN only when you can descend into NEW territory
    // you haven't unlocked yet (the "move forward" signal). Once the next floor
    // is already unlocked, it's just navigation — gray like the left arrow.
    if (this.exploreDescendBg && this.exploreDescendTxt) {
      const nextUnlocked = s.unlockedLevels.includes(s.currentLevel + 1);
      const newReady = s.canEscape() && !nextUnlocked;
      const enabled = nextUnlocked || s.canEscape();
      this.exploreDescendBg.setFillStyle(newReady ? 0x2c6a3c : enabled ? 0x2a2a2a : 0x1e1e1e);
      this.exploreDescendBg.setStrokeStyle(3, newReady ? 0x66cc88 : enabled ? 0x555555 : 0x333333);
      this.exploreDescendTxt.setColor(newReady ? '#FFFFFF' : enabled ? '#DDDDDD' : '#555555');
    }
    // Right arrow preview = the NEXT floor's resource icon.
    this.setArrowIcon(this.rightArrowIcon, getFloorOre(s.currentLevel + 1).resource);

    // Left arrow (go back up): enabled whenever you're below floor 0.
    if (this.leftArrowBg && this.leftArrowTxt) {
      const canBack = s.currentLevel > 0;
      this.leftArrowBg.setFillStyle(canBack ? 0x2a2a2a : 0x1e1e1e);
      this.leftArrowBg.setStrokeStyle(3, canBack ? 0x555555 : 0x333333);
      this.leftArrowTxt.setColor(canBack ? '#DDDDDD' : '#555555');
    }
    // Left arrow preview = the PREVIOUS floor's resource (hidden on floor 0).
    this.setArrowIcon(this.leftArrowIcon, s.currentLevel > 0 ? getFloorOre(s.currentLevel - 1).resource : null);
  }

  /** Point an arrow's preview image at a resource icon, or hide it if none. */
  private setArrowIcon(icon: Phaser.GameObjects.Image | undefined, resource: string | null): void {
    if (!icon) return;
    const key = resource ? `icon_${resource}` : '';
    if (resource && this.scene.textures.exists(key)) {
      icon.setTexture(key).setScale(56 / ICON_NATIVE).setVisible(true);
    } else {
      icon.setVisible(false);
    }
  }

  updateResourceBar(): void {
    // Show the resource you're currently collecting — icon + count both follow
    // the active floor.
    const res = this.state.floorOre.resource;
    const key = `icon_${res}`;
    // The readout only lives on the explore tab; never re-show it elsewhere.
    const onExplore = this.activeTab === 'explore';
    const hasIcon = this.scene.textures.exists(key);
    if (this.resBarIcon) {
      if (hasIcon && onExplore) {
        this.resBarIcon.setTexture(key).setScale(72 / ICON_NATIVE).setVisible(true);
      } else {
        this.resBarIcon.setVisible(false);
      }
    }
    if (this.resBarName) {
      // Fall back to the emoji glyph as a prefix when no PNG icon is loaded.
      this.resBarName.setText(hasIcon ? RESOURCES[res].name : `${RESOURCES[res].icon} ${RESOURCES[res].name}`);
    }
    if (this.resBarText) {
      this.resBarText.setText(fmt(this.state.resources[res] ?? D(0)));
    }
    this.layoutResourceBar();
    // Keep item counts in sync when viewing items tab
    if (this.activeTab === 'items') this.refreshItemCounts();
    // Collecting may have made an upgrade affordable or finished exploring a floor
    // → refresh the tab alert dots.
    this.refreshTabNotifs();
  }

  refreshItemCounts(): void {
    for (const resId of RESOURCE_ORDER) {
      const txt = this.resTexts.get(`item_${resId}`);
      if (txt) txt.setText(`x${fmt(this.state.resources[resId] ?? D(0))}`);
    }
  }

  /**
   * Refresh the cost-line button: "[icon] owned/cost ResourceName" (or MAXED).
   * Green when affordable, dark otherwise; the icon hides at max level.
   */
  private updateCostButton(upg: UpgradeDef): void {
    const lvl = this.state.getUpgradeLevel(upg.id);
    const maxed = lvl >= upg.maxLevel;
    const canBuy = this.state.canAffordUpgrade(upg.id);
    // Cost resource can change per level (cycling upgrades like Master Scav).
    const resId = this.state.getUpgradeCostResource(upg.id);
    const owned = this.state.resources[resId] ?? D(0);
    const cost = this.state.getUpgradeCost(upg.id);
    const resName = RESOURCES[resId]?.name ?? resId;
    const LX = UIManager.UPG_LEFT;

    const bg = this.upgBuyBg.get(upg.id);
    if (bg) bg.setFillStyle(maxed ? 0x2a2a2a : canBuy ? 0x336633 : 0x333333);
    // Swap the icon to the current cost resource (matters for cycling upgrades).
    const icon = this.upgCostIcons.get(upg.id);
    if (icon) {
      const key = `icon_${resId}`;
      if (!maxed && this.scene.textures.exists(key)) icon.setTexture(key).setVisible(true);
      else icon.setVisible(false);
    }
    const label = this.upgCostLabels.get(upg.id);
    if (label) {
      // Always centered in the button; the cost icon sits as a left accent.
      label.setOrigin(0.5, 0.5).setX(LX + UIManager.UPG_BTN_W / 2);
      if (maxed) {
        label.setText('MAXED').setColor('#7CFF7C');
      } else {
        label.setText(`${fmt(owned)}/${fmt(cost)} ${resName}`).setColor('#FFFFFF');
      }
    }
  }

  /**
   * Render one upgrade row — either its real contents, or a "?????? Locked"
   * placeholder until the upgrade's unlockFloor has been reached (progressive
   * reveal). Drives name / description / level / cost button.
   */
  private renderUpgradeRow(upg: UpgradeDef): void {
    const name = this.upgNameLabels.get(upg.id);
    const desc = this.upgDescLabels.get(upg.id);
    const lvlTxt = this.upgLvlLabels.get(upg.id);

    if (!this.state.isUpgradeUnlocked(upg.id)) {
      name?.setText('??????').setColor('#888888');
      desc?.setText('(Locked)').setColor('#666666');
      lvlTxt?.setVisible(false);
      const bg = this.upgBuyBg.get(upg.id);
      if (bg) bg.setFillStyle(0x222222);
      this.upgCostIcons.get(upg.id)?.setVisible(false);
      const label = this.upgCostLabels.get(upg.id);
      label?.setText('\u{1F512} LOCKED').setColor('#777777')
        .setOrigin(0.5, 0.5).setX(UIManager.UPG_LEFT + UIManager.UPG_BTN_W / 2);
      return;
    }

    name?.setText(upg.name).setColor('#EEEEEE');
    desc?.setText(upg.description).setColor('#AAAAAA');
    lvlTxt?.setVisible(true).setText(`Lv ${this.state.getUpgradeLevel(upg.id)}/${upg.maxLevel}`);
    this.updateCostButton(upg);
  }

  refreshUpgradePanel(): void {
    for (const upg of UPGRADES) this.renderUpgradeRow(upg);
    // A purchase can max a row (and, with hideMaxed on, remove it) → restack.
    this.relayoutUpgrades();
  }

  /**
   * Per-tick refresh of ONLY the currently-visible panel's live,
   * resource-dependent bits (e.g. affordability / owned-vs-cost). Off-screen
   * panels cost nothing — they re-sync when shown via showTab. This keeps the
   * per-tick work bounded to one panel no matter how many upgrades/resources
   * exist. Add new tabs here as they gain dynamic, resource-driven content.
   */
  tickRefresh(): void {
    // The tab alert dots are checked every tick regardless of which tab is open.
    this.refreshTabNotifs();
    switch (this.activeTab) {
      case 'upgrades': this.refreshUpgradePanel(); break;
      case 'shop': this.refreshShopPanel(); break;
      case 'achievements': this.refreshAchievementsPanel(); break;
      // gear / void affordability hook in here as they're built out.
    }
  }

  refreshAutoEscape(): void {
    const isOn = this.state.autoEscape;
    this.autoEscBg.setFillStyle(isOn ? 0x336633 : 0x333333);
    this.autoEscBg.setStrokeStyle(1, isOn ? 0x66aa66 : 0x444444);
    this.autoEscTxt.setColor(isOn ? '#88FF88' : '#666666');
  }

  refreshAbilities(): void {
    for (const ab of ABILITIES) {
      const container = this.abilityBtns.get(ab.id);
      if (!container) continue;

      const canUse = this.state.canUseAbility(ab.id);
      const cd = this.state.getAbilityCooldown(ab.id);

      const bg = (container as unknown as Record<string, Phaser.GameObjects.Rectangle>).__bg;
      if (bg) {
        bg.setFillStyle(canUse ? 0x2a3a2a : 0x1a1a1a);
        bg.setStrokeStyle(2, canUse ? 0x448844 : 0x333333);
      }

      // Fallback name text (only exists if no PNG icon)
      const nameTxt = this.abilityLabels.get(`name_${ab.id}`);
      if (nameTxt) nameTxt.setColor(canUse ? '#FFFFFF' : '#666666');

      // Cost resource icon — show when off cooldown, hide when on cooldown
      const costIcon = (container as unknown as Record<string, Phaser.GameObjects.Image>).__costIcon;

      const statusTxt = this.abilityLabels.get(ab.id);
      if (statusTxt) {
        if (cd > 0) {
          statusTxt.setText(`${Math.ceil(cd * 1.5)}s`);
          statusTxt.setColor('#FF8888');
          statusTxt.setX(0);
          if (costIcon) costIcon.setVisible(false);
        } else {
          statusTxt.setText(`${ab.costAmount}`);
          statusTxt.setColor(canUse ? '#88FF88' : '#888888');
          statusTxt.setX(costIcon ? 6 : 0);
          if (costIcon) costIcon.setVisible(true);
        }
      }
    }
  }

  /* ---- Visual effects ---- */

  flashDamage(): void {
    this.scene.tweens.add({
      targets: this.damageOverlay,
      alpha: { from: 0.3, to: 0 },
      duration: 400,
      ease: 'Power2',
    });
    RundotGameAPI.triggerHapticAsync('warning' as never);
  }

  flashDeath(): void {
    this.scene.tweens.add({
      targets: this.damageOverlay,
      alpha: { from: 0.6, to: 0 },
      duration: 800,
      ease: 'Power2',
    });
    RundotGameAPI.triggerHapticAsync('error' as never);
  }

  /* ---- VHS Rewind effect ---- */

  playRewindEffect(fragments: number, onComplete: () => void): void {
    const { GAME_WIDTH, GAME_HEIGHT } = LAYOUT;

    // VHS static overlay
    const staticOverlay = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0x000000, 0,
    ).setDepth(400);

    // Scan lines
    const scanLines = this.scene.add.graphics().setDepth(401).setAlpha(0);
    for (let y = 0; y < GAME_HEIGHT; y += 4) {
      scanLines.fillStyle(0x000000, 0.3);
      scanLines.fillRect(0, y, GAME_WIDTH, 2);
    }

    // "REWIND" text
    const rewindTxt = makeText(this.scene, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40,
      '\u23EA REWIND \u23EA', 48, '#CC88FF', { fontStyle: 'bold' },
    ).setOrigin(0.5).setDepth(402).setAlpha(0);

    const fragTxt = makeText(this.scene, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30,
      `+${fragments} Void Fragments`, 28, '#FFD700', { fontStyle: 'bold' },
    ).setOrigin(0.5).setDepth(402).setAlpha(0);

    // Phase 1: static fills screen
    this.scene.tweens.add({
      targets: staticOverlay,
      alpha: 0.9,
      duration: 600,
      ease: 'Power2',
    });
    this.scene.tweens.add({
      targets: scanLines,
      alpha: 1,
      duration: 400,
    });

    // Phase 2: show text
    this.scene.time.delayedCall(500, () => {
      this.scene.tweens.add({ targets: rewindTxt, alpha: 1, duration: 300 });
      this.scene.tweens.add({ targets: fragTxt, alpha: 1, duration: 300, delay: 200 });
      RundotGameAPI.triggerHapticAsync('success' as never);
    });

    // Phase 3: fade out and rebuild
    this.scene.time.delayedCall(2200, () => {
      this.scene.tweens.add({
        targets: [staticOverlay, scanLines, rewindTxt, fragTxt],
        alpha: 0,
        duration: 500,
        onComplete: () => {
          staticOverlay.destroy();
          scanLines.destroy();
          rewindTxt.destroy();
          fragTxt.destroy();
          onComplete();
        },
      });
    });
  }

  /* ---- Welcome back popup ---- */

  showWelcomeBack(summary: OfflineSummary): void {
    const { GAME_WIDTH, GAME_HEIGHT } = LAYOUT;

    // Dim overlay
    const overlay = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0x000000, 0.7,
    ).setDepth(300).setInteractive();

    // Panel
    const panelW = 520;
    const panelH = 340;
    const panel = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      panelW, panelH, 0x1a1a1a, 0.95,
    ).setDepth(301).setStrokeStyle(2, 0x555555);

    // Title
    const title = makeText(this.scene, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 120,
      'WELCOME BACK', 28, '#FFD700', { fontStyle: 'bold' },
    ).setOrigin(0.5).setDepth(302);

    // Time away
    const timeStr = summary.minutes >= 60
      ? `${Math.floor(summary.minutes / 60)}h ${summary.minutes % 60}m`
      : `${summary.minutes}m`;
    const timeTxt = makeText(this.scene, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 70,
      `You were away for ${timeStr}`, 20, '#AAAAAA',
    ).setOrigin(0.5).setDepth(302);

    // Stats
    const statsTxt = makeText(this.scene, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20,
      `Resources found: ${summary.resourcesFound}`, 22, '#CCCCCC', { align: 'center' },
    ).setOrigin(0.5).setDepth(302);

    // Dismiss button
    const dismissBtn = makeBtn(this.scene, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100,
      'CONTINUE', 200, 50, 0x336633, () => {
        overlay.destroy();
        panel.destroy();
        title.destroy();
        timeTxt.destroy();
        statsTxt.destroy();
        dismissBtn.destroy();
        RundotGameAPI.analytics.recordCustomEvent('welcome_back_dismissed');
      },
    );
    dismissBtn.setDepth(302);
  }

  /* ---- Settings modal ---- */

  private openSettings(): void {
    if (this.settingsModal) return;                       // already open
    const { GAME_WIDTH, GAME_HEIGHT } = LAYOUT;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    RundotGameAPI.analytics.recordCustomEvent('settings_opened');
    RundotGameAPI.triggerHapticAsync('light' as never);

    // Container groups the modal for one-call teardown. Input still routes to the
    // top-most object under the pointer, so the backdrop blocks the game beneath.
    const modal = this.scene.add.container(0, 0).setDepth(310);

    // Input-blocking backdrop (closes only via the X / CLOSE buttons).
    const overlay = this.scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72).setInteractive();
    modal.add(overlay);

    const panelW = 560;
    const panelH = 470;
    const top = cy - panelH / 2;
    const panel = this.scene.add.rectangle(cx, cy, panelW, panelH, 0x141414, 0.98)
      .setStrokeStyle(2, 0x555555).setInteractive();
    modal.add(panel);

    modal.add(makeText(this.scene, cx, top + 34, 'SETTINGS', 30, '#FFFFFF', { fontStyle: 'bold' }).setOrigin(0.5));

    // Close (X) — top-right corner of the panel.
    modal.add(makeBtn(this.scene, cx + panelW / 2 - 32, top + 32, '✕', 40, 40, 0x442222, () => this.closeSettings()));

    modal.add(this.scene.add.rectangle(cx, top + 66, panelW - 48, 1, 0x444444));

    // ---- Credits / version ----
    modal.add(makeText(this.scene, cx, top + 92, 'Backrooms Escape Idle', 22, '#FFD700', { fontStyle: 'bold' }).setOrigin(0.5));
    modal.add(makeText(this.scene, cx, top + 122, 'Version 1.0.0', 16, '#AAAAAA').setOrigin(0.5));
    modal.add(makeText(this.scene, cx, top + 150, 'Created by cbarker', 14, '#888888').setOrigin(0.5));

    modal.add(this.scene.add.rectangle(cx, top + 186, panelW - 48, 1, 0x444444));

    // ---- Reset progress ----
    modal.add(makeText(this.scene, cx, top + 214, 'RESET PROGRESS', 20, '#FF8888', { fontStyle: 'bold' }).setOrigin(0.5));
    modal.add(makeText(this.scene, cx, top + 244, 'Permanently erase your save and start over.', 14, '#999999', {
      align: 'center', wordWrap: { width: panelW - 80 },
    }).setOrigin(0.5));

    // Confirmation row — hidden until RESET is tapped.
    const confirmGroup = this.scene.add.container(0, 0).setVisible(false);
    confirmGroup.add(makeText(this.scene, cx, top + 278, 'Erase everything? This cannot be undone.', 15, '#FFAAAA', {
      align: 'center', fontStyle: 'bold',
    }).setOrigin(0.5));
    const yesBtn = makeBtn(this.scene, cx - 72, top + 314, 'YES, WIPE', 132, 44, 0x882222, () => {
      this.closeSettings();
      this.cb.onResetProgress();
    });
    (yesBtn.getAt(0) as Phaser.GameObjects.Rectangle).setStrokeStyle(2, 0xcc4444);
    const noBtn = makeBtn(this.scene, cx + 72, top + 314, 'CANCEL', 132, 44, 0x333333, () => {
      confirmGroup.setVisible(false);
      resetBtn.setVisible(true);
    });
    confirmGroup.add([yesBtn, noBtn]);

    const resetBtn = makeBtn(this.scene, cx, top + 300, 'RESET', 220, 48, 0x662222, () => {
      resetBtn.setVisible(false);
      confirmGroup.setVisible(true);
    });
    (resetBtn.getAt(0) as Phaser.GameObjects.Rectangle).setStrokeStyle(2, 0xaa4444);
    modal.add(resetBtn);
    modal.add(confirmGroup);

    // ---- Close (bottom) ----
    modal.add(makeBtn(this.scene, cx, top + panelH - 36, 'CLOSE', 200, 46, 0x2a2a2a, () => this.closeSettings()));

    this.settingsModal = modal;
  }

  private closeSettings(): void {
    if (!this.settingsModal) return;
    this.settingsModal.destroy(true);                     // destroy children too
    this.settingsModal = null;
  }

  /* ---- Stats modal ---- */

  private showStats(): void {
    if (this.statsModal) return;
    const { GAME_WIDTH, GAME_HEIGHT } = LAYOUT;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    RundotGameAPI.triggerHapticAsync('light' as never);

    const modal = this.scene.add.container(0, 0).setDepth(310);
    const overlay = this.scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72).setInteractive();
    modal.add(overlay);

    const panelW = 560;
    const panelH = 740;
    const top = cy - panelH / 2;
    const panel = this.scene.add.rectangle(cx, cy, panelW, panelH, 0x141414, 0.98)
      .setStrokeStyle(2, 0x555555).setInteractive();
    modal.add(panel);

    modal.add(makeText(this.scene, cx, top + 34, 'STATS', 30, '#FFFFFF', { fontStyle: 'bold' }).setOrigin(0.5));
    modal.add(makeBtn(this.scene, cx + panelW / 2 - 32, top + 32, '✕', 40, 40, 0x442222, () => this.closeStats()));
    modal.add(this.scene.add.rectangle(cx, top + 66, panelW - 48, 1, 0x444444));

    // Snapshot of the live values (reopen to refresh).
    const s = this.state;
    const rows: [string, string][] = [
      ['Rewinds', `${s.prestigeCount}`],
      ['Tap power', fmt(s.clickPower)],
      ['Auto search', `${s.autoPerSecond}/s`],
      // Explorer 1's own auto power (shared per-Explorer power + its personal bonus;
      // excludes the drone). More Explorers will each get their own line here later.
      ['Explorer 1', `${s.explorerAuto(0)}/s auto`],
      ['Lucky Find (Crit %)', `${Math.round(s.critChance * 100)}%  ×${s.critMult}`],
      ['Node respawn', `${s.nodeRespawnTime} ms`],
      ['Hype boost', `×${s.hypeMultiplier} auto for ${s.hypeDuration / 1000}s`],
      ['Hype cooldown', `${Math.round(s.hypeCooldown / 60000)} min`],
      ['Auto-Capture (Moth)', `${Math.round(s.autoCaptureChance * 100)}%`],
      ['Quality chance', `${Math.round(s.qualityChance * 100)}%  (+${s.qualityBonus})`],
      ['Mint chance', `${Math.round(s.mintChance * 100)}%  (+9)`],
      ['Easy Access chance', `${(s.easyAccessChance * 100).toFixed(1)}%  (½ HP)`],
      ['Resources found', `${s.stats.resourcesFound.toLocaleString()}`],
      ['Quality finds', `${s.stats.qualityFinds.toLocaleString()}`],
      ['Mint finds', `${s.stats.mintFinds.toLocaleString()}`],
      ['Easy Access finds', `${s.stats.easyAccessFinds.toLocaleString()}`],
      ['Moths caught', fmt(s.resources['moth'] ?? D(0))],
    ];
    let y = top + 96;
    const rowGap = 38;
    for (const [label, val] of rows) {
      modal.add(makeText(this.scene, cx - panelW / 2 + 36, y, label, 18, '#AAAAAA').setOrigin(0, 0.5));
      modal.add(makeText(this.scene, cx + panelW / 2 - 36, y, val, 18, '#FFFFFF', { fontStyle: 'bold' }).setOrigin(1, 0.5));
      y += rowGap;
    }

    modal.add(makeBtn(this.scene, cx, top + panelH - 36, 'CLOSE', 200, 46, 0x2a2a2a, () => this.closeStats()));
    this.statsModal = modal;
  }

  private closeStats(): void {
    if (!this.statsModal) return;
    this.statsModal.destroy(true);
    this.statsModal = null;
  }

  /* ---- Level change ---- */

  refreshForNewLevel(): void {
    // (Overlay stays a fixed readable alpha — the old danger-based darkening
    //  pushed deep floors to near-black.)
    this.levelText.setText(this.state.level.name);
    this.depthText.setText(this.depthLabel());

    // New floor's ore becomes the focal node.
    this.clearShowcase();
    this.popShowcase(this.state.floorOre.resource, this.state.floorOre.tier);

    // Clear void prompt banner + dot (conditions may have changed after rewind)
    if (this.voidPromptBanner) { this.voidPromptBanner.destroy(); this.voidPromptBanner = null; }
    if (this.voidNotifDot) { this.voidNotifDot.destroy(); this.voidNotifDot = null; }

    this.addLogMessage({
      type: 'system',
      message: this.state.level.description,
      color: this.state.level.textColor,
    });
  }
}
