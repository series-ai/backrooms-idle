import Phaser from 'phaser';
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { LAYOUT } from '../config';
import { UPGRADES, RESOURCES, RESOURCE_ORDER, VOID_UPGRADES, PRESTIGE_TIERS, ABILITIES, EQUIP_SLOTS, EQUIP_SLOT_ICONS, GEAR_POOL, GEAR_TIER_COLORS, RECIPES, SHOP_ITEMS, SHARD_MILESTONES } from '../data/GameData';
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
  onBuyUpgrade: (id: string) => void;
  onEscape: () => void;
  onTravel: (levelId: number) => void;
  onTabChanged: (tab: string) => void;
  onRewind: () => void;
  onBuyVoidUpgrade: (id: string) => void;
  onUseAbility: (id: string) => void;
  onToggleAutoEscape: () => void;
  onCraft: (recipeId: string) => void;
  onBuyShopItem: (itemId: string) => void;
  onOpenStore: () => void;
}

export class UIManager {
  private scene: Phaser.Scene;
  private state: GameState;
  private cb: UICallbacks;

  // Background
  private bgImage!: Phaser.GameObjects.Image;
  private darkOverlay!: Phaser.GameObjects.Rectangle;
  private flickerOverlay!: Phaser.GameObjects.Rectangle;
  private damageOverlay!: Phaser.GameObjects.Rectangle;

  // Header
  private levelText!: Phaser.GameObjects.Text;
  private subtitleText!: Phaser.GameObjects.Text;

  // Status bars
  private progFill!: Phaser.GameObjects.Rectangle;
  private progLabel!: Phaser.GameObjects.Text;

  // Focal "showcase" presentation (replaces the scrolling text log)
  private showcaseBig: Phaser.GameObjects.Image | null = null;
  private showcaseKey: string | null = null;
  private captionText!: Phaser.GameObjects.Text;

  // Resource bar
  private resTexts: Map<string, Phaser.GameObjects.Text> = new Map();

  // Tabs
  private activeTab = 'explore';
  private panels: Map<string, Phaser.GameObjects.Container> = new Map();
  private tabBGs: Map<string, Phaser.GameObjects.Rectangle> = new Map();

  // Upgrade panel refs for live updates
  private upgCostLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private upgLvlLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private upgBuyBtns: Map<string, Phaser.GameObjects.Container> = new Map();

  // Escape panel refs
  private escInfoText!: Phaser.GameObjects.Text;
  private escBtn!: Phaser.GameObjects.Container;
  private escBtnBg!: Phaser.GameObjects.Rectangle;
  private travelContainer!: Phaser.GameObjects.Container;
  private travelLevelName!: Phaser.GameObjects.Text;
  private travelLevelSub!: Phaser.GameObjects.Text;
  private travelPrevBg!: Phaser.GameObjects.Rectangle;
  private travelNextBg!: Phaser.GameObjects.Rectangle;
  private travelHomeBg!: Phaser.GameObjects.Rectangle;

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

  // Shop panel refs
  private shopShardLabel!: Phaser.GameObjects.Text;
  private shopBuyBtns: Map<string, Phaser.GameObjects.Container> = new Map();
  private shopStatusTexts: Map<string, Phaser.GameObjects.Text> = new Map();

  // Auto-escape toggle
  private autoEscBg!: Phaser.GameObjects.Rectangle;
  private autoEscTxt!: Phaser.GameObjects.Text;

  // Ability refs
  private abilityBtns: Map<string, Phaser.GameObjects.Container> = new Map();
  private abilityLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private logBottom = 0;
  private exploreDescendBg?: Phaser.GameObjects.Rectangle;
  private exploreDescendTxt?: Phaser.GameObjects.Text;

  // Void prompt (stuck at max level)
  private voidPromptBanner: Phaser.GameObjects.Container | null = null;
  private voidNotifDot: Phaser.GameObjects.Container | null = null;

  // Header extras
  private depthText!: Phaser.GameObjects.Text;

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
  private popShowcase(iconId: string): void {
    const key = `icon_${iconId}`;
    if (!this.scene.textures.exists(key)) return;
    const targetScale = 320 / ICON_NATIVE;

    if (this.showcaseBig && this.showcaseKey === iconId) {
      // Same icon — just re-pop it.
      this.showcaseBig.setScale(targetScale * 0.85);
      this.scene.tweens.add({ targets: this.showcaseBig, scale: targetScale, duration: 200, ease: 'Back.easeOut' });
      return;
    }

    if (this.showcaseBig) this.showcaseBig.destroy();
    this.showcaseBig = this.scene.add.image(LAYOUT.CENTER_X, this.showcaseCenterY(), key).setDepth(14);
    this.showcaseBig.setScale(targetScale * 0.6).setAlpha(0);
    if (this.activeTab !== 'explore') this.showcaseBig.setVisible(false);
    this.showcaseKey = iconId;
    this.scene.tweens.add({ targets: this.showcaseBig, scale: targetScale, alpha: 1, duration: 260, ease: 'Back.easeOut' });
  }

