import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { GameState, type GameEvent, type OfflineSummary } from '../GameState';
import { IAP_BUNDLES, SHARD_PACKS, ENTITIES } from '../data/GameData';
import { TICK_INTERVAL_MS, SAVE_INTERVAL_MS } from '../config';
import { haptic, bindHapticsSetting } from '../haptics';
import type { Big } from '../num';

/**
 * Framework-free game engine for the React UI (replaces GameScene's loop).
 * Owns the GameState, the tick/save clocks, SDK persistence, offline progress,
 * and premium boot checks. React subscribes via useSyncExternalStore: every
 * loop pass bumps a version counter, and components read this.state directly.
 */
export class GameController {
  /** Reassigned only by resetProgress(); everything reads it live. */
  state = new GameState();

  private version = 0;
  private listeners = new Set<() => void>();
  private loopHandle: number | null = null;
  private lastNow = 0;
  private tickAcc = 0;
  private saveAcc = 0;

  /** Latest flavor-worthy event (entity/ambient/system) for the explore line. */
  flavor: { evt: GameEvent; at: number } | null = null;
  /** One-shot offline haul, cleared once the UI has shown it. */
  welcomeBack: OfflineSummary | null = null;
  /** serverTime − Date.now(); null until the first successful sync. */
  serverTimeOffset: number | null = null;
  subActive = false;

  /* ---- React subscription plumbing ---- */

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getVersion = (): number => this.version;

  private bump(): void {
    this.version++;
    for (const cb of this.listeners) cb();
  }

  /* ---- Boot ---- */

  async boot(): Promise<void> {
    bindHapticsSetting(() => this.state.hapticsEnabled);
    await this.loadGame();
    void this.initPremium();
    this.lastNow = performance.now();
    // 100ms cadence: smooth enough for bar easing, cheap enough to not matter.
    this.loopHandle = window.setInterval(() => this.loop(), 100);
    this.scheduleMoth();
    this.schedulePhantom();
    RundotGameAPI.analytics.recordCustomEvent('game_started', { level: this.state.currentLevel, ui: 'react' });
    this.bump();
  }

  destroy(): void {
    if (this.loopHandle !== null) window.clearInterval(this.loopHandle);
    this.loopHandle = null;
    if (this.mothTimer !== null) window.clearTimeout(this.mothTimer);
    this.mothTimer = null;
    if (this.phantomTimer !== null) window.clearTimeout(this.phantomTimer);
    this.phantomTimer = null;
  }

  private loop(): void {
    const now = performance.now();
    const delta = Math.min(now - this.lastNow, 2000);   // clamp tab-sleep jumps
    this.lastNow = now;
    const s = this.state;

    s.advanceRespawn(delta);
    for (const evt of s.advanceEntity(delta)) this.noteEvent(evt);
    s.advanceLighting(delta);
    s.advanceHype(delta);

    this.tickAcc += delta;
    while (this.tickAcc >= TICK_INTERVAL_MS) {
      this.tickAcc -= TICK_INTERVAL_MS;
      const result = s.processTick();
      for (const evt of result.events) this.noteEvent(evt);
    }

    this.saveAcc += delta;
    if (this.saveAcc >= SAVE_INTERVAL_MS) {
      this.saveAcc = 0;
      void this.saveGame();
    }

    this.bump();
  }

  private noteEvent(evt: GameEvent): void {
    // Resource pickups are shown by the counters; text line is for the rest.
    if (evt.type !== 'resource') this.flavor = { evt, at: Date.now() };
  }

  /* ---- Player actions (explore v1 surface; grows with each migrated screen) ---- */

  /** Manual tap. Returns the hit so the UI can float the damage number. */
  search(): { damage: Big; crit: boolean; superCrit: boolean } | null {
    const hit = this.state.manualSearch();
    if (!hit.struck) return null;
    for (const evt of hit.events) this.noteEvent(evt);
    haptic(hit.superCrit ? 'heavy' : hit.crit ? 'medium' : 'light');
    this.bump();
    return { damage: hit.damage, crit: hit.crit, superCrit: hit.superCrit };
  }

