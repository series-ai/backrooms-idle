# Backrooms: Idle Survival — Game Design Document

---

## 1. Overview

An idle/clicker survival game set in the Backrooms. The player explores procedurally-described levels, collects resources, fights (or avoids) entities, upgrades their character, and escapes deeper into the Backrooms.

**Current state:** A basic idle loop across 6 levels with 8 resources, 8 upgrades, and 5 entity types. The game ends after Level 4 (Abandoned Office) with no replay incentive.

---

## 2. Current Systems

### 2.1 Core Tick Loop
- Runs every 1.5 seconds
- Each tick: gain exploration, passive regen, sanity drain, auto-heal, random event roll
- Random events: 25% resource find attempt, ~25-29% entity encounter (scales with danger), ~35% ambient message, ~11-15% nothing

### 2.2 Exploration
- Each level has an `explorationRequired` value (100 -> 250 -> 500 -> 400 -> 750 -> 1000)
- Each tick adds `1 * explorationSpeed` to progress
- Reaching 100% is required to escape (plus a Level Key)
- **Resets to 0** when escaping or traveling to a different level

### 2.3 Resources (8 total)
| Resource | Use |
|---|---|
| Almond Water | Drink for +15 HP. Buys Regeneration upgrade |
| Canned Food | Eat for +20 Sanity. Buys Iron Will & Meditation |
| Batteries | Buys Sharp Eyes (find rate) |
| Cloth Scraps | Buys Quick Feet & Quiet Steps |
| Scrap Metal | Buys Thick Skin (damage reduction) |
| Firesalt | Auto-consumed to block one monster attack |
| Lucky Coins | Buys Scavenger (double loot chance) |
| Level Keys | Required to escape to the next level |

### 2.4 Upgrades (8 total)
| Upgrade | Max | Effect per Level | Cost Resource |
|---|---|---|---|
| Quick Feet | 20 | +15% explore speed | Cloth Scraps |
| Sharp Eyes | 20 | +20% find rate | Batteries |
| Thick Skin | 15 | +10% damage reduction | Scrap Metal |
| Iron Will | 15 | +10% sanity drain reduction | Canned Food |
| Quiet Steps | 15 | +8% entity avoidance | Cloth Scraps |
| Scavenger | 15 | +7% double loot chance | Lucky Coins |
| Regeneration | 10 | +0.5 HP/tick | Almond Water |
| Meditation | 10 | +0.5 Sanity/tick | Canned Food |

### 2.5 Entities (5 types)
| Entity | Damage | Sanity Damage | Found on |
|---|---|---|---|
| Smiler | 8 | 5 | Levels 0, 2, 4 |
| Hound | 12 | 3 | Levels 0, 1, 4 |
| Skin-Stealer | 15 | 15 | Levels 1, 2, 3, 4 |
| Partygoer | 18 | 20 | Levels 2, 3, 3, 4 |
| The Wretched | 30 | 25 | Levels 3, 4 |

Combat resolution order: Avoidance check -> Firesalt auto-use -> Take damage

### 2.6 Levels (6 total)
| # | Name | Danger | Explore Required | Specialty Drops |
|---|---|---|---|---|
| 0 | The Lobby | 1 | 100 | Cloth, Water |
| 1 | Habitable Zone | 2 | 250 | Metal, Batteries |
| 2 | Pipe Dreams | 3 | 500 | Metal, Batteries, Firesalt |
| 3 | The Poolrooms | 2 | 400 | Water, Coins, Firesalt |
| 4 | Electrical Station | 4 | 750 | Batteries, Metal, Coins |
| 5 | Abandoned Office | 5 | 1000 | Everything equal |

### 2.7 Death
- Triggers at 0 HP or 0 Sanity
- Penalty: respawn at 50% HP/Sanity, lose 30% exploration, lose 30% of non-key/non-coin resources
- Not permanent -- game continues

### 2.8 Offline Progress
- Processes up to 200 ticks (~5 minutes of idle time)
- Only gains exploration and resources (no combat, no entity encounters)
- Capped regardless of how long the player is away

### 2.9 Save System
- Auto-saves every 30 seconds to platform storage
- Saves all state: level, resources, upgrades, stats, exploration

---

## 3. System Connections Map