  private clearShowcase(): void {
    if (this.showcaseBig) { this.showcaseBig.destroy(); this.showcaseBig = null; }
    this.showcaseKey = null;
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
    this.createEscapePanel();
    this.createVoidPanel();
    this.createGearPanel();
    this.createShopPanel();
    this.showTab('explore');
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
    this.darkOverlay = this.scene.add.rectangle(
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
    // Header panel
    this.scene.add.rectangle(GAME_WIDTH / 2, 48, GAME_WIDTH, 90, 0x000000, 0.5)
      .setDepth(3);
    // Status bars panel
    this.scene.add.rectangle(GAME_WIDTH / 2, 140, GAME_WIDTH, 86, 0x000000, 0.45)
      .setDepth(3);
    // Main content panel
    this.scene.add.rectangle(GAME_WIDTH / 2, (LAYOUT.CONTENT_TOP + LAYOUT.CONTENT_BOTTOM) / 2,
      GAME_WIDTH - 20, LAYOUT.CONTENT_BOTTOM - LAYOUT.CONTENT_TOP + 20, 0x0a0a0a, 0.6)
      .setDepth(3)
      .setStrokeStyle(1, 0x333333);
    // Resource bar panel
    this.scene.add.rectangle(GAME_WIDTH / 2, LAYOUT.RESOURCE_BAR_Y + 20, GAME_WIDTH, 50, 0x000000, 0.65)
      .setDepth(3);
    // Tab bar panel (two rows: row1 centered at TAB_Y-24, row2 at TAB_Y+24, each 42px tall)
    this.scene.add.rectangle(GAME_WIDTH / 2, LAYOUT.TAB_Y,
      GAME_WIDTH, 100, 0x000000, 0.6)
      .setDepth(3);
    // Bottom fill below tabs
    this.scene.add.rectangle(GAME_WIDTH / 2, LAYOUT.TAB_Y + 80,
      GAME_WIDTH, 120, 0x000000, 0.7)
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
    this.levelText = makeText(this.scene, cx, 18, this.state.level.name, 36, '#FFFFFF', {
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.levelText.setDepth(10);

    this.subtitleText = makeText(this.scene, cx, 58, this.state.level.subtitle, 22, this.state.level.textColor, {
      fontStyle: 'italic',
    }).setOrigin(0.5, 0);
    this.subtitleText.setDepth(10);

    // Depth counter (top-right) — always visible, shows lifetime progression
    const showDepth = this.state.totalDepth > 0 || this.state.prestigeCount > 0;
    const depthStr = showDepth ? `DEPTH: ${this.state.totalDepth}` : '';
    this.depthText = makeText(this.scene, LAYOUT.GAME_WIDTH - 20, 8, depthStr, 14, '#8888CC', {
      fontStyle: 'bold',
    }).setOrigin(1, 0).setDepth(10);
  }

  /* ---- Status bars ---- */

  private createStatusBars(): void {
    const { BAR_X, BAR_WIDTH, BAR_HEIGHT } = LAYOUT;

    // Goal line — so a new player always knows the loop.
    makeText(this.scene, BAR_X, 96, 'Explore to find resources → buy upgrades → descend deeper.', 15, '#9aa6c0')
      .setDepth(12);

    // Single EXPLORATION bar (the thing that fills as you explore the level).
    const y = 140;
    this.scene.add.rectangle(BAR_X + BAR_WIDTH / 2, y + BAR_HEIGHT / 2, BAR_WIDTH, BAR_HEIGHT, 0x222222).setDepth(10);
    this.progFill = this.scene.add.rectangle(BAR_X, y, 0, BAR_HEIGHT, 0xffcc00).setOrigin(0, 0).setDepth(11);
    this.progLabel = makeText(this.scene, BAR_X + 6, y + 1, 'EXPLORING: 0%', 16, '#FFFFFF').setDepth(12);

  }

  /* ---- Resource bar ---- */

  private createResourceBar(): void {
    const y = LAYOUT.RESOURCE_BAR_Y;
    // Dark background strip
    this.scene.add.rectangle(LAYOUT.CENTER_X, y + 20, 700, 44, 0x111111, 0.8)
      .setDepth(10);

    const show = ['cloth_scraps', 'batteries', 'scrap_metal', 'lucky_coins'];
    const startX = 50;
    const gap = 170;

    for (let i = 0; i < show.length; i++) {
      const res = RESOURCES[show[i]];
      const x = startX + i * gap;
      const icon = this.createIcon(x + 18, y + 20, show[i], 80);
      if (icon) {
        icon.setDepth(11);
        const txt = makeText(this.scene, x + 60, y + 8, `${this.state.resources[show[i]] ?? 0}`, 20, '#DDDDDD')
          .setDepth(11);
        this.resTexts.set(show[i], txt);
      } else {
        const txt = makeText(this.scene, x, y + 8, `${res.icon} ${this.state.resources[show[i]] ?? 0}`, 20, '#DDDDDD')
          .setDepth(11);
        this.resTexts.set(show[i], txt);
      }
    }
  }

  /* ---- Tab bar ---- */

  private createTabBar(): void {
    const showVoid = this.state.prestigeCount > 0 || this.state.canRewind();

    // Two-row layout with full labels
    const row1: { id: string; label: string }[] = showVoid
      ? [{ id: 'explore', label: 'EXPLORE' }, { id: 'items', label: 'ITEMS' }, { id: 'upgrades', label: 'UPGRADES' }, { id: 'escape', label: 'ESCAPE' }]
      : [{ id: 'explore', label: 'EXPLORE' }, { id: 'items', label: 'ITEMS' }, { id: 'upgrades', label: 'UPGRADES' }];
    const row2: { id: string; label: string }[] = showVoid
      ? [{ id: 'void', label: 'VOID' }, { id: 'gear', label: 'GEAR' }, { id: 'shop', label: 'SHOP' }]
      : [{ id: 'escape', label: 'ESCAPE' }, { id: 'gear', label: 'GEAR' }, { id: 'shop', label: 'SHOP' }];

    const rowH = 42;
    const rowGap = 8;
    const row1Y = LAYOUT.TAB_Y - rowGap / 2 - rowH / 2;
    const row2Y = LAYOUT.TAB_Y + rowGap / 2 + rowH / 2;
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

        bg.setInteractive({ useHandCursor: true });
        const tabId = tabs[i].id;
        bg.on('pointerdown', () => {
          this.showTab(tabId);
          this.cb.onTabChanged(tabId);
        });

        this.tabBGs.set(tabId, bg);
        (bg as unknown as Record<string, Phaser.GameObjects.Text>).__tabTxt = txt;
      }
    };

    buildRow(row1, row1Y);
    buildRow(row2, row2Y);
  }

  /* ---- Explore panel (log + action buttons) ---- */

  private createExplorePanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);

