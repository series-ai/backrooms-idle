import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { GameController } from '../game/GameController';
import {
  RESOURCES, RESOURCE_ORDER, FLOOR_BASE_STAGES, PETS, UPGRADES, SHOP_UPGRADES, IAP_BUNDLES, SHARD_PACKS,
  GEAR, GEAR_SLOTS, GEAR_SLOT_ICONS, GEAR_SLOT_LABELS, GEAR_LEVEL_MAX, VOID_UPGRADES, ACHIEVEMENTS, REWIND_MIN_FLOOR,
  gearLevelCost, gearEffectSummary, getTierColor,
  getFloorOre, resourceKey, parseResourceKey, resourceKeyName, tierSuffix,
} from '../data/GameData';
import { GameState } from '../GameState';
import { fmt, D } from '../num';

/* Re-render on every controller loop pass (10Hz) — components read live state. */
function useGame(game: GameController): number {
  return useSyncExternalStore(game.subscribe, game.getVersion);
}

const TABS = [
  { id: 'explore', label: 'EXPLORE', icon: 'icons/explore_icon.png' },
  { id: 'upgrades', label: 'UPGRADES', icon: 'icons/upgrades_icon.png' },
  { id: 'gear', label: 'GEAR', icon: 'icons/gear_icon.png' },
  { id: 'items', label: 'ITEMS', icon: 'icons/items_icon.png' },
  { id: 'shop', label: 'SHOP', icon: 'icons/prestige/void_shard.png' },
  { id: 'void', label: 'VOID', icon: 'icons/void_icon.png' },
  { id: 'achievements', label: 'AWARDS', icon: 'icons/achievements_icon.png' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const resIcon = (id: string): string => ICON_OVERRIDES[id] ?? `icons/resources/${id}.png`;

/**
 * Central icon resolver (mirrors GameScene's registry): PNG art ALWAYS wins;
 * emoji is a last resort only for ids with no art anywhere. Overrides cover
 * ids whose art lives outside their category folder or uses CamelCase files.
 */
const ICON_OVERRIDES: Record<string, string> = {
  moth_powers: 'icons/entities/moth.png',
  moth: 'icons/entities/moth.png',   // the Moth RESOURCE's art also lives in entities/
  lamp: 'icons/resources/lamp.png',
  duct_tape: 'icons/resources/duct_tape.png',
  mre: 'icons/resources/mre.png',
  radio: 'icons/resources/radio.png',
  lucky_foot: 'icons/equipment/lucky_rabbits_foot.png',
  pipe_pistol: 'icons/equipment/PipePistol.png',
  scrap_shotgun: 'icons/equipment/ScrapShotgun.png',
  salvaged_ar: 'icons/equipment/SalvagedAR.png',
  impossible_gun: 'icons/equipment/ImpossibleGun.png',
  pet_static: 'icons/pets/Static.png',
  pet_snapshot: 'icons/pets/Snapshot.png',
  pet_balloon: 'icons/pets/PartyBalloon.png',
  pet_cat: 'icons/pets/BlackCat.png',
};
const PET_ICONS = ICON_OVERRIDES;
/** Entity art with CamelCase/renamed files (all others are icons/entities/<key>.png). */
const ENTITY_ICON_FILES: Record<string, string> = {
  wretched: 'the_wretched.png',
  crimson_watcher: 'CrimsonWatcher.png',
  ink_crawler: 'InkCrawler.png',
  archivist: 'TheArchivist.png',
  frost_shade: 'FrostShade.png',
};
const entityIcon = (key: string): string => `icons/entities/${ENTITY_ICON_FILES[key] ?? `${key}.png`}`;

/** Colored glow marking a tier-2+ resource pool (tier 1 = none). */
function tierGlow(tier: number): React.CSSProperties | undefined {
  const color = getTierColor(tier);
  if (color === null) return undefined;
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  return { filter: `drop-shadow(0 0 8px ${hex}) drop-shadow(0 6px 12px rgba(0,0,0,0.7))` };
}
const upgIcon = (id: string): string => ICON_OVERRIDES[id] ?? `icons/upgrades/${id}.png`;
const gearIcon = (id: string): string => ICON_OVERRIDES[id] ?? `icons/equipment/${id}.png`;

export function App({ game }: { game: GameController }): React.ReactElement {
  useGame(game);
  const [tab, setTab] = useState<TabId>('explore');
  const [dailyOpen, setDailyOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [petOpen, setPetOpen] = useState<string | null>(null);
  const s = game.state;

  // Where the shop opens: the chooser normally, or a specific sub-shop when
  // deep-linked (the offer pill goes straight to premium).
  const [shopEntry, setShopEntry] = useState<'menu' | 'shards' | 'premium'>('menu');

  const openTab = (id: TabId, entry: 'menu' | 'shards' | 'premium' = 'menu'): void => {
    if (id === 'shop') {
      setShopEntry(entry);
      void game.refreshRunBalance();
    }
    setTab(id);
  };

  // Auto-pop the daily reward once the server clock syncs and a claim is waiting
  // (after the welcome-back modal is out of the way).
  const day = game.serverDay;
  const dailyWaiting = day !== null && s.dailyRewardAvailable(day) && !game.welcomeBack;
  useEffect(() => {
    if (dailyWaiting) setDailyOpen(true);
  }, [dailyWaiting]);

  return (
    <>
      {/* Lighting moods — OUTSIDE the app column, at the very bottom of the
          stack: below the scrim (#app::before) and below the column's frame,
          so bright/dark can never paint over either. */}
      <div className="bg-layer bg-bright" style={{ opacity: s.lighting === 'bright' ? 1 : 0 }} />
      <div className="bg-layer bg-dark" style={{ opacity: s.lighting === 'dark' ? 1 : 0 }} />

    <div className="app">
      <header className="header card">
        <div className="header-col">
          <button className="header-btn" onClick={() => setStatsOpen(true)}>STATS</button>
          <button className="header-btn" onClick={() => setDailyOpen(true)}>📅</button>
        </div>
        <div className="header-center">
          <FitText className="header-title" text={s.level.name} />
          <div className="header-floor">FLOOR {s.currentLevel}</div>
        </div>
        <div className="header-col">
          <button className="header-btn" onClick={() => setSettingsOpen(true)}>⚙</button>
        </div>
      </header>

      <DescendBanner game={game} />

      <main className={`content ${tab === 'explore' ? 'content-stage' : 'content-scroll'}`}>
        {tab === 'explore' && <ExploreScreen game={game} onPetTap={setPetOpen} onShop={() => openTab('shop', 'premium')} />}
        {tab === 'upgrades' && <UpgradesScreen game={game} />}
        {tab === 'shop' && <ShopScreen game={game} entry={shopEntry} />}
        {tab === 'gear' && <GearScreen game={game} />}
        {tab === 'items' && <ItemsScreen game={game} onVoid={() => openTab('void')} />}
        {tab === 'void' && <VoidScreen game={game} />}
        {tab === 'achievements' && <AchievementsScreen game={game} />}
        {tab === 'explore' && s.lighting === 'bright' && (
          <div className="dust" aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={`mote mote-${i}`} />)}
          </div>
        )}
        {tab === 'explore' && game.phantom && (
          <button
            key={game.phantom.id}
            className="phantom"
            style={{ left: `${game.phantom.x}%`, top: `${game.phantom.y}%` }}
            onPointerDown={() => game.catchPhantom()}
            aria-label="A phantom in the dark"
          >
            <GameIcon className="phantom-img" src={entityIcon(game.phantom.iconKey)} emoji={game.phantom.emoji} />
          </button>
        )}
        {tab === 'explore' && game.moth && (
          <button
            key={game.moth.id}
            className="moth"
            style={{ top: `${game.moth.top}%`, animationDuration: `${game.moth.duration}ms` }}
            onPointerDown={() => game.catchMoth()}
          >
            <img className="moth-img" src="icons/entities/moth.png" alt="moth" draggable={false} />
          </button>
        )}
      </main>

      {tab === 'explore' && <ResourceBar game={game} />}

      <nav className="tabs">
        {TABS.map((t) => {
          // Red pip: something is waiting on that tab (only shown from OTHER tabs).
          const pip = tab !== t.id && (
            (t.id === 'explore' && s.canDescendToNew())
            || (t.id === 'upgrades' && s.hasAffordableUpgrade())
            || (t.id === 'gear' && s.hasCraftableGear())
            || (t.id === 'shop' && s.hasAffordableShopUpgrade())
            || (t.id === 'void' && s.hasAffordableVoidUpgrade())
            || (t.id === 'achievements' && s.hasClaimableAchievement())
          );
          return (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'tab-active' : ''}`}
              onClick={() => openTab(t.id)}
            >
              <img className="tab-icon" src={t.icon} alt="" />
              <span>{t.label}</span>
              {pip && <span className="tab-pip">!</span>}
            </button>
          );
        })}
      </nav>

      <Toast game={game} />
      {game.welcomeBack && <WelcomeBack game={game} />}
      {dailyOpen && <DailyModal game={game} onClose={() => setDailyOpen(false)} />}
      {settingsOpen && <SettingsModal game={game} onClose={() => setSettingsOpen(false)} />}
      {statsOpen && <StatsModal game={game} onClose={() => setStatsOpen(false)} />}
      {petOpen && <PetModal game={game} petId={petOpen} onClose={() => setPetOpen(null)} />}
    </div>
    </>
  );
}

/**
 * Single-line text that SHRINKS to fit its container (via transform, so the
 * layout box never changes size) — long floor titles can't push the UI around.
 */
function FitText({ text, className }: { text: string; className?: string }): React.ReactElement {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    i.style.transform = 'none';
    const scale = Math.min(1, o.clientWidth / Math.max(1, i.scrollWidth));
    i.style.transform = scale < 1 ? `scale(${scale})` : 'none';
  }, [text]);
  return (
    <div ref={outer} className={`fit-text ${className ?? ''}`}>
      <span ref={inner}>{text}</span>
    </div>
  );
}

/** Screen-independent event line (purchases, shard awards). */
function Toast({ game }: { game: GameController }): React.ReactElement | null {
  const t = game.toast;
  if (!t || Date.now() - t.at > 3500) return null;
  return <div className="toast" style={{ color: t.color }}>{t.msg}</div>;
}

function DescendBanner({ game }: { game: GameController }): React.ReactElement {
  const s = game.state;
  const ore = s.floorOre;
  const oreName = (RESOURCES[ore.resource]?.name ?? ore.resource) + tierSuffix(ore.tier);
  const done = s.canEscape();
  const pct = Math.min(100, Math.max(0, s.explorationPct));
  // A pure progress strip — NO text, ever. When the floor completes it pulses
  // ready-green and taps descend (the ▶ nav card is the labeled affordance).
  return (
    <button
      className={`descend descend-slim ${done ? 'descend-ready' : ''}`}
      onClick={() => done && game.descend()}
      aria-label={done ? `${oreName} — descend` : `Exploring for ${oreName}, ${Math.floor(pct)}%`}
    >
      <div className="descend-fill" style={{ width: `${pct}%` }} />
    </button>
  );
}

type FloatHit = { id: number; text: string; crit: boolean; superCrit: boolean; x: number };

function ExploreScreen({ game, onPetTap, onShop }: {
  game: GameController; onPetTap: (id: string) => void; onShop: () => void;
}): React.ReactElement {
  const s = game.state;
  const ore = s.floorOre;
  const holdTimer = useRef<number | null>(null);
  const floatSeq = useRef(0);
  const [floats, setFloats] = useState<FloatHit[]>([]);
  const [popId, setPopId] = useState(0);

  const doSearch = (): void => {
    const hit = game.search();
    if (!hit) return;
    const id = ++floatSeq.current;
    setFloats((f) => [...f.slice(-6), {
      id,
      text: hit.superCrit ? `SUPER CRIT -${fmt(hit.damage)}` : hit.crit ? `CRIT -${fmt(hit.damage)}` : `-${fmt(hit.damage)}`,
      crit: hit.crit,
      superCrit: hit.superCrit,
      x: 20 + Math.random() * 60,   // % across the node, jittered per hit
    }]);
    setPopId(id);
    setTimeout(() => setFloats((f) => f.filter((h) => h.id !== id)), 800);
  };

  // Moth catches float over the node like damage numbers (gold, with wings).
  const mothCatchId = game.lastMothCatch?.id ?? 0;
  useEffect(() => {
    if (!game.lastMothCatch) return;
    const { gain } = game.lastMothCatch;
    const id = ++floatSeq.current;
    setFloats((f) => [...f.slice(-6), {
      id, text: `+${gain} 🦋`, crit: true, superCrit: false, x: 30 + Math.random() * 40,
    }]);
    setTimeout(() => setFloats((f) => f.filter((h) => h.id !== id)), 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mothCatchId]);

  const startHold = (): void => {
    doSearch();
    holdTimer.current = window.setInterval(doSearch, 160);
  };
  const stopHold = (): void => {
    if (holdTimer.current !== null) window.clearInterval(holdTimer.current);
    holdTimer.current = null;
  };

  const integ = s.nodeIntegrityMax;
  const remaining = integ.sub(s.nodeDamage).max(0);
  const remainPct = Math.max(0, Math.min(1, remaining.div(integ.max(1)).toNumber()));

  const [baseOpen, setBaseOpen] = useState(false);
  const [hypeFade, setHypeFade] = useState(0);
  // Buddy antics: tap him to stop-and-chat; tap anywhere to steer his facing.
  const [chatting, setChatting] = useState(false);
  const [faceLeft, setFaceLeft] = useState(false);
  const chatTimer = useRef<number | null>(null);
  const flavor = game.flavor && Date.now() - game.flavor.at < 4500 ? game.flavor.evt : null;
  const nextRes = getFloorOre(s.currentLevel + 1).resource;
  const prevRes = s.currentLevel > 0 ? getFloorOre(s.currentLevel - 1).resource : null;
  const nextUnlocked = s.unlockedLevels.includes(s.currentLevel + 1);
  const baseStage = s.floorBaseStage;
  const ownedPets = PETS.filter((p) => s.getPetLevel(p.id) > 0);
  const noisePct = s.entityActive ? 100 : s.noise;

  return (
    <div
      className="explore"
      onPointerDown={(e) => {
        // Tap left/right of center → he faces the tap (old buddy steering).
        const r = e.currentTarget.getBoundingClientRect();
        setFaceLeft(e.clientX < r.left + r.width / 2);
      }}
    >
      {/* Chip row: offer (left) · base (right). Small, in-flow, one line. */}
      <div className="chip-row">
        {game.offerCountdown ? (
          <button
            className="offer-pill"
            onClick={() => {
              onShop();
              game.snoozeOffer();
            }}
          >
            <span className="offer-title">OFFER</span>
            <span className="offer-timer">{game.offerCountdown}</span>
          </button>
        ) : <span />}
        <div className="chip-group">
          {ownedPets.map((p) => (
            <button key={p.id} className="pet-chip" onClick={() => onPetTap(p.id)} aria-label={p.name}>
              <GameIcon className="pet-chip-icon" src={PET_ICONS[p.iconKey] ?? ''} emoji={p.icon} />
            </button>
          ))}
          <button className="base-chip" onClick={() => setBaseOpen(true)}>
            ⛺ {baseStage}/{FLOOR_BASE_STAGES.length}
          </button>
        </div>
      </div>

      <button
        className="runner-wrap"
        onClick={() => {
          if (game.activateHype()) {
            setHypeFade((n) => n + 1);
            return;
          }
          // No hype to pop: he stops for a quick chat, then runs on.
          setChatting(true);
          if (chatTimer.current !== null) window.clearTimeout(chatTimer.current);
          chatTimer.current = window.setTimeout(() => setChatting(false), 2400);
        }}
      >
        <span className="runner-line" style={{ transform: `scaleX(${faceLeft ? -1 : 1})` }}>
          {/* Companions from Another Explorer run a step behind, starter suit. */}
          {Array.from({ length: Math.min(3, s.explorerCount - 1) }, (_, i) => (
            <div
              key={i}
              className={`runner runner-companion ${s.hypeActive ? 'runner-hyped' : ''}`}
              style={{ backgroundImage: 'url(sprites/OuterBuddies/buddy1.png)', animationDelay: `${(i + 1) * 0.18}s` }}
            />
          ))}
          <div
            className={`runner ${chatting ? 'runner-chat' : s.hypeActive ? 'runner-hyped' : ''}`}
            style={{
              backgroundImage: `url(sprites/OuterBuddies/buddy${Math.min(6, Math.max(1, s.buddySuit))}.png)`,
              // Sheet rows: run 13 (armed variants 14-17), chat 10.
              ['--row' as string]: chatting
                ? '10'
                : `${13 + (({ shotgun: 1, AR: 2, pistol: 3, gun: 4 } as Record<string, number>)[s.buddyWeaponStyle ?? ''] ?? 0)}`,
            }}
          />
        </span>
        {/* Pill sits just BELOW the sprite (may overlap the flavor line —
            deliberate; it never pushes layout). */}
        {s.hypeAvailable && <span className="hype-pill">HYPE!</span>}
        {hypeFade > 0 && !s.hypeAvailable && (
          <span key={hypeFade} className="hype-pill hype-fading">HYPE!</span>
        )}
      </button>

      <div className="flavor" style={{ color: flavor?.color ?? 'transparent' }}>
        {flavor ? `— ${flavor.message.toUpperCase()} —` : '·'}
      </div>

      <div className="stage-row">
        <button
          className="nav-card"
          disabled={prevRes === null}
          onClick={() => game.ascend()}
          aria-label={prevRes ? `Back up to ${RESOURCES[prevRes]?.name}` : 'No floor above'}
        >
          {prevRes && <img className="nav-icon" src={resIcon(prevRes)} alt="" />}
          <span className="nav-tri">◀</span>
        </button>

        <button
          className="node"
          onPointerDown={startHold}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
        >
          {floats.map((h) => (
            <span
              key={h.id}
              className={`float-hit ${h.superCrit ? 'float-super' : h.crit ? 'float-crit' : ''}`}
              style={{ left: `${h.x}%` }}
            >
              {h.text}
            </span>
          ))}
          {s.entityActive && s.activeEntity ? (
            <>
              {/* Encounter: the monster takes over the node — taps hit IT. */}
              <span key={popId} className={`node-art ${popId > 0 ? 'node-pop' : ''}`}>
                <GameIcon
                  className="node-icon entity-icon"
                  src={s.activeEntity.iconKey ? entityIcon(s.activeEntity.iconKey) : ''}
                  emoji={s.activeEntity.icon}
                />
              </span>
              <div className="bar bar-entity">
                <div
                  className="bar-fill bar-fill-danger"
                  style={{ width: `${Math.max(0, Math.min(1, s.entityPresence.div(s.entityPresenceMax.max(1)).toNumber())) * 100}%` }}
                />
                <span className="bar-text">{s.activeEntity.name} · {fmt(s.entityPresence)} / {fmt(s.entityPresenceMax)}</span>
              </div>
              <div className="node-entity">Tap to drive it off!</div>
            </>
          ) : (
            <>
              {/* Node grade tags — reserved slot so they never shift layout. */}
              <span className="node-tags">
                {!s.isRespawning && (s.nodeIsMint || s.nodeIsQuality) && (
                  <span className={`node-tag ${s.nodeIsMint ? 'tag-mint' : 'tag-quality'}`}>
                    {s.nodeIsMint ? 'MINT' : 'QUALITY'}
                  </span>
                )}
                {!s.isRespawning && s.nodeIsEasyAccess && (
                  <span className="node-tag tag-easy">EASY ACCESS</span>
                )}
              </span>
              <span key={popId} className={`node-art ${popId > 0 ? 'node-pop' : ''}`}>
                <img
                  className="node-icon"
                  src={resIcon(ore.resource)}
                  alt={RESOURCES[ore.resource]?.name}
                  draggable={false}
                  style={tierGlow(ore.tier)}
                />
              </span>
              {/* Simple textless durability strip. */}
              <div className="bar bar-amber bar-slim">
                <div className="bar-fill bar-fill-amber" style={{ width: `${remainPct * 100}%` }} />
              </div>
            </>
          )}
        </button>

        <button
          className={`nav-card ${!nextUnlocked && s.canEscape() ? 'nav-ready' : ''}`}
          disabled={!nextUnlocked && !s.canEscape()}
          onClick={() => game.descend()}
          aria-label={`Descend to ${RESOURCES[nextRes]?.name}`}
        >
          <img className="nav-icon" src={resIcon(nextRes)} alt="" />
          <span className="nav-tri">▶</span>
        </button>
      </div>

      {/* Noise: bare slim strip — no text. */}
      <div className="noise-row">
        <span className="noise-spk">🔊</span>
        <div className="bar bar-noise bar-slim">
          <div
            className={`bar-fill ${s.entityActive ? 'bar-fill-danger' : noisePct > 75 ? 'bar-fill-hot' : 'bar-fill-green'}`}
            style={{ width: `${Math.min(100, noisePct)}%` }}
          />
        </div>
      </div>

      {baseOpen && <BaseModal game={game} onClose={() => setBaseOpen(false)} />}
    </div>
  );
}

function ResourceBar({ game }: { game: GameController }): React.ReactElement {
  const s = game.state;
  const ore = s.floorOre;
  const count = s.resources[resourceKey(ore.resource, ore.tier)] ?? D(0);
  return (
    <div className="resource-bar card">
      <img className="resource-icon" src={resIcon(ore.resource)} alt="" />
      <span className="resource-name">{RESOURCES[ore.resource]?.name}{tierSuffix(ore.tier)}</span>
      <span className="resource-count">{fmt(count)}</span>
    </div>
  );
}

/** PNG icon with graceful fallback to an emoji glyph (generated floor upgrades have no art). */
function GameIcon({ src, emoji, className }: { src: string; emoji: string; className: string }): React.ReactElement {
  const [failed, setFailed] = useState(src === '');
  if (failed) return <span className={className}>{emoji}</span>;
  return <img className={className} src={src} alt="" onError={() => setFailed(true)} />;
}

function UpgradesScreen({ game }: { game: GameController }): React.ReactElement {
  const s = game.state;
  const [openId, setOpenId] = useState<string | null>(null);
  const visible = UPGRADES.filter((u) => {
    if (s.hideMaxedUpgrades && s.getUpgradeLevel(u.id) >= u.maxLevel) return false;
    return true;
  });
  return (
    <div className="list">
      {openId && <UpgradeModal game={game} id={openId} onClose={() => setOpenId(null)} />}
      <button className="btn btn-small" onClick={() => game.toggleHideMaxed()}>
        {s.hideMaxedUpgrades ? 'SHOW MAXED' : 'HIDE MAXED'}
      </button>
      {visible.map((u) => {
        const unlocked = s.isUpgradeUnlocked(u.id);
        const lvl = s.getUpgradeLevel(u.id);
        const maxed = lvl >= u.maxLevel;
        const costRes = s.getUpgradeCostResource(u.id);
        const canBuy = s.canAffordUpgrade(u.id);
        return (
          <div
            key={u.id}
            className={`row-card upg-row ${maxed ? 'row-card-maxed' : ''}`}
            onClick={() => unlocked && setOpenId(u.id)}
            role={unlocked ? 'button' : undefined}
          >
            {unlocked ? (
              <>
                <GameIcon className="row-icon" src={upgIcon(u.id)} emoji={u.icon} />
                <div className="upg-mid">
                  <div className="row-name">
                    {u.name} <span className="row-lvl">Lv {lvl}/{u.maxLevel}</span>
                  </div>
                  <div className="row-desc upg-desc">{u.description}</div>
                </div>
                {maxed ? (
                  <div className="upg-maxed">MAX</div>
                ) : (
                  <button
                    className="btn btn-buy upg-buy"
                    disabled={!canBuy}
                    onClick={(e) => {
                      e.stopPropagation();   // buy without opening the detail popup
                      game.buyUpgrade(u.id);
                    }}
                  >
                    <img className="row-cost-icon" src={resIcon(costRes)} alt={RESOURCES[costRes]?.name ?? costRes} />
                    <span className={canBuy ? 'cost-ok' : 'cost-short'}>
                      {fmt(s.resources[costRes] ?? D(0))}/{fmt(s.getUpgradeCost(u.id))}
                    </span>
                  </button>
                )}
              </>
            ) : (
              <div className="row-locked upg-locked">?????? — floor {u.unlockFloor}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Full-detail upgrade popup: whole description, current effect, big buy button. */
function UpgradeModal({ game, id, onClose }: { game: GameController; id: string; onClose: () => void }): React.ReactElement | null {
  const s = game.state;
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return null;
  const lvl = s.getUpgradeLevel(u.id);
  const maxed = lvl >= u.maxLevel;
  const costRes = s.getUpgradeCostResource(u.id);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <GameIcon className="modal-pet-icon" src={upgIcon(u.id)} emoji={u.icon} />
        <h2 className="modal-title modal-title-sm">{u.name}</h2>
        <p className="modal-dim">{u.description}</p>
        <div className="stat-rows">
          <div className="stat-row"><span className="stat-label">Level</span><span className="stat-value">{lvl} / {u.maxLevel}</span></div>
          <div className="stat-row">
            <span className="stat-label">Per level</span>
            <span className="stat-value">+{u.effectPerLevel}{u.effectUnit}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Current bonus</span>
            <span className="stat-value">+{+(u.effectPerLevel * lvl).toFixed(2)}{u.effectUnit}</span>
          </div>
        </div>
        {maxed ? (
          <div className="row-maxed">MAXED</div>
        ) : (
          <button
            className="btn btn-buy"
            disabled={!s.canAffordUpgrade(u.id)}
            onClick={() => game.buyUpgrade(u.id)}
          >
            <img className="modal-cost-icon" src={resIcon(costRes)} alt="" />
            <span className={s.canAffordUpgrade(u.id) ? 'cost-ok' : 'cost-short'}>
              {fmt(s.resources[costRes] ?? D(0))}/{fmt(s.getUpgradeCost(u.id))}
            </span>
            &nbsp;{RESOURCES[costRes]?.name ?? costRes}
          </button>
        )}
        <button className="btn" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}

function ShopScreen({ game, entry }: { game: GameController; entry: 'menu' | 'shards' | 'premium' }): React.ReactElement {
  const s = game.state;
  const [openId, setOpenId] = useState<string | null>(null);
  const [openPremium, setOpenPremium] = useState<string | null>(null);
  // Two sub-shops: void-shard spending vs RUN-currency premium. Landing shows
  // a chooser (or the deep-linked sub-shop, e.g. from the offer pill); the
  // sticky balance chips switch between them from inside.
  const [sub, setSub] = useState<'menu' | 'shards' | 'premium'>(entry);
  useEffect(() => { void game.refreshRunBalance(); }, [game]);

  if (sub === 'menu') {
    return (
      <div className="list">
        {/* Same balance bar as inside the sub-shops — a quick balance check
            without committing to either menu (and the chips still navigate). */}
        <div className="shop-header shop-header-sticky">
          <button className="shop-switch" onClick={() => setSub('shards')}>
            <img className="row-cost-icon" src="icons/prestige/void_shard.png" alt="" />
            <b>{s.voidShards}</b>&nbsp;Void Shards
          </button>
          <button className="shop-switch" onClick={() => setSub('premium')}>
            RUN: {game.runBalance === null ? '…' : game.runBalance.toLocaleString()}
          </button>
        </div>
        <button className="shop-choice" onClick={() => setSub('shards')}>
          <img className="shop-choice-icon" src="icons/prestige/void_shard.png" alt="" />
          <span className="shop-choice-name name-purple">VOID SHARD SHOP</span>
          <span className="row-desc">Spend {s.voidShards} Void Shards on permanent upgrades</span>
          {s.hasAffordableShopUpgrade() && <span className="tab-pip">!</span>}
        </button>
        <button className="shop-choice shop-choice-gold" onClick={() => setSub('premium')}>
          <span className="shop-choice-icon shop-choice-emoji">★</span>
          <span className="shop-choice-name name-gold">RUN PREMIUM</span>
          <span className="row-desc">Bundles, shard packs & RUN PLUS</span>
        </button>
      </div>
    );
  }

  return (
    <div className="list">
      {openId && <ShopUpgradeModal game={game} id={openId} onClose={() => setOpenId(null)} />}
      {openPremium && <PremiumModal game={game} id={openPremium} onClose={() => setOpenPremium(null)} />}
      {/* Sticky balances double as sub-shop switches. */}
      <div className="shop-header shop-header-sticky">
        <button
          className={`shop-switch ${sub === 'shards' ? 'shop-switch-active' : ''}`}
          onClick={() => setSub('shards')}
        >
          <img className="row-cost-icon" src="icons/prestige/void_shard.png" alt="" />
          <b>{s.voidShards}</b>&nbsp;Void Shards
        </button>
        <button
          className={`shop-switch ${sub === 'premium' ? 'shop-switch-active' : ''}`}
          onClick={() => setSub('premium')}
        >
          RUN: {game.runBalance === null ? '…' : game.runBalance.toLocaleString()}
        </button>
      </div>

      {sub === 'premium' && IAP_BUNDLES.map((b) => {
        const owned = s.ownsIap(b.id);
        const locked = !s.iapUnlocked(b);
        const gate = b.requires ? IAP_BUNDLES.find((o) => o.id === b.requires) : undefined;
        return (
          <div
            key={b.id}
            className={`row-card upg-row premium-card ${b.iceBreaker ? 'premium-ice' : ''}`}
            onClick={() => setOpenPremium(b.id)}
            role="button"
          >
            <span className="row-icon">{b.icon}</span>
            <div className="upg-mid">
              <div className={`row-name ${b.iceBreaker ? 'name-green' : 'name-purple'}`}>{b.name}</div>
              <div className="row-desc upg-desc">{b.desc}</div>
            </div>
            {owned ? (
              <div className="upg-maxed">OWNED</div>
            ) : locked ? (
              <div className="upg-maxed" title={`Unlocks after ${gate?.name}`}>🔒</div>
            ) : (
              <button
                className="btn btn-buy btn-gold upg-buy"
                onClick={(e) => {
                  e.stopPropagation();
                  void game.buyIap(b.id);
                }}
              >
                <span>{b.price}</span>
                <span>RUN</span>
              </button>
            )}
          </div>
        );
      })}

      {sub === 'premium' && !s.firstPackBonusUsed && <div className="pack-note">★ FIRST SHARD PACK PAYS DOUBLE ★</div>}
      {sub === 'premium' && <div className="pack-grid">
        {SHARD_PACKS.map((p) => (
          <div key={p.id} className="row-card pack-card">
            <div className="pack-head">
              <img className="row-icon" src="icons/prestige/void_shard.png" alt="" />
              <span className="name-purple">{p.shards} SHARDS</span>
              {p.bonusPct > 0 && <span className="pack-bonus">+{p.bonusPct}%</span>}
            </div>
            <button className="btn btn-buy" onClick={() => void game.buyShardPack(p.id)}>{p.price} RUN</button>
          </div>
        ))}
      </div>}

      {sub === 'premium' && <div className="row-card upg-row premium-card" onClick={() => setOpenPremium('sub')} role="button">
        <span className="row-icon">★</span>
        <div className="upg-mid">
          <div className="row-name name-gold">RUN PLUS</div>
          <div className="row-desc upg-desc">+50% resources · ×2 offline cap · +1 daily shard. Monthly subscription.</div>
        </div>
        {game.subActive ? (
          <div className="upg-maxed">ACTIVE</div>
        ) : (
          <button
            className="btn btn-buy btn-gold upg-buy"
            onClick={(e) => {
              e.stopPropagation();
              void game.subscribeRun();
            }}
          >
            <span>SUB</span>
          </button>
        )}
      </div>}

      {sub === 'shards' && SHOP_UPGRADES.map((sup) => {
        const lvl = s.getShopLevel(sup.id);
        const maxed = lvl >= sup.maxLevel;
        return (
          <div
            key={sup.id}
            className={`row-card upg-row ${maxed ? 'row-card-maxed' : ''}`}
            onClick={() => setOpenId(sup.id)}
            role="button"
          >
            <GameIcon className="row-icon" src={sup.iconTexture ? (ICON_OVERRIDES[sup.iconTexture] ?? '') : ''} emoji={sup.icon} />
            <div className="upg-mid">
              <div className="row-name">
                {sup.name} <span className="row-lvl">Lv {lvl}/{sup.maxLevel}</span>
              </div>
              <div className="row-desc upg-desc">{sup.description}</div>
            </div>
            {maxed ? (
              <div className="upg-maxed">MAX</div>
            ) : (
              <button
                className="btn btn-buy upg-buy"
                disabled={!s.canAffordShopUpgrade(sup.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  game.buyShopUpgrade(sup.id);
                }}
              >
                <img className="row-cost-icon" src="icons/prestige/void_shard.png" alt="Void Shards" />
                <span>{s.getShopUpgradeCost(sup.id)}</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Shard-pack purchase popup — the store's pack grid, anywhere. */
function ShardPackModal({ game, onClose }: { game: GameController; onClose: () => void }): React.ReactElement {
  const s = game.state;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title modal-title-sm">VOID SHARD PACKS</h2>
        <p className="modal-dim">
          RUN balance: {game.runBalance === null ? '…' : game.runBalance.toLocaleString()}
        </p>
        {!s.firstPackBonusUsed && <div className="pack-note">★ FIRST SHARD PACK PAYS DOUBLE ★</div>}
        <div className="pack-grid">
          {SHARD_PACKS.map((p) => (
            <div key={p.id} className="row-card pack-card">
              <div className="pack-head">
                <img className="row-icon" src="icons/prestige/void_shard.png" alt="" />
                <span className="name-purple">{p.shards} SHARDS</span>
                {p.bonusPct > 0 && <span className="pack-bonus">+{p.bonusPct}%</span>}
              </div>
              <button className="btn btn-buy" onClick={() => void game.buyShardPack(p.id)}>{p.price} RUN</button>
            </div>
          ))}
        </div>
        <button className="btn" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}

/** Full-detail premium popup: bundles ('sub' = the subscription). */
function PremiumModal({ game, id, onClose }: { game: GameController; id: string; onClose: () => void }): React.ReactElement | null {
  const s = game.state;
  if (id === 'sub') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal card" onClick={(e) => e.stopPropagation()}>
          <span className="modal-pet-icon">★</span>
          <h2 className="modal-title modal-title-sm">RUN PLUS</h2>
          <p className="modal-dim">+50% resources · ×2 offline cap · +1 daily shard, every day. Monthly subscription, billed through RUN.</p>
          {game.subActive ? (
            <div className="row-maxed">ACTIVE — thank you!</div>
          ) : (
            <button className="btn btn-buy btn-gold" onClick={() => void game.subscribeRun()}>SUBSCRIBE</button>
          )}
          <button className="btn" onClick={onClose}>CLOSE</button>
        </div>
      </div>
    );
  }
  const b = IAP_BUNDLES.find((x) => x.id === id);
  if (!b) return null;
  const owned = s.ownsIap(b.id);
  const locked = !s.iapUnlocked(b);
  const gate = b.requires ? IAP_BUNDLES.find((o) => o.id === b.requires) : undefined;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <span className="modal-pet-icon">{b.icon}</span>
        <h2 className="modal-title modal-title-sm">{b.name}</h2>
        <p className="modal-dim">{b.desc}</p>
        <div className="stat-rows">
          {b.grantsAmplifier && <div className="stat-row"><span className="stat-label">Permanent</span><span className="stat-value">×2 ALL resource gains</span></div>}
          {b.shards > 0 && <div className="stat-row"><span className="stat-label">Void Shards</span><span className="stat-value">+{b.shards}</span></div>}
          {b.scrap > 0 && <div className="stat-row"><span className="stat-label">Scrap</span><span className="stat-value">+{b.scrap}</span></div>}
        </div>
        {owned ? (
          <div className="row-maxed">OWNED</div>
        ) : locked ? (
          <div className="row-locked">🔒 Unlocks after {gate?.name}</div>
        ) : (
          <button className="btn btn-buy btn-gold" onClick={() => void game.buyIap(b.id)}>
            {b.price} RUN — BUY
          </button>
        )}
        <button className="btn" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}

/** Full-detail shard-shop popup — same pattern as the upgrade popup. */
function ShopUpgradeModal({ game, id, onClose }: { game: GameController; id: string; onClose: () => void }): React.ReactElement | null {
  const s = game.state;
  const sup = SHOP_UPGRADES.find((x) => x.id === id);
  if (!sup) return null;
  const lvl = s.getShopLevel(sup.id);
  const maxed = lvl >= sup.maxLevel;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <GameIcon className="modal-pet-icon" src={sup.iconTexture ? (ICON_OVERRIDES[sup.iconTexture] ?? '') : ''} emoji={sup.icon} />
        <h2 className="modal-title modal-title-sm">{sup.name}</h2>
        <p className="modal-dim">{sup.description}</p>
        <div className="stat-rows">
          <div className="stat-row"><span className="stat-label">Level</span><span className="stat-value">{lvl} / {sup.maxLevel}</span></div>
          <div className="stat-row"><span className="stat-label">Per level</span><span className="stat-value">+{sup.effectPerLevel}{sup.effectUnit}</span></div>
          <div className="stat-row"><span className="stat-label">Current bonus</span><span className="stat-value">+{+(sup.effectPerLevel * lvl).toFixed(2)}{sup.effectUnit}</span></div>
        </div>
        {maxed ? (
          <div className="row-maxed">MAXED</div>
        ) : (
          <button
            className="btn btn-buy"
            disabled={!s.canAffordShopUpgrade(sup.id)}
            onClick={() => game.buyShopUpgrade(sup.id)}
          >
            <img className="modal-cost-icon" src="icons/prestige/void_shard.png" alt="" />
            {s.getShopUpgradeCost(sup.id)} Void Shards
          </button>
        )}
        <button className="btn" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}

function DailyModal({ game, onClose }: { game: GameController; onClose: () => void }): React.ReactElement {
  const s = game.state;
  const day = game.serverDay;
  const available = day !== null && s.dailyRewardAvailable(day);
  const preview = available && day !== null
    ? s.nextDailyReward(day)
    : { streak: Math.max(1, s.dailyStreak), shards: 0 };
  const track = GameState.DAILY_REWARDS;
  const todayIdx = (preview.streak - 1) % track.length;
  const [claimed, setClaimed] = useState<number | null>(null);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">DAILY REWARD</h2>
        <p className="modal-dim">Day {preview.streak} streak</p>
        <div className="daily-track">
          {track.map((amt, i) => {
            const isToday = i === todayIdx && available;
            const done = i < todayIdx || (i === todayIdx && !available);
            return (
              <div key={i} className={`daily-slot ${isToday ? 'daily-today' : ''} ${done ? 'daily-done' : ''}`}>
                <span className="daily-day">D{i + 1}</span>
                <span className="daily-amt">{amt}</span>
              </div>
            );
          })}
        </div>
        {available ? (
          <>
            <div className="daily-payout">+{claimed ?? preview.shards} <span className="name-purple">Void Shards</span></div>
            {game.subActive && <p className="modal-dim">includes +1 RUN PLUS bonus shard</p>}
            {claimed === null ? (
              <button
                className="btn btn-green"
                onClick={() => {
                  const r = game.claimDaily();
                  if (r.shards > 0) {
                    setClaimed(r.shards);
                    setTimeout(onClose, 900);
                  } else onClose();
                }}
              >
                CLAIM
              </button>
            ) : (
              <div className="row-maxed">+{claimed} CLAIMED!</div>
            )}
          </>
        ) : (
          <>
            <div className="daily-claimed">✓ Claimed today</div>
            <p className="modal-dim">Come back tomorrow to keep the streak alive.</p>
            <button className="btn" onClick={onClose}>CLOSE</button>
          </>
        )}
      </div>
    </div>
  );
}

/** Two-tap destructive confirm: first tap arms for 2.5s, second fires. */
function ConfirmButton({ label, armedLabel, className, onConfirm }: {
  label: string; armedLabel: string; className?: string; onConfirm: () => void;
}): React.ReactElement {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 2500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={`btn ${className ?? ''} ${armed ? 'btn-armed' : ''}`}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
    >
      {armed ? armedLabel : label}
    </button>
  );
}

/** Total equipped-loadout bonuses, one line (ported from the old gear panel). */
function loadoutSummary(s: GameState): string {
  const parts: string[] = [];
  const eff = (key: Parameters<GameState['gearEffect']>[0]): number => +s.gearEffect(key).toFixed(1);
  const push = (val: number, text: string): void => { if (val > 0) parts.push(text); };
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
  return parts.length > 0 ? `Loadout: ${parts.join(' · ')}` : 'Nothing equipped — craft gear below.';
}

function GearScreen({ game }: { game: GameController }): React.ReactElement {
  const s = game.state;
  const [bagFullFor, setBagFullFor] = useState<string | null>(null);
  const [itemOpen, setItemOpen] = useState<string | null>(null);
  const bagCap = Math.max(s.gearInventorySize, s.gearInventory.length);
  // Unlocked (craftable) gear first; locked ?????? cards sink to the bottom.
  const craftList = GEAR.filter((g) => !s.gearIsOwned(g.id))
    .sort((a, b) => Number(s.isGearUnlocked(b.id)) - Number(s.isGearUnlocked(a.id)));
  return (
    <div className="list">
      {bagFullFor && <BagFullModal game={game} craftId={bagFullFor} onClose={() => setBagFullFor(null)} />}
      {itemOpen && <GearItemModal game={game} id={itemOpen} onClose={() => setItemOpen(null)} />}

      {/* Loadout: one box per slot — equipped art, tap to inspect/level. */}
      <div className="slot-grid">
        {GEAR_SLOTS.map((slot) => {
          const id = s.gearEquipped[slot];
          const g = id ? GEAR.find((x) => x.id === id) : undefined;
          const lvl = g ? (s.gearLevels[g.id] ?? 0) : 0;
          return (
            <div key={slot} className="slot-col">
              <div className="slot-label">{GEAR_SLOT_ICONS[slot]} {GEAR_SLOT_LABELS[slot]}</div>
              <button className="slot-box" onClick={() => g && setItemOpen(g.id)}>
                {g
                  ? <GameIcon className="slot-art" src={g.iconTexture ? gearIcon(g.iconTexture) : ''} emoji={g.icon} />
                  : <span className="slot-dash">--</span>}
                {g && s.canLevelGear(g.id) && <span className="tab-pip">!</span>}
              </button>
              <div className="slot-name">{g ? `${g.name}${lvl > 0 ? ` Lv${lvl}` : ''}` : ''}</div>
            </div>
          );
        })}
      </div>

      <div className="loadout-line">{loadoutSummary(s)}</div>
      <div className="gear-meta">
        <GameIcon className="row-cost-icon" src="icons/equipment/Scrap.png" emoji="🔩" />
        &nbsp;Scrap: <b>{s.scrap}</b>&nbsp;·&nbsp;Gear Rating: <b>{s.gearRating}</b>
      </div>

      {/* The bag: benched gear that survives Rewind. Tap to equip/scrap. */}
      <div className="bag-label">🎒 BAG {s.gearInventory.length}/{s.gearInventorySize}</div>
      <div className="bag-grid" style={{ gridTemplateColumns: `repeat(${bagCap}, 1fr)` }}>
        {Array.from({ length: bagCap }, (_, i) => {
          const id = s.gearInventory[i];
          const g = id ? GEAR.find((x) => x.id === id) : undefined;
          return (
            <button key={i} className="slot-box bag-box" onClick={() => g && setItemOpen(g.id)}>
              {g
                ? <GameIcon className="slot-art" src={g.iconTexture ? gearIcon(g.iconTexture) : ''} emoji={g.icon} />
                : <span className="slot-dash">--</span>}
            </button>
          );
        })}
      </div>

      <div className="craft-divider"><span>CRAFT NEW GEAR</span></div>
      <div className="craft-grid">
        {craftList.map((g) => {
          if (!s.isGearUnlocked(g.id)) {
            return (
              <div key={g.id} className="row-card craft-card craft-card-locked">
                <div className="row-name">??????</div>
                <div className="row-desc">(Locked)</div>
                <div className="row-desc">Reach Floor {g.unlockFloor} to reveal.</div>
                <div className="btn craft-locked-btn">🔒 LOCKED</div>
              </div>
            );
          }
          return (
            <div key={g.id} className="row-card craft-card">
              <div className="craft-head">
                <GameIcon className="row-cost-icon" src={g.iconTexture ? gearIcon(g.iconTexture) : ''} emoji={g.icon} />
                <span className="row-name">{g.name}</span>
                <span className="craft-slot-tag">{GEAR_SLOT_LABELS[g.slot]}</span>
              </div>
              <div className="row-desc name-green">{gearEffectSummary(g)}</div>
              {s.gearIsDismantled(g.id) ? (
                <div className="row-locked">Scrapped this run — back after Rewind</div>
              ) : (
                <button
                  className="btn btn-buy craft-btn"
                  disabled={!s.canAffordGear(g.id)}
                  onClick={() => {
                    if (s.craftBlockedByFullInventory(g.id)) setBagFullFor(g.id);
                    else game.craftGear(g.id);
                  }}
                >
                  <span>CRAFT</span>
                  {g.cost.map((c) => {
                    const have = s.resources[c.resourceId] ?? D(0);
                    const ok = have.gte(c.amount);
                    return (
                      <span key={c.resourceId} className={`craft-cost ${ok ? 'cost-ok' : 'cost-short'}`}>
                        <img className="craft-cost-icon" src={resIcon(c.resourceId)} alt="" />
                        {fmt(ok ? D(c.amount) : have)}/{c.amount}
                      </span>
                    );
                  })}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Gear item popup: inspect an equipped or bagged piece — level, equip, scrap. */
function GearItemModal({ game, id, onClose }: { game: GameController; id: string; onClose: () => void }): React.ReactElement | null {
  const s = game.state;
  const g = GEAR.find((x) => x.id === id);
  if (!g) return null;
  const lvl = s.gearLevels[g.id] ?? 0;
  const equipped = s.gearIsEquipped(g.id);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <GameIcon className="modal-pet-icon" src={g.iconTexture ? gearIcon(g.iconTexture) : ''} emoji={g.icon} />
        <h2 className="modal-title modal-title-sm">{g.name}{lvl > 0 ? ` +${lvl}` : ''}</h2>
        <p className="modal-dim">{GEAR_SLOT_LABELS[g.slot]}{equipped ? ' · EQUIPPED' : ' · in bag'}</p>
        <p className="modal-dim">{g.description}</p>
        <div className="stat-rows">
          <div className="stat-row"><span className="stat-label">Effects</span><span className="stat-value name-green">{gearEffectSummary(g)}</span></div>
          <div className="stat-row"><span className="stat-label">Level</span><span className="stat-value">{lvl} / {GEAR_LEVEL_MAX}{lvl > 0 ? ` (+${lvl * 10}% base effects)` : ''}</span></div>
        </div>
        {lvl < GEAR_LEVEL_MAX && (
          <button className="btn btn-buy" disabled={!s.canLevelGear(g.id)} onClick={() => game.levelGear(g.id)}>
            LEVEL UP → Lv {lvl + 1} · {gearLevelCost(g, lvl)} Scrap
          </button>
        )}
        {!equipped && (
          <button className="btn btn-green" onClick={() => { game.equipGear(g.id); onClose(); }}>EQUIP</button>
        )}
        {!equipped && (
          <ConfirmButton label="SCRAP" armedLabel="SURE?" className="btn-danger" onConfirm={() => { game.dismantleGear(g.id); onClose(); }} />
        )}
        <button className="btn" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}

/**
 * Bag full: crafting benches the equipped piece and there's no room. Scrap a
 * benched item to make space — the pending craft completes automatically.
 */
function BagFullModal({ game, craftId, onClose }: { game: GameController; craftId: string; onClose: () => void }): React.ReactElement {
  const s = game.state;
  const pending = GEAR.find((g) => g.id === craftId);
  const bagged = s.gearInventory
    .map((id) => GEAR.find((g) => g.id === id))
    .filter((g): g is (typeof GEAR)[number] => !!g);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card modal-scroll" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title modal-title-sm">BAG FULL</h2>
        <p className="modal-dim">
          Crafting {pending?.name} benches your equipped piece, but the bag is full.
          Scrap something to make room — the craft finishes on its own.
        </p>
        {bagged.map((g) => (
          <div key={g.id} className="row-card upg-row">
            <GameIcon className="row-icon" src={g.iconTexture ? gearIcon(g.iconTexture) : ''} emoji={g.icon} />
            <div className="upg-mid">
              <div className="row-name">{g.name}{(s.gearLevels[g.id] ?? 0) > 0 ? ` +${s.gearLevels[g.id]}` : ''}</div>
              <div className="row-desc upg-desc">{gearEffectSummary(g)}</div>
            </div>
            <ConfirmButton
              label="SCRAP"
              armedLabel="SURE?"
              className="btn-danger"
              onConfirm={() => {
                game.dismantleGear(g.id);
                game.craftGear(craftId);
                onClose();
              }}
            />
          </div>
        ))}
        <button className="btn" onClick={onClose}>CANCEL</button>
      </div>
    </div>
  );
}

function ItemsScreen({ game, onVoid }: { game: GameController; onVoid: () => void }): React.ReactElement {
  const s = game.state;
  const [packsOpen, setPacksOpen] = useState(false);
  // Curated resource order (RESOURCE_ORDER), tiers grouped after their base.
  const orderOf = (key: string): number => {
    const { resource, tier } = parseResourceKey(key);
    const i = RESOURCE_ORDER.indexOf(resource);
    return (i === -1 ? RESOURCE_ORDER.length : i) * 100 + tier;
  };
  const pools = Object.entries(s.resources)
    .filter(([, v]) => v.gt(0))
    .sort(([a], [b]) => orderOf(a) - orderOf(b));
  return (
    <div className="list">
      {packsOpen && <ShardPackModal game={game} onClose={() => setPacksOpen(false)} />}
      {/* Prestige currency balances, pinned while the inventory scrolls.
          Tapping the shard balance offers shard packs, store-style. */}
      <div className="shop-header shop-header-sticky">
        <button
          className="shop-switch"
          onClick={() => {
            void game.refreshRunBalance();
            setPacksOpen(true);
          }}
        >
          <img className="row-cost-icon" src="icons/prestige/void_shard.png" alt="" />
          <b>{s.voidShards}</b>&nbsp;Void Shards
        </button>
        {/* Fragments are spent on the Void tab — the chip takes you there. */}
        <button className="shop-switch" onClick={onVoid}>
          <img className="row-cost-icon" src="icons/prestige/void_fragment.png" alt="" />
          <b>{s.voidFragments}</b>&nbsp;Void Fragments
        </button>
      </div>
      {pools.length === 0 && <div className="row-card"><div className="row-locked">Nothing collected yet.</div></div>}
      {pools.map(([key, val]) => {
        const { resource } = parseResourceKey(key);
        return (
          <div key={key} className="row-card item-row">
            <GameIcon className="row-icon" src={resIcon(resource)} emoji={RESOURCES[resource]?.icon ?? '❔'} />
            <span className="row-name">{resourceKeyName(key)}</span>
            <span className="resource-count">{fmt(val)}</span>
          </div>
        );
      })}
    </div>
  );
}

function VoidScreen({ game }: { game: GameController }): React.ReactElement {
  const s = game.state;
  const canRewind = s.canRewind();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="list">
      {openId && <VoidUpgradeModal game={game} id={openId} onClose={() => setOpenId(null)} />}
      {/* Sticky: fragments + rewind count stay pinned while scrolling. */}
      <div className="shop-header shop-header-sticky">
        <div className="shop-shards">
          <img className="row-cost-icon" src="icons/prestige/void_fragment.png" alt="" />
          <b>{s.voidFragments}</b>&nbsp;Void Fragments
        </div>
        <div className="shop-run">Rewinds: {s.prestigeCount}</div>
      </div>

      {/* REWIND is the biggest decision in the game — it gets a hero panel,
          not a row. The fragment payout is the loudest number on screen. */}
      <div className={`rewind-hero ${canRewind ? 'rewind-ready' : ''}`}>
        <div className="rewind-title">🌀 REWIND</div>
        <div className="row-desc">
          Collapse the run back to Floor 0. Gear, Void Shards, Scrap, pets and bases survive.
        </div>
        {canRewind ? (
          <>
            <div className="rewind-reward">
              <img className="rewind-frag-icon" src="icons/prestige/void_fragment.png" alt="" />
              <span className="rewind-amount">+{s.calculateRewindFragments()}</span>
            </div>
            <div className="rewind-reward-label">VOID FRAGMENTS ON REWIND</div>
            <ConfirmButton
              label="REWIND"
              armedLabel="SURE? The run ends now."
              className="btn-buy btn-rewind"
              onConfirm={() => game.rewind()}
            />
          </>
        ) : (
          <div className="row-locked">Reach floor {REWIND_MIN_FLOOR} to Rewind</div>
        )}
      </div>

      {VOID_UPGRADES.map((v) => {
        const lvl = s.getVoidLevel(v.id);
        const maxed = lvl >= v.maxLevel;
        return (
          <div
            key={v.id}
            className={`row-card upg-row ${maxed ? 'row-card-maxed' : ''}`}
            onClick={() => setOpenId(v.id)}
            role="button"
          >
            <span className="row-icon">{v.icon}</span>
            <div className="upg-mid">
              <div className="row-name">
                {v.name} <span className="row-lvl">Lv {lvl}/{v.maxLevel}</span>
              </div>
              <div className="row-desc upg-desc">{v.description}</div>
            </div>
            {maxed ? (
              <div className="upg-maxed">MAX</div>
            ) : (
              <button
                className="btn btn-buy upg-buy"
                disabled={!s.canAffordVoidUpgrade(v.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  game.buyVoidUpgrade(v.id);
                }}
              >
                <img className="row-cost-icon" src="icons/prestige/void_fragment.png" alt="Void Fragments" />
                <span>{s.getVoidUpgradeCost(v.id)}</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Full-detail void-upgrade popup — same pattern as the upgrade popup. */
function VoidUpgradeModal({ game, id, onClose }: { game: GameController; id: string; onClose: () => void }): React.ReactElement | null {
  const s = game.state;
  const v = VOID_UPGRADES.find((x) => x.id === id);
  if (!v) return null;
  const lvl = s.getVoidLevel(v.id);
  const maxed = lvl >= v.maxLevel;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <span className="modal-pet-icon">{v.icon}</span>
        <h2 className="modal-title modal-title-sm">{v.name}</h2>
        <p className="modal-dim">{v.description}</p>
        <div className="stat-rows">
          <div className="stat-row"><span className="stat-label">Level</span><span className="stat-value">{lvl} / {v.maxLevel}</span></div>
          <div className="stat-row"><span className="stat-label">Per level</span><span className="stat-value">+{v.effectPerLevel}{v.effectUnit}</span></div>
          <div className="stat-row"><span className="stat-label">Current bonus</span><span className="stat-value">+{+(v.effectPerLevel * lvl).toFixed(2)}{v.effectUnit}</span></div>
        </div>
        {maxed ? (
          <div className="row-maxed">MAXED</div>
        ) : (
          <button
            className="btn btn-buy"
            disabled={!s.canAffordVoidUpgrade(v.id)}
            onClick={() => game.buyVoidUpgrade(v.id)}
          >
            <img className="modal-cost-icon" src="icons/prestige/void_fragment.png" alt="" />
            {s.getVoidUpgradeCost(v.id)} Void Fragments
          </button>
        )}
        <button className="btn" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}

function AchievementsScreen({ game }: { game: GameController }): React.ReactElement {
  const s = game.state;
  return (
    <div className="list">
      {/* Sticky shard balance — watch it tick up as you claim tiers. */}
      <div className="shop-header shop-header-sticky">
        <div className="shop-shards">
          <img className="row-cost-icon" src="icons/prestige/void_shard.png" alt="" />
          <b>{s.voidShards}</b>&nbsp;Void Shards
        </div>
      </div>
      {ACHIEVEMENTS.map((a) => {
        const lvl = s.getAchievementLevel(a.id);
        const maxed = lvl >= a.thresholds.length;
        const progress = s.getAchievementProgress(a.stat);
        const threshold = maxed ? a.thresholds[a.thresholds.length - 1] : a.thresholds[lvl];
        const pct = Math.min(100, (progress / threshold) * 100);
        const claimable = s.canClaimAchievement(a.id);
        return (
          <div key={a.id} className={`row-card ${maxed ? 'row-card-maxed' : ''}`}>
            <div className="row-head">
              <div className="row-name">🏆 {a.name}</div>
              <div className="row-lvl">Tier {lvl}/{a.thresholds.length}</div>
            </div>
            <div className="row-desc">{a.description}</div>
            <div className="bar bar-noise">
              <div className="bar-fill bar-fill-green" style={{ width: `${pct}%` }} />
              <span className="bar-text">{maxed ? 'MAXED' : `${fmt(D(progress))} / ${fmt(D(threshold))}`}</span>
            </div>
            {claimable && (
              <button className="btn btn-buy" onClick={() => game.claimAchievement(a.id)}>
                <img className="row-cost-icon" src="icons/prestige/void_shard.png" alt="" />
                CLAIM +{s.getAchievementReward(a.id)} Void Shards
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BaseModal({ game, onClose }: { game: GameController; onClose: () => void }): React.ReactElement {
  const s = game.state;
  const stage = s.floorBaseStage;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">⛺ FLOOR BASE</h2>
        <p className="modal-dim">
          {stage > 0
            ? `${FLOOR_BASE_STAGES[stage - 1].name} (${stage}/${FLOOR_BASE_STAGES.length}) — permanent on this floor`
            : 'No base on this floor yet. Every node break rolls a chance to build.'}
        </p>
        <div className="stat-rows">
          {FLOOR_BASE_STAGES.map((st, i) => {
            const built = i < stage;
            const isNext = i === stage;
            return (
              <div key={st.name} className="stat-row">
                <span className="stat-label" style={{ color: built ? '#9fd06a' : undefined }}>
                  {built ? '✓' : isNext ? '▸' : '·'} {st.name}
                </span>
                <span className="stat-value" style={{ color: built ? '#9fd06a' : isNext ? undefined : '#777' }}>
                  {built ? st.desc : isNext ? `${st.desc} — 1-in-${Math.round(st.chance / s.baseChanceMult)} per break` : st.desc}
                </span>
              </div>
            );
          })}
        </div>
        <button className="btn" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}

function SettingsModal({ game, onClose }: { game: GameController; onClose: () => void }): React.ReactElement {
  const s = game.state;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card modal-scroll" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">SETTINGS</h2>
        <p className="modal-dim">Backrooms Escape Idle · v2.0.0 · Created by cbarker</p>

        <h3 className="modal-section">HAPTICS</h3>
        <button className={`btn ${s.hapticsEnabled ? 'btn-green' : ''}`} onClick={() => game.toggleHaptics()}>
          HAPTICS: {s.hapticsEnabled ? 'ON' : 'OFF'}
        </button>

        <h3 className="modal-section modal-section-danger">RESET PROGRESS</h3>
        <p className="modal-dim">Permanently erase your save and start over.</p>
        <p className="modal-keep">
          ✓ Purchases & subscription are kept<br />
          ✓ All PURCHASED Void Shards refunded — even spent ones
        </p>
        <ConfirmButton
          label="RESET"
          armedLabel="SURE? This cannot be undone."
          className="btn-danger"
          onConfirm={() => { onClose(); void game.resetProgress(false); }}
        />
        <ConfirmButton
          label="HARD RESET (testing) — wipes purchases too"
          armedLabel="SURE? Everything goes, even purchases."
          className="btn-danger btn-small-text"
          onConfirm={() => { onClose(); void game.resetProgress(true); }}
        />

        <button className="btn" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}

function StatsModal({ game, onClose }: { game: GameController; onClose: () => void }): React.ReactElement {
  const s = game.state;
  const rows: [string, string][] = [
    ['Rewinds', `${s.prestigeCount}`],
    ['Lifetime floors descended', `${s.totalDepth.toLocaleString()}`],
    ['Tap power', fmt(s.clickPower)],
    ['Auto search', `${s.autoPerSecond}/s`],
    ['Explorer 1', `${s.explorerAuto(0)}/s auto`],
    ['Lucky Find (Crit %)', `${Math.round(s.critChance * 100)}%  ×${+s.critMult.toFixed(2)}`],
    ['Node respawn', `${s.nodeRespawnTime} ms`],
    ['Hype boost', `×${s.hypeMultiplier} auto for ${s.hypeDuration / 1000}s`],
    ['Hype cooldown', `${Math.round(s.hypeCooldown / 60000)} min`],
    ['Auto-Capture (Moth)', `${Math.round(s.autoCaptureChance * 100)}%`],
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
    const i = rows.findIndex(([l]) => l.startsWith('Lucky Find'));
    rows.splice(i + 1, 0, ['Super Crit (Static)', `${s.petStaticLevel}%  ×${s.superCritMult}`]);
  }
  if (s.voidPowerMult > 1) rows.splice(1, 0, ['Void Resonance', `×${+s.voidPowerMult.toFixed(2)} all power`]);
  if (s.explorerCount > 1) {
    const i = rows.findIndex(([l]) => l.startsWith('Explorer 1'));
    rows.splice(i + 1, 0, ['Explorers', `${s.explorerCount} (each +${s.explorerSharedAuto}/s)`]);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card modal-scroll" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">STATS</h2>
        <div className="stat-rows">
          {rows.map(([label, val]) => (
            <div key={label} className="stat-row">
              <span className="stat-label">{label}</span>
              <span className="stat-value">{val}</span>
            </div>
          ))}
        </div>
        <button className="btn" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}

function PetModal({ game, petId, onClose }: { game: GameController; petId: string; onClose: () => void }): React.ReactElement | null {
  const s = game.state;
  const pet = PETS.find((p) => p.id === petId);
  if (!pet) return null;
  const lvl = s.getPetLevel(petId);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{pet.name.toUpperCase()}</h2>
        <GameIcon className="modal-pet-icon" src={PET_ICONS[pet.iconKey] ?? ''} emoji={pet.icon} />
        <p className="modal-dim">{pet.description}</p>
        <div className="stat-rows">
          <div className="stat-row"><span className="stat-label">Level</span><span className="stat-value">{lvl} / {pet.maxLevel}</span></div>
          <div className="stat-row"><span className="stat-label">{pet.bonusLabel}</span><span className="stat-value">+{+(lvl * pet.bonusPerLevel).toFixed(2)}%</span></div>
          <div className="stat-row">
            <span className="stat-label">Grows</span>
            <span className="stat-value">{lvl >= pet.maxLevel ? 'MAX level' : `1-in-${s.petLevelUpOdds(petId)} per ${pet.growsOn}`}</span>
          </div>
          {pet.milestones.map((m) => (
            <div key={m.level} className="stat-row">
              <span className="stat-label">Lv {m.level} bonus</span>
              <span className="stat-value" style={{ color: lvl >= m.level ? '#7CFF7C' : '#777' }}>{m.desc}</span>
            </div>
          ))}
        </div>
        <button className="btn" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}

function WelcomeBack({ game }: { game: GameController }): React.ReactElement {
  const wb = game.welcomeBack;
  if (!wb) return <></>;
  const timeStr = wb.minutes >= 60 ? `${Math.floor(wb.minutes / 60)}h ${wb.minutes % 60}m` : `${wb.minutes}m`;
  return (
    <div className="modal-overlay">
      <div className="modal card">
        <h2 className="modal-title">WELCOME BACK</h2>
        <p className="modal-dim">You were away for {timeStr}</p>
        <div className="modal-stat">
          <span className="modal-stat-label">RESOURCES FOUND</span>
          <span className="modal-stat-value">{wb.resourcesFound}</span>
        </div>
        <button className="btn btn-green" onClick={() => game.clearWelcomeBack()}>CONTINUE</button>
      </div>
    </div>
  );
}