  /* ---- Moth collectible (ported from UIManager's scheduler) ---- */

  /** The moth in flight, or null. `top` = % down the stage; duration = flight ms. */
  moth: { id: number; top: number; duration: number } | null = null;
  private mothSeq = 0;
  private mothTimer: number | null = null;

  private scheduleMoth(): void {
    if (this.mothTimer !== null) window.clearTimeout(this.mothTimer);
    // ~40s jittered; Moth Lure (void) divides the wait, up to 2× as frequent.
    const delay = (35_000 + Math.random() * 10_000) / this.state.mothRateMult;
    this.mothTimer = window.setTimeout(() => {
      this.spawnMoth();
      this.scheduleMoth();
    }, delay);
  }

  private spawnMoth(): void {
    if (this.moth) return;
    const id = ++this.mothSeq;
    // Two empty bands: above the node art, or below it.
    const top = Math.random() < 0.5 ? 6 + Math.random() * 12 : 62 + Math.random() * 14;
    const duration = 9_000 + Math.random() * 4_000;
    this.moth = { id, top, duration };
    this.bump();
    // Trapper: roll auto-capture once — snags it mid-flight unless tapped first.
    if (Math.random() < this.state.autoCaptureChance) {
      window.setTimeout(() => {
        if (this.moth?.id === id) this.catchMoth();
      }, 700 + Math.random() * 1_100);
    }
    // Flew away uncaught.
    window.setTimeout(() => {
      if (this.moth?.id === id) {
        this.moth = null;
        this.bump();
      }
    }, duration);
  }

  /* ---- Phantom collectible (dark phases only) ---- *
   * A faint entity from THIS floor's roster fades in; tapping it stares it
   * down: a resource burst + −20 Noise. At most one, dark-phase gated. */

  phantom: { id: number; iconKey: string; emoji: string; x: number; y: number } | null = null;
  private phantomSeq = 0;
  private phantomTimer: number | null = null;

  private schedulePhantom(): void {
    if (this.phantomTimer !== null) window.clearTimeout(this.phantomTimer);
    this.phantomTimer = window.setTimeout(() => {
      this.trySpawnPhantom();
      this.schedulePhantom();
    }, 8_000 + Math.random() * 7_000);
  }

  private trySpawnPhantom(): void {
    if (this.phantom || this.state.lighting !== 'dark' || this.state.entityActive) return;
    const roster = this.state.level.entityIds.map((id) => ENTITIES[id]).filter((e) => e?.iconKey);
    const pick = roster.length > 0 ? roster[Math.floor(Math.random() * roster.length)] : ENTITIES['smiler'];
    const id = ++this.phantomSeq;
    this.phantom = {
      id,
      iconKey: pick.iconKey ?? 'smiler',
      emoji: pick.icon,
      x: 12 + Math.random() * 66,   // % across the stage
      y: 15 + Math.random() * 45,   // % down the stage
    };
    this.bump();
    // Fades back into the dark if ignored.
    window.setTimeout(() => {
      if (this.phantom?.id === id) {
        this.phantom = null;
        this.bump();
      }
    }, 6_000);
  }

  catchPhantom(): void {
    if (!this.phantom) return;
    this.phantom = null;
    const { gain, events } = this.state.collectPhantom();
    for (const evt of events) this.noteEvent(evt);
    haptic('medium');
    this.showToast(`Stared it down: +${gain} · −20 Noise`, '#9FB4FF');
    RundotGameAPI.analytics.recordCustomEvent('phantom_caught', { gain });
  }

  /** Last moth catch — the explore screen floats it over the node like a hit. */
  lastMothCatch: { id: number; gain: number } | null = null;