    // Action buttons at the bottom: SEARCH (manual find) + DESCEND.
    const btnY = LAYOUT.CONTENT_BOTTOM - 44;
    const searchBtn = makeBtn(this.scene, 198, btnY, '\u{1F50D} SEARCH', 300, 72, 0x2c6a3c, () => this.cb.onSearch());
    (searchBtn.getAt(0) as Phaser.GameObjects.Rectangle).setStrokeStyle(3, 0x66cc88);
    const descendBtn = makeBtn(this.scene, 522, btnY, '⬇ DESCEND', 300, 72, 0x333355, () => this.cb.onEscape());
    this.exploreDescendBg = descendBtn.getAt(0) as Phaser.GameObjects.Rectangle;
    this.exploreDescendTxt = descendBtn.getAt(1) as Phaser.GameObjects.Text;
    panel.add([searchBtn, descendBtn]);

    // Focal showcase fills the space above the buttons: a big icon (created on
    // demand at scene depth 14) plus a caption that pops as events happen.
    this.logBottom = btnY - 56;
    const capY = this.logBottom - 60;
    this.captionText = makeText(this.scene, LAYOUT.CENTER_X, capY, 'Searching the rooms...', 24, '#d6d6d6', {
      align: 'center', wordWrap: { width: 640 },
    }).setOrigin(0.5).setDepth(16);
    panel.add(this.captionText);

