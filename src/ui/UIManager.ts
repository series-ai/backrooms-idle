import Phaser from 'phaser';
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { LAYOUT } from '../config';
import { UPGRADES, RESOURCES, RESOURCE_ORDER, ORE_SEQUENCE, VOID_UPGRADES, REWIND_MIN_FLOOR, ABILITIES, GEAR, GEAR_SLOTS, GEAR_SLOT_ICONS, GEAR_SLOT_LABELS, GEAR_LEVEL_MAX, gearEffectSummary, ENTITIES, SHOP_UPGRADES, ACHIEVEMENTS, FLOOR_BASE_STAGES, PETS, getTierColor, tierSuffix, getFloorOre, type UpgradeDef, type ShopUpgradeDef, type AchievementDef, type VoidUpgradeDef, type GearDef, type GearEffect } from '../data/GameData';
import { fmt, D, type Big } from '../num';
import type { GameEvent, OfflineSummary, LightingState } from '../GameState';
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
    // Render at 2× and downsample — keeps small text crisp when the FIT-scaled
    // canvas resizes (at 1× the rescale smears glyphs into a dark fringe).
    resolution: 2,
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
  onCollectMoth: () => number;   // returns Moths banked (Lamp Trap Lv10+ doubles a catch)
  onCollectPhantom: () => number;   // returns the resource burst from staring one down
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
  onCraftGear: (id: string) => void;
  onEquipGear: (id: string) => void;
  onDismantleGear: (id: string) => void;   // scrap a benched piece for Scrap
  onLevelGear: (id: string) => void;       // spend Scrap on +10% base effects
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
  private buddyShadow: Phaser.GameObjects.Sprite | null = null;   // bright-phase contact shadow
  private navLeft?: Phaser.GameObjects.Container;    // ◀ / ▶ floor arrows — scene-level so the
  private navRight?: Phaser.GameObjects.Container;   // lighting overlays never wash them
  /** Which buddy "suit" is active (1..6) — follows the Gear Rating (state.buddySuit). */
  private buddySuit = 1;
  /** Weapon in the runner's hands ('pistol'|'shotgun'|'AR'|'gun', null = unarmed). */
  private buddyWeapon: string | null = null;
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
  // Lighting overlays (light wash from above / vignette + pall for the dark)
  private lightOverlay?: Phaser.GameObjects.Image;
  private vignetteOverlay?: Phaser.GameObjects.Image;
  private dimOverlay?: Phaser.GameObjects.Rectangle;
  private dustEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;   // bright-phase dust motes
  // Phantom collectible: a faint entity that drifts in during DARK phases only.
  private phantomTimer?: Phaser.Time.TimerEvent;
  private activePhantom?: Phaser.GameObjects.Image;
  private durFill?: Phaser.GameObjects.Rectangle;
  private durLabel?: Phaser.GameObjects.Text;   // "N to collect" readout on the durability bar
  private qualityLabel?: Phaser.GameObjects.Text;   // "QUALITY"/"MINT" tag above a pre-rolled node
  private easyAccessLabel?: Phaser.GameObjects.Text;   // "EASY ACCESS" tag (independent of grade)
  private baseLabel?: Phaser.GameObjects.Text;   // floor-base status line under the search hint
  private baseDescLabel?: Phaser.GameObjects.Text;   // its bonus readout (what the base GIVES you)
  private lastBaseLoc = -1;     // floor location the base line last showed...
  private lastBaseStage = -1;   // ...and its stage — so a stage-up on THIS floor pops the line
  // Danger layer (explore screen): noise meter + the active-entity takeover
  private noiseFill?: Phaser.GameObjects.Rectangle;
  private noiseLabel?: Phaser.GameObjects.Text;
  private entityImg?: Phaser.GameObjects.Image;      // entity art over the node (blocks it)
  private entityEmoji?: Phaser.GameObjects.Text;     // emoji fallback when no PNG exists
  private entityBarBg?: Phaser.GameObjects.Rectangle;
  private entityFill?: Phaser.GameObjects.Rectangle;
  private entityLabel?: Phaser.GameObjects.Text;
  private entityShownId: string | null = null;       // drives the show/hide transitions

  // Resource bar
  private resTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  // Items tab: per-resource rows, repacked by layoutItemRows() as floors unlock.
  private itemRows: Map<string, Phaser.GameObjects.Container> = new Map();
  private itemsScroll?: Phaser.GameObjects.Container;
  private itemsMinScroll = 0;
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
  private tabActiveImgs: Map<string, Phaser.GameObjects.Image> = new Map();   // gradient pane on the active tab

  // Upgrade panel refs for live updates
  private upgCostLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private upgCostIcons: Map<string, Phaser.GameObjects.Image> = new Map();
  private upgLvlLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private upgNameLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private upgDescLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private upgBuyBg: Map<string, Phaser.GameObjects.Image> = new Map();   // gradient button images
  private upgCards: Map<string, Phaser.GameObjects.Rectangle> = new Map();   // card backgrounds (dim when maxed)
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

  // Void panel refs (card grid + rewind block; mirrors the shop panel)
  private voidFragLabel!: Phaser.GameObjects.Text;
  private voidFragIcon?: Phaser.GameObjects.Image;
  private voidStatsLine?: Phaser.GameObjects.Text;
  private voidLvlLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private voidCostLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private voidCostIcons: Map<string, Phaser.GameObjects.Image> = new Map();
  private voidBuyBg: Map<string, Phaser.GameObjects.Image> = new Map();
  private voidCards: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private voidScroll?: Phaser.GameObjects.Container;
  private voidMinScroll = 0;
  private voidDragActive = false;
  private voidDragMoved = false;
  private voidDragStartPointer = 0;
  private voidDragStartScroll = 0;
  private rewindBtn!: Phaser.GameObjects.Container;
  private rewindBtnBg!: Phaser.GameObjects.Rectangle;
  // Rewind payout banner — the in-your-face "what THIS rewind pays" block.
  private rewindBanner!: Phaser.GameObjects.Rectangle;
  private rewindPayoutBig!: Phaser.GameObjects.Text;     // the huge "+N"
  private rewindPayoutLabel!: Phaser.GameObjects.Text;   // "VOID FRAGMENTS" / lock reason
  private rewindBonusLine!: Phaser.GameObjects.Text;     // shards + scrap extras
  private rewindKeepLine!: Phaser.GameObjects.Text;      // what survives the reset
  private rewindPulseTween?: Phaser.Tweens.Tween;
  private rewindPulseOn = false;

  // Gear panel refs (slot summary + card grid; mirrors the shop panel)
  private gearSlotIcons: Map<string, Phaser.GameObjects.Image> = new Map();
  private gearSlotEmpty: Map<string, Phaser.GameObjects.Text> = new Map();
  private gearSlotNames: Map<string, Phaser.GameObjects.Text> = new Map();
  private gearBonusText!: Phaser.GameObjects.Text;
  private gearNameLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private gearDescLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private gearFlavorLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private gearSlotBadges: Map<string, Phaser.GameObjects.Text> = new Map();
  private gearNameIcons: Map<string, Phaser.GameObjects.Image> = new Map();
  private gearBtnBg: Map<string, Phaser.GameObjects.Image> = new Map();
  private gearBtnLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  // Recipe cost pairs on the CRAFT button: one icon + "owned/cost" text per
  // cost resource (icons instead of spelled-out names — names don't fit).
  private gearCostPairs: Map<string, { icon: Phaser.GameObjects.Image | null; txt: Phaser.GameObjects.Text }[]> = new Map();
  private gearCards: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  // Scrap economy: the balance line + per-card SCRAP button (with tap-again confirm).
  private gearScrapText!: Phaser.GameObjects.Text;
  private gearScrapIcon: Phaser.GameObjects.Image | null = null;
  private gearRows: Map<string, Phaser.GameObjects.Container> = new Map();
  // Bag row — one box per bag slot, indexed by position. Tap = inspect popup.
  private gearBagLabel?: Phaser.GameObjects.Text;
  private gearBagEmpty: Phaser.GameObjects.Text[] = [];
  private gearBagNames: Phaser.GameObjects.Text[] = [];
  private gearBagIcons: Map<number, Phaser.GameObjects.Image> = new Map();
  private gearBagX0 = 0;      // first bag box center x (set in createGearPanel)
  private gearBagBoxCY = 0;   // bag box center y (set in createGearPanel)
  // Red "!" pip per loadout slot — lit while its piece can afford a LEVEL UP.
  private gearSlotPips: Map<string, Phaser.GameObjects.Container> = new Map();
  // Item inspect popup (tap a loadout or bag box; null while closed)
  private gearItemModal: Phaser.GameObjects.Container | null = null;
  private gearFirstCardY = 0;   // grid top — relayoutGearRows packs visible cards from here
  private gearScroll?: Phaser.GameObjects.Container;
  private gearMinScroll = 0;
  private gearDragActive = false;
  private gearDragMoved = false;
  private gearDragStartPointer = 0;
  private gearDragStartScroll = 0;

  // Shop panel refs (mirrors the upgrade panel: scrollable cards + cost buttons)
  private shopShardLabel!: Phaser.GameObjects.Text;
  private shopShardIcon?: Phaser.GameObjects.Image;
  private shopRows: Map<string, Phaser.GameObjects.Container> = new Map();
  private shopLvlLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private shopCostLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private shopCostIcons: Map<string, Phaser.GameObjects.Image> = new Map();
  private shopBuyBg: Map<string, Phaser.GameObjects.Image> = new Map();   // gradient button images
  private shopCards: Map<string, Phaser.GameObjects.Rectangle> = new Map();   // card backgrounds (dim when maxed)
  private shopScroll?: Phaser.GameObjects.Container;
  private shopMinScroll = 0;
  private shopDragActive = false;
  private shopDragMoved = false;
  private shopDragStartPointer = 0;
  private shopDragStartScroll = 0;

  // Achievements panel refs (mirrors the shop panel: scrollable cards + claim buttons)
  private achShardLabel?: Phaser.GameObjects.Text;
  private achShardIcon?: Phaser.GameObjects.Image;
  private achBonusLabel?: Phaser.GameObjects.Text;
  private achLevelsLabel?: Phaser.GameObjects.Text;
  private achLvlLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private achProgLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private achProgFill: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private achBtnBg: Map<string, Phaser.GameObjects.Image> = new Map();   // gradient button images
  private achCards: Map<string, Phaser.GameObjects.Rectangle> = new Map();   // card backgrounds (dim when all claimed)
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

  // Pets row (explore bottom-left): one small button per pet, shown when unlocked.
  private petBtns: Map<string, Phaser.GameObjects.Container> = new Map();
  private petLvlBadges: Map<string, Phaser.GameObjects.Text> = new Map();
  private petModal: Phaser.GameObjects.Container | null = null;

  // "Bag full" craft prompt (built on demand; null while closed)
  private bagFullModal: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene, state: GameState, cb: UICallbacks) {
    this.scene = scene;
    this.state = state;
    this.cb = cb;
  }

  /** True when a pointer is inside the wide-tab content area (where card lists render). */
  private inWideContent(p: Phaser.Input.Pointer): boolean {
    return p.y >= LAYOUT.CONTENT_TOP_WIDE && p.y <= LAYOUT.CONTENT_BOTTOM_WIDE;
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

  /** Focal showcase icon box — art size and tap-zone extent. */
  private static readonly SHOWCASE_SIZE = 380;

  /**
   * Vertical extent of the explore column relative to the showcase icon
   * center — top is the bounced HYPE pill's top edge (runner center -330,
   * pill -54, half-pill 18; the sprite frame's empty upper half doesn't
   * reserve space), bottom is the noise meter's bottom edge (+318 center,
   * +11 half-height). Keep in sync with the offsets in createExplorePanel.
   */
  private static readonly EXPLORE_STACK_TOP = -402;
  private static readonly EXPLORE_STACK_BOTTOM = 329;

  /** Pets row center Y — bottom-left of the explore content (66px buttons). */
  private petRowY(): number {
    return LAYOUT.CONTENT_BOTTOM - 46;
  }

  /**
   * Showcase icon center, placed so the whole explore column (runner down to
   * noise meter) is vertically centered in the content card — equal air above
   * and below, instead of a dead band pooling at the bottom. On short canvases
   * (see initLayout) centering would sink the noise meter into the pets row,
   * so the center is capped to keep a clear gap above the pet buttons.
   */
  private showcaseCenterY(): number {
    const cardMid = (LAYOUT.CONTENT_TOP + LAYOUT.CONTENT_BOTTOM) / 2;
    const centered = Math.round(cardMid - (UIManager.EXPLORE_STACK_TOP + UIManager.EXPLORE_STACK_BOTTOM) / 2);
    const petRowTop = this.petRowY() - 33;   // half a 66px pet button
    const maxCenter = petRowTop - 12 - UIManager.EXPLORE_STACK_BOTTOM;
    return Math.min(centered, maxCenter);
  }

  /** Swap/pop the big focal icon. */
  private popShowcase(iconId: string, tier: number = 1): void {
    const key = `icon_${iconId}`;
    if (!this.scene.textures.exists(key)) return;
    const targetScale = UIManager.SHOWCASE_SIZE / ICON_NATIVE;

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

  /** The run-cycle key for the current suit + weapon-in-hand. */
  private buddyRunAnim(): string {
    return `buddy${this.buddySuit}_run${this.buddyWeapon ? `_${this.buddyWeapon}` : ''}`;
  }

  /**
   * Re-read the avatar's look from the state: Gear Rating picks the buddy sheet
   * (1..6, looping), the equipped weapon picks the armed run cycle. Called after
   * any gear change; no-ops when nothing about the look changed.
   */
  syncBuddyAppearance(): void {
    const suit = Phaser.Math.Clamp(this.state.buddySuit, 1, 6);
    const weapon = this.state.buddyWeaponStyle;
    if (suit === this.buddySuit && weapon === this.buddyWeapon) return;
    const suitChanged = suit !== this.buddySuit;
    this.buddySuit = suit;
    this.buddyWeapon = weapon;
    if (!this.buddyRunner) return;
    if (suitChanged) {
      this.buddyRunner.setTexture(`buddy${suit}`);
      this.buddyShadow?.setTexture(`buddy${suit}`, 0);
    }
    if (this.buddyState === 'run') this.buddyRunner.play(this.buddyRunAnim());
    else if (this.buddyState === 'chat') this.buddyRunner.play(`buddy${suit}_chat`);
    else this.buddyRunner.setFrame(UIManager.BUDDY_STAND_FRAME);
  }

  /**
   * Face the runner (and his contact shadow) left or right. The shadow frame
   * is authored for a LEFT-facing pose (weapon shadow on the left of the body
   * shadow), so the shadow's flip is the runner's inverse, and the graphic's
   * off-center placement mirrors as a ∓57px offset that keeps the body
   * ellipse under his body with the weapon shadow out front.
   */
  private setBuddyFacing(faceLeft: boolean): void {
    this.buddyRunner?.setFlipX(faceLeft);
    if (this.buddyShadow) {
      this.buddyShadow.setFlipX(!faceLeft);
      this.buddyShadow.x = LAYOUT.CENTER_X + (faceLeft ? 57 : -57);
    }
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
      this.buddyRunner.play(this.buddyRunAnim());
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
    this.setBuddyFacing(pointer.x < LAYOUT.CENTER_X);
    if (this.buddyState !== 'run') {
      this.buddyState = 'run';
      this.buddyRunner.play(this.buddyRunAnim());
    }
  }

  /* ================================================================ */
  /*  Build all UI                                                     */
  /* ================================================================ */

  createAll(): void {
    this.createBackground();
    this.createLightingOverlays();
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
    this.schedulePhantom();
  }

  /* ---- Wandering moth collectible ---- *
   * Every ~3 minutes a moth drifts across the explore screen; click it for +1
   * Moth. Only one is ever alive, and it's always cleaned up (clicked or off-screen)
   * so there's no entity buildup. */

  private scheduleMoth(): void {
    this.mothTimer?.remove();
    // ~40s, jittered, so it isn't perfectly periodic. Moth Lure (void) divides
    // the wait, so moths visit up to 2× as often when maxed.
    const delay = Phaser.Math.Between(35_000, 45_000) / this.state.mothRateMult;
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
      : Phaser.Math.Between(LAYOUT.CONTENT_BOTTOM - 320, LAYOUT.CONTENT_BOTTOM - 100);   // below the showcase, above the tabs
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
    const gain = this.cb.onCollectMoth();
    // Floating "+N" where it was caught (Lamp Trap Lv10+ makes this +2).
    const pop = makeText(this.scene, moth.x, moth.y, `+${gain}`, 30, '#C9B6FF', {
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

  /* ---- Lighting overlays ---- *
   * The halls drift bright / normal / dark (GameState.advanceLighting). Bright
   * washes warm fluorescent light down from the ceiling; dark closes a heavy
   * vignette + dim pall over everything. Both are canvas-baked gradients
   * (Graphics.fillGradientStyle is WebGL-only — same trap as the buy buttons)
   * cross-faded by alpha, and they only show on the explore tab. */

  private ensureLightingTextures(): void {
    if (!this.scene.textures.exists('light_gradient')) {
      const w = LAYOUT.GAME_WIDTH;
      const h = 560;
      const tex = this.scene.textures.createCanvas('light_gradient', w, h);
      if (tex) {
        const ctx = tex.getContext();
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(255, 238, 180, 0.85)');
        grad.addColorStop(0.45, 'rgba(255, 238, 180, 0.30)');
        grad.addColorStop(1, 'rgba(255, 238, 180, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        tex.refresh();
      }
    }
    if (!this.scene.textures.exists('dark_vignette')) {
      const w = LAYOUT.GAME_WIDTH;
      const h = LAYOUT.GAME_HEIGHT;
      const tex = this.scene.textures.createCanvas('dark_vignette', w, h);
      if (tex) {
        const ctx = tex.getContext();
        const r = Math.hypot(w, h) / 2;
        const grad = ctx.createRadialGradient(w / 2, h / 2, r * 0.22, w / 2, h / 2, r);
        grad.addColorStop(0, 'rgba(2, 2, 8, 0)');
        grad.addColorStop(0.55, 'rgba(2, 2, 8, 0.35)');
        grad.addColorStop(1, 'rgba(2, 2, 8, 0.88)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        tex.refresh();
      }
    }
    // A single soft dot — the only texture the bright-phase dust needs.
    if (!this.scene.textures.exists('dust_mote')) {
      const size = 16;
      const tex = this.scene.textures.createCanvas('dust_mote', size, size);
      if (tex) {
        const ctx = tex.getContext();
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.35)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        tex.refresh();
      }
    }
  }

  private createLightingOverlays(): void {
    this.ensureLightingTextures();
    const { GAME_WIDTH, GAME_HEIGHT, CENTER_X } = LAYOUT;
    // Depth 23-24: above the content panels (15-20) so the mood covers the whole
    // hall, below the tab bar (30). None are interactive — input passes through.
    this.dimOverlay = this.scene.add.rectangle(CENTER_X, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x020208, 1)
      .setDepth(23).setAlpha(0);
    if (this.scene.textures.exists('light_gradient')) {
      this.lightOverlay = this.scene.add.image(CENTER_X, 0, 'light_gradient')
        .setOrigin(0.5, 0).setDepth(24).setAlpha(0);
    }
    if (this.scene.textures.exists('dark_vignette')) {
      this.vignetteOverlay = this.scene.add.image(CENTER_X, GAME_HEIGHT / 2, 'dark_vignette')
        .setDepth(24).setAlpha(0);
    }

    // Dust motes for BRIGHT phases — one emitter, one tiny texture, ~25 alive
    // (8s lifespan / 320ms cadence), additive so they read as catching the
    // light. Starts silent; applyLighting() starts/stops it, and a stop lets
    // the airborne motes live out their drift as the light fades — free exit
    // animation. Cost is negligible: a single batched draw.
    if (this.scene.textures.exists('dust_mote')) {
      this.dustEmitter = this.scene.add.particles(0, 0, 'dust_mote', {
        emitZone: {
          type: 'random',
          // The lit upper halls (a plain callback — the typed RandomZoneSource shape).
          source: {
            getRandomPoint: (point) => {
              point.x = Phaser.Math.Between(20, GAME_WIDTH - 20);
              point.y = Phaser.Math.Between(20, 980);
            },
          },
        },
        lifespan: { min: 5_000, max: 9_000 },
        speed: { min: 4, max: 16 },        // barely-moving drift
        angle: { min: 0, max: 360 },
        gravityY: 4,                        // the slowest possible settle
        scale: { min: 0.3, max: 1 },
        alpha: { start: 0.5, end: 0 },      // each mote slowly twinkles out
        tint: 0xfff2c0,                     // the same warm fluorescent tone as the wash
        blendMode: Phaser.BlendModes.ADD,
        frequency: 320,
        emitting: false,
      }).setDepth(25);
    }
  }

  /** Cross-fade the overlays to a lighting state (called on every phase shift). */
  applyLighting(state: LightingState, instant = false): void {
    const targets: [Phaser.GameObjects.GameObject | undefined, number][] = [
      [this.lightOverlay, state === 'bright' ? 0.9 : 0],
      [this.vignetteOverlay, state === 'dark' ? 0.9 : 0],
      [this.dimOverlay, state === 'dark' ? 0.22 : 0],
      // The runner casts a contact shadow only while the fluorescents are on.
      [this.buddyShadow ?? undefined, state === 'bright' ? 0.5 : 0],
    ];
    for (const [obj, alpha] of targets) {
      if (!obj) continue;
      this.scene.tweens.killTweensOf(obj);
      if (instant) (obj as Phaser.GameObjects.Image).setAlpha(alpha);
      // The fluorescents don't fade up — they FLICKER on: stutter bursts with
      // dead gaps between them, then hold. Fading out stays a smooth gutter.
      else if (obj === this.lightOverlay && alpha > 0) {
        this.scene.tweens.chain({
          targets: obj,
          tweens: [
            { alpha, duration: 30, hold: 60 },
            { alpha: 0.04, duration: 20, hold: 120 },
            { alpha: alpha * 0.85, duration: 25, hold: 45 },
            { alpha: 0.08, duration: 20, hold: 170 },
            { alpha, duration: 35 },
          ],
        });
      }
      else this.scene.tweens.add({ targets: obj, alpha, duration: 1600, ease: 'Sine.easeInOut' });
    }
    // Dust hangs in the light: emit only while bright (a stop lets the motes
    // already in the air finish their drift as the wash fades).
    if (this.dustEmitter) {
      if (state === 'bright') this.dustEmitter.start();
      else this.dustEmitter.stop();
    }
    // Leaving the dark takes any phantom with it.
    if (state !== 'dark') this.removePhantom(true);
  }

  /* ---- Phantom collectible (dark phases only) ---- *
   * A faint, ghost-tinted entity fades into the halls for a few seconds. Click
   * it to stare it down: a resource burst + −20 Noise (collectPhantom). Same
   * lifecycle discipline as the moth: at most one, always cleaned up. */

  private schedulePhantom(): void {
    this.phantomTimer?.remove();
    const delay = Phaser.Math.Between(8_000, 15_000);
    this.phantomTimer = this.scene.time.delayedCall(delay, () => {
      this.trySpawnPhantom();
      this.schedulePhantom();
    });
  }

  private trySpawnPhantom(): void {
    if (this.activePhantom || this.activeTab !== 'explore') return;
    if (this.state.lighting !== 'dark' || this.state.entityActive) return;
    // A phantom of something that ACTUALLY hunts this floor (needs loaded art).
    const roster = this.state.level.entityIds
      .map((id) => ENTITIES[id])
      .filter((e) => e?.iconKey && this.scene.textures.exists(`icon_${e.iconKey}`));
    const pick = roster.length > 0 ? roster[Math.floor(Math.random() * roster.length)] : ENTITIES['smiler'];
    const key = `icon_${pick.iconKey}`;
    if (!this.scene.textures.exists(key)) return;

    const x = Phaser.Math.Between(90, LAYOUT.GAME_WIDTH - 90);
    const y = Phaser.Math.Between(LAYOUT.CONTENT_TOP + 130, LAYOUT.CONTENT_BOTTOM - 280);
    const img = this.scene.add.image(x, y, key)
      .setDepth(26).setScale(140 / ICON_NATIVE).setAlpha(0).setTint(0x7788bb);
    img.setInteractive({ useHandCursor: true });
    img.once('pointerdown', () => this.catchPhantom());
    this.activePhantom = img;

    // Fade in, drift upward, gone in ~7s if ignored.
    this.scene.tweens.add({ targets: img, alpha: 0.3, duration: 1400, ease: 'Sine.easeOut' });
    this.scene.tweens.add({ targets: img, y: y - 34, duration: 7_000, ease: 'Sine.easeInOut' });
    this.scene.time.delayedCall(7_000, () => {
      if (this.activePhantom === img) this.removePhantom(true);
    });
  }

  private catchPhantom(): void {
    const img = this.activePhantom;
    if (!img) return;
    this.activePhantom = undefined;
    const gain = this.cb.onCollectPhantom();

    // Stare-down flash: it brightens, swells, and is gone.
    this.scene.tweens.killTweensOf(img);
    img.disableInteractive();
    this.scene.tweens.add({
      targets: img, alpha: 0, scale: img.scale * 1.6, duration: 420, ease: 'Sine.easeIn',
      onComplete: () => img.destroy(),
    });

    const resName = RESOURCES[this.state.floorOre.resource]?.name ?? '';
    const mote = makeText(this.scene, img.x, img.y - 40, `+${gain} ${resName}  ·  −20 Noise`, 17, '#9FB4FF', {
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(27).setAlpha(0);
    this.scene.tweens.add({
      targets: mote, alpha: 1, y: img.y - 74, duration: 260, ease: 'Back.easeOut',
      onComplete: () => this.scene.tweens.add({
        targets: mote, alpha: 0, delay: 700, duration: 300,
        onComplete: () => mote.destroy(),
      }),
    });
  }

  private removePhantom(fade: boolean): void {
    const img = this.activePhantom;
    if (!img) return;
    this.activePhantom = undefined;
    this.scene.tweens.killTweensOf(img);
    if (fade) {
      this.scene.tweens.add({ targets: img, alpha: 0, duration: 600, onComplete: () => img.destroy() });
    } else {
      img.destroy();
    }
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
    this.resBarCard = this.scene.add.rectangle(GAME_WIDTH / 2, LAYOUT.RESOURCE_BAR_CENTER, GAME_WIDTH - 20, LAYOUT.RESOURCE_BAR_HEIGHT, 0x0a0a0a, 0.6)
      .setDepth(3)
      .setStrokeStyle(1, 0x333333);
    // Footer — one solid panel behind the tab buttons down to the screen bottom.
    // FOOTER_TOP sits one CARD_GAP under both the resource card (explore) and
    // the wide content card (menus), so the seam is identical on every tab and
    // the 0.6-alpha panels never stack into a darker band.
    const footerTop = LAYOUT.FOOTER_TOP;
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
    // Depth 27-29 (with the exploration bar below): above the lighting overlays
    // (23-25) so the bright wash / dark pall never dim the floor readout, still
    // under the header buttons and tab bar (30+).
    this.levelText = makeText(this.scene, cx, 42, this.state.level.name, 36, '#FFFFFF', {
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(27);

    this.depthText = makeText(this.scene, cx, 76, this.depthLabel(), 18, '#8888CC', {
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(27);

    // Header buttons sit at depth 30 — above the content panels (15) for the same
    // reason as the tab bar: masked scroll lists still hit-test over the header,
    // and an invisible overflow row would otherwise swallow these clicks.

    // Settings button — top-right corner of the header card.
    const settingsBtn = makeBtn(this.scene, LAYOUT.GAME_WIDTH - 78, 30, 'SETTINGS', 120, 36, 0x2a2a2a, () => this.openSettings());
    (settingsBtn.getAt(1) as Phaser.GameObjects.Text).setFontSize(16);
    settingsBtn.setDepth(30);

    // Stats button — top-LEFT corner, mirroring Settings (temporary placement).
    const statsBtn = makeBtn(this.scene, 78, 30, 'STATS', 120, 36, 0x2a2a2a, () => this.showStats());
    (statsBtn.getAt(1) as Phaser.GameObjects.Text).setFontSize(16);
    statsBtn.setDepth(30);

    // "Hide maxed" toggle — same style as Settings, tucked just beneath it.
    // Only shown on the Upgrades tab (toggled in showTab).
    this.hideMaxedBtn = makeBtn(this.scene, LAYOUT.GAME_WIDTH - 78, 72, 'HIDE MAXED', 120, 34, 0x2a2a2a, () => this.cb.onToggleHideMaxed());
    (this.hideMaxedBtn.getAt(1) as Phaser.GameObjects.Text).setFontSize(14);
    this.hideMaxedBtn.setDepth(30).setVisible(false);
    this.updateHideMaxedBtn();   // sync initial color/label to state
  }

  /**
   * The floor number under the level name. Just where you ARE — the lifetime
   * descent odometer (totalDepth) lives in the Stats modal, not the header.
   */
  private depthLabel(): string {
    return `FLOOR ${this.state.currentLevel}`;
  }

  /* ---- Status bars ---- */

  private createStatusBars(): void {
    const { BAR_X, BAR_WIDTH, BAR_HEIGHT } = LAYOUT;

    // Green EXPLORATION bar — even 34px rhythm with the header above
    // (Title 42, Depth 76, Bar 110, count 144).
    const y = 110 - BAR_HEIGHT / 2; // bar top (center at 110)
    // Depth 27-29: keeps the bar out of the lighting overlays' wash (see
    // createHeader) — the floor readout stays legible in bright and dark.
    this.progBarBg = this.scene.add.rectangle(BAR_X + BAR_WIDTH / 2, y + BAR_HEIGHT / 2, BAR_WIDTH, BAR_HEIGHT, 0x16241a)
      .setDepth(27).setStrokeStyle(1, 0x2e4a2e);
    this.progFill = this.scene.add.rectangle(BAR_X, y, 0, BAR_HEIGHT, 0x4caf50).setOrigin(0, 0).setDepth(28);
    this.progLabel = makeText(this.scene, LAYOUT.CENTER_X, y + BAR_HEIGHT / 2, 'EXPLORING 0%', 16, '#FFFFFF', { fontStyle: 'bold' })
      .setOrigin(0.5, 0.5).setDepth(29);

    // Discrete count just under the bar (center at 144).
    this.roomsLabel = makeText(this.scene, LAYOUT.CENTER_X, 144, 'Rooms 0 / 10', 16, '#9fd0a0', {
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(29);
  }

  /* ---- Resource bar ---- */

  private createResourceBar(): void {
    const cx = LAYOUT.CENTER_X;
    // (Background is the resource-bar card drawn in createBackground.)

    // Single readout: which resource you're CURRENTLY collecting, its name, and
    // how many you have. Icon + name + count all swap as you descend (see
    // updateResourceBar). Laid out as: [icon] Name ............... count
    const res = this.state.floorOre.resource;
    const cy = LAYOUT.RESOURCE_BAR_CENTER;     // vertical center of the bar card

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
    this.ensureUpgradeBtnTexture();   // the active tab wears the same gradient as buy buttons

    // Two UNIFORM rows: every button the same size no matter how full its row
    // is (short rows just center) — no more one-tab-spans-the-screen banners.
    // Items sits LAST — it's the least-used tab and kept getting fat-fingered
    // when it lived next to Explore.
    const row1: { id: string; label: string }[] = [
      { id: 'explore', label: 'EXPLORE' }, { id: 'upgrades', label: 'UPGRADES' },
      { id: 'gear', label: 'GEAR' }, { id: 'items', label: 'ITEMS' },
    ];
    const row2: { id: string; label: string }[] = showVoid
      ? [{ id: 'shop', label: 'SHOP' }, { id: 'void', label: 'VOID' }, { id: 'achievements', label: 'ACHIEVEMENTS' }]
      : [{ id: 'shop', label: 'SHOP' }, { id: 'achievements', label: 'ACHIEVEMENTS' }];

    const rowH = LAYOUT.TAB_ROW_HEIGHT;
    const rowGap = LAYOUT.TAB_ROW_GAP;
    const row1Y = LAYOUT.TAB_Y - rowGap / 2 - rowH / 2;
    const row2Y = LAYOUT.TAB_Y + rowGap / 2 + rowH / 2;
    const totalPad = 20;
    const gapX = 6;
    const maxCols = Math.max(row1.length, row2.length);
    const tabW = Math.floor((LAYOUT.GAME_WIDTH - totalPad - (maxCols - 1) * gapX) / maxCols);

    const buildRow = (tabs: { id: string; label: string }[], centerY: number) => {
      const count = tabs.length;
      const rowW = count * tabW + (count - 1) * gapX;
      const startX = (LAYOUT.GAME_WIDTH - rowW) / 2;

      for (let i = 0; i < count; i++) {
        const x = startX + i * (tabW + gapX) + tabW / 2;
        // Depth 30: ABOVE the content panels (15). Panel scroll lists are masked
        // to the content area, but masks don't clip INPUT — overflow rows sit
        // invisibly over the tab bar and would otherwise swallow tab clicks
        // (Phaser routes input to the topmost object only).
        const bg = this.scene.add.rectangle(x, centerY, tabW, rowH, 0x222222)
          .setDepth(30)
          .setStrokeStyle(1, 0x444444);
        // Active-state gradient pane — hidden until showTab lights this tab up.
        // Not interactive, so it never steals the rectangle's clicks.
        const glow = this.scene.add.image(x, centerY, 'upg_btn_grad')
          .setDisplaySize(tabW, rowH).setDepth(31).setVisible(false);
        this.tabActiveImgs.set(tabs[i].id, glow);
        const txt = makeText(this.scene, x, centerY, tabs[i].label, 16, '#888888', {
          fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(32);
        // Long labels (ACHIEVEMENTS) shrink until they fit their button.
        for (let size = 16; txt.width > tabW - 14 && size > 11; size--) txt.setFontSize(size);

        // Shop tab gets the Void Shard icon to the left of its label (icon + text
        // centered together within the button).
        if (tabs[i].id === 'shop') {
          const iconSize = 36;
          const iconGap = 6;
          const icon = this.createIcon(0, centerY, 'void_shard', iconSize);
          if (icon) {
            icon.setDepth(32);
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
        if (tabId === 'upgrades' || tabId === 'explore' || tabId === 'achievements' || tabId === 'gear' || tabId === 'void' || tabId === 'shop') {
          const dot = this.scene.add.container(x + tabW / 2 - 6, centerY - rowH / 2 + 4).setDepth(33);
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
  }

  /** Show/hide the per-tab alert dots (only when you're on a different tab). */
  private refreshTabNotifs(): void {
    const up = this.tabNotifDots.get('upgrades');
    if (up) up.setVisible(this.activeTab !== 'upgrades' && this.state.hasAffordableUpgrade());
    const ex = this.tabNotifDots.get('explore');
    if (ex) ex.setVisible(this.activeTab !== 'explore' && this.state.canDescendToNew());
    const ach = this.tabNotifDots.get('achievements');
    if (ach) ach.setVisible(this.activeTab !== 'achievements' && this.state.hasClaimableAchievement());
    const gear = this.tabNotifDots.get('gear');
    if (gear) gear.setVisible(this.activeTab !== 'gear' && this.state.hasCraftableGear());
    const vd = this.tabNotifDots.get('void');
    if (vd) vd.setVisible(this.activeTab !== 'void' && this.state.hasAffordableVoidUpgrade());
    const shop = this.tabNotifDots.get('shop');
    if (shop) shop.setVisible(this.activeTab !== 'shop' && this.state.hasAffordableShopUpgrade());
  }

  /* ---- Explore panel (log + action buttons) ---- */

  private createExplorePanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);

    const cx = LAYOUT.CENTER_X;

    const iconCy = this.showcaseCenterY();

    // The big focal icon doubles as the explore BUTTON: tap or hold to explore.
    // A transparent hit zone sits on top of the swappable showcase icon.
    this.exploreBtnZone = this.scene.add.rectangle(cx, iconCy, UIManager.SHOWCASE_SIZE, UIManager.SHOWCASE_SIZE, 0xffffff, 0)
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

    // The arrows stay scene-level (not in the panel) at depth 27 so the
    // lighting overlays (23-25) never wash the buttons; showTab toggles them
    // with the rest of the explore-only chrome.
    left.setDepth(27);
    right.setDepth(27);
    this.navLeft = left;
    this.navRight = right;

    // Integrity bar under the icon — the node's HP. Starts full and DRAINS as you
    // search it; when it empties you collect the resource and it refills (new node).
    // Carries a centered "remaining / max" HP readout for transparency.
    const durW = 240;
    const durH = 22;
    const durBg = this.scene.add.rectangle(cx, iconCy + 200, durW, durH, 0x2a1212, 1).setDepth(16).setStrokeStyle(1, 0x4a2a2a);
    this.durFill = this.scene.add.rectangle(cx - durW / 2, iconCy + 200, durW, durH, 0xffcc44).setOrigin(0, 0.5).setDepth(17);
    this.durLabel = makeText(this.scene, cx, iconCy + 200, '', 13, '#FFFFFF', {
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(18);
    panel.add([durBg, this.durFill, this.durLabel]);

    // "QUALITY" tag above the icon — shown only when the current node was pre-rolled
    // as a quality find, so the player is motivated to break it for the +1 extra.
    this.qualityLabel = makeText(this.scene, cx, iconCy - 166, 'QUALITY', 26, '#FFA500', {
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(18).setVisible(false);
    panel.add(this.qualityLabel);

    // "EASY ACCESS" tag — independent of grade (a node can be MINT and easy-access),
    // so it sits just below the grade tag and shows on its own roll.
    this.easyAccessLabel = makeText(this.scene, cx, iconCy - 134, 'EASY ACCESS', 22, '#66CCFF', {
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(18).setVisible(false);
    panel.add(this.easyAccessLabel);

    // Persistent hint under the icon.
    this.hintText = makeText(this.scene, cx, iconCy + 230, 'Tap or hold to search', 18, '#FFFFFF')
      .setOrigin(0.5).setDepth(16);
    panel.add(this.hintText);

    // Floor-base status under the hint — this floor's permanent construction
    // (FLOOR_BASE_STAGES) plus a smaller line spelling out the bonuses it grants
    // (or, with no base, what the first stage would give). Node breaks roll to
    // advance it; text/color follow the current floor in updateStatusBars.
    this.baseLabel = makeText(this.scene, cx, iconCy + 258, '', 16, '#777777')
      .setOrigin(0.5).setDepth(16);
    this.baseDescLabel = makeText(this.scene, cx, iconCy + 284, '', 14, '#666666')
      .setOrigin(0.5).setDepth(16);
    panel.add([this.baseLabel, this.baseDescLabel]);

    // Noise meter — searching is loud. Fills green → amber → red; at 100% an
    // entity from this floor's roster finds you (see the encounter display).
    const noiseW = 240;
    const noiseH = 22;
    const noiseY = iconCy + 318;
    const noiseBg = this.scene.add.rectangle(cx, noiseY, noiseW, noiseH, 0x141414, 1)
      .setDepth(16).setStrokeStyle(1, 0x3a3a3a);
    this.noiseFill = this.scene.add.rectangle(cx - noiseW / 2, noiseY, 0, noiseH, 0x66aa66)
      .setOrigin(0, 0.5).setDepth(17);
    this.noiseLabel = makeText(this.scene, cx, noiseY, 'Noise 0%', 13, '#CCCCCC', {
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(18);
    panel.add([noiseBg, this.noiseFill, this.noiseLabel]);

    // Encounter display — the entity takes over the node area (art above the
    // dimmed showcase; taps hit IT). Its presence bar sits where the grade tags
    // usually pulse (those hide during an encounter).
    this.entityImg = this.scene.add.image(cx, iconCy, 'icon_smiler')
      .setDepth(18).setVisible(false);
    this.entityEmoji = makeText(this.scene, cx, iconCy, '', 110, '#FFFFFF')
      .setOrigin(0.5).setDepth(18).setVisible(false);
    const ebW = 240;
    this.entityBarBg = this.scene.add.rectangle(cx, iconCy - 166, ebW, 20, 0x1a0a1a, 1)
      .setDepth(17).setStrokeStyle(1, 0x663366).setVisible(false);
    this.entityFill = this.scene.add.rectangle(cx - ebW / 2, iconCy - 166, ebW, 20, 0xcc4466)
      .setOrigin(0, 0.5).setDepth(18).setVisible(false);
    this.entityLabel = makeText(this.scene, cx, iconCy - 166, '', 12, '#FFFFFF', {
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(19).setVisible(false);
    panel.add([this.entityImg, this.entityEmoji, this.entityBarBg, this.entityFill, this.entityLabel]);

    // The player avatar — you, running endlessly through the backrooms. Sits
    // up top, above the entity/ambient flavor line (flavor is at iconCy - 212),
    // and loops the run cycle so the screen always feels like forward motion.
    // The sprite sheet already bakes in its own shadow.
    const runnerY = iconCy - 330;
    // The look follows the saved loadout from the first frame (Gear Rating suit
    // + equipped weapon), so a scene rebuild never flashes the default skin.
    this.buddySuit = Phaser.Math.Clamp(this.state.buddySuit, 1, 6);
    this.buddyWeapon = this.state.buddyWeaponStyle;
    // Contact shadow under his feet — the sheet's dedicated 'shadow' frame
    // (cell 0): a 23px weapon shadow on the LEFT of a larger body shadow, i.e.
    // authored for a left-facing pose. The runner spawns facing right, so the
    // shadow starts mirrored, with the body ellipse under his body and the
    // weapon shadow leading in front (see setBuddyFacing for the ∓57 offset).
    // Added to the panel before the runner so it renders beneath him. Starts
    // invisible; applyLighting fades it in while the fluorescents are on.
    this.buddyShadow = this.scene.add.sprite(cx - 57, runnerY + 23, `buddy${this.buddySuit}`, 0)
      .setScale(1.7).setDepth(16).setAlpha(0).setFlipX(true);
    panel.add(this.buddyShadow);
    this.buddyRunner = this.scene.add.sprite(cx, runnerY, `buddy${this.buddySuit}`)
      .setScale(1.7).setDepth(16);
    // Play the one-shot spawn ("appearing") animation, then settle into the run
    // loop. If the player taps him during the intro, the click handler takes over.
    this.buddyRunner.play(`buddy${this.buddySuit}_spawn`);
    this.buddyRunner.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      if (this.buddyState === 'run' && this.buddyRunner) this.buddyRunner.play(this.buddyRunAnim());
    });
    panel.add(this.buddyRunner);

    // "HYPE!" prompt — yellow text in a black pill that bounces above the runner
    // when hype is available. Hidden until then; tapping the runner activates it.
    // Tucked just above his head — the old -70 reserved a dead band that
    // pushed the whole column down (see EXPLORE_STACK_TOP).
    const hype = this.scene.add.container(cx, runnerY - 44).setDepth(20).setVisible(false);
    const pill = this.scene.add.graphics();
    pill.fillStyle(0x000000, 0.92).fillRoundedRect(-42, -18, 84, 36, 18);
    pill.lineStyle(2, 0xFFD24A, 1).strokeRoundedRect(-42, -18, 84, 36, 18);
    const hypeTxt = makeText(this.scene, 0, 0, 'HYPE!', 19, '#FFD24A', { fontStyle: 'bold' }).setOrigin(0.5);
    hype.add([pill, hypeTxt]);
    panel.add(hype);
    this.hypePrompt = hype;
    this.scene.tweens.add({
      targets: hype, y: runnerY - 54, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Clicks steer the avatar: tap off him to point him toward the click and run
    // (left of center = run left, right = run right); tap him to stop (stand00),
    // and keep tapping him to chat. A chat finishes back to standing.
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onBuddyPointer(pointer));

    // Pets row — unlocked pets (PETS, e.g. the Lamp Trap) line up bottom-left of
    // the explore content, below the moth flight band. Each is a small icon with
    // a level badge; tap for a popup of what it's doing. Hidden until owned —
    // refreshPetRow syncs visibility/levels.
    const petY = this.petRowY();
    PETS.forEach((pet, i) => {
      const btn = this.scene.add.container(58 + i * 78, petY).setDepth(18).setVisible(false);
      const bg = this.scene.add.rectangle(0, 0, 66, 66, 0x1e1e1e, 0.95).setStrokeStyle(2, 0x6a5a2a);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.showPetPopup(pet.id));
      btn.add(bg);
      // PNG art when loaded; the pet's emoji stands in until art exists.
      const petIcon = this.createIcon(0, -6, pet.iconKey, 46);
      if (petIcon) btn.add(petIcon);
      else btn.add(makeText(this.scene, 0, -6, pet.icon, 30, '#FFFFFF').setOrigin(0.5));
      const lvlTxt = makeText(this.scene, 0, 24, 'Lv 1', 13, '#FFE08A', {
        fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5);
      btn.add(lvlTxt);
      panel.add(btn);
      this.petBtns.set(pet.id, btn);
      this.petLvlBadges.set(pet.id, lvlTxt);
    });
    this.refreshPetRow();

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

    // During an encounter the entity covers the node and taps hit IT — so IT
    // reacts (recoil + red hit-flash), not the ore icon hidden underneath.
    const foe = this.entityShownId
      ? (this.entityImg?.visible ? this.entityImg
        : this.entityEmoji?.visible ? this.entityEmoji : undefined)
      : undefined;
    if (foe) {
      const base = foe === this.entityImg ? 300 / ICON_NATIVE : 1;
      this.scene.tweens.killTweensOf(foe);
      foe.setAlpha(1);
      foe.setScale(base * 0.9);
      foe.setTint(0xff7777);
      foe.angle = 0;
      this.scene.tweens.add({ targets: foe, scale: base, duration: 240, ease: 'Back.easeOut' });
      this.scene.tweens.add({
        targets: foe, angle: [6, -4, 2, 0], duration: 300, ease: 'Sine.easeInOut',
        onComplete: () => { foe.angle = 0; },
      });
      this.scene.time.delayedCall(90, () => foe.clearTint());
      return;
    }

    const s = UIManager.SHOWCASE_SIZE / ICON_NATIVE;
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
   * pops bigger and drifts higher; a SUPER crit (Static) is bigger still,
   * burning orange with a double bang.
   */
  showSearchHit(damage: Big, crit: boolean, superCrit = false): void {
    if (this.activeTab !== 'explore') return;
    const cx = LAYOUT.CENTER_X + Phaser.Math.Between(-50, 50);
    const cy = this.showcaseCenterY() + Phaser.Math.Between(-30, 10);
    const label = superCrit ? `${fmt(damage)}!!` : crit ? `${fmt(damage)}!` : fmt(damage);
    // Hype mode pumps up the numbers — bigger and chunkier.
    const hyped = this.state.hypeActive;
    const size = Math.round((superCrit ? 66 : crit ? 54 : 30) * (hyped ? 1.6 : 1));
    const color = superCrit ? '#FF8A3C' : crit ? '#FFD24A' : '#FFFFFF';
    const mote = makeText(this.scene, cx, cy, label, size, color, {
      fontStyle: 'bold', stroke: '#000000', strokeThickness: superCrit ? 7 : crit ? 6 : 4,
    }).setOrigin(0.5).setDepth(21);
    this.panels.get('explore')?.add(mote);
    this.scene.tweens.add({
      targets: mote,
      x: cx + Phaser.Math.Between(-40, 40),
      y: cy - (superCrit ? 220 : crit ? 180 : 120),
      alpha: { from: 1, to: 0 },
      scale: superCrit ? { from: 1.5, to: 1 } : crit ? { from: 1.35, to: 1 } : { from: 1, to: 0.9 },
      duration: superCrit ? 1100 : crit ? 950 : 680,
      ease: 'Cubic.easeOut',
      onComplete: () => mote.destroy(),
    });
  }

  /* ---- Items panel ---- */

  private createItemsPanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);

    // Scrollable container — rows are positioned by layoutItemRows(), which
    // also hides resources from floors you haven't reached this run (so the
    // list only ever shows what you've actually seen).
    const scrollContainer = this.scene.add.container(0, 0);
    this.itemsScroll = scrollContainer;
    const contentH = LAYOUT.CONTENT_BOTTOM_WIDE - LAYOUT.CONTENT_TOP_WIDE - 10;

    for (const resId of RESOURCE_ORDER) {
      const res = RESOURCES[resId];
      // Row children use LOCAL offsets; the row container itself is slotted
      // into place (row.y) by layoutItemRows.
      const row = this.scene.add.container(0, 0).setVisible(false);

      // Resource icon + name (left) + count (right) — same line
      const icon = this.createIcon(60, 14, resId, 100);
      if (icon) {
        row.add(icon);
        row.add(makeText(this.scene, 120, 0, res.name, 22, '#EEEEEE'));
      } else {
        row.add(makeText(this.scene, 40, 0, `${res.icon}  ${res.name}`, 22, '#EEEEEE'));
      }
      const countTxt = makeText(this.scene, 680, 2, `x${fmt(this.state.resources[resId] ?? D(0))}`, 22, '#FFD700', {
        fontStyle: 'bold',
      }).setOrigin(1, 0);
      row.add(countTxt);
      this.resTexts.set(`item_${resId}`, countTxt);

      // Description (left) + use button (right) — same line
      row.add(makeText(this.scene, icon ? 120 : 60, 30, res.description, 16, '#AAAAAA'));

      if (res.usable && res.useLabel) {
        const label = res.useLabel;
        const btn = makeBtn(this.scene, 640, 40, label, 100, 32, 0x334433, () => {
          if (resId === 'almond_water') this.cb.onHeal();
          else if (resId === 'canned_food') this.cb.onEat();
        });
        row.add(btn);
      }

      scrollContainer.add(row);
      this.itemRows.set(resId, row);
    }

    panel.add(scrollContainer);

    // Clip to the content area so scrolled rows don't bleed over the tab bar.
    const maskGfx = this.scene.add.graphics();
    maskGfx.setVisible(false);
    maskGfx.fillRect(0, LAYOUT.CONTENT_TOP_WIDE, LAYOUT.GAME_WIDTH, contentH);
    panel.setMask(maskGfx.createGeometryMask());

    // Drag to scroll. The scroll floor (itemsMinScroll) is recomputed by
    // layoutItemRows as the visible list grows past the viewport.
    const dragZone = this.scene.add.rectangle(
      LAYOUT.CENTER_X, LAYOUT.CONTENT_TOP_WIDE + contentH / 2,
      LAYOUT.GAME_WIDTH, contentH, 0x000000, 0,
    ).setDepth(16).setInteractive();

    let dragging = false;
    let lastY = 0;

    dragZone.on('pointerdown', (_p: Phaser.Input.Pointer) => {
      dragging = true;
      lastY = _p.y;
    });
    this.scene.input.on('pointermove', (_p: Phaser.Input.Pointer) => {
      if (!dragging || !this.panels.get('items')?.visible) return;
      const dy = _p.y - lastY;
      lastY = _p.y;
      scrollContainer.y = Phaser.Math.Clamp(scrollContainer.y + dy, this.itemsMinScroll, 0);
    });
    this.scene.input.on('pointerup', () => { dragging = false; });

    // Mouse-wheel scroll for PC players.
    this.scene.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (!this.panels.get('items')?.visible) return;
      scrollContainer.y = Phaser.Math.Clamp(scrollContainer.y - dy, this.itemsMinScroll, 0);
    });

    panel.add(dragZone);

    this.panels.set('items', panel);
    this.layoutItemRows();
  }

  /**
   * Show only the resources you've SEEN this run — a floor's ore appears once
   * that floor is unlocked (or you're holding some, e.g. Moths), everything
   * deeper stays hidden. Visible rows pack together; scroll bounds follow.
   */
  private layoutItemRows(): void {
    const startY = LAYOUT.CONTENT_TOP_WIDE + 10;
    const rowH = 75;
    const contentH = LAYOUT.CONTENT_BOTTOM_WIDE - LAYOUT.CONTENT_TOP_WIDE - 10;
    const maxUnlocked = Math.max(0, ...this.state.unlockedLevels);
    let visIdx = 0;
    RESOURCE_ORDER.forEach((resId, i) => {
      const row = this.itemRows.get(resId);
      if (!row) return;
      const owned = (this.state.resources[resId] ?? D(0)).gt(0);
      // Ore rows unlock with their floor (tier laps re-use the same row);
      // floor-independent extras (Moth) show once you hold any.
      const seen = (i < ORE_SEQUENCE.length && i <= maxUnlocked) || owned;
      row.setVisible(seen);
      if (seen) row.y = startY + (visIdx++) * rowH;   // slot into the packed list
    });
    this.itemsMinScroll = Math.min(0, -(visIdx * rowH - contentH));
    if (this.itemsScroll) {
      this.itemsScroll.y = Phaser.Math.Clamp(this.itemsScroll.y, this.itemsMinScroll, 0);
    }
  }

  /* ---- Upgrade panel ---- */

  // One CARD's internal geometry, defined ONCE (local offsets from the card's
  // container origin). Cards are uniform and laid out in a TWO-COLUMN grid by
  // relayoutUpgrades(), so there is no per-index math and nothing can overlap
  // regardless of how many upgrades exist.
  // Cards are FLUSH: the grid pitch equals the card height and the column
  // offset equals the card width, so adjacent cards share edges (their 1px
  // strokes form the grid lines).
  private static readonly UPG_ROW_H = 158;    // vertical pitch = card height
  private static readonly UPG_COL_W = 338;    // right-column x offset = card width
  private static readonly UPG_GRID_X = 8;     // grid left inset (centers 2 × 338 in 720)
  private static readonly UPG_CARD_W = 338;   // card width
  private static readonly UPG_CARD_CX = 183;  // card center x within its container
  private static readonly UPG_LEFT = 28;
  private static readonly UPG_BTN_W = 310;    // spans the card with even padding
  private static readonly UPG_BTN_H = 50;
  private static readonly UPG_BTN_CY = 108;   // button vertical center within the card

  /**
   * Lazily bake the shared buy-button texture: a bluish-purple vertical
   * gradient with rounded corners + a light border. One texture, every button
   * is an Image of it — affordability is shown by ALPHA, not a color swap.
   *
   * Drawn directly on a CanvasTexture: Graphics.fillGradientStyle is
   * WebGL-only and silently drops the FILL when baked via generateTexture
   * (canvas path), which left only the stroke outline.
   */
  private ensureUpgradeBtnTexture(): void {
    if (this.scene.textures.exists('upg_btn_grad')) return;
    const w = UIManager.UPG_BTN_W;
    const h = UIManager.UPG_BTN_H;
    const r = 12;
    const tex = this.scene.textures.createCanvas('upg_btn_grad', w, h);
    if (!tex) return;
    const ctx = tex.getContext();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#8a7bff');
    grad.addColorStop(1, '#5440c8');
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(1, 1, w - 2, h - 2, r);
    else ctx.rect(1, 1, w - 2, h - 2);   // ancient-browser fallback: square corners
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(168, 155, 255, 0.9)';
    ctx.stroke();
    tex.refresh();
  }

  private createUpgradePanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);
    const contentH = LAYOUT.CONTENT_BOTTOM_WIDE - LAYOUT.CONTENT_TOP_WIDE - 10;
    this.ensureUpgradeBtnTexture();

    const scrollContainer = this.scene.add.container(0, 0);
    this.upgScroll = scrollContainer;

    for (const upg of UPGRADES) this.buildUpgradeRow(upg);

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
   * Build one upgrade card and register it in the id→widget maps. Called for
   * the whole roster at panel creation, and again by syncUpgradeRows() when
   * the endless ladder generates new tiers mid-session.
   */
  private buildUpgradeRow(upg: UpgradeDef): void {
    const scrollContainer = this.upgScroll;
    if (!scrollContainer) return;
    const LX = UIManager.UPG_LEFT;
    const BW = UIManager.UPG_BTN_W;
    const BCY = UIManager.UPG_BTN_CY;

    // Card container; relayoutUpgrades() assigns its grid slot (x = column,
    // y = row). Children use fixed LOCAL offsets — name / desc / level
    // stacked, then the gradient buy button.
    const row = this.scene.add.container(0, 0);

    const nameTxt = makeText(this.scene, LX, 4, upg.name, 17, '#EEEEEE', { fontStyle: 'bold' });
    // Description is HARD-CAPPED at 3 wrapped lines (maxLines) and the Lv
    // counter lives top-right, so no description length can ever collide.
    const descTxt = makeText(this.scene, LX, 30, upg.description, 13, '#D8D8D8', {
      wordWrap: { width: UIManager.UPG_CARD_W - 38 }, maxLines: 3,
    });
    const lvl = this.state.getUpgradeLevel(upg.id);
    const lvlTxt = makeText(this.scene, LX + BW, 6, `Lv ${lvl}/${upg.maxLevel}`, 13, '#9fd0a0')
      .setOrigin(1, 0);
    this.upgNameLabels.set(upg.id, nameTxt);
    this.upgDescLabels.set(upg.id, descTxt);
    this.upgLvlLabels.set(upg.id, lvlTxt);

    // Cost line = the buy button: "[icon] owned/cost ResourceName".
    const btnBg = this.scene.add.image(LX + BW / 2, BCY, 'upg_btn_grad')
      .setInteractive({ useHandCursor: true });
    // Press feedback: a quick squeeze while held.
    btnBg.on('pointerdown', () => btnBg.setScale(0.96));
    btnBg.on('pointerout', () => btnBg.setScale(1));
    // Buy on RELEASE, only if the gesture wasn't a scroll-drag AND the pointer is
    // inside the content area — masked overflow rows still hit-test over the
    // header/tab strips, where a buy must never trigger.
    btnBg.on('pointerup', (p: Phaser.Input.Pointer) => {
      btnBg.setScale(1);
      if (!this.upgDragMoved && this.inWideContent(p)) this.cb.onBuyUpgrade(upg.id);
    });
    // Oversized on purpose — the icon overhangs the button top/bottom for pop.
    const costIcon = this.createIcon(LX + 38, BCY, upg.costResource, 76);
    if (costIcon) this.upgCostIcons.set(upg.id, costIcon);
    const costLabel = makeText(this.scene, LX + BW / 2, BCY, '', 13, '#FFFFFF', { fontStyle: 'bold' })
      .setOrigin(0.5, 0.5);

    // Each upgrade gets its own card (added first so it sits behind the content).
    // Spans local y -10..148 — ~15px clear under the button (which ends at 133);
    // full opacity until maxed (updateCostButton dims it).
    const card = this.scene.add.rectangle(UIManager.UPG_CARD_CX, 69, UIManager.UPG_CARD_W, 158, 0x1e1e1e, 1)
      .setStrokeStyle(1, 0x3a3a3a);
    this.upgCards.set(upg.id, card);

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

  /**
   * Create cards for any UPGRADES entries added since the panel was built —
   * the endless ladder pushes new tier defs when a floor is first reached.
   * Cheap no-op when nothing is new.
   */
  syncUpgradeRows(): void {
    if (!this.upgScroll) return;
    let added = false;
    for (const upg of UPGRADES) {
      if (!this.upgRows.has(upg.id)) { this.buildUpgradeRow(upg); added = true; }
    }
    if (added) this.relayoutUpgrades();
  }

  /**
   * Position the visible upgrade cards in a TWO-COLUMN grid (fill order:
   * left→right, then down) and recompute scroll bounds. Hidden cards (e.g.
   * maxed when hideMaxed is on) claim no slot, so the grid always packs tight
   * no matter the count or filter.
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
      row.x = UIManager.UPG_GRID_X + (shown % 2) * UIManager.UPG_COL_W;
      row.y = startY + Math.floor(shown / 2) * rowH;
      shown++;
    }
    const gridRows = Math.ceil(shown / 2);
    this.upgMinScroll = Math.min(0, contentH - gridRows * rowH);
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

  /* ---- Void panel (Rewind + permanent fragment upgrades) ---- */

  private createVoidPanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);
    const contentH = LAYOUT.CONTENT_BOTTOM_WIDE - LAYOUT.CONTENT_TOP_WIDE - 10;
    const cx = LAYOUT.CENTER_X;

    const scrollContainer = this.scene.add.container(0, 0);
    this.voidScroll = scrollContainer;

    this.ensureUpgradeBtnTexture();
    const LX = UIManager.UPG_LEFT;
    const BW = UIManager.UPG_BTN_W;
    const BCY = UIManager.UPG_BTN_CY;
    const rowH = UIManager.UPG_ROW_H;

    // Header (scrolls with the list): fragment balance + how the economy works.
    const headerY = LAYOUT.CONTENT_TOP_WIDE + 10;
    const vfIcon = this.createIcon(0, headerY + 14, 'void_fragment', 60) ?? undefined;
    this.voidFragIcon = vfIcon;
    this.voidFragLabel = makeText(this.scene, 0, headerY,
      `Void Fragments: ${this.state.voidFragments}`, 22, '#CC88FF', { fontStyle: 'bold' }).setOrigin(0, 0);
    if (vfIcon) scrollContainer.add(vfIcon);
    scrollContainer.add(this.voidFragLabel);
    this.centerShardHeader(vfIcon, this.voidFragLabel, cx);
    const earnInfo = makeText(this.scene, cx, headerY + 36,
      'Rewind to earn Fragments — deeper runs pay exponentially more.',
      13, '#8888AA').setOrigin(0.5, 0);
    scrollContainer.add(earnInfo);

    // ---- Rewind payout banner — the headline of the tab. A big card that
    // shouts what THIS rewind pays right now: huge fragment count (pulsing
    // when there's something to take), shard/scrap extras, and a "you keep"
    // line so the reset never feels like losing everything. ----
    const canRewind = this.state.canRewind();
    const bannerTop = headerY + 64;
    const bannerH = 150;
    this.rewindBanner = this.scene.add.rectangle(cx, bannerTop + bannerH / 2, 660, bannerH, 0x2a2040, 1)
      .setStrokeStyle(2, 0x8855CC);
    scrollContainer.add(this.rewindBanner);
    // Oversized fragment icon anchors the banner's left side.
    const bigFrag = this.createIcon(120, bannerTop + 58, 'void_fragment', 100);
    if (bigFrag) scrollContainer.add(bigFrag);
    this.rewindPayoutBig = makeText(this.scene, bigFrag ? 185 : 60, bannerTop + 40, '+0', 44, '#FFD700', {
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0, 0.5);
    scrollContainer.add(this.rewindPayoutBig);
    this.rewindPayoutLabel = makeText(this.scene, bigFrag ? 185 : 60, bannerTop + 70, 'VOID FRAGMENTS', 15, '#CC88FF', {
      fontStyle: 'bold',
    }).setOrigin(0, 0);
    scrollContainer.add(this.rewindPayoutLabel);
    this.rewindBonusLine = makeText(this.scene, cx, bannerTop + 102, '', 14, '#C0C8D0', {
      align: 'center',
    }).setOrigin(0.5, 0);
    scrollContainer.add(this.rewindBonusLine);
    this.rewindKeepLine = makeText(this.scene, cx, bannerTop + 126, '', 12, '#7777AA', {
      align: 'center',
    }).setOrigin(0.5, 0);
    scrollContainer.add(this.rewindKeepLine);
    // The +N heartbeat — resumed/paused by refreshVoidPanel with the payout.
    this.rewindPulseTween = this.scene.tweens.add({
      targets: this.rewindPayoutBig, scale: 1.08, duration: 640,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut', paused: true,
    });

    // The REWIND button itself, right under the banner.
    const rewindBtnY = bannerTop + bannerH + 40;
    const rewindBtnBg = this.scene.add.rectangle(0, 0, 420, 56, canRewind ? 0x553388 : 0x222233)
      .setOrigin(0.5).setStrokeStyle(2, canRewind ? 0x8855CC : 0x333344);
    const rwIcon = this.createIcon(-120, 0, 'rewind_button', 80);
    const rewindBtnTxt = this.scene.add.text(rwIcon ? 10 : 0, 0, rwIcon ? 'REWIND' : '⏪ REWIND', {
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
    // Rewind on RELEASE with the same drag/area guard as the buy buttons — a
    // scroll gesture must never trigger a full prestige reset.
    this.rewindBtn.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.voidDragMoved && this.inWideContent(p) && this.state.canRewind()) this.cb.onRewind();
    });
    this.rewindBtnBg = rewindBtnBg;
    scrollContainer.add(this.rewindBtn);

    this.voidStatsLine = makeText(this.scene, cx, rewindBtnY + 36, '', 13, '#666688')
      .setOrigin(0.5, 0);
    scrollContainer.add(this.voidStatsLine);

    const divider = this.scene.add.rectangle(cx, rewindBtnY + 64, 660, 2, 0x553388);
    scrollContainer.add(divider);

    // Card grid of permanent void upgrades — same geometry as the shop cards.
    const firstCardY = rewindBtnY + 78;
    for (let i = 0; i < VOID_UPGRADES.length; i++) {
      const vup = VOID_UPGRADES[i];
      const row = this.scene.add.container(
        UIManager.UPG_GRID_X + (i % 2) * UIManager.UPG_COL_W,
        firstCardY + Math.floor(i / 2) * rowH,
      );

      const nameTxt = makeText(this.scene, LX, 4, `${vup.icon} ${vup.name}`, 17, '#DDDDFF', { fontStyle: 'bold' });
      const descTxt = makeText(this.scene, LX, 30, vup.description, 13, '#D8D8D8', {
        wordWrap: { width: UIManager.UPG_CARD_W - 38 }, maxLines: 3,
      });
      const lvlTxt = makeText(this.scene, LX + BW, 6, `Lv ${this.state.getVoidLevel(vup.id)}/${vup.maxLevel}`, 13, '#c8a8ff')
        .setOrigin(1, 0);
      this.voidLvlLabels.set(vup.id, lvlTxt);

      const btnBg = this.scene.add.image(LX + BW / 2, BCY, 'upg_btn_grad')
        .setInteractive({ useHandCursor: true });
      btnBg.on('pointerdown', () => btnBg.setScale(0.96));
      btnBg.on('pointerout', () => btnBg.setScale(1));
      btnBg.on('pointerup', (p: Phaser.Input.Pointer) => {
        btnBg.setScale(1);
        if (!this.voidDragMoved && this.inWideContent(p)) this.cb.onBuyVoidUpgrade(vup.id);
      });
      // Oversized on purpose — overhangs the button top/bottom for pop.
      const costIcon = this.createIcon(LX + 38, BCY, 'void_fragment', 76);
      if (costIcon) this.voidCostIcons.set(vup.id, costIcon);
      const costLabel = makeText(this.scene, LX + BW / 2, BCY, '', 13, '#FFFFFF', { fontStyle: 'bold' })
        .setOrigin(0.5, 0.5);

      // Void cards get a faint purple cast to set the menu apart.
      const card = this.scene.add.rectangle(UIManager.UPG_CARD_CX, 69, UIManager.UPG_CARD_W, 158, 0x1e1e2e, 1)
        .setStrokeStyle(1, 0x3a3a55);
      this.voidCards.set(vup.id, card);

      row.add(card);
      row.add([nameTxt, descTxt, lvlTxt, btnBg]);
      if (costIcon) row.add(costIcon);
      row.add(costLabel);

      scrollContainer.add(row);
      this.voidBuyBg.set(vup.id, btnBg);
      this.voidCostLabels.set(vup.id, costLabel);
    }

    panel.add(scrollContainer);

    // Clip to the content area.
    const maskGfx = this.scene.add.graphics();
    maskGfx.setVisible(false);
    maskGfx.fillRect(0, LAYOUT.CONTENT_TOP_WIDE, LAYOUT.GAME_WIDTH, contentH);
    panel.setMask(maskGfx.createGeometryMask());

    const gridRows = Math.ceil(VOID_UPGRADES.length / 2);
    const totalH = (firstCardY + gridRows * rowH) - (LAYOUT.CONTENT_TOP_WIDE + 10);
    this.voidMinScroll = Math.min(0, contentH - totalH);

    // Drag-to-scroll (same gesture model as the shop, gated to this tab).
    this.scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.activeTab !== 'void') return;
      if (p.y < LAYOUT.CONTENT_TOP_WIDE || p.y > LAYOUT.CONTENT_BOTTOM_WIDE) return;
      this.voidDragActive = true;
      this.voidDragMoved = false;
      this.voidDragStartPointer = p.y;
      this.voidDragStartScroll = scrollContainer.y;
    });
    this.scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.voidDragActive) return;
      const dy = p.y - this.voidDragStartPointer;
      if (Math.abs(dy) > 6) this.voidDragMoved = true;
      scrollContainer.y = Phaser.Math.Clamp(this.voidDragStartScroll + dy, this.voidMinScroll, 0);
    });
    this.scene.input.on('pointerup', () => { this.voidDragActive = false; });
    this.scene.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.activeTab !== 'void' || !this.voidScroll) return;
      this.voidScroll.y = Phaser.Math.Clamp(this.voidScroll.y - dy, this.voidMinScroll, 0);
    });

    this.panels.set('void', panel);
    this.refreshVoidPanel();
  }

  /** Refresh one void-upgrade card: level and cost button (MAXED hides the icon). */
  private renderVoidRow(vup: VoidUpgradeDef): void {
    const lvl = this.state.getVoidLevel(vup.id);
    const maxed = lvl >= vup.maxLevel;
    const canBuy = this.state.canAffordVoidUpgrade(vup.id);
    const cost = this.state.getVoidUpgradeCost(vup.id);

    this.voidLvlLabels.get(vup.id)?.setText(`Lv ${lvl}/${vup.maxLevel}`);

    // Same treatment as the shop: maxed hides the button and fades the card;
    // affordability reads as opacity on the gradient.
    this.voidCards.get(vup.id)?.setAlpha(maxed ? 0.5 : 1);
    const bg = this.voidBuyBg.get(vup.id);
    if (bg) {
      bg.setVisible(!maxed);
      if (bg.input) bg.input.enabled = !maxed;
      if (!maxed) bg.setAlpha(canBuy ? 1 : 0.35);
    }
    this.voidCostIcons.get(vup.id)?.setVisible(!maxed).setAlpha(canBuy ? 1 : 0.6);
    const label = this.voidCostLabels.get(vup.id);
    if (label) {
      if (maxed) label.setText('MAXED').setColor('#c8a8ff').setAlpha(1);
      else label.setText(`${cost} Fragments`).setColor('#FFFFFF').setAlpha(canBuy ? 1 : 0.7);
    }
  }

  refreshVoidPanel(): void {
    this.voidFragLabel.setText(`Void Fragments: ${this.state.voidFragments}`);
    this.centerShardHeader(this.voidFragIcon, this.voidFragLabel, LAYOUT.CENTER_X);

    for (const vup of VOID_UPGRADES) this.renderVoidRow(vup);

    // Rewind payout banner: what THIS rewind pays, in headline type.
    const canRewind = this.state.canRewind();
    const frags = canRewind ? this.state.calculateRewindFragments() : 0;
    const hot = canRewind && frags > 0;
    if (!canRewind) {
      this.rewindPayoutBig.setText('\u{1F512}').setColor('#666688');
      this.rewindPayoutLabel.setText(`REACH FLOOR ${REWIND_MIN_FLOOR} TO UNLOCK`).setColor('#666688');
      this.rewindBonusLine.setText('The Rewind resets the run and pays permanent Void Fragments.');
    } else if (frags <= 0) {
      this.rewindPayoutBig.setText('+0').setColor('#8888AA');
      this.rewindPayoutLabel.setText('VOID FRAGMENTS').setColor('#8888AA');
      this.rewindBonusLine.setText(`Descend past Floor ${this.state.rewindHeadStart} (your head start) to earn Fragments.`);
    } else {
      const shards = this.state.rewindShardBonus;   // Conduit pays only on a productive rewind
      this.rewindPayoutBig.setText(`+${frags}`).setColor('#FFD700');
      this.rewindPayoutLabel.setText('VOID FRAGMENTS · READY NOW').setColor('#CC88FF');
      this.rewindBonusLine.setText(shards > 0 ? `Plus: +${shards} Void Shard${shards === 1 ? '' : 's'}` : '');
    }
    this.rewindKeepLine.setText('You keep: gear (equipped + bag) · Scrap · pets · bases · shards · Void upgrades');
    this.rewindBanner.setFillStyle(hot ? 0x2a2040 : 0x1e1c2a);
    this.rewindBanner.setStrokeStyle(2, hot ? 0x8855CC : 0x3a3a55);
    // Heartbeat only while there's a payout to grab.
    if (hot !== this.rewindPulseOn) {
      this.rewindPulseOn = hot;
      if (hot) this.rewindPulseTween?.play();   // play() also wakes a created-paused tween
      else {
        this.rewindPulseTween?.pause();
        this.rewindPayoutBig.setScale(1);
      }
    }

    this.voidStatsLine?.setText(
      `Rewinds: ${this.state.prestigeCount}  ·  Lifetime depth: ${this.state.totalDepth}  ·  Deepest this run: ${this.state.deepestFloorThisRun}`,
    );
    this.rewindBtnBg.setFillStyle(canRewind ? 0x553388 : 0x222233);
    this.rewindBtnBg.setStrokeStyle(2, canRewind ? 0x8855CC : 0x333344);
    const rewindTxt = this.rewindBtn.getAt(1) as Phaser.GameObjects.Text;
    rewindTxt.setColor(canRewind ? '#FFFFFF' : '#555566');
  }

  /* ---- Gear panel (craftable scavenger loadout) ---- */

  // Gear card internals: standard card frame plus an effects line (green) and a
  // flavor line, with the item's SLOT as a badge where upgrade cards show Lv.
  private static readonly GEAR_SLOT_BOX = 118;    // slot summary box size (5 across)
  private static readonly GEAR_SLOT_X0 = 72;      // first slot box center x
  private static readonly GEAR_SLOT_PITCH = 144;  // slot box spacing (720 / 5)

  private createGearPanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);
    const contentH = LAYOUT.CONTENT_BOTTOM_WIDE - LAYOUT.CONTENT_TOP_WIDE - 10;
    const cx = LAYOUT.CENTER_X;

    const scrollContainer = this.scene.add.container(0, 0);
    this.gearScroll = scrollContainer;

    this.ensureUpgradeBtnTexture();
    const LX = UIManager.UPG_LEFT;
    const BW = UIManager.UPG_BTN_W;
    const BCY = UIManager.UPG_BTN_CY;
    const rowH = UIManager.UPG_ROW_H;

    // Loadout summary: one box per slot (equipped item icon + name, or empty).
    const headerY = LAYOUT.CONTENT_TOP_WIDE + 10;
    const box = UIManager.GEAR_SLOT_BOX;
    const boxCY = headerY + 26 + box / 2;
    for (let i = 0; i < GEAR_SLOTS.length; i++) {
      const slot = GEAR_SLOTS[i];
      const sx = UIManager.GEAR_SLOT_X0 + i * UIManager.GEAR_SLOT_PITCH;
      scrollContainer.add(makeText(this.scene, sx, headerY, `${GEAR_SLOT_ICONS[slot]} ${GEAR_SLOT_LABELS[slot]}`, 13, '#AAAAAA', { fontStyle: 'bold' }).setOrigin(0.5, 0));
      // Tap a filled slot box to inspect the equipped piece (level it up there).
      const slotBox = this.scene.add.rectangle(sx, boxCY, box, box, 0x1e1e1e, 1)
        .setStrokeStyle(1, 0x3a3a3a)
        .setInteractive({ useHandCursor: true });
      slotBox.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (this.gearDragMoved || !this.inWideContent(p)) return;
        const id = this.state.gearEquipped[slot];
        if (id) this.showGearItemPopup(id);
      });
      scrollContainer.add(slotBox);
      // "--" placeholder while the slot is empty; refreshGearPanel swaps in the icon.
      const emptyTxt = makeText(this.scene, sx, boxCY, '--', 22, '#555555').setOrigin(0.5);
      scrollContainer.add(emptyTxt);
      this.gearSlotEmpty.set(slot, emptyTxt);
      const nameTxt = makeText(this.scene, sx, boxCY + box / 2 + 6, '', 12, '#CCCCCC', {
        align: 'center', wordWrap: { width: UIManager.GEAR_SLOT_PITCH - 8 }, maxLines: 2,
      }).setOrigin(0.5, 0);
      scrollContainer.add(nameTxt);
      this.gearSlotNames.set(slot, nameTxt);
      // LEVEL-UP pip: same red "!" language as the tab-bar alert dots. Sits on
      // the box's top-right corner; refreshGearPanel drives visibility.
      const pip = this.scene.add.container(sx + box / 2 - 8, boxCY - box / 2 + 8);
      pip.add(this.scene.add.circle(0, 0, 11, 0xff3030).setStrokeStyle(2, 0x000000));
      pip.add(makeText(this.scene, 0, 0, '!', 15, '#FFFFFF', { fontStyle: 'bold' }).setOrigin(0.5));
      pip.setVisible(false);
      scrollContainer.add(pip);
      this.gearSlotPips.set(slot, pip);
    }

    // Total loadout bonus line under the boxes.
    this.gearBonusText = makeText(this.scene, cx, boxCY + box / 2 + 48, '', 14, '#9fd0a0', {
      align: 'center', wordWrap: { width: 660 }, maxLines: 2,
    }).setOrigin(0.5, 0);
    scrollContainer.add(this.gearBonusText);

    // Scrap balance — earned by dismantling gear, spent on gear levels.
    this.gearScrapText = makeText(this.scene, cx, boxCY + box / 2 + 96, '', 16, '#C0C8D0', {
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    scrollContainer.add(this.gearScrapText);
    // Scrap art sits left of the balance line (x set on refresh — the line's
    // width changes with the number). Falls back to the 🔩 emoji in the text.
    this.gearScrapIcon = this.createIcon(cx, boxCY + box / 2 + 96 + 10, 'scrap', 26);
    if (this.gearScrapIcon) scrollContainer.add(this.gearScrapIcon);

    // The BAG — benched gear that travels with you across Rewinds. One box per
    // bag slot (same visual language as the loadout row); tap a filled box to
    // inspect the item and equip or scrap it from the popup. A legacy save can
    // arrive over capacity, so the row is sized to fit whatever it holds.
    const bagCap = Math.max(this.state.gearInventorySize, this.state.gearInventory.length);
    const bagLabelY = boxCY + box / 2 + 128;
    this.gearBagLabel = makeText(this.scene, cx, bagLabelY, '', 13, '#AAAAAA', { fontStyle: 'bold' })
      .setOrigin(0.5, 0);
    scrollContainer.add(this.gearBagLabel);
    this.gearBagBoxCY = bagLabelY + 26 + box / 2;
    this.gearBagX0 = cx - ((bagCap - 1) / 2) * UIManager.GEAR_SLOT_PITCH;
    this.gearBagEmpty = [];
    this.gearBagNames = [];
    for (let i = 0; i < bagCap; i++) {
      const sx = this.gearBagX0 + i * UIManager.GEAR_SLOT_PITCH;
      const bagBox = this.scene.add.rectangle(sx, this.gearBagBoxCY, box, box, 0x1e1e1e, 1)
        .setStrokeStyle(1, 0x3a3a3a)
        .setInteractive({ useHandCursor: true });
      bagBox.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (this.gearDragMoved || !this.inWideContent(p)) return;
        const id = this.state.gearInventory[i];
        if (id) this.showGearItemPopup(id);
      });
      scrollContainer.add(bagBox);
      const emptyTxt = makeText(this.scene, sx, this.gearBagBoxCY, '--', 22, '#555555').setOrigin(0.5);
      scrollContainer.add(emptyTxt);
      this.gearBagEmpty.push(emptyTxt);
      const nameTxt = makeText(this.scene, sx, this.gearBagBoxCY + box / 2 + 6, '', 12, '#CCCCCC', {
        align: 'center', wordWrap: { width: UIManager.GEAR_SLOT_PITCH - 8 }, maxLines: 2,
      }).setOrigin(0.5, 0);
      scrollContainer.add(nameTxt);
      this.gearBagNames.push(nameTxt);
    }

    const dividerY = this.gearBagBoxCY + box / 2 + 44;
    const divider = this.scene.add.rectangle(cx, dividerY, 660, 2, 0x444444);
    scrollContainer.add(divider);
    scrollContainer.add(makeText(this.scene, cx, dividerY + 8, 'CRAFT NEW GEAR', 13, '#AAAAAA', { fontStyle: 'bold' })
      .setOrigin(0.5, 0));

    // Card grid of CRAFTABLE gear only — owned pieces live in the loadout/bag
    // above, and scrapped items hide until Rewind; relayoutGearRows() packs
    // whatever remains.
    const firstCardY = dividerY + 34;
    this.gearFirstCardY = firstCardY;
    for (let i = 0; i < GEAR.length; i++) {
      const gear = GEAR[i];
      const row = this.scene.add.container(
        UIManager.UPG_GRID_X + (i % 2) * UIManager.UPG_COL_W,
        firstCardY + Math.floor(i / 2) * rowH,
      );
      this.gearRows.set(gear.id, row);

      const nameIcon = gear.iconTexture ? this.createIcon(LX + 16, 14, gear.iconTexture, 40) : null;
      if (nameIcon) this.gearNameIcons.set(gear.id, nameIcon);
      const nameTxt = makeText(this.scene, nameIcon ? LX + 42 : LX, 4, gear.name, 17, '#EEEEEE', { fontStyle: 'bold' });
      this.gearNameLabels.set(gear.id, nameTxt);
      // Effects line (what it actually gives you) + one flavor line under it.
      const descTxt = makeText(this.scene, LX, 34, gearEffectSummary(gear), 13, '#9fd0a0', {
        wordWrap: { width: UIManager.UPG_CARD_W - 38 }, maxLines: 2,
      });
      this.gearDescLabels.set(gear.id, descTxt);
      // Equip-status line (the old flavor blurb slot): "Equipped" in green
      // when the piece is in its slot, blank otherwise.
      const flavorTxt = makeText(this.scene, LX, 66, '', 12, '#7CFF7C', {
        wordWrap: { width: UIManager.UPG_CARD_W - 38 }, maxLines: 1, fontStyle: 'bold',
      });
      this.gearFlavorLabels.set(gear.id, flavorTxt);
      // Slot badge where upgrade cards show the Lv counter.
      const slotTxt = makeText(this.scene, LX + BW, 6, GEAR_SLOT_LABELS[gear.slot], 12, '#c8a8ff')
        .setOrigin(1, 0);
      this.gearSlotBadges.set(gear.id, slotTxt);

      // Main button: CRAFT — owned pieces leave the grid (loadout/bag manage
      // them), so the only actions here are craft and the bag-full prompt.
      const btnBg = this.scene.add.image(LX + BW / 2, BCY, 'upg_btn_grad')
        .setInteractive({ useHandCursor: true });
      btnBg.on('pointerdown', () => btnBg.setScale(0.96));
      btnBg.on('pointerout', () => btnBg.setScale(1));
      btnBg.on('pointerup', (p: Phaser.Input.Pointer) => {
        btnBg.setScale(1);
        if (this.gearDragMoved || !this.inWideContent(p)) return;
        if (this.state.canAffordGear(gear.id) && this.state.craftBlockedByFullInventory(gear.id)) {
          this.showBagFullPrompt(gear);
        }
        else this.cb.onCraftGear(gear.id);
      });

      // Cost pairs: resource icon + "owned/cost" per ingredient, laid out to
      // the right of the CRAFT word. Icons instead of names — names overflow.
      const costLabel = makeText(this.scene, LX + BW / 2, BCY, '', 12, '#FFFFFF', {
        fontStyle: 'bold', align: 'center',
      }).setOrigin(0.5, 0.5);
      const pairs: { icon: Phaser.GameObjects.Image | null; txt: Phaser.GameObjects.Text }[] = [];
      for (let ci = 0; ci < gear.cost.length; ci++) {
        const pairX = LX + 108 + ci * 106;
        const pairIcon = this.createIcon(pairX, BCY, gear.cost[ci].resourceId, 36);
        const pairTxt = makeText(this.scene, pairX + 22, BCY, '', 12, '#FFFFFF', {
          fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        pairs.push({ icon: pairIcon, txt: pairTxt });
      }
      this.gearCostPairs.set(gear.id, pairs);

      const card = this.scene.add.rectangle(UIManager.UPG_CARD_CX, 69, UIManager.UPG_CARD_W, 158, 0x1e1e1e, 1)
        .setStrokeStyle(1, 0x3a3a3a);
      this.gearCards.set(gear.id, card);

      row.add(card);
      if (nameIcon) row.add(nameIcon);
      row.add([nameTxt, descTxt, flavorTxt, slotTxt, btnBg]);
      for (const pair of pairs) {
        if (pair.icon) row.add(pair.icon);
        row.add(pair.txt);
      }
      row.add(costLabel);

      scrollContainer.add(row);
      this.gearBtnBg.set(gear.id, btnBg);
      this.gearBtnLabels.set(gear.id, costLabel);
    }

    panel.add(scrollContainer);

    // Clip to the content area.
    const maskGfx = this.scene.add.graphics();
    maskGfx.setVisible(false);
    maskGfx.fillRect(0, LAYOUT.CONTENT_TOP_WIDE, LAYOUT.GAME_WIDTH, contentH);
    panel.setMask(maskGfx.createGeometryMask());

    const gridRows = Math.ceil(GEAR.length / 2);
    const totalH = (firstCardY + gridRows * rowH) - (LAYOUT.CONTENT_TOP_WIDE + 10);
    this.gearMinScroll = Math.min(0, contentH - totalH);

    // Drag-to-scroll (same gesture model as the shop, gated to this tab).
    this.scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.activeTab !== 'gear') return;
      if (p.y < LAYOUT.CONTENT_TOP_WIDE || p.y > LAYOUT.CONTENT_BOTTOM_WIDE) return;
      this.gearDragActive = true;
      this.gearDragMoved = false;
      this.gearDragStartPointer = p.y;
      this.gearDragStartScroll = scrollContainer.y;
    });
    this.scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.gearDragActive) return;
      const dy = p.y - this.gearDragStartPointer;
      if (Math.abs(dy) > 6) this.gearDragMoved = true;
      scrollContainer.y = Phaser.Math.Clamp(this.gearDragStartScroll + dy, this.gearMinScroll, 0);
    });
    this.scene.input.on('pointerup', () => { this.gearDragActive = false; });
    this.scene.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.activeTab !== 'gear' || !this.gearScroll) return;
      this.gearScroll.y = Phaser.Math.Clamp(this.gearScroll.y - dy, this.gearMinScroll, 0);
    });

    this.panels.set('gear', panel);
    this.refreshGearPanel();
  }

  /**
   * Refresh one CRAFT-GRID card through its states:
   *   locked (?????? until its floor) → CRAFT (cost per resource, owned/cost)
   *   or BAG FULL (affordable but no room for the displaced piece).
   * Owned and scrapped items don't render here — relayoutGearRows hides them
   * (the loadout and bag rows manage owned pieces via the inspect popup).
   */
  private renderGearRow(gear: GearDef): void {
    const name = this.gearNameLabels.get(gear.id);
    const desc = this.gearDescLabels.get(gear.id);
    const flavor = this.gearFlavorLabels.get(gear.id);
    const badge = this.gearSlotBadges.get(gear.id);
    const card = this.gearCards.get(gear.id);
    const bg = this.gearBtnBg.get(gear.id);
    const pairs = this.gearCostPairs.get(gear.id) ?? [];
    const label = this.gearBtnLabels.get(gear.id);
    const nameIcon = this.gearNameIcons.get(gear.id);
    const LX = UIManager.UPG_LEFT;
    const BW = UIManager.UPG_BTN_W;
    const hidePairs = () => {
      for (const pair of pairs) { pair.icon?.setVisible(false); pair.txt.setVisible(false); }
    };

    if (!this.state.isGearUnlocked(gear.id)) {
      name?.setText('??????').setColor('#888888');
      desc?.setText('(Locked)').setColor('#666666');
      flavor?.setText(`Reach Floor ${gear.unlockFloor} to reveal.`).setColor('#555555');
      badge?.setVisible(false);
      nameIcon?.setVisible(false);
      card?.setAlpha(1).setStrokeStyle(1, 0x3a3a3a);
      // Locked: the gradient goes ghostly — desaturated tint + heavy fade.
      bg?.setVisible(true).setTint(0x666677).setAlpha(0.25);
      if (bg?.input) bg.input.enabled = false;
      hidePairs();
      label?.setX(LX + BW / 2).setText('\u{1F512} LOCKED').setColor('#777777').setAlpha(1);
      return;
    }

    name?.setText(gear.name).setColor('#EEEEEE');
    desc?.setText(gearEffectSummary(gear)).setColor('#9fd0a0');
    flavor?.setText('');
    badge?.setVisible(true).setText(GEAR_SLOT_LABELS[gear.slot]);
    nameIcon?.setVisible(true);
    card?.setAlpha(1).setStrokeStyle(1, 0x3a3a3a);

    // Craftable: icon + "owned/cost" per recipe ingredient, faded until affordable.
    const canCraft = this.state.canAffordGear(gear.id);
    bg?.setVisible(true).clearTint().setAlpha(canCraft ? 1 : 0.35);
    if (bg?.input) bg.input.enabled = true;
    // Affordable but the bag can't take the displaced piece: the button stays
    // live and opens the scrap-or-cancel prompt instead of crafting.
    if (canCraft && this.state.craftBlockedByFullInventory(gear.id)) {
      hidePairs();
      label?.setX(LX + BW / 2).setText('CRAFT\nBAG FULL').setColor('#FFB84A').setAlpha(1);
      return;
    }
    label?.setX(LX + 44).setText('CRAFT').setColor('#FFFFFF').setAlpha(canCraft ? 1 : 0.7);
    for (let ci = 0; ci < pairs.length; ci++) {
      const c = gear.cost[ci];
      const owned = this.state.resources[c.resourceId] ?? D(0);
      const enough = owned.gte(c.amount);
      // Clamp the owned count so the pair never outgrows its slot on the button.
      const count = `${enough ? c.amount : fmt(owned)}/${c.amount}`;
      const pair = pairs[ci];
      pair.icon?.setVisible(true).setAlpha(canCraft ? 1 : 0.6);
      // No texture for this resource: fall back to its emoji in the text.
      pair.txt.setVisible(true)
        .setText(pair.icon ? count : `${RESOURCES[c.resourceId]?.icon ?? ''}${count}`)
        .setColor(enough ? '#A0FFA0' : '#FFB4B4')
        .setAlpha(canCraft ? 1 : 0.8);
    }
  }

  refreshGearPanel(): void {
    // Slot summary: equipped item icon + name per slot (icons recreated on the
    // fly — items swap rarely and this keeps the texture handling simple).
    const gearPanel = this.panels.get('gear');
    const scrollCont = gearPanel?.getAt(0) as Phaser.GameObjects.Container | undefined;
    for (let i = 0; i < GEAR_SLOTS.length; i++) {
      const slot = GEAR_SLOTS[i];
      const sx = UIManager.GEAR_SLOT_X0 + i * UIManager.GEAR_SLOT_PITCH;
      const boxCY = LAYOUT.CONTENT_TOP_WIDE + 36 + UIManager.GEAR_SLOT_BOX / 2;

      const oldIcon = this.gearSlotIcons.get(slot);
      if (oldIcon) { oldIcon.destroy(); this.gearSlotIcons.delete(slot); }

      const id = this.state.gearEquipped[slot];
      const def = id ? GEAR.find((g) => g.id === id) : null;
      if (def) {
        const gIcon = def.iconTexture ? this.createIcon(sx, boxCY, def.iconTexture, 88) : null;
        if (gIcon && scrollCont) {
          scrollCont.add(gIcon);
          this.gearSlotIcons.set(slot, gIcon);
          this.gearSlotEmpty.get(slot)?.setVisible(false);
        } else {
          // No texture: show the emoji in the box instead of the icon.
          this.gearSlotEmpty.get(slot)?.setVisible(true).setText(def.icon).setColor('#EEEEEE');
        }
        const lvl = this.state.getGearLevel(def.id);
        this.gearSlotNames.get(slot)?.setText(`${def.name}${lvl > 0 ? ` Lv${lvl}` : ''}`);
      } else {
        this.gearSlotEmpty.get(slot)?.setVisible(true).setText('--').setColor('#555555');
        this.gearSlotNames.get(slot)?.setText('');
      }
      // Level-up pip: lit while this slot's piece can afford its next level.
      // Re-raised each refresh so the freshly re-added slot icon never covers it.
      const pip = this.gearSlotPips.get(slot);
      if (pip) {
        pip.setVisible(!!def && this.state.canLevelGear(def.id));
        scrollCont?.bringToTop(pip);
      }
    }

    // Total loadout bonus line. Scrap levels make values fractional — strip noise.
    const parts: string[] = [];
    const eff = (key: GearEffect) => +this.state.gearEffect(key).toFixed(1);
    const push = (val: number, text: string) => { if (val > 0) parts.push(text); };
    push(eff('tapMult'), `+${eff('tapMult')}% tap`);
    push(eff('autoMult'), `+${eff('autoMult')}% auto`);
    push(eff('critChance'), `+${eff('critChance')}% crit`);
    push(eff('critDamage'), `+${eff('critDamage')}x crit dmg`);
    push(eff('quality'), `+${eff('quality')}% quality`);
    push(eff('mint'), `+${eff('mint')}% mint`);
    push(eff('yield'), `+${eff('yield')} yield`);
    push(eff('hypeDur'), `+${eff('hypeDur')}% hype`);
    push(eff('respawn'), `${eff('respawn')}% faster respawn`);
    push(eff('mothCatch'), `+${eff('mothCatch')}% moth catch`);
    push(eff('easyAccess'), `+${eff('easyAccess')}% easy access`);
    push(eff('quiet'), `-${eff('quiet')}% noise`);
    push(eff('repel'), `+${eff('repel')}% vs entities`);
    this.gearBonusText.setText(parts.length > 0 ? `Loadout: ${parts.join(' · ')}` : 'Nothing equipped — craft gear from your resources below.');

    // Scrap balance + how the economy works, in one line.
    const scrapLine = `Scrap: ${fmt(this.state.scrap)}  ·  Gear Rating: ${this.state.gearRating}`;
    this.gearScrapText.setText(this.gearScrapIcon ? scrapLine : `\u{1F529} ${scrapLine}`);
    this.gearScrapIcon?.setX(this.gearScrapText.x - this.gearScrapText.width / 2 - 18);

    // Bag row: item icon + name per occupied box (same recreate-on-refresh
    // pattern as the loadout slots above). Count runs red when over capacity
    // (possible only on legacy saves).
    const bag = this.state.gearInventory;
    const cap = this.state.gearInventorySize;
    this.gearBagLabel?.setText(`\u{1F392} BAG  ${bag.length}/${cap}`)
      .setColor(bag.length > cap ? '#FF7766' : '#AAAAAA');
    for (let i = 0; i < this.gearBagEmpty.length; i++) {
      const oldIcon = this.gearBagIcons.get(i);
      if (oldIcon) { oldIcon.destroy(); this.gearBagIcons.delete(i); }
      const sx = this.gearBagX0 + i * UIManager.GEAR_SLOT_PITCH;
      const def = bag[i] ? GEAR.find((g) => g.id === bag[i]) : undefined;
      if (def) {
        const gIcon = def.iconTexture ? this.createIcon(sx, this.gearBagBoxCY, def.iconTexture, 88) : null;
        if (gIcon && scrollCont) {
          scrollCont.add(gIcon);
          this.gearBagIcons.set(i, gIcon);
          this.gearBagEmpty[i].setVisible(false);
        } else {
          this.gearBagEmpty[i].setVisible(true).setText(def.icon).setColor('#EEEEEE');
        }
        const lvl = this.state.getGearLevel(def.id);
        this.gearBagNames[i].setText(`${def.name}${lvl > 0 ? ` Lv${lvl}` : ''}`);
      } else {
        this.gearBagEmpty[i].setVisible(true).setText('--').setColor('#555555');
        this.gearBagNames[i].setText('');
      }
    }

    for (const gear of GEAR) this.renderGearRow(gear);
    this.relayoutGearRows();
  }

  /**
   * Hide gear scrapped this run and pack the remaining cards into a flush
   * two-column grid (same idea as the upgrades tab's hide-maxed restack).
   * Scroll bounds follow the shorter list; everything returns after a Rewind.
   */
  private relayoutGearRows(): void {
    let vis = 0;
    for (const gear of GEAR) {
      const row = this.gearRows.get(gear.id);
      if (!row) continue;
      // Owned gear lives in the loadout/bag rows; dismantled gear is parts
      // until Rewind. The grid only shows what can (eventually) be crafted.
      const hidden = this.state.gearIsOwned(gear.id) || this.state.gearIsDismantled(gear.id);
      row.setVisible(!hidden);
      if (hidden) continue;
      row.x = UIManager.UPG_GRID_X + (vis % 2) * UIManager.UPG_COL_W;
      row.y = this.gearFirstCardY + Math.floor(vis / 2) * UIManager.UPG_ROW_H;
      vis++;
    }
    const contentH = LAYOUT.CONTENT_BOTTOM_WIDE - LAYOUT.CONTENT_TOP_WIDE - 10;
    const totalH = (this.gearFirstCardY + Math.ceil(vis / 2) * UIManager.UPG_ROW_H) - (LAYOUT.CONTENT_TOP_WIDE + 10);
    this.gearMinScroll = Math.min(0, contentH - totalH);
    if (this.gearScroll) {
      this.gearScroll.y = Phaser.Math.Clamp(this.gearScroll.y, this.gearMinScroll, 0);
    }
  }

  /**
   * Center an "[icon] Void Shards: N" header group horizontally around `cx`. Called
   * on build AND on refresh (the number's width changes as the balance grows, so the
   * group must be re-centered). Label keeps a left (0) origin; only x positions move.
   */
  private centerShardHeader(icon: Phaser.GameObjects.Image | undefined, label: Phaser.GameObjects.Text, cx: number): void {
    const iconSize = 60;
    const gap = icon ? 12 : 0;
    const iconW = icon ? iconSize : 0;
    const total = iconW + gap + label.width;
    let x = cx - total / 2;
    if (icon) { icon.setX(x + iconW / 2); x += iconW + gap; }
    label.setOrigin(0, 0).setX(x);
  }

  /* ---- Shop panel (Phase 5) ---- */

  private createShopPanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);
    const contentH = LAYOUT.CONTENT_BOTTOM_WIDE - LAYOUT.CONTENT_TOP_WIDE - 10;
    const cx = LAYOUT.CENTER_X;

    const scrollContainer = this.scene.add.container(0, 0);
    this.shopScroll = scrollContainer;

    this.ensureUpgradeBtnTexture();
    const LX = UIManager.UPG_LEFT;
    const BW = UIManager.UPG_BTN_W;
    const BCY = UIManager.UPG_BTN_CY;
    const rowH = UIManager.UPG_ROW_H;

    // Header (scrolls with the list): shard balance (icon + count, centered) + how to earn.
    const headerY = LAYOUT.CONTENT_TOP_WIDE + 10;
    const vsIcon = this.createIcon(0, headerY + 14, 'void_shard', 60) ?? undefined;
    this.shopShardIcon = vsIcon;
    this.shopShardLabel = makeText(this.scene, 0, headerY,
      `Void Shards: ${this.state.voidShards}`, 22, '#CC88FF', { fontStyle: 'bold' }).setOrigin(0, 0);
    if (vsIcon) scrollContainer.add(vsIcon);
    scrollContainer.add(this.shopShardLabel);
    this.centerShardHeader(vsIcon, this.shopShardLabel, cx);
    const earnInfo = makeText(this.scene, cx, headerY + 36,
      'Earn a Void Shard by maxing an upgrade or reaching a new floor.',
      13, '#8888AA').setOrigin(0.5, 0);
    scrollContainer.add(earnInfo);

    const firstCardY = headerY + 70;

    for (let i = 0; i < SHOP_UPGRADES.length; i++) {
      const sup = SHOP_UPGRADES[i];
      // Card in the two-column grid — mirrors the upgrade panel (name / desc /
      // level stacked, gradient cost button below).
      const row = this.scene.add.container(
        UIManager.UPG_GRID_X + (i % 2) * UIManager.UPG_COL_W,
        firstCardY + Math.floor(i / 2) * rowH,
      );

      // Name line: a loaded PNG icon (iconTexture, e.g. the Lamp Trap's lamp art —
      // same as its explore-page button) beats the emoji prefix; emoji is the fallback.
      const nameIcon = sup.iconTexture ? this.createIcon(LX + 16, 12, sup.iconTexture, 36) : null;
      const nameTxt = makeText(this.scene, nameIcon ? LX + 40 : LX, 4,
        !nameIcon && sup.icon ? `${sup.icon} ${sup.name}` : sup.name, 17, '#EEEEEE', { fontStyle: 'bold' });
      // Hard-capped at 3 wrapped lines + top-right Lv counter — a description can
      // never run into the level line no matter how long it gets.
      const descTxt = makeText(this.scene, LX, 30, sup.description, 13, '#D8D8D8', {
        wordWrap: { width: UIManager.UPG_CARD_W - 38 }, maxLines: 3,
      });
      const lvl = this.state.getShopLevel(sup.id);
      const lvlTxt = makeText(this.scene, LX + BW, 6, `Lv ${lvl}/${sup.maxLevel}`, 13, '#c8a8ff')
        .setOrigin(1, 0);
      this.shopLvlLabels.set(sup.id, lvlTxt);

      const btnBg = this.scene.add.image(LX + BW / 2, BCY, 'upg_btn_grad')
        .setInteractive({ useHandCursor: true });
      btnBg.on('pointerdown', () => btnBg.setScale(0.96));
      btnBg.on('pointerout', () => btnBg.setScale(1));
      btnBg.on('pointerup', (p: Phaser.Input.Pointer) => {
        btnBg.setScale(1);
        if (!this.shopDragMoved && this.inWideContent(p)) this.cb.onBuyShopUpgrade(sup.id);
      });
      // Oversized on purpose — overhangs the button top/bottom for pop.
      const costIcon = this.createIcon(LX + 38, BCY, 'void_shard', 76);
      if (costIcon) this.shopCostIcons.set(sup.id, costIcon);
      const costLabel = makeText(this.scene, LX + BW / 2, BCY, '', 13, '#FFFFFF', { fontStyle: 'bold' })
        .setOrigin(0.5, 0.5);

      const card = this.scene.add.rectangle(UIManager.UPG_CARD_CX, 69, UIManager.UPG_CARD_W, 158, 0x1e1e1e, 1)
        .setStrokeStyle(1, 0x3a3a3a);
      this.shopCards.set(sup.id, card);

      row.add(card);
      if (nameIcon) row.add(nameIcon);
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

    const gridRows = Math.ceil(SHOP_UPGRADES.length / 2);
    const totalH = (firstCardY + gridRows * rowH) - (LAYOUT.CONTENT_TOP_WIDE + 10);
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

    // When maxed, HIDE the button (and disable its tap) but keep the MAXED label,
    // and fade the whole card back — it needs no more attention.
    // Affordability reads as OPACITY on the gradient, same as the upgrade panel.
    this.shopCards.get(sup.id)?.setAlpha(maxed ? 0.5 : 1);
    const bg = this.shopBuyBg.get(sup.id);
    if (bg) {
      bg.setVisible(!maxed);
      if (bg.input) bg.input.enabled = !maxed;
      if (!maxed) bg.setAlpha(canBuy ? 1 : 0.35);
    }
    this.shopCostIcons.get(sup.id)?.setVisible(!maxed).setAlpha(canBuy ? 1 : 0.6);
    const label = this.shopCostLabels.get(sup.id);
    if (label) {
      if (maxed) label.setText('MAXED').setColor('#c8a8ff').setAlpha(1);
      else label.setText(`${cost} Void Shards`).setColor('#FFFFFF').setAlpha(canBuy ? 1 : 0.7);
    }
  }

  refreshShopPanel(): void {
    this.shopShardLabel.setText(`Void Shards: ${this.state.voidShards}`);
    this.centerShardHeader(this.shopShardIcon, this.shopShardLabel, LAYOUT.CENTER_X);
    for (const sup of SHOP_UPGRADES) this.renderShopRow(sup);
  }

  /* ---- Achievements panel (cards + claim buttons; mirrors the shop panel) ---- */

  private createAchievementsPanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);
    const contentH = LAYOUT.CONTENT_BOTTOM_WIDE - LAYOUT.CONTENT_TOP_WIDE - 10;

    const scrollContainer = this.scene.add.container(0, 0);
    this.achScroll = scrollContainer;

    // Achievement cards are TALLER than upgrade/shop cards to fit a progress bar
    // between the level line and the claim button, but share the two-column
    // grid geometry (UPG_COL_W / UPG_CARD_W).
    this.ensureUpgradeBtnTexture();
    const LX = UIManager.UPG_LEFT;
    const BW = UIManager.UPG_BTN_W;        // 310 — shared horizontal span
    const CARD_H = 190;
    const CARD_CY = 85;                    // card local center (spans -10..180 — ~15px under the button)
    const BAR_Y = 92;                      // progress bar center
    const BAR_H = 20;
    const BCY = 140;                       // claim button center
    const rowH = CARD_H;                   // flush — no gap between cards
    const startY = LAYOUT.CONTENT_TOP_WIDE + 10;

    // Header (scrolls with the cards). Line 1: the Void Shard balance (matches the
    // Shop header). Line 2: the global auto-search bonus from claimed tiers (+0.5%
    // each across ALL achievements) on the left, the "N levels x 0.5%" breakdown right.
    const cx = LAYOUT.CENTER_X;
    const vsIcon = this.createIcon(0, startY + 14, 'void_shard', 60) ?? undefined;
    this.achShardIcon = vsIcon;
    this.achShardLabel = makeText(this.scene, 0, startY,
      `Void Shards: ${this.state.voidShards}`, 22, '#CC88FF', { fontStyle: 'bold' }).setOrigin(0, 0);
    if (vsIcon) scrollContainer.add(vsIcon);
    scrollContainer.add(this.achShardLabel);
    this.centerShardHeader(vsIcon, this.achShardLabel, cx);

    this.achBonusLabel = makeText(this.scene, LX, startY + 44, '', 18, '#9fd0a0', { fontStyle: 'bold' })
      .setOrigin(0, 0);
    this.achLevelsLabel = makeText(this.scene, LAYOUT.GAME_WIDTH - LX, startY + 44, '', 16, '#8aa88a')
      .setOrigin(1, 0);
    scrollContainer.add([this.achBonusLabel, this.achLevelsLabel]);
    const firstCardY = startY + 84;

    for (let i = 0; i < ACHIEVEMENTS.length; i++) {
      const ach = ACHIEVEMENTS[i];
      // Card in the two-column grid.
      const row = this.scene.add.container(
        UIManager.UPG_GRID_X + (i % 2) * UIManager.UPG_COL_W,
        firstCardY + Math.floor(i / 2) * rowH,
      );

      const nameTxt = makeText(this.scene, LX, 4, ach.name, 17, '#EEEEEE', { fontStyle: 'bold' });
      // Same overlap-proofing as the upgrade/shop cards: 3-line cap + Lv top-right.
      const descTxt = makeText(this.scene, LX, 30, ach.description, 13, '#D8D8D8', {
        wordWrap: { width: UIManager.UPG_CARD_W - 38 }, maxLines: 3,
      });
      const lvlTxt = makeText(this.scene, LX + BW, 6, `Lv ${this.state.getAchievementLevel(ach.id)}/${ach.thresholds.length}`, 13, '#c8a8ff')
        .setOrigin(1, 0);
      this.achLvlLabels.set(ach.id, lvlTxt);

      // Progress bar toward the NEXT tier: track + green fill (scaled by ratio) + a
      // centered "current / threshold" label. Always visible so the requirement is clear.
      const barBg = this.scene.add.rectangle(LX + BW / 2, BAR_Y, BW, BAR_H, 0x111111, 1)
        .setStrokeStyle(1, 0x444444);
      const barFill = this.scene.add.rectangle(LX, BAR_Y, BW, BAR_H, 0x3a9a3a, 1).setOrigin(0, 0.5);
      this.achProgFill.set(ach.id, barFill);
      const progTxt = makeText(this.scene, LX + BW / 2, BAR_Y, '', 12, '#FFFFFF', { fontStyle: 'bold' })
        .setOrigin(0.5);
      this.achProgLabels.set(ach.id, progTxt);

      // Claim button (gradient, same treatment as the upgrade/shop buy buttons).
      const btnBg = this.scene.add.image(LX + BW / 2, BCY, 'upg_btn_grad')
        .setInteractive({ useHandCursor: true });
      btnBg.on('pointerdown', () => btnBg.setScale(0.96));
      btnBg.on('pointerout', () => btnBg.setScale(1));
      btnBg.on('pointerup', (p: Phaser.Input.Pointer) => {
        btnBg.setScale(1);
        if (!this.achDragMoved && this.inWideContent(p)) this.cb.onClaimAchievement(ach.id);
      });
      // Oversized on purpose — overhangs the button top/bottom for pop.
      const rewardIcon = this.createIcon(LX + BW - 38, BCY, 'void_shard', 68);
      if (rewardIcon) this.achBtnIcons.set(ach.id, rewardIcon);
      const btnLabel = makeText(this.scene, LX + BW / 2, BCY, '', 13, '#FFFFFF', { fontStyle: 'bold' })
        .setOrigin(0.5, 0.5);

      const card = this.scene.add.rectangle(UIManager.UPG_CARD_CX, CARD_CY, UIManager.UPG_CARD_W, CARD_H, 0x1e1e1e, 1)
        .setStrokeStyle(1, 0x3a3a3a);
      this.achCards.set(ach.id, card);

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

    this.achMinScroll = Math.min(0, contentH - (84 + Math.ceil(ACHIEVEMENTS.length / 2) * rowH));

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

    // Claim button — when fully claimed, HIDE the button but keep the ALL CLAIMED
    // label and fade the whole card back. Claimability reads as OPACITY on the
    // gradient, like the buy buttons.
    this.achCards.get(ach.id)?.setAlpha(maxed ? 0.5 : 1);
    const bg = this.achBtnBg.get(ach.id);
    if (bg) {
      bg.setVisible(!maxed);
      if (bg.input) bg.input.enabled = !maxed;
      if (!maxed) bg.setAlpha(claimable ? 1 : 0.35);
    }
    const icon = this.achBtnIcons.get(ach.id);
    if (icon) icon.setVisible(!maxed).setAlpha(claimable ? 1 : 0.6);
    const label = this.achBtnLabels.get(ach.id);
    if (label) {
      if (maxed) label.setText('ALL CLAIMED').setColor('#c8a8ff').setAlpha(1);
      else label.setText(`CLAIM  +${this.state.getAchievementReward(ach.id)}`).setColor(claimable ? '#FFFFFF' : '#CCCCCC').setAlpha(claimable ? 1 : 0.7);
    }
  }

  refreshAchievementsPanel(): void {
    if (this.achShardLabel) {
      this.achShardLabel.setText(`Void Shards: ${this.state.voidShards}`);
      this.centerShardHeader(this.achShardIcon, this.achShardLabel, LAYOUT.CENTER_X);
    }
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
    // Update tab button visuals — the active tab wears the purple gradient
    // (same language as every buy button); the rest stay dark.
    for (const [id, bg] of this.tabBGs) {
      const isActive = id === tab;
      this.tabActiveImgs.get(id)?.setVisible(isActive);
      bg.setStrokeStyle(1, isActive ? 0xa89bff : 0x444444);
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

    // The lighting mood (and its phantoms/dust) belongs to the halls — explore only.
    const showWorld = tab === 'explore';
    // Floor nav arrows are scene-level (above the overlays), so they don't
    // ride the explore panel's visibility and need their own toggle.
    this.navLeft?.setVisible(showWorld);
    this.navRight?.setVisible(showWorld);
    this.lightOverlay?.setVisible(showWorld);
    this.vignetteOverlay?.setVisible(showWorld);
    this.dimOverlay?.setVisible(showWorld);
    this.dustEmitter?.setVisible(showWorld);
    if (!showWorld) this.removePhantom(false);

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
      // Sits in the band between the runner's feet (-235, shadow at ~-215)
      // and the showcase icon's top (-190) — over the shadow, never the sprite.
      this.flavorMsg = makeText(this.scene, LAYOUT.CENTER_X, this.showcaseCenterY() - 212, '', 20, evt.color, {
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
      const live = !s.isRespawning && !s.entityActive;
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

    // Floor-base lines: gold stage name + its active bonuses once anything is
    // built; until then a dim hint teasing what the first stage grants. A
    // stage-up on the floor we're already watching gets a celebratory pop.
    if (this.baseLabel && this.baseDescLabel) {
      const stage = s.floorBaseStage;
      const loc = s.baseLocation;
      if (loc !== this.lastBaseLoc || stage !== this.lastBaseStage) {
        if (stage > 0) {
          const name = FLOOR_BASE_STAGES[stage - 1].name;
          const bonuses = FLOOR_BASE_STAGES.slice(0, stage).map((st) => st.desc).join(' · ');
          this.baseLabel.setText(`⛺ Base: ${name} (${stage}/${FLOOR_BASE_STAGES.length})`).setColor('#FFD24A');
          this.baseDescLabel.setText(`${bonuses} — on this floor`).setColor('#C8B878');
        } else {
          this.baseLabel.setText('No base on this floor yet').setColor('#777777');
          this.baseDescLabel.setText(`Keep searching to secure one: ${FLOOR_BASE_STAGES[0].desc} here, forever`).setColor('#666666');
        }
        if (loc === this.lastBaseLoc && stage > this.lastBaseStage) {
          this.scene.tweens.add({
            targets: [this.baseLabel, this.baseDescLabel], scale: { from: 1.6, to: 1 }, duration: 500, ease: 'Back.easeOut',
          });
        }
        this.lastBaseLoc = loc;
        this.lastBaseStage = stage;
      }
    }

    // "EASY ACCESS" tag (independent of grade) — same live-only, pulsing treatment.
    if (this.easyAccessLabel) {
      const show = !s.isRespawning && !s.entityActive && s.nodeIsEasyAccess;
      if (show) {
        if (!this.easyAccessLabel.visible) {
          this.easyAccessLabel.setVisible(true);
          this.scene.tweens.add({
            targets: this.easyAccessLabel, scale: { from: 1, to: 1.12 },
            duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          });
        }
      } else if (this.easyAccessLabel.visible) {
        this.scene.tweens.killTweensOf(this.easyAccessLabel);
        this.easyAccessLabel.setScale(1).setVisible(false);
      }
    }

    // Noise meter — fills as you search, drains while quiet, slams red when
    // something has already found you.
    if (this.noiseFill && this.noiseLabel) {
      const pct = s.entityActive ? 1 : s.noise / 100;
      this.noiseFill.width = Phaser.Math.Linear(this.noiseFill.width, 240 * pct, 0.25);
      this.noiseFill.setFillStyle(s.entityActive ? 0xff4444 : pct > 0.75 ? 0xff8844 : pct > 0.4 ? 0xd8c04a : 0x66aa66);
      this.noiseLabel.setText(s.entityActive ? '!!! FOUND !!!'
        : `Noise ${Math.floor(s.noise)}%${s.lighting === 'dark' ? ' ×1.5' : ''}`);
    }

    // Entity encounter: on spawn, the entity's art takes over the node (which
    // dims behind it) and a presence bar appears; taps drain it. On resolution
    // everything pops back to the ordinary search view.
    const entity = s.activeEntity;
    if (entity && this.entityShownId !== entity.id) {
      this.entityShownId = entity.id;
      const key = entity.iconKey ? `icon_${entity.iconKey}` : '';
      if (key && this.scene.textures.exists(key) && this.entityImg) {
        this.entityImg.setTexture(key).setScale((300 / ICON_NATIVE) * 0.6).setAlpha(0).setVisible(true);
        this.scene.tweens.add({ targets: this.entityImg, scale: 300 / ICON_NATIVE, alpha: 1, duration: 300, ease: 'Back.easeOut' });
        this.entityEmoji?.setVisible(false);
      } else if (this.entityEmoji) {
        this.entityEmoji.setText(entity.icon).setScale(0.6).setAlpha(0).setVisible(true);
        this.scene.tweens.add({ targets: this.entityEmoji, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
        this.entityImg?.setVisible(false);
      }
      this.entityBarBg?.setVisible(true);
      this.entityFill?.setVisible(true);
      this.entityLabel?.setVisible(true);
      this.showcaseBig?.setAlpha(0.22);
      this.hintText.setText('Tap to drive it off!').setColor('#FF8888');
    } else if (!entity && this.entityShownId) {
      this.entityShownId = null;
      this.entityImg?.setVisible(false);
      this.entityEmoji?.setVisible(false);
      this.entityBarBg?.setVisible(false);
      this.entityFill?.setVisible(false);
      this.entityLabel?.setVisible(false);
      this.showcaseBig?.setAlpha(1);
      this.hintText.setText('Tap or hold to search').setColor('#FFFFFF');
    }
    if (entity && this.entityFill && this.entityLabel) {
      const left = s.entityPresence;
      const max = s.entityPresenceMax;
      const ratio = Math.max(0, Math.min(1, left.div(max.max(1)).toNumber()));
      this.entityFill.width = Phaser.Math.Linear(this.entityFill.width, 240 * ratio, 0.3);
      this.entityLabel.setText(`${entity.name}  ${fmt(left)} / ${fmt(max)}`);
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
    // A new floor (or a first Moth) may have just revealed a row — repack.
    this.layoutItemRows();
  }

  /**
   * Refresh the cost-line button: "[icon] owned/cost ResourceName" (or MAXED).
   * The gradient stays the same color in every state — affordability reads as
   * OPACITY (full when buyable, faded when not); the icon hides at max level.
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

    // When maxed, HIDE the button (and disable its tap) but keep the MAXED
    // label, and fade the whole card back — it needs no more attention.
    this.upgCards.get(upg.id)?.setAlpha(maxed ? 0.5 : 1);
    const bg = this.upgBuyBg.get(upg.id);
    if (bg) {
      bg.setVisible(!maxed);
      if (bg.input) bg.input.enabled = !maxed;
      if (!maxed) bg.clearTint().setAlpha(canBuy ? 1 : 0.35);
    }
    // Swap the icon to the current cost resource (matters for cycling upgrades).
    const icon = this.upgCostIcons.get(upg.id);
    if (icon) {
      const key = `icon_${resId}`;
      if (!maxed && this.scene.textures.exists(key)) icon.setTexture(key).setVisible(true).setAlpha(canBuy ? 1 : 0.6);
      else icon.setVisible(false);
    }
    const label = this.upgCostLabels.get(upg.id);
    if (label) {
      // Always centered in the button; the cost icon sits as a left accent.
      label.setOrigin(0.5, 0.5).setX(LX + UIManager.UPG_BTN_W / 2).setAlpha(maxed || canBuy ? 1 : 0.7);
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
      // Locked: the gradient goes ghostly — desaturated tint + heavy fade.
      this.upgBuyBg.get(upg.id)?.setTint(0x666677).setAlpha(0.25).setVisible(true);
      this.upgCostIcons.get(upg.id)?.setVisible(false);
      const label = this.upgCostLabels.get(upg.id);
      label?.setText('\u{1F512} LOCKED').setColor('#777777').setAlpha(1)
        .setOrigin(0.5, 0.5).setX(UIManager.UPG_LEFT + UIManager.UPG_BTN_W / 2);
      return;
    }

    name?.setText(upg.name).setColor('#EEEEEE');
    desc?.setText(upg.description).setColor('#D8D8D8');
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
      case 'gear': this.refreshGearPanel(); break;
      case 'void': this.refreshVoidPanel(); break;
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

  playRewindEffect(fragments: number, shards: number, onComplete: () => void): void {
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
      `+${fragments} Void Fragments${shards > 0 ? `\n+${shards} Void Shard${shards === 1 ? '' : 's'}` : ''}`,
      28, '#FFD700', { fontStyle: 'bold', align: 'center' },
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

    // Snapshot of the live values (reopen to refresh).
    const s = this.state;
    const rows: [string, string][] = [
      ['Rewinds', `${s.prestigeCount}`],
      // Lifetime descent odometer — every floor ever descended, across all rewinds.
      ['Lifetime floors descended', `${s.totalDepth.toLocaleString()}`],
      ['Tap power', fmt(s.clickPower)],
      ['Auto search', `${s.autoPerSecond}/s`],
      // Explorer 1's own auto power (shared per-Explorer power + its personal bonus;
      // excludes the drone). More Explorers will each get their own line here later.
      ['Explorer 1', `${s.explorerAuto(0)}/s auto`],
      ['Lucky Find (Crit %)', `${Math.round(s.critChance * 100)}%  ×${+s.critMult.toFixed(2)}`],
      // (Super Crit row spliced in below when Static is owned.)
      ['Node respawn', `${s.nodeRespawnTime} ms`],
      ['Hype boost', `×${s.hypeMultiplier} auto for ${s.hypeDuration / 1000}s`],
      ['Hype cooldown', `${Math.round(s.hypeCooldown / 60000)} min`],
      ['Auto-Capture (Moth)', `${Math.round(s.autoCaptureChance * 100)}%`],
      // Two decimals (noise-stripped): Quality Sense and the Magpie move in 0.25% steps.
      ['Quality chance', `${+(s.qualityChance * 100).toFixed(2)}%  (+${s.qualityBonus})`],
      ['Mint chance', `${+(s.mintChance * 100).toFixed(2)}%  (+9)`],
      ['Easy Access chance', `${(s.easyAccessChance * 100).toFixed(1)}%  (½ HP)`],
      ['Noise per tap', `${+s.noisePerTap.toFixed(3)}%`],
      ['Entity damage', `×${+s.repelMult.toFixed(2)}`],
      ['Auto vs entities', `${Math.round(s.autoRepelPct * 100)}%`],
      ['Entities driven off', `${s.lifetimeEntitiesRepelled.toLocaleString()}`],
      ['Phantoms stared down', `${s.lifetimePhantomsCaught.toLocaleString()}`],
      ['Resources found', `${s.stats.resourcesFound.toLocaleString()}`],
      ['Quality finds', `${s.stats.qualityFinds.toLocaleString()}`],
      ['Mint finds', `${s.stats.mintFinds.toLocaleString()}`],
      ['Easy Access finds', `${s.stats.easyAccessFinds.toLocaleString()}`],
      ['Moths caught', fmt(s.resources['moth'] ?? D(0))],
    ];
    if (s.petStaticLevel > 0) {
      const critIdx = rows.findIndex(([label]) => label.startsWith('Lucky Find'));
      rows.splice(critIdx + 1, 0, ['Super Crit (Static)', `${s.petStaticLevel}%  ×${s.superCritMult}`]);
    }
    // Void Resonance's compounding power multiplier, once it exists.
    if (s.voidPowerMult > 1) rows.splice(1, 0, ['Void Resonance', `×${+s.voidPowerMult.toFixed(2)} all power`]);
    // Extra Explorers (shop) — each one re-counts the per-Explorer power.
    if (s.explorerCount > 1) {
      const exIdx = rows.findIndex(([label]) => label.startsWith('Explorer 1'));
      rows.splice(exIdx + 1, 0, ['Explorers', `${s.explorerCount} (each +${s.explorerSharedAuto}/s)`]);
    }

    // Panel grows with the row count but is capped to the screen; if the content
    // would exceed the cap it scrolls instead of crowding the close button.
    const panelW = 560;
    const rowGap = 38;
    const headPad = 92;   // panel top → first row center (title + divider above)
    const footPad = 88;   // last row → CLOSE button + margin below
    const maxH = GAME_HEIGHT - 80;
    const contentH = rows.length * rowGap;
    const panelH = Math.min(headPad + contentH + footPad, maxH);
    const top = cy - panelH / 2;

    const modal = this.scene.add.container(0, 0).setDepth(310);
    const overlay = this.scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72).setInteractive();
    modal.add(overlay);
    const panel = this.scene.add.rectangle(cx, cy, panelW, panelH, 0x141414, 0.98)
      .setStrokeStyle(2, 0x555555).setInteractive();
    modal.add(panel);

    modal.add(makeText(this.scene, cx, top + 34, 'STATS', 30, '#FFFFFF', { fontStyle: 'bold' }).setOrigin(0.5));
    modal.add(makeBtn(this.scene, cx + panelW / 2 - 32, top + 32, '✕', 40, 40, 0x442222, () => this.closeStats()));
    modal.add(this.scene.add.rectangle(cx, top + 66, panelW - 48, 1, 0x444444));

    // Rows live in a scroll container, clipped to the region between the divider
    // and the CLOSE button so nothing ever bleeds over either.
    const viewTop = top + 74;
    const viewBottom = top + panelH - 64;
    const scroll = this.scene.add.container(0, 0);
    let y = top + headPad;
    for (const [label, val] of rows) {
      scroll.add(makeText(this.scene, cx - panelW / 2 + 36, y, label, 18, '#AAAAAA').setOrigin(0, 0.5));
      scroll.add(makeText(this.scene, cx + panelW / 2 - 36, y, val, 18, '#FFFFFF', { fontStyle: 'bold' }).setOrigin(1, 0.5));
      y += rowGap;
    }
    modal.add(scroll);

    const maskGfx = this.scene.add.graphics().setVisible(false);
    maskGfx.fillRect(cx - panelW / 2, viewTop, panelW, viewBottom - viewTop);
    scroll.setMask(maskGfx.createGeometryMask());
    modal.add(maskGfx);   // parented so it's destroyed with the modal

    // Drag-scroll only when the content overflows the visible region. Listeners are
    // on the panel itself (destroyed with the modal) — no scene-level leak per open.
    const overflow = (y - rowGap / 2) - viewBottom;
    if (overflow > 0) {
      const minScroll = -(overflow + 12);
      let dragging = false;
      let lastY = 0;
      panel.on('pointerdown', (p: Phaser.Input.Pointer) => { dragging = true; lastY = p.y; });
      panel.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (!dragging) return;
        scroll.y = Phaser.Math.Clamp(scroll.y + (p.y - lastY), minScroll, 0);
        lastY = p.y;
      });
      panel.on('pointerup', () => { dragging = false; });
      panel.on('pointerout', () => { dragging = false; });
    }

    modal.add(makeBtn(this.scene, cx, top + panelH - 36, 'CLOSE', 200, 46, 0x2a2a2a, () => this.closeStats()));
    this.statsModal = modal;
  }

  private closeStats(): void {
    if (!this.statsModal) return;
    this.statsModal.destroy(true);
    this.statsModal = null;
  }

  /* ---- Pets (explore bottom-left row + popup) ---- */

  /** Sync the pets row to what's unlocked + current levels (call after buys/level-ups). */
  refreshPetRow(): void {
    for (const pet of PETS) {
      const btn = this.petBtns.get(pet.id);
      if (!btn) continue;
      const lvl = this.state.getPetLevel(pet.id);
      btn.setVisible(lvl > 0);
      this.petLvlBadges.get(pet.id)?.setText(`Lv ${lvl}`);
    }
  }

  /** Popup explaining what a pet is doing right now (level, bonuses, milestones). */
  private showPetPopup(petId: string): void {
    if (this.petModal) return;
    const pet = PETS.find((p) => p.id === petId);
    if (!pet) return;
    RundotGameAPI.triggerHapticAsync('light' as never);
    const { GAME_WIDTH, GAME_HEIGHT } = LAYOUT;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const s = this.state;
    const lvl = s.getPetLevel(petId);

    // Live readout: what it gives, how it grows, milestone status (green = active).
    const rows: [string, string, string?][] = [
      ['Level', `${lvl} / ${pet.maxLevel}`],
      [pet.bonusLabel, `+${+(lvl * pet.bonusPerLevel).toFixed(2)}%`],
    ];
    if (petId === 'lamp_trap') rows.push(['Your total auto-catch', `${Math.round(s.autoCaptureChance * 100)}%`]);
    if (petId === 'pet_static') rows.push(['Super Crit multiplier', `×${s.superCritMult}`]);
    if (petId === 'pet_snapshot') rows.push(['Your total Mint chance', `${+(s.mintChance * 100).toFixed(2)}%`]);
    if (petId === 'pet_balloon') rows.push(['Current hype duration', `${s.hypeDuration / 1000}s`]);
    if (petId === 'pet_cat') {
      rows.push(['Your total auto vs entities', `${Math.round(s.autoRepelPct * 100)}%`]);
      rows.push(['Entity give-up time', `${Math.round(s.entityLeaveMs / 1000)}s`]);
    }
    rows.push(['Grows', lvl >= pet.maxLevel ? 'MAX level reached' : `1-in-${s.petLevelUpOdds(petId)} per ${pet.growsOn}`]);
    for (const m of pet.milestones) {
      rows.push([`Lv ${m.level} bonus`, m.desc, lvl >= m.level ? '#7CFF7C' : '#777777']);
    }

    const panelW = 560;
    // Panel grows with the row count (the Black Cat has two extra stat rows),
    // keeping the same air between the last row and the CLOSE button as the
    // 6-row pets had at the old fixed 600.
    const panelH = 360 + rows.length * 40;
    const top = cy - panelH / 2;

    const modal = this.scene.add.container(0, 0).setDepth(310);
    const overlay = this.scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72).setInteractive();
    modal.add(overlay);
    const panel = this.scene.add.rectangle(cx, cy, panelW, panelH, 0x141414, 0.98)
      .setStrokeStyle(2, 0x6a5a2a).setInteractive();
    modal.add(panel);

    modal.add(makeText(this.scene, cx, top + 34, pet.name.toUpperCase(), 30, '#FFE08A', { fontStyle: 'bold' }).setOrigin(0.5));
    modal.add(makeText(this.scene, cx, top + 62, 'PET', 14, '#8a7a4a', { fontStyle: 'bold' }).setOrigin(0.5));
    modal.add(makeBtn(this.scene, cx + panelW / 2 - 32, top + 32, '✕', 40, 40, 0x442222, () => this.closePetPopup()));
    modal.add(this.scene.add.rectangle(cx, top + 80, panelW - 48, 1, 0x444444));

    const petIcon = this.createIcon(cx, top + 146, pet.iconKey, 104);
    if (petIcon) modal.add(petIcon);
    else modal.add(makeText(this.scene, cx, top + 146, pet.icon, 72, '#FFFFFF').setOrigin(0.5));
    modal.add(makeText(this.scene, cx, top + 214, pet.description, 15, '#AAAAAA', {
      align: 'center', wordWrap: { width: panelW - 80 },
    }).setOrigin(0.5, 0));

    let y = top + 296;
    for (const [label, val, color] of rows) {
      modal.add(makeText(this.scene, cx - panelW / 2 + 36, y, label, 18, '#AAAAAA').setOrigin(0, 0.5));
      modal.add(makeText(this.scene, cx + panelW / 2 - 36, y, val, 18, color ?? '#FFFFFF', { fontStyle: 'bold' }).setOrigin(1, 0.5));
      y += 40;
    }

    modal.add(makeBtn(this.scene, cx, top + panelH - 36, 'CLOSE', 200, 46, 0x2a2a2a, () => this.closePetPopup()));
    this.petModal = modal;
  }

  private closePetPopup(): void {
    if (!this.petModal) return;
    this.petModal.destroy(true);
    this.petModal = null;
  }

  /* ---- Bag-full craft prompt ---- *
   * Crafting benches the equipped piece into the bag — when the bag has no
   * room, the craft is blocked and this modal offers the way out: scrap a
   * bagged item (tap-again confirm, same as the cards) and the pending craft
   * completes automatically, or cancel and manage the bag by hand. */

  private showBagFullPrompt(gear: GearDef): void {
    if (this.bagFullModal) return;
    RundotGameAPI.triggerHapticAsync('light' as never);
    const { GAME_WIDTH, GAME_HEIGHT } = LAYOUT;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const items = this.state.gearInventory
      .map((id) => GEAR.find((g) => g.id === id))
      .filter((g): g is GearDef => !!g);

    const panelW = 620;
    const rowH = 74;
    const listTop = 196;
    const panelH = listTop + items.length * rowH + 84;
    const top = cy - panelH / 2;

    const modal = this.scene.add.container(0, 0).setDepth(310);
    modal.add(this.scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72).setInteractive());
    modal.add(this.scene.add.rectangle(cx, cy, panelW, panelH, 0x141414, 0.98)
      .setStrokeStyle(2, 0x8a5a2a).setInteractive());

    modal.add(makeText(this.scene, cx, top + 34, 'BAG FULL', 30, '#FFB84A', { fontStyle: 'bold' }).setOrigin(0.5));
    modal.add(makeBtn(this.scene, cx + panelW / 2 - 32, top + 32, '✕', 40, 40, 0x442222, () => this.closeBagFullPrompt()));
    modal.add(this.scene.add.rectangle(cx, top + 62, panelW - 48, 1, 0x444444));
    modal.add(makeText(this.scene, cx, top + 84,
      `Crafting ${gear.name} benches your equipped ${GEAR_SLOT_LABELS[gear.slot]},\nbut the bag is full (${items.length}/${this.state.gearInventorySize}).\nScrap a bagged item to make room — the craft then goes through:`,
      15, '#AAAAAA', { align: 'center', wordWrap: { width: panelW - 60 } }).setOrigin(0.5, 0));

    let y = top + listTop;
    for (const item of items) {
      const rowCY = y + rowH / 2;
      modal.add(this.scene.add.rectangle(cx, rowCY, panelW - 48, rowH - 10, 0x1e1e1e, 1)
        .setStrokeStyle(1, 0x3a3a3a));
      const icon = item.iconTexture ? this.createIcon(cx - panelW / 2 + 58, rowCY, item.iconTexture, 44) : null;
      if (icon) modal.add(icon);
      else modal.add(makeText(this.scene, cx - panelW / 2 + 58, rowCY, item.icon, 26, '#FFFFFF').setOrigin(0.5));
      const lvl = this.state.getGearLevel(item.id);
      modal.add(makeText(this.scene, cx - panelW / 2 + 92, rowCY, `${item.name}${lvl > 0 ? `  Lv ${lvl}` : ''}`,
        17, '#EEEEEE', { fontStyle: 'bold' }).setOrigin(0, 0.5));

      const value = this.state.gearDismantleValue(item.id);
      const scrapText = `SCRAP +${value}`;
      let armed = false;
      const btn = makeBtn(this.scene, cx + panelW / 2 - 110, rowCY, scrapText, 160, 46, 0x553333, () => {
        if (!armed) {
          armed = true;
          (btn.getAt(1) as Phaser.GameObjects.Text).setText('SURE?').setColor('#FF9966');
          this.scene.time.delayedCall(2500, () => {
            armed = false;
            if (btn.active) (btn.getAt(1) as Phaser.GameObjects.Text).setText(scrapText).setColor('#FFFFFF');
          });
          return;
        }
        this.cb.onDismantleGear(item.id);
        this.closeBagFullPrompt();
        // Room freed → finish what the player started. (A legacy over-capacity
        // bag can still be full after one scrap — re-prompt with the rest.)
        if (!this.state.craftBlockedByFullInventory(gear.id)) this.cb.onCraftGear(gear.id);
        else this.showBagFullPrompt(gear);
      });
      (btn.getAt(1) as Phaser.GameObjects.Text).setFontSize(16);
      modal.add(btn);
      y += rowH;
    }

    modal.add(makeBtn(this.scene, cx, top + panelH - 42, 'CANCEL', 200, 46, 0x2a2a2a, () => this.closeBagFullPrompt()));
    this.bagFullModal = modal;
  }

  private closeBagFullPrompt(): void {
    if (!this.bagFullModal) return;
    this.bagFullModal.destroy(true);
    this.bagFullModal = null;
  }

  /* ---- Gear item inspect popup ---- *
   * Tap a loadout box or a bag box: the item's full story plus its actions.
   * Equipped piece → LEVEL UP (Scrap). Bagged piece → EQUIP / SCRAP (tap-again
   * confirm). Actions run through the same GameScene callbacks as everything
   * else, so logs/saves/appearance all stay in sync. */

  private showGearItemPopup(id: string): void {
    if (this.gearItemModal) return;
    const def = GEAR.find((g) => g.id === id);
    if (!def || !this.state.gearIsOwned(id)) return;
    RundotGameAPI.triggerHapticAsync('light' as never);
    const { GAME_WIDTH, GAME_HEIGHT } = LAYOUT;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const s = this.state;
    const equipped = s.gearIsEquipped(id);
    const lvl = s.getGearLevel(id);

    const rows: [string, string, string?][] = [
      ['Status', equipped ? 'Equipped' : 'In bag', equipped ? '#7CFF7C' : '#8899AA'],
      ['Level', `${lvl} / ${GEAR_LEVEL_MAX}`],
      ['Scrap value', `${s.gearDismantleValue(id)} \u{1F529}`],
    ];

    const panelW = 560;
    const panelH = 470 + rows.length * 40;
    const top = cy - panelH / 2;

    const modal = this.scene.add.container(0, 0).setDepth(310);
    modal.add(this.scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72).setInteractive());
    modal.add(this.scene.add.rectangle(cx, cy, panelW, panelH, 0x141414, 0.98)
      .setStrokeStyle(2, equipped ? 0xFFD24A : 0x6a5a2a).setInteractive());

    modal.add(makeText(this.scene, cx, top + 34, def.name.toUpperCase(), 28, '#FFE08A', { fontStyle: 'bold' }).setOrigin(0.5));
    modal.add(makeText(this.scene, cx, top + 62, `${GEAR_SLOT_ICONS[def.slot]} ${GEAR_SLOT_LABELS[def.slot]}`, 14, '#8a7a4a', { fontStyle: 'bold' }).setOrigin(0.5));
    modal.add(makeBtn(this.scene, cx + panelW / 2 - 32, top + 32, '✕', 40, 40, 0x442222, () => this.closeGearItemPopup()));
    modal.add(this.scene.add.rectangle(cx, top + 80, panelW - 48, 1, 0x444444));

    const bigIcon = def.iconTexture ? this.createIcon(cx, top + 146, def.iconTexture, 104) : null;
    if (bigIcon) modal.add(bigIcon);
    else modal.add(makeText(this.scene, cx, top + 146, def.icon, 72, '#FFFFFF').setOrigin(0.5));
    modal.add(makeText(this.scene, cx, top + 210, def.description, 15, '#AAAAAA', {
      align: 'center', wordWrap: { width: panelW - 80 },
    }).setOrigin(0.5, 0));
    modal.add(makeText(this.scene, cx, top + 262, gearEffectSummary(def) + (lvl > 0 ? `  (+${lvl * 10}%)` : ''), 15, '#9fd0a0', {
      align: 'center', wordWrap: { width: panelW - 80 }, fontStyle: 'bold',
    }).setOrigin(0.5, 0));

    let y = top + 320;
    for (const [label, val, color] of rows) {
      modal.add(makeText(this.scene, cx - panelW / 2 + 36, y, label, 18, '#AAAAAA').setOrigin(0, 0.5));
      modal.add(makeText(this.scene, cx + panelW / 2 - 36, y, val, 18, color ?? '#FFFFFF', { fontStyle: 'bold' }).setOrigin(1, 0.5));
      y += 40;
    }

    const actionY = top + panelH - 96;
    if (equipped) {
      // Equipped: the Scrap sink. (No scrapping what's on your body — swap it
      // out by equipping a bagged piece in the same slot first.)
      const cost = s.gearLevelUpCost(id);
      if (cost === null) {
        modal.add(makeText(this.scene, cx, actionY, 'Lv MAX — fully reinforced', 17, '#FFD24A', { fontStyle: 'bold' }).setOrigin(0.5));
      } else {
        const canLevel = s.canLevelGear(id);
        const lvlBtn = makeBtn(this.scene, cx, actionY, `LEVEL UP → Lv ${lvl + 1}  ·  ${cost} Scrap`, 340, 52, canLevel ? 0x553388 : 0x2a2a3a, () => {
          if (!this.state.canLevelGear(id)) return;
          this.cb.onLevelGear(id);
          // Rebuild so the new level / next cost show immediately.
          this.closeGearItemPopup();
          this.showGearItemPopup(id);
        });
        // makeBtn's default 22px overflows this long label — shrink to fit.
        (lvlBtn.getAt(1) as Phaser.GameObjects.Text).setFontSize(17);
        if (!canLevel) lvlBtn.setAlpha(0.6);
        modal.add(lvlBtn);
      }
    } else {
      // Bagged: put it on (swaps with the current slot holder) or scrap it.
      const equipBtn = makeBtn(this.scene, cx - 90, actionY, 'EQUIP', 160, 52, 0x553388, () => {
        this.cb.onEquipGear(id);
        this.closeGearItemPopup();
      });
      (equipBtn.getAt(1) as Phaser.GameObjects.Text).setFontSize(18);
      modal.add(equipBtn);
      const scrapText = `SCRAP +${s.gearDismantleValue(id)}`;
      let armed = false;
      const scrapBtn = makeBtn(this.scene, cx + 90, actionY, scrapText, 160, 52, 0x553333, () => {
        if (!armed) {
          armed = true;
          (scrapBtn.getAt(1) as Phaser.GameObjects.Text).setText('SURE?').setColor('#FF9966');
          this.scene.time.delayedCall(2500, () => {
            armed = false;
            if (scrapBtn.active) (scrapBtn.getAt(1) as Phaser.GameObjects.Text).setText(scrapText).setColor('#FFFFFF');
          });
          return;
        }
        this.cb.onDismantleGear(id);
        this.closeGearItemPopup();
      });
      (scrapBtn.getAt(1) as Phaser.GameObjects.Text).setFontSize(16);
      modal.add(scrapBtn);
    }

    modal.add(makeBtn(this.scene, cx, top + panelH - 36, 'CLOSE', 200, 46, 0x2a2a2a, () => this.closeGearItemPopup()));
    this.gearItemModal = modal;
  }

  private closeGearItemPopup(): void {
    if (!this.gearItemModal) return;
    this.gearItemModal.destroy(true);
    this.gearItemModal = null;
  }

  /* ---- Level change ---- */

  refreshForNewLevel(): void {
    // The endless ladder may have generated new upgrade tiers for this floor —
    // give them cards before anything tries to render them.
    this.syncUpgradeRows();
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