  catchMoth(): void {
    if (!this.moth) return;
    const id = this.moth.id;
    this.moth = null;
    const { gain, events } = this.state.collectMoth();
    for (const evt of events) this.noteEvent(evt);
    haptic('medium');
    this.lastMothCatch = { id, gain };
    RundotGameAPI.analytics.recordCustomEvent('moth_collected');
    this.bump();
  }

  activateHype(): boolean {
    if (!this.state.activateHype()) return false;
    haptic('medium');
    this.showToast(`HYPE! ×${this.state.hypeMultiplier} auto search for ${this.state.hypeDuration / 1000}s`, '#FFD24A');
    return true;
  }

  /** ▶ / descend banner: travel into unlocked floors, escape into new ones. */
  descend(): void {
    const s = this.state;
    if (s.unlockedLevels.includes(s.currentLevel + 1)) {
      if (s.travelTo(s.currentLevel + 1)) this.afterFloorChange();
    } else if (s.canEscape() && s.escape()) {
      RundotGameAPI.analytics.recordCustomEvent('level_escaped', { to_level: s.currentLevel, ui: 'react' });
      this.afterFloorChange();
    }
  }

  /** ◀ back up a floor. */
  ascend(): void {
    const s = this.state;
    if (s.currentLevel > 0 && s.travelTo(s.currentLevel - 1)) this.afterFloorChange();
  }

  private afterFloorChange(): void {
    haptic('success');
    // Shard awards AND the flee-penalty toll surface as toasts — they matter
    // on every tab, not just where the flavor line lives.
    for (const evt of this.state.collectShardAwards()) this.showToast(evt.message, evt.color);
    void this.saveGame();
    this.bump();
  }

  clearWelcomeBack(): void {
    this.welcomeBack = null;
    this.bump();
  }

  /* ---- Toasts (screen-independent event line, e.g. purchases/shard awards) ---- */

  toast: { msg: string; color: string; at: number } | null = null;

  private showToast(msg: string, color: string): void {
    this.toast = { msg, color, at: Date.now() };
    this.bump();
  }

  /* ---- Economy actions ---- */

  buyUpgrade(id: string): void {
    if (!this.state.buyUpgrade(id)) return;
    haptic('light');
    for (const evt of this.state.collectShardAwards()) this.showToast(evt.message, evt.color);
    this.bump();
  }

  buyShopUpgrade(id: string): void {
    if (!this.state.buyShopUpgrade(id)) return;
    haptic('success');
    void this.saveGame();
    this.bump();
  }

  toggleHideMaxed(): void {
    this.state.hideMaxedUpgrades = !this.state.hideMaxedUpgrades;
    this.bump();
  }

  /* ---- Gear ---- */

  craftGear(id: string): void {
    if (!this.state.craftGear(id)) return;
    haptic('success');
    void this.saveGame();
    this.bump();
  }

  equipGear(id: string): void {
    if (!this.state.equipGear(id)) return;
    haptic('light');
    void this.saveGame();
    this.bump();
  }

  levelGear(id: string): void {
    if (!this.state.levelGear(id)) return;
    haptic('light');
    void this.saveGame();
    this.bump();
  }

  dismantleGear(id: string): void {
    const scrap = this.state.dismantleGear(id);
    if (scrap <= 0) return;
    haptic('medium');
    this.showToast(`Dismantled — +${scrap} Scrap`, '#FFB84A');
    void this.saveGame();
  }

  /* ---- Void / rewind ---- */

  buyVoidUpgrade(id: string): void {
    if (!this.state.buyVoidUpgrade(id)) return;
    haptic('light');
    void this.saveGame();
    this.bump();
  }

  rewind(): void {
    if (!this.state.canRewind()) return;
    const fragments = this.state.rewind();
    haptic('heavy');
    this.showToast(`REWIND — +${fragments} Void Fragments`, '#CC88FF');
    RundotGameAPI.analytics.recordCustomEvent('prestige_rewind', { fragments });
    void this.saveGame();
  }

  /* ---- Achievements / consumables ---- */

  claimAchievement(id: string): void {
    if (!this.state.claimAchievement(id)) return;
    haptic('success');
    void this.saveGame();
    this.bump();
  }