```
TICK LOOP (1.5s)
  |
  +---> Exploration ---> 100%? ---> Need Level Key ---> ESCAPE ---> Next Level
  |                                                                   |
  +---> Resource Drops ---> Consumables (heal/eat)                    |
  |         |               Auto-heal at 25%                          |
  |         +---> Upgrade Currency                                    |
  |                 |                                                 |
  |                 +---> Upgrades ---> Modify tick outcomes ----------+
  |                         |
  |                         +-- Explore faster (Quick Feet)
  |                         +-- Find more (Sharp Eyes, Scavenger)
  |                         +-- Survive better (Thick Skin, Iron Will, Quiet Steps)
  |                         +-- Passive regen (Regeneration, Meditation)
  |
  +---> Entity Encounters ---> Avoid? ---> Safe
  |                       |--> Firesalt? ---> Block
  |                       +--> No defense ---> Take Damage ---> Death? ---> Respawn w/ penalty
  |
  +---> Ambient Messages (flavor text)
```

---

## 4. Design Holes

### CRITICAL -- Game Has No End Game
1. **No prestige/reset system.** After clearing 6 levels, the game is over. Nothing to replay for. Every successful idle game has a prestige loop -- you reset your progress in exchange for permanent multipliers that make the next run faster and stronger.

2. **No scaling.** HP stays at 100 forever. Upgrades cap out. Resources pile up with nowhere to spend them. The satisfying exponential growth curve that makes idle games addictive is missing.

3. **No compounding.** Resources grow linearly. There are no multipliers that multiply other multipliers. The core dopamine loop (numbers going up faster and faster) doesn't exist.

### HIGH -- Missing Core Idle Features
4. **Active play isn't rewarded.** Watching the game and doing nothing is the same as tapping. Good idle games give active players abilities to trigger, choices to make, mini-objectives to complete.

5. **No milestones or achievements.** No goals beyond "escape." Players need short-term, medium-term, and long-term goals to stay engaged.

6. **No equipment or rare drops.** All progression is flat percentage upgrades. There's no thrill of finding a rare item, no gear to equip, no build variety.

### MEDIUM -- Balance & Feel Issues
7. **Death is only punishing, not interesting.** Losing 30% of everything feels bad. Death should offer a tradeoff or a learning moment, not just a tax.

8. **Exploration resets on travel.** Going back to farm Level 0 for cloth means losing all progress on your current level. This punishes the farming loop the game relies on.

9. **Offline progress is too weak.** Capped at 5 minutes. Players who return after 8 hours get the same as someone gone 5 minutes. This hurts retention.

10. **No reason to revisit cleared levels.** Beyond farming, cleared levels offer nothing new.

### LOW -- Missing Polish
11. **No tutorial or onboarding.** New players don't know what firesalt does or what the goal is.

12. **No visual progression.** The wallpaper never changes. No visual indicator of getting stronger.

13. **No boss encounters.** All entities are random with the same resolution. No special moments.

14. **No social features.** No leaderboard, no sharing milestones.

---

## 5. Improvement Plan -- Phased Build

Each phase builds on the previous one. Complete a phase fully before moving to the next.

---

### PHASE 1: Fix the Foundation
*Goal: Remove frustration, add basic scaling, make the existing game feel better.*