    this.panels.set('explore', panel);
  }

  /* ---- Items panel ---- */

  private createItemsPanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);
    const startY = LAYOUT.CONTENT_TOP + 10;

    for (let i = 0; i < RESOURCE_ORDER.length; i++) {
      const resId = RESOURCE_ORDER[i];
      const res = RESOURCES[resId];
      const y = startY + i * 75;
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
      const countTxt = makeText(this.scene, 680, y + 2, `x${this.state.resources[resId] ?? 0}`, 22, '#FFD700', {
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

      panel.add(row);
    }

    this.panels.set('items', panel);
  }

  /* ---- Upgrade panel ---- */

  private createUpgradePanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);
    const startY = LAYOUT.CONTENT_TOP + 10;

    // Scrollable container for upgrades
    const scrollContainer = this.scene.add.container(0, 0);
    const contentH = LAYOUT.CONTENT_BOTTOM - LAYOUT.CONTENT_TOP - 10;

    for (let i = 0; i < UPGRADES.length; i++) {
      const upg = UPGRADES[i];
      const y = startY + i * 100;
      const row = this.scene.add.container(0, 0);

      // Name + level
      const lvl = this.state.getUpgradeLevel(upg.id);
      const upgIcon = this.createIcon(58, y + 12, upg.id, 90);
      let nameTxt: Phaser.GameObjects.Text;
      if (upgIcon) {
        row.add(upgIcon);
        nameTxt = makeText(this.scene, 112, y, upg.name, 20, '#EEEEEE', { fontStyle: 'bold' });
      } else {
        nameTxt = makeText(this.scene, 40, y, `${upg.icon}  ${upg.name}`, 20, '#EEEEEE', { fontStyle: 'bold' });
      }
      const lvlTxt = makeText(this.scene, 640, y, `Lv.${lvl}/${upg.maxLevel}`, 16, '#AAAAAA')
        .setOrigin(1, 0);
      this.upgLvlLabels.set(upg.id, lvlTxt);

      // Description + effect
      const currentEffect = lvl * upg.effectPerLevel;
      const descStr = `${upg.description}  |  +${currentEffect}${upg.effectUnit}`;
      const descTxt = makeText(this.scene, upgIcon ? 112 : 60, y + 26, descStr, 14, '#AAAAAA');
      this.upgCostLabels.set(`desc_${upg.id}`, descTxt);

      // Cost + buy button on same line
      const cost = this.state.getUpgradeCost(upg.id);
      const costRes = RESOURCES[upg.costResource];
      const costTxt = makeText(this.scene, upgIcon ? 112 : 60, y + 50, `Cost: ${cost} ${costRes.icon}`, 16, '#CCCCCC');
      this.upgCostLabels.set(upg.id, costTxt);

      const canBuy = this.state.canAffordUpgrade(upg.id);
      const btnColor = canBuy ? 0x336633 : 0x333333;
      const buyBtn = makeBtn(this.scene, 600, y + 56, canBuy ? 'BUY' : '---', 110, 32, btnColor, () => {
        this.cb.onBuyUpgrade(upg.id);
      });
      this.upgBuyBtns.set(upg.id, buyBtn);

      row.add([nameTxt, lvlTxt, descTxt, costTxt, buyBtn]);

      // Divider line
      const divider = this.scene.add.rectangle(LAYOUT.CENTER_X, y + 88, 620, 1, 0x444444).setDepth(15);
      row.add(divider);

      scrollContainer.add(row);
    }

    panel.add(scrollContainer);

    // Add mask to clip content to the content area
    const maskGfx = this.scene.add.graphics();
    maskGfx.setVisible(false);
    maskGfx.fillRect(0, LAYOUT.CONTENT_TOP, LAYOUT.GAME_WIDTH, contentH);
    panel.setMask(maskGfx.createGeometryMask());

    // Enable drag scrolling when content overflows
    const totalH = UPGRADES.length * 100;
    if (totalH > contentH) {
      const dragZone = this.scene.add.rectangle(
        LAYOUT.CENTER_X, LAYOUT.CONTENT_TOP + contentH / 2,
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
        if (!dragging || !this.panels.get('upgrades')?.visible) return;
        const dy = _p.y - lastY;
        lastY = _p.y;
        scrollContainer.y = Phaser.Math.Clamp(scrollContainer.y + dy, minScroll, 0);
      });
      this.scene.input.on('pointerup', () => { dragging = false; });

      panel.add(dragZone);
    }

    this.panels.set('upgrades', panel);
  }

  /* ---- Escape / Levels panel ---- */

  private createEscapePanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);
    const cx = LAYOUT.CENTER_X;
    const gap = 16; // spacing between sections
    let curY = LAYOUT.CONTENT_TOP + 10;

    // Current level label
    const currentLvlLabel = makeText(this.scene, cx, curY, 'CURRENT LEVEL', 16, '#AAAAAA', {
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    panel.add(currentLvlLabel);
    curY += currentLvlLabel.height + 8;

    // Level description (variable height)
    const descTxt = makeText(this.scene, cx, curY, this.state.level.description, 18, this.state.level.textColor, {
      align: 'center',
      wordWrap: { width: 600 },
    }).setOrigin(0.5, 0);
    panel.add(descTxt);
    curY += descTxt.height + gap;

    // Progress info (variable height — 3 lines)
    this.escInfoText = makeText(this.scene, cx, curY, '', 20, '#CCCCCC', {
      align: 'center',
      wordWrap: { width: 600 },
    }).setOrigin(0.5, 0);
    panel.add(this.escInfoText);
    curY += 80 + gap; // reserve ~3 lines worth of space

    // Escape button
    const canEsc = this.state.canEscape();
    const escBtnBg = this.scene.add.rectangle(0, 0, 400, 60, canEsc ? 0x446644 : 0x333333)
      .setOrigin(0.5).setStrokeStyle(2, canEsc ? 0x66aa66 : 0x444444);
    const escBtnTxt = this.scene.add.text(0, 0, '\u{1F511} ESCAPE TO NEXT LEVEL', {
      fontFamily: FONT_FAMILY,
      fontSize: '22px',
      color: canEsc ? '#FFFFFF' : '#666666',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.escBtn = this.scene.add.container(cx, curY + 30, [escBtnBg, escBtnTxt]);
    this.escBtn.setSize(400, 60);
    this.escBtn.setInteractive({ useHandCursor: true });
    this.escBtn.on('pointerdown', () => this.cb.onEscape());
    this.escBtnBg = escBtnBg;
    panel.add(this.escBtn);
    curY += 60 + gap * 2;

    // Travel label
    const travelLabel = makeText(this.scene, cx, curY, 'TRAVEL', 16, '#AAAAAA', {
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    panel.add(travelLabel);
    curY += travelLabel.height + gap;

    // Travel navigation container
    this.travelContainer = this.scene.add.container(0, 0);
    panel.add(this.travelContainer);

    const navY = curY + 30;

    // Previous button
    this.travelPrevBg = this.scene.add.rectangle(cx - 220, navY, 70, 60, 0x2a2a2a)
      .setOrigin(0.5).setStrokeStyle(1, 0x444444).setInteractive({ useHandCursor: true });
    this.travelPrevBg.on('pointerdown', () => this.travelPrev());
    const prevTxt = makeText(this.scene, cx - 220, navY, '\u25C0', 28, '#CCCCCC').setOrigin(0.5);
    this.travelContainer.add([this.travelPrevBg, prevTxt]);

    // Level name display (center)
    this.travelLevelName = makeText(this.scene, cx, navY - 12, '', 20, '#FFFFFF', {
      fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5);
    this.travelLevelSub = makeText(this.scene, cx, navY + 14, '', 14, '#AAAAAA', {
      align: 'center',
    }).setOrigin(0.5);
    this.travelContainer.add([this.travelLevelName, this.travelLevelSub]);

    // Next button
    this.travelNextBg = this.scene.add.rectangle(cx + 220, navY, 70, 60, 0x2a2a2a)
      .setOrigin(0.5).setStrokeStyle(1, 0x444444).setInteractive({ useHandCursor: true });
    this.travelNextBg.on('pointerdown', () => this.travelNext());
    const nextTxt = makeText(this.scene, cx + 220, navY, '\u25B6', 28, '#CCCCCC').setOrigin(0.5);
    this.travelContainer.add([this.travelNextBg, nextTxt]);

    // Home button (go to Level 0)
    this.travelHomeBg = this.scene.add.rectangle(cx, navY + 70, 200, 44, 0x2a2a2a)
      .setOrigin(0.5).setStrokeStyle(1, 0x444444).setInteractive({ useHandCursor: true });
    this.travelHomeBg.on('pointerdown', () => {
      if (this.state.currentLevel !== 0) this.cb.onTravel(0);
    });
    const homeTxt = makeText(this.scene, cx, navY + 70, '\u{1F3E0} BACK TO LEVEL 0', 16, '#AAAAAA').setOrigin(0.5);
    this.travelContainer.add([this.travelHomeBg, homeTxt]);

    this.refreshTravelNav();

    this.panels.set('escape', panel);
  }

  private travelPrev(): void {
    const sorted = this.state.unlockedLevels.slice().sort((a, b) => a - b);
    const idx = sorted.indexOf(this.state.currentLevel);
    if (idx > 0) this.cb.onTravel(sorted[idx - 1]);
  }

  private travelNext(): void {
    const sorted = this.state.unlockedLevels.slice().sort((a, b) => a - b);
    const idx = sorted.indexOf(this.state.currentLevel);
    if (idx < sorted.length - 1) this.cb.onTravel(sorted[idx + 1]);
  }

  private refreshTravelNav(): void {
    const sorted = this.state.unlockedLevels.slice().sort((a, b) => a - b);
    const idx = sorted.indexOf(this.state.currentLevel);
    const lvl = this.state.level;

    // Update level display
    this.travelLevelName.setText(lvl.name);
    this.travelLevelSub.setText(lvl.subtitle);
    this.travelLevelSub.setColor(lvl.textColor);

    // Enable/disable prev
    const hasPrev = idx > 0;
    this.travelPrevBg.setFillStyle(hasPrev ? 0x2a2a2a : 0x1a1a1a);
    this.travelPrevBg.setStrokeStyle(1, hasPrev ? 0x444444 : 0x2a2a2a);

    // Enable/disable next
    const hasNext = idx < sorted.length - 1;
    this.travelNextBg.setFillStyle(hasNext ? 0x2a2a2a : 0x1a1a1a);
    this.travelNextBg.setStrokeStyle(1, hasNext ? 0x444444 : 0x2a2a2a);

    // Enable/disable home
    const notHome = this.state.currentLevel !== 0;
    this.travelHomeBg.setFillStyle(notHome ? 0x2a2a2a : 0x1a1a1a);
    this.travelHomeBg.setStrokeStyle(1, notHome ? 0x444444 : 0x2a2a2a);
  }

  /* ---- Void panel (prestige upgrades + rewind) ---- */

  private createVoidPanel(): void {
    const panel = this.scene.add.container(0, 0).setDepth(15);
    const startY = LAYOUT.CONTENT_TOP + 10;
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
    const contentH = LAYOUT.CONTENT_BOTTOM - LAYOUT.CONTENT_TOP - 10;
    const maskGfx = this.scene.add.graphics();
    maskGfx.setVisible(false);
    maskGfx.fillRect(0, LAYOUT.CONTENT_TOP, LAYOUT.GAME_WIDTH, contentH);
    panel.setMask(maskGfx.createGeometryMask());

    const totalH = rewindBtnY + 60 - startY;
    if (totalH > contentH) {
      const dragZone = this.scene.add.rectangle(
        cx, LAYOUT.CONTENT_TOP + contentH / 2,
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
    let curY = LAYOUT.CONTENT_TOP + 10;

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
    const contentH = LAYOUT.CONTENT_BOTTOM - LAYOUT.CONTENT_TOP - 10;
    const maskGfx = this.scene.add.graphics();
    maskGfx.setVisible(false);
    maskGfx.fillRect(0, LAYOUT.CONTENT_TOP, LAYOUT.GAME_WIDTH, contentH);
    panel.setMask(maskGfx.createGeometryMask());

    const totalH = curY - LAYOUT.CONTENT_TOP;
    if (totalH > contentH) {
      const dragZone = this.scene.add.rectangle(
        cx, LAYOUT.CONTENT_TOP + contentH / 2,
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
    const scrollContainer = this.scene.add.container(0, 0);
    const cx = LAYOUT.CENTER_X;
    let curY = LAYOUT.CONTENT_TOP + 10;

    // Title with void shard icon
    const vsIcon = this.createIcon(cx - 148, curY + 14, 'void_shard', 80);
    if (vsIcon) {
      scrollContainer.add(vsIcon);
      const title = makeText(this.scene, cx + 10, curY, 'VOID SHARD SHOP', 24, '#CC88FF', {
        fontStyle: 'bold',
      }).setOrigin(0.5, 0);
      scrollContainer.add(title);
    } else {
      const title = makeText(this.scene, cx, curY, '\u{1F48E} VOID SHARD SHOP', 24, '#CC88FF', {
        fontStyle: 'bold',
      }).setOrigin(0.5, 0);
      scrollContainer.add(title);
    }
    curY += 34;

    // Shard balance with icon
    const vsBalIcon = this.createIcon(cx - 116, curY + 12, 'void_shard', 70);
    if (vsBalIcon) {
      scrollContainer.add(vsBalIcon);
      this.shopShardLabel = makeText(this.scene, cx - 90, curY, `Void Shards: ${this.state.voidShards}`, 20, '#CC88FF', {
        fontStyle: 'bold',
      }).setOrigin(0, 0);
    } else {
      this.shopShardLabel = makeText(this.scene, cx, curY, `Void Shards: ${this.state.voidShards}`, 20, '#CC88FF', {
        fontStyle: 'bold',
      }).setOrigin(0.5, 0);
    }
    scrollContainer.add(this.shopShardLabel);
    curY += 30;

    // How to earn shards info
    const earnInfo = makeText(this.scene, cx, curY,
      'Earn: 1/Rewind, Memory Fragments, Achievements',
      13, '#8888AA').setOrigin(0.5, 0);
    scrollContainer.add(earnInfo);
    curY += 24;

    // Buy Shards button (opens platform store)
    const buyShardsBtn = makeBtn(this.scene, cx, curY + 18, '\u{1F4B0} GET MORE SHARDS', 320, 40, 0x443366, () => {
      this.cb.onOpenStore();
    });
    scrollContainer.add(buyShardsBtn);
    curY += 50;

    // Divider
    scrollContainer.add(this.scene.add.rectangle(cx, curY, 620, 2, 0x444444).setDepth(15));
    curY += 16;

    // Render shop items by category
    const categories: Array<{ label: string; key: string }> = [
      { label: 'STARTER PACKS (One-Time)', key: 'starter' },
      { label: 'CONVENIENCE', key: 'convenience' },
      { label: 'COSMETICS (Permanent)', key: 'cosmetic' },
    ];

    for (const cat of categories) {
      const catTitle = makeText(this.scene, cx, curY, cat.label, 18, '#AAAAAA', {
        fontStyle: 'bold',
      }).setOrigin(0.5, 0);
      scrollContainer.add(catTitle);
      curY += 28;

      const items = SHOP_ITEMS.filter(i => i.category === cat.key);
      for (const item of items) {
        const row = this.scene.add.container(0, 0);

        // Name
        const nameTxt = makeText(this.scene, 40, curY, `${item.icon}  ${item.name}`, 17, '#EEEEEE', {
          fontStyle: 'bold',
        });
        row.add(nameTxt);

        // Description
        const descTxt = makeText(this.scene, 40, curY + 22, item.description, 13, '#AAAAAA', {
          wordWrap: { width: 480 },
        });
        row.add(descTxt);

        // Status text (cost or "OWNED")
        const owned = item.oneTime && this.state.purchasedItems[item.id];
        const statusStr = owned ? 'OWNED' : `${item.cost} \u{1F48E}`;
        const statusColor = owned ? '#88FF88' : '#CC88FF';
        const statusTxt = makeText(this.scene, 680, curY, statusStr, 16, statusColor, {
          fontStyle: 'bold',
        }).setOrigin(1, 0);
        row.add(statusTxt);
        this.shopStatusTexts.set(item.id, statusTxt);

        // Buy button
        const canBuy = this.state.canBuyShopItem(item.id);
        const btnLabel = owned ? '\u2713' : canBuy ? 'BUY' : '---';
        const btnColor = owned ? 0x224422 : canBuy ? 0x443366 : 0x222233;
        const buyBtn = makeBtn(this.scene, 600, curY + 32, btnLabel, 100, 28, btnColor, () => {
          this.cb.onBuyShopItem(item.id);
        });
        row.add(buyBtn);
        this.shopBuyBtns.set(item.id, buyBtn);

        scrollContainer.add(row);

        // Divider
        scrollContainer.add(this.scene.add.rectangle(cx, curY + 56, 620, 1, 0x333333).setDepth(15));
        curY += 64;
      }

      curY += 8; // gap between categories
    }

    // Achievements section
    scrollContainer.add(this.scene.add.rectangle(cx, curY, 620, 2, 0x444444).setDepth(15));
    curY += 16;
    const achTitle = makeText(this.scene, cx, curY, 'SHARD ACHIEVEMENTS', 18, '#AAAAAA', {
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    scrollContainer.add(achTitle);
    curY += 28;

    for (const milestone of SHARD_MILESTONES) {
      const claimed = this.state.claimedShardMilestones.includes(milestone.id);
      const icon = claimed ? '\u2713' : '\u25CB';
      const color = claimed ? '#88FF88' : '#666688';
      const mileTxt = makeText(this.scene, 40, curY,
        `${icon} ${milestone.description} — +${milestone.reward} \u{1F48E}`,
        14, color);
      scrollContainer.add(mileTxt);
      this.shopStatusTexts.set(`ach_${milestone.id}`, mileTxt);
      curY += 24;
    }

    curY += 20; // bottom padding

    panel.add(scrollContainer);

    // Mask and scroll
    const contentH = LAYOUT.CONTENT_BOTTOM - LAYOUT.CONTENT_TOP - 10;
    const maskGfx = this.scene.add.graphics();
    maskGfx.setVisible(false);
    maskGfx.fillRect(0, LAYOUT.CONTENT_TOP, LAYOUT.GAME_WIDTH, contentH);
    panel.setMask(maskGfx.createGeometryMask());

    const totalH = curY - LAYOUT.CONTENT_TOP;
    if (totalH > contentH) {
      const dragZone = this.scene.add.rectangle(
        cx, LAYOUT.CONTENT_TOP + contentH / 2,
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
        if (!dragging || !this.panels.get('shop')?.visible) return;
        const dy = _p.y - lastPointerY;
        lastPointerY = _p.y;
        scrollContainer.y = Phaser.Math.Clamp(scrollContainer.y + dy, minScroll, 0);
      });
      this.scene.input.on('pointerup', () => { dragging = false; });

      panel.add(dragZone);
    }

    this.panels.set('shop', panel);
  }

  refreshShopPanel(): void {
    // Update shard balance
    this.shopShardLabel.setText(`Void Shards: ${this.state.voidShards}`);

    // Update shop items
    for (const item of SHOP_ITEMS) {
      const btn = this.shopBuyBtns.get(item.id);
      const statusTxt = this.shopStatusTexts.get(item.id);

      const owned = item.oneTime && this.state.purchasedItems[item.id];
      const canBuy = this.state.canBuyShopItem(item.id);

      if (statusTxt) {
        statusTxt.setText(owned ? 'OWNED' : `${item.cost} \u{1F48E}`);
        statusTxt.setColor(owned ? '#88FF88' : '#CC88FF');
      }

      if (btn) {
        const bg = btn.getAt(0) as Phaser.GameObjects.Rectangle;
        const txt = btn.getAt(1) as Phaser.GameObjects.Text;
        if (owned) {
          bg.setFillStyle(0x224422);
          txt.setText('\u2713');
        } else if (canBuy) {
          bg.setFillStyle(0x443366);
          txt.setText('BUY');
        } else {
          bg.setFillStyle(0x222233);
          txt.setText('---');
        }
      }
    }

    // Update achievements
    for (const milestone of SHARD_MILESTONES) {
      const txt = this.shopStatusTexts.get(`ach_${milestone.id}`);
      if (txt) {
        const claimed = this.state.claimedShardMilestones.includes(milestone.id);
        const icon = claimed ? '\u2713' : '\u25CB';
        txt.setText(`${icon} ${milestone.description} — +${milestone.reward} \u{1F48E}`);
        txt.setColor(claimed ? '#88FF88' : '#666688');
      }
    }
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
    if (tab === 'escape') this.refreshEscapePanel();
    if (tab === 'items') this.refreshItemCounts();
    if (tab === 'void') this.refreshVoidPanel();
    if (tab === 'gear') this.refreshGearPanel();
    if (tab === 'shop') this.refreshShopPanel();

    // Toggle showcase icon visibility with explore tab
    if (this.showcaseBig) this.showcaseBig.setVisible(tab === 'explore');

    // Hide void notification dot when viewing VOID tab
    if (tab === 'void' && this.voidNotifDot) this.voidNotifDot.setVisible(false);
  }

  /* ================================================================ */
  /*  Log                                                              */
  /* ================================================================ */

  addLogMessage(evt: GameEvent): void {
    // Big focal icon pops in for events that carry one (resources, entities, items).
    if (evt.iconKey) this.popShowcase(evt.iconKey);

    // Caption pops as it updates — no wall of scrolling text.
    if (this.captionText) {
      this.captionText.setText(evt.message).setColor(evt.color).setScale(0.92).setAlpha(1);
      this.scene.tweens.add({ targets: this.captionText, scale: 1, duration: 180, ease: 'Back.easeOut' });
    }
  }

  /* ================================================================ */
  /*  Live updates                                                     */
  /* ================================================================ */

  updateStatusBars(): void {
    const { BAR_WIDTH, BAR_X } = LAYOUT;
    const s = this.state;
    const progW = BAR_WIDTH * Math.max(0, s.explorationPct / 100);
    this.progFill.width = Phaser.Math.Linear(this.progFill.width, progW, 0.15);
    this.progFill.x = BAR_X;
    const pct = Math.floor(s.explorationPct);
    this.progLabel.setText(pct >= 100 ? 'EXPLORED — ready to descend' : `EXPLORING: ${pct}%`);

    if (this.exploreDescendBg && this.exploreDescendTxt) {
      const can = s.canEscape();
      this.exploreDescendBg.setFillStyle(can ? 0x2c6a3c : 0x2a2a3a);
      this.exploreDescendBg.setStrokeStyle(3, can ? 0x66cc88 : 0x44445a);
      this.exploreDescendTxt.setColor(can ? '#FFFFFF' : '#7a7a90');
    }
  }

  updateResourceBar(): void {
    const show = ['cloth_scraps', 'batteries', 'scrap_metal', 'lucky_coins'];
    for (const id of show) {
      const txt = this.resTexts.get(id);
      if (txt) {
        const hasIcon = this.scene.textures.exists(`icon_${id}`);
        if (hasIcon) {
          txt.setText(`${this.state.resources[id] ?? 0}`);
        } else {
          const res = RESOURCES[id];
          txt.setText(`${res.icon} ${this.state.resources[id] ?? 0}`);
        }
      }
    }
    // Keep item counts in sync when viewing items tab
    if (this.activeTab === 'items') this.refreshItemCounts();
  }

  refreshItemCounts(): void {
    for (const resId of RESOURCE_ORDER) {
      const txt = this.resTexts.get(`item_${resId}`);
      if (txt) txt.setText(`x${this.state.resources[resId] ?? 0}`);
    }
  }

  refreshUpgradePanel(): void {
    for (const upg of UPGRADES) {
      const lvl = this.state.getUpgradeLevel(upg.id);
      const lvlTxt = this.upgLvlLabels.get(upg.id);
      if (lvlTxt) lvlTxt.setText(`Lv.${lvl}/${upg.maxLevel}`);

      const descTxt = this.upgCostLabels.get(`desc_${upg.id}`);
      if (descTxt) {
        const currentEffect = lvl * upg.effectPerLevel;
        descTxt.setText(`${upg.description}  |  +${currentEffect}${upg.effectUnit}`);
      }

      const costTxt = this.upgCostLabels.get(upg.id);
      if (costTxt) {
        const cost = this.state.getUpgradeCost(upg.id);
        const costRes = RESOURCES[upg.costResource];
        costTxt.setText(
          lvl >= upg.maxLevel ? 'MAXED' : `Cost: ${cost} ${costRes.icon}`,
        );
      }

      const btn = this.upgBuyBtns.get(upg.id);
      if (btn) {
        const canBuy = this.state.canAffordUpgrade(upg.id);
        const bg = btn.getAt(0) as Phaser.GameObjects.Rectangle;
        const txt = btn.getAt(1) as Phaser.GameObjects.Text;
        bg.setFillStyle(canBuy ? 0x336633 : 0x333333);
        txt.setText(lvl >= upg.maxLevel ? 'MAX' : canBuy ? 'BUY' : '---');
      }
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

  refreshEscapePanel(): void {
    const s = this.state;
    const lines = [
      `Exploration: ${Math.floor(s.explorationPct)}% / 100%`,
      `Level Keys: ${s.resources['level_keys'] ?? 0}`,
      `Danger: ${'!'.repeat(s.level.danger)}`,
    ];

    // Hint when the player is at the max unlocked level
    const atMaxLevel = s.currentLevel >= s.maxLevelUnlocked && s.currentLevel < 9;
    if (atMaxLevel && s.canRewind()) {
      lines.push('');
      lines.push('You\'ve reached the deepest level.');
      lines.push('Use REWIND in the VOID tab to prestige');
      lines.push('and unlock more levels!');
    } else if (atMaxLevel) {
      lines.push('');
      lines.push('You\'ve reached the deepest level.');
      lines.push('Keep exploring to unlock Rewind.');
    }

    this.escInfoText.setText(lines.join('\n'));

    const canEsc = s.canEscape();
    this.escBtnBg.setFillStyle(canEsc ? 0x446644 : 0x333333);
    this.escBtnBg.setStrokeStyle(2, canEsc ? 0x66aa66 : 0x444444);
    const btnTxt = this.escBtn.getAt(1) as Phaser.GameObjects.Text;
    btnTxt.setColor(canEsc ? '#FFFFFF' : '#666666');

    this.refreshTravelNav();
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
    const statLines = [
      `Resources found: ${summary.resourcesFound}`,
      `Exploration gained: +${summary.explorationGained}`,
    ];
    const statsTxt = makeText(this.scene, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20,
      statLines.join('\n'), 22, '#CCCCCC', { align: 'center' },
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

  /* ---- Level change ---- */

  refreshForNewLevel(): void {
    // Darker overlay for more dangerous levels
    const danger = this.state.level.danger;
    this.darkOverlay.setAlpha(0.45 + danger * 0.06);

    this.levelText.setText(this.state.level.name);
    this.subtitleText.setText(this.state.level.subtitle);
    this.subtitleText.setColor(this.state.level.textColor);

    // Update depth counter
    if (this.state.totalDepth > 0 || this.state.prestigeCount > 0) {
      this.depthText.setText(`DEPTH: ${this.state.totalDepth}`);
    }

    // Reset focal showcase for the new level
    this.clearShowcase();

    // Clear void prompt banner + dot (conditions may have changed after rewind)
    if (this.voidPromptBanner) { this.voidPromptBanner.destroy(); this.voidPromptBanner = null; }
    if (this.voidNotifDot) { this.voidNotifDot.destroy(); this.voidNotifDot = null; }

    this.addLogMessage({
      type: 'system',
      message: this.state.level.description,
      color: this.state.level.textColor,
    });
    this.addLogMessage({
      type: 'system',
      message: 'You begin exploring...',
      color: '#AAAAAA',
    });
  }
}