  /* ---- RUN-currency purchases (ported from GameScene premium handlers) ---- */

  runBalance: number | null = null;

  async refreshRunBalance(): Promise<void> {
    try {
      this.runBalance = await RundotGameAPI.iap.getHardCurrencyBalance();
    } catch (err) {
      RundotGameAPI.log(`[Premium] balance fetch failed: ${err}`);
      this.runBalance = null;
    }
    this.bump();
  }

  async buyIap(id: string): Promise<void> {
    const def = IAP_BUNDLES.find((b) => b.id === id);
    if (!def || this.state.ownsIap(id) || !this.state.iapUnlocked(def)) return;
    try {
      const res = await RundotGameAPI.iap.spendCurrency(def.id, def.price, {
        screenName: 'shop', description: def.name,
      });
      void this.refreshRunBalance();
      if (!res.success) {
        if (res.error !== 'USER_CANCELLED') this.showToast(`Purchase failed: ${res.error ?? 'unknown error'}`, '#FF6666');
        return;
      }
      this.state.grantIap(def);
      await this.saveGame();
      haptic('success');
      this.showToast(`${def.name} unlocked!`, '#CC88FF');
      RundotGameAPI.analytics.recordCustomEvent('iap_bundle_purchased', { id, price: def.price });
    } catch (err) {
      RundotGameAPI.log(`[Premium] ${id} purchase error: ${err}`);
    }
    this.bump();
  }

  async buyShardPack(id: string): Promise<void> {
    const pack = SHARD_PACKS.find((p) => p.id === id);
    if (!pack) return;
    try {
      const res = await RundotGameAPI.iap.spendCurrency(pack.id, pack.price, {
        screenName: 'shop', description: `${pack.shards} Void Shards`,
      });
      void this.refreshRunBalance();
      if (!res.success) {
        if (res.error !== 'USER_CANCELLED') this.showToast(`Purchase failed: ${res.error ?? 'unknown error'}`, '#FF6666');
        return;
      }
      const { granted, doubled } = this.state.grantShardPack(pack);
      await this.saveGame();
      haptic('success');
      this.showToast(doubled ? `FIRST PACK ×2! +${granted} Void Shards` : `+${granted} Void Shards`, '#CC88FF');
      RundotGameAPI.analytics.recordCustomEvent('shard_pack_purchased', {
        id, price: pack.price, shards: granted, first_purchase_bonus: doubled ? 1 : 0,
      });
    } catch (err) {
      RundotGameAPI.log(`[Premium] ${id} purchase error: ${err}`);
    }
    this.bump();
  }

  async subscribeRun(): Promise<void> {
    try {
      if (await RundotGameAPI.iap.isUserSubscribed('PLUS')) {
        this.subActive = true;
        this.state.subActive = true;
        this.bump();
        return;
      }
      const res = await RundotGameAPI.iap.purchaseSubscription('PLUS', 'monthly');
      if (!res.success) return;
      this.subActive = true;
      this.state.subActive = true;
      haptic('success');
      this.showToast('RUN PLUS active — +50% resources, ×2 offline, +1 daily shard', '#FFD24A');
      RundotGameAPI.analytics.recordCustomEvent('subscription_purchased', { tier: 'PLUS' });
    } catch (err) {
      RundotGameAPI.log(`[Premium] subscribe error: ${err}`);
    }
    this.bump();
  }

  /* ---- Settings / reset ---- */

  toggleHaptics(): void {
    this.state.hapticsEnabled = !this.state.hapticsEnabled;
    void this.saveGame();
    this.bump();
  }