#### 1A. Exploration Persistence
Save exploration progress per-level instead of resetting it when you travel.
- Store `explorationPerLevel: Record<number, number>` in GameState
- When traveling, save current level's exploration and restore the destination level's saved progress
- Escaping to a NEW level still starts at 0 (you haven't explored it yet)
- This lets players farm resources on easy levels without losing progress on hard ones

#### 1B. Better Offline Progress
Increase the offline cap from 5 minutes to 50 minutes.
- Change `MAX_OFFLINE_TICKS` from 200 to 2000
- Add a "Welcome Back" popup showing: time away, resources found, exploration gained
- This is a simple config change with a small UI addition

#### 1C. Max HP / Max Sanity Upgrades
Add two new upgrades so the player can grow beyond 100 HP/Sanity.
- **Tough Body**: +10 Max HP per level, costs Scrap Metal, max level 50
- **Strong Mind**: +10 Max Sanity per level, costs Canned Food, max level 50
- This gives a real sense of growth -- after 10 levels of Tough Body, you have 200 HP instead of 100
- Add these to the upgrades tab alongside existing upgrades

#### 1D. Better Death
Replace flat 30% penalty with a tiered system:
- **Ghost Walk**: 10 ticks of entity immunity after respawning (you just died, give the player a breather)
- **Adrenaline Rush**: +25% find rate for 20 ticks after respawning (risk/reward for pushing dangerous levels)
- **Reduced resource loss**: Drop from 30% to 15% loss, but exploration penalty stays at 30%
- Lucky Coins can now be spent (5 coins) on death to keep ALL resources (death insurance)

---

### PHASE 2: The Prestige Loop
*Goal: Infinite replayability. This is the most important phase for the game's longevity.*

#### 2A. Rewind (Prestige)
When the player reaches Level 4 (Electrical Station) or beyond, a new button appears: **"Rewind the Tape"**

Pressing it triggers a VHS rewind effect (static, scan lines, tape noise) and:
- Resets: current level to 0, all exploration to 0, all resources to 0, all upgrades to 0, HP/Sanity back to base
- Awards: **Void Fragments** -- a permanent currency that never resets

Void Fragment formula:
```
fragments = floor(
  (totalLevelsCleared * 2)
  + (totalExploration / 100)
  + (upgradesBought * 0.5)
  + (deaths * 0.3)   // risk/reward
)
```

Players should earn ~5-15 fragments on their first prestige, scaling up as they go deeper.

#### 2B. Void Fragment Upgrades (Permanent)
A new tab: **"VOID"** -- only appears after first prestige.

| Void Upgrade | Effect per Level | Max | Cost |
|---|---|---|---|
| Hardened Soul | +10 base Max HP | 20 | 3 per level |
| Iron Psyche | +10 base Max Sanity | 20 | 3 per level |
| Speed Runner | +5% base explore speed | 20 | 4 per level |
| Keen Senses | +5% base find rate | 20 | 4 per level |
| Thick Hide | +3% base damage reduction | 10 | 5 per level |
| Inner Peace | +3% base sanity drain reduction | 10 | 5 per level |
| Pack Rat | Start each run with 3 extra almond water + 2 food | 5 | 8 per level |
| Deep Memory | +200 offline tick cap per level | 10 | 6 per level |

These bonuses apply at the START of every new run. A player with Hardened Soul Lv.5 starts with 150 max HP instead of 100. This is what makes each prestige feel noticeably stronger.

#### 2C. Depth Counter
A permanent stat: **Total Depth** = total number of level escapes across all runs, ever.
- Displayed prominently in the header or stats section
- This is the "big number" that always goes up, even when everything else resets
- Gives a sense of lifetime progression

#### 2D. Prestige Tiers
After certain prestige milestones, new content unlocks:
- **Prestige 1**: Unlocks the Void tab
- **Prestige 3**: Unlocks Level 5 (The Crimson Halls -- new level with new entities)
- **Prestige 5**: Unlocks Level 6 (The Library -- new level)
- **Prestige 10**: Unlocks Level 7 (The Frozen Sublevel) + **Infinite Depth**

New levels mean new entity types, new ambient messages, new specialty drops, and higher danger ratings. The game keeps expanding as you prestige.

#### 2E. Infinite Procedural Levels *(implemented)*
After clearing Level 7 (The Frozen Sublevel), the game generates **infinite procedural sublevels** (Sublevel 9, 10, 11...). These levels:
- Cycle through 8 unique themes (Void Corridor, Decay Blooms, White Noise, Infinite Reflection, Calcium Memory, Holy Absence, Flesh Corridors, The Forgetting)
- Scale in danger (6 to 10), exploration cost (2500+), and resource drops
- Pull from all 9 entity types with harder mixes at deeper levels
- Have their own pool of deep-level ambient messages
- Are deterministic (same sublevel id always generates the same level)
- Auto-escape and travel work normally with procedural levels
- The travel list shows Level 0 + the 6 most recent levels to avoid UI overflow

This gives the depth counter real meaning — every Rewind lets you push deeper with better void upgrades. The "big number" never stops going up.

---

### PHASE 3: Active Play & Engagement
*Goal: Give players something to DO. Reward attention without punishing idle players.*

#### 3A. Abilities (Cooldown Buttons)
Three abilities on the explore tab, each with a cooldown:

**Scavenge** (Batteries cost: 2)
- Instantly rolls 3-5 resource drops
- 60-tick cooldown (90 seconds)
- Great for actively farming a specific level

**Barricade** (Scrap Metal cost: 3)
- Entity immunity for 20 ticks (30 seconds)
- 80-tick cooldown (2 minutes)
- Use before exploring dangerous levels

**Signal Flare** (Firesalt cost: 1)
- Double resource drops for 15 ticks (22 seconds)
- 50-tick cooldown (75 seconds)
- Combine with Scavenge for big hauls

These abilities appear as buttons below the log on the explore tab. They show cooldown timers. Active players who use abilities well will progress faster than pure idle, but idle players still progress fine.

#### 3B. Exploration Milestones
Each level has one-time milestone rewards at 25%, 50%, 75%, and 100%:
- **25%**: Small resource bundle (3-5 random resources)
- **50%**: Medium bundle (5-8 random resources + guaranteed firesalt)
- **75%**: Large bundle (8-12 random resources)
- **100%**: Boss encounter (see Phase 4) + guaranteed Level Key

Milestones reset on prestige but NOT on travel. They give satisfying checkpoints during exploration.

#### 3C. Events & Discoveries
Rare tick events that break up the routine:

| Event | Chance | Effect |
|---|---|---|
| Hidden Room | 2% | Bonus 3-5 resources + lore text |
| Supply Cache | 1.5% | Large drop of 5-8 random resources |
| Wanderer NPC | 1% | Offers a trade (e.g. 5 cloth for 3 firesalt) |
| Unstable Floor | 2% | Temporarily noclip to a random unlocked level for 10 ticks, then return |
| Memory Fragment | 0.5% | Collectible lore piece (collection tracked in stats) |

Events appear as special log messages with distinct colors. They make each session feel different.

---

### PHASE 4: Equipment & Bosses
*Goal: Build variety, memorable moments, and ongoing resource sinks.*

#### 4A. Equipment System
Players can find and equip gear. One equipment slot per category (Head, Body, Feet, Accessory).

**Finding Gear:**
- Rare drops during exploration (1-2% chance per resource roll)
- Guaranteed drop from bosses
- Can be crafted (see 4C)

**Gear Tiers:** Common (white) -> Uncommon (green) -> Rare (blue) -> Legendary (gold)
Higher tiers drop on higher danger levels and from bosses.

**Example Gear:**
| Item | Slot | Effect | Found on |
|---|---|---|---|
| Worn Flashlight | Accessory | +10% explore speed | Level 0-1 |
| Gas Mask | Head | -20% sanity drain | Level 2+ |
| Steel-Toe Boots | Feet | -15% damage taken | Level 1-3 |
| Firesalt Pouch | Accessory | Auto-block 2 attacks before breaking | Level 3+ |
| Lucky Rabbit's Foot | Accessory | +15% find rate | Level 3 (Poolrooms) |
| Hazmat Suit | Body | -30% sanity drain, -10% damage | Level 4+ (Legendary) |

**Gear persists across travels but resets on prestige.** This gives a reason to find good gear each run.

#### 4B. Boss Encounters
Each hand-crafted level spawns a boss when exploration first hits 100%:

| Level | Boss | Special Mechanic |
|---|---|---|
| 0 (Lobby) | The Watcher | A Smiler that keeps attacking every tick for 5 ticks. Surviving = Level Key |
| 1 (Habitable) | The Collector | Steals 20% of your resources. Defeating it (costs 3 firesalt) returns double |
| 2 (Pipe Dreams) | Pipe Wyrm | 3-phase fight: dodge (avoidance check), block (firesalt), endure (take reduced damage). Rewards rare gear |
| 3 (Poolrooms) | The Drowned | Sanity-focused -- drains 40 sanity over 3 ticks. Surviving awards rare accessory |
| 4 (Electrical) | Voltage Phantom | Massive damage (40). Must have firesalt OR high avoidance. Drops guaranteed rare+ gear |
| 5 (Office) | The Manager | Final boss of base game. Multi-hit. Drops legendary gear |

**Procedural Sublevel Bosses** (Sublevel 9+):
- Every procedural level also has a boss at 100% exploration
- Bosses are remixed from a pool of mechanics (multi-hit, sanity drain, resource steal, damage burst)
- Boss difficulty scales with sublevel depth (damage, HP thresholds, number of phases)
- Higher sublevels have a better chance of dropping Legendary gear
- Boss names are procedurally generated from the level's theme (e.g. "The Void Sentinel" on a Void Corridor sublevel)

Bosses:
- Trigger once per exploration cycle (not repeatable until prestige resets exploration)
- Defeating a boss always drops a Level Key + chance for gear
- Bosses scale with prestige tier AND sublevel depth (more HP/damage each prestige and deeper level)
- Failing a boss doesn't kill you but costs resources and resets exploration to 90%

#### 4C. Basic Crafting
Combine resources at a crafting station (new tab or sub-section of items):

| Recipe | Ingredients | Result |
|---|---|---|
| Bandages | 3 Cloth Scraps | Heal 10 HP (weaker than water but farmable) |
| Torch | 2 Batteries + 1 Cloth | -30% entity encounter rate for 25 ticks |
| Barricade Kit | 4 Scrap Metal | Block all damage for 10 ticks |
| Distilled Water | 3 Almond Water | Full HP heal |
| Nerve Tonic | 2 Canned Food + 1 Water | Full Sanity heal |
| Firesalt Bomb | 3 Firesalt + 1 Metal | Kill any entity instantly (including bosses phase) |

Recipes are unlocked by reaching exploration milestones or finding them as rare events.

---

### PHASE 5: Shop & Monetization
*Goal: Sustainable revenue through purchases. No ads. Never pay-to-win.*

#### 5A. Premium Currency: Void Shards
Void Shards are a paid currency. They can ALSO be earned very slowly in-game:
- 1 Void Shard per prestige (guaranteed)
- Rare reward from Memory Fragment events
- Milestone reward for big achievements (first prestige, depth 50, etc.)

A player who never pays can still earn everything -- it just takes longer.

#### 5B. Shop Items (Void Shards)

**Starter Packs (one-time purchase):**
| Pack | Price | Contents |
|---|---|---|
| Survivor's Kit | 5 Shards | +20 base Max HP permanently, +10 starting almond water per run |
| Explorer's Kit | 5 Shards | +15% base explore speed permanently |
| Scavenger's Kit | 5 Shards | +15% base find rate permanently |

**Convenience (repeatable):**
| Item | Price | Effect |
|---|---|---|
| Resource Bundle | 2 Shards | Instantly gain 10 of each resource |
| Instant Prestige | 8 Shards | Prestige immediately with current fragment earnings (skip grinding to level 4) |
| Offline Boost | 3 Shards | Next offline session processes 2x ticks |
| Auto-Scavenge | 10 Shards | Automatically uses Scavenge ability when off cooldown for 1 full run |

**Cosmetic (permanent):**
| Item | Price | Effect |
|---|---|---|
| Crimson Wallpaper | 5 Shards | Red-tinted backrooms background |
| Poolrooms Wallpaper | 5 Shards | Blue pool tile background |
| Static Wallpaper | 5 Shards | TV static overlay effect |
| Custom Entity Names | 3 Shards | Rename entities to your own text |
| Gold Text Theme | 3 Shards | All UI text becomes gold-tinted |

#### 5C. Key Principles
- **Never pay-to-win.** Paid items are convenience or cosmetic only. Free players can reach everything.
- **No ads, ever.** The game never interrupts you.
- **No energy/stamina systems.** The game never stops you from playing.
- **No loot boxes or gambling.** You always know exactly what you're buying.
- Void Shards earned in-game ensure free players feel included, not excluded.

---

## 6. Implementation Order

| # | Feature | Phase | Builds On | Impact |
|---|---|---|---|---|
| 1 | Exploration persistence | 1 | Nothing | Removes biggest frustration |
| 2 | Better offline progress (50 min cap) | 1 | Nothing | Better retention |
| 3 | Max HP/Sanity upgrades | 1 | Nothing | Sense of growth |
| 4 | Better death (ghost walk, adrenaline, insurance) | 1 | Nothing | Less frustrating deaths |
| 5 | Prestige system (Rewind) | 2 | Phase 1 | Infinite replayability |
| 6 | Void Fragment upgrades | 2 | #5 | Permanent progression |
| 7 | Depth counter | 2 | #5 | Big number always going up |
| 8 | Prestige-gated new levels | 2 | #5 | Content expansion |
| 9 | Abilities (Scavenge/Barricade/Flare) | 3 | Phase 1 | Active play reward |
| 10 | Exploration milestones | 3 | #1 | Satisfying checkpoints |
| 11 | Random events & discoveries | 3 | Nothing | Variety, surprise |
| 12 | Equipment system | 4 | Phase 2 | Build variety, excitement |
| 13 | Boss encounters | 4 | #10 | Memorable moments |
| 14 | Basic crafting | 4 | Phase 1 | Resource sinks |
| 15 | Shop + Void Shards | 5 | Phase 2 | Revenue |

---

## 7. Target Player Experience

**First 5 minutes:** Player learns the loop. Explore, find stuff, first entity scare. Escape Level 0.

**First 30 minutes:** Player has upgraded a few times, reached Level 2-3, died at least once. Starting to understand resource management. Uses first ability (Scavenge).

**First prestige (~30-45 min):** Player reaches Level 4, sees the Rewind button. Resets and feels noticeably stronger. "Oh, THIS is the game." Hook moment.

**First hour:** Player has prestiged 2-3 times. Void upgrades make early levels trivial. Pushing deeper. Finding gear. Fighting bosses.

**Ongoing:** Prestige runs get faster. New levels unlock. Gear builds emerge. Memory Fragment collection. Depth counter climbing. Player is invested.

**Monetization touchpoint:** Player hits a wall (maybe prestige 5-6 where runs slow down). Shop offers convenience, not power. "I could buy a resource bundle and skip this grind, or keep playing." Player chooses freely.