  /**
   * Wipe the run. Normal reset keeps paid goods and refunds PURCHASED shards
   * (even spent ones); hard reset (testing tool) torches everything.
   */
  async resetProgress(hard: boolean): Promise<void> {
    RundotGameAPI.analytics.recordCustomEvent('progress_reset', {
      level: this.state.currentLevel,
      total_depth: this.state.totalDepth,
      prestiges: this.state.prestigeCount,
      hard: hard ? 1 : 0,
      ui: 'react',
    });
    haptic('warning');
    const old = this.state;
    const fresh = new GameState();
    if (!hard) {
      fresh.voidAmplifier = old.voidAmplifier;
      fresh.iapOwned = [...old.iapOwned];
      fresh.firstPackBonusUsed = old.firstPackBonusUsed;
      fresh.dailyStreak = old.dailyStreak;
      fresh.dailyLastClaimDay = old.dailyLastClaimDay;
      fresh.voidShards = old.lifetimePurchasedShards;
      fresh.lifetimePurchasedShards = old.lifetimePurchasedShards;
    }
    fresh.subActive = this.subActive;
    this.state = fresh;
    this.flavor = null;
    await this.saveGame();
    this.bump();
  }

  /* ---- Special-offer pill ---- */

  /** Countdown label when the offer should show on explore, else null. */
  get offerCountdown(): string | null {
    if (this.serverTimeOffset === null) return null;
    const s = this.state;
    if (!(s.highestLevelReached >= 3 || s.currentLevel >= 3)) return null;
    const serverNow = Date.now() + this.serverTimeOffset;
    if (serverNow < s.offerSnoozedUntil) return null;
    const nextBundle = IAP_BUNDLES.find((b) => !s.ownsIap(b.id) && s.iapUnlocked(b));
    if (!nextBundle && this.subActive) return null;
    const msLeft = 86_400_000 - (serverNow % 86_400_000);
    const h = Math.floor(msLeft / 3_600_000);
    const m = Math.floor((msLeft % 3_600_000) / 60_000);
    return `${h}h${String(m).padStart(2, '0')}m`;
  }

  /** Pill tapped: it deep-linked to the shop; go quiet for an hour. */
  snoozeOffer(): void {
    if (this.serverTimeOffset === null) return;
    this.state.offerSnoozedUntil = Date.now() + this.serverTimeOffset + 3_600_000;
    void this.saveGame();
    this.bump();
  }

  /* ---- Daily rewards ---- */

  get serverDay(): number | null {
    return this.serverTimeOffset === null
      ? null
      : Math.floor((Date.now() + this.serverTimeOffset) / 86_400_000);
  }

  claimDaily(): { shards: number; streak: number } {
    const day = this.serverDay;
    if (day === null) return { shards: 0, streak: this.state.dailyStreak };
    const result = this.state.claimDailyReward(day);
    if (result.shards > 0) {
      haptic('success');
      void this.saveGame();
      RundotGameAPI.analytics.recordCustomEvent('daily_reward_claimed', {
        streak: result.streak, shards: result.shards,
      });
    }
    this.bump();
    return result;
  }

  /* ---- Persistence (same save key/shape as the Phaser build) ---- */

  async saveGame(): Promise<void> {
    try {
      await RundotGameAPI.appStorage.setItem('backrooms_save', JSON.stringify(this.state.toSaveData()));
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
        if (data.lastSaveTime) {
          const elapsed = Date.now() - data.lastSaveTime;
          if (elapsed > 5000) {
            const { summary } = this.state.processOfflineTime(elapsed);
            if (summary.minutes > 0) this.welcomeBack = summary;
          }
        }
      }
    } catch (err) {
      RundotGameAPI.log(`[Load] Error: ${err}`);
    }
  }

  private async initPremium(): Promise<void> {
    try {
      this.subActive = await RundotGameAPI.iap.isUserSubscribed('PLUS');
      this.state.subActive = this.subActive;
    } catch (err) {
      RundotGameAPI.log(`[Premium] subscription check failed: ${err}`);
    }
    try {
      const t = await RundotGameAPI.requestTimeAsync();
      this.serverTimeOffset = t.serverTime - Date.now();
    } catch (err) {
      RundotGameAPI.log(`[Premium] server time failed: ${err}`);
    }
    this.bump();
  }
}
