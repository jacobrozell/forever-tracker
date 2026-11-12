# Forever Tracker

A single-page roster for an Alliance account on WoW: Forever. Open `index.html` in a browser, or use the live copy at [jacobrozell.github.io/forever-tracker](https://jacobrozell.github.io/forever-tracker/).

Levels, zones, gold, experience, professions, bags, bag contents, the quest log, equipped gear, and reputation come from the game's addon save files. Completed quests come from Questie. Talent plans, crafting routes, gold rules, and the addon list stay in the page and are not overwritten.

You need [Node.js](https://nodejs.org/) (the refresh script) and, if you publish, [Git](https://git-scm.com/).

## Addons to install

Install these in CurseForge for the WoW: Forever game, not retail or Classic. On an addon's Files tab, pick a file marked Forever when one exists. The same list is on the page under **Addons**.

These three are required for a full refresh. Without Altoholic and Bagnon the script has nothing to read for the roster. Without Questie the completed-quest list stays empty.

| Addon | Why |
| --- | --- |
| Altoholic | Saves level, zone, gold, experience, professions, items, the quest log, equipped gear, and reputation (the DataStore files). |
| Bagnon | Saves which bags are equipped and how full they are (the BagBrother file). |
| Questie | Saves which quests each character has finished. |

Log into each character once with those enabled, open the profession windows and the bank if you want those counted, then log out. Altoholic writes the quest log, gear, and reputation on that logout. Questie writes the completed list the same way.

## What the page shows from a scan

The home page is the account: the roster, what to do next, gold, the auction house, bags, addons, and Legacy points at the bottom. Open a character's name for that character only. The top of their page is the stat line (level, experience, gold, bags, quests, item level). Under it: Build, Mats, Route, Skills, Quests, Gear, and Reputation. That split follows the Destiny companion: one guardian on screen, with build and gear on their page, and account goals kept off it.

Under the roster, each scanned character also has a strip with the same stats, and the name opens their page.

**Quests** has two lists. **Show → Done** is Questie's completed quests. **Show → In the log** is the quests Altoholic still sees in the log, with the quest text and any reward. **Sort** is Zone, Level, or Name. The browser remembers both choices. Steps that share a name, such as Camping 101, are listed once with a count. Questie does not save the day a quest was turned in, so there is no completion date. A handful of Forever quests have no name in Questie's database and show up as `Quest` plus a number.

**Gear** is what that character had equipped at logout, with the item's quality color and the average item level.

**Reputation** is the home-city standing. The bar fills the current rank, not the whole path to Exalted. Honored is the discount the gold section plans around for the level 40 mount.

Worth adding for play. They are not required to refresh the page.

| Addon | Why |
| --- | --- |
| Auctionator | Prices in tooltips and one-click posting. A full auction scan is what the price section on the page was built from. |
| Baganator | Better bags, and item counts across characters. |
| Questie | Quest givers, objectives, and turn-ins on the map. |
| Leatrix Plus and Leatrix Maps | Quality-of-life toggles, revealed maps, and flight points. |
| RestedXP Guide | Step-by-step leveling route. Free to about level 20 for Alliance. |
| Pawn | Marks upgrades so you are not comparing gear by hand on every character. |
| ForeverArtisan | Profession shopping lists for getting crafts to 150. Forever support is less proven, so try it and watch for errors. |

Already in use. Leave them installed.

| Addon | Note |
| --- | --- |
| ALL THE THINGS | Collection tracker. |
| Titan Panel | The info bar the top of the page is modeled on. |
| RP Journal | Keep it. |
| HealBot Continued | Has a Forever file. Some features are reported broken, so watch it on the healers. |
| RareScanner | If its icon warns, the installed file is probably not a Forever build. Use the Forever file from its Files tab. |

Do not install these. They have no working Forever version, and the Classic or retail file will not load correctly.

- TradeSkillMaster. Auctionator covers posting.
- WeakAuras.
- GatherMate2. The beta file is the only one available. Use the game's own minimap tracking.
- AdiBags. Baganator replaces it.

If the game misbehaves after an install, log in with addons off from character select, turn them back on, and type `/reload`.

## Refresh after you play

WoW writes addon data when you log out or run `/reload`. A refresh while you are still in the game reads the previous logout.

1. Log out, or type `/reload`, on each character you want included.
2. Double-click `refresh.bat`.
   Or, from this folder in a terminal: `node tools/refresh.mjs`
3. Open `index.html`. If a level or skill still shows an old number you typed in, click **Reset to scan values**. Notes you typed are kept.

Check the result without changing the page:

```bat
node tools/refresh.mjs --dry
```

That prints each character's level, zone, gold, bag slots, professions, quests in the log, item level, and the first two reputations.

The header should then say **Scanned** followed by the newest logout time. Keg Kenobi and Sneaky Gnomes stay blank until you log into each of them once with Altoholic, Bagnon, and Questie enabled.

## Where the numbers come from

The script looks for the newest Forever account save that contains `DataStore_Characters.lua`:

```text
C:\Program Files (x86)\World of Warcraft\_forever_\WTF\Account\<account>\SavedVariables
C:\Program Files\World of Warcraft\_forever_\WTF\Account\<account>\SavedVariables
```

If the game is installed somewhere else, point the script at that `SavedVariables` folder for one run:

```bat
set WOW_SAVED=D:\WoW\_forever_\WTF\Account\YOURACCOUNT\SavedVariables
node tools\refresh.mjs
```

In PowerShell, use `$env:WOW_SAVED = "D:\WoW\..."` instead of `set`.

These addons have to be enabled, or the matching file stays empty:

| Addon | Save file | What it supplies |
| --- | --- | --- |
| Altoholic (DataStore) | `DataStore_Characters.lua`, `DataStore_Crafts.lua`, `DataStore_Containers.lua` | Level, zone, gold, experience, professions, items |
| Altoholic (DataStore) | `DataStore_Quests.lua` | Quests still in the log, and their rewards |
| Altoholic (DataStore) | `DataStore_Inventory.lua` | Equipped gear and average item level |
| Altoholic (DataStore) | `DataStore_Reputations.lua` | Faction standing |
| Bagnon | `BagBrother.lua` | Which bags are equipped and how full they are |
| Questie | `Questie.lua` | Which quests are finished. Names and zones come from the Questie database installed with the addon |

The script reads those files in place. It does not copy them into this folder. Do not commit the `SavedVariables` folder. It contains account data.

A profession skill appears only after you open that profession window once on that character. Blacksmithing and Leatherworking sometimes save no skill number. The page keeps the earlier estimate, marked `(est.)`, until the save includes a real rank.

## What a refresh does not change

- Legacy talent plans and the preset builds
- The material lists and the "level this craft to 150" routes
- Gold and mail rules
- Which addons to install
- Auction House prices

Auctionator's price database is stored in a binary format inside `Auctionator.lua`, so the script cannot read a new scan. Prices already on the page are reused when the same item shows up in bags. To record a new price, edit the `PRICES`, `SELL`, `KEEP`, or `SKIP` lists in `index.html`. Each price is copper: 100 copper is 1 silver, 10000 copper is 1 gold. The third number on a `PRICES` row is how many were listed.

## Add a character

Two lists have to agree. The page will not invent a role, class color, or profession plan.

1. In `tools/refresh.mjs`, add a row to `ROSTER` near the top:

   ```js
   ["keg", "Keg Kenobi", ["Mining", "Skinning"]],
   ```

   The first value is a short id. The second is the character name exactly as it appears in game. The third is the gathering skill, then the crafting skill. Use `null` if that slot is empty.

2. In `index.html`, add an object to the `chars` array with the same `id` and `name`. Copy a nearby character and change the class, role, and profession plan. The `k` field is the class color (`warrior`, `rogue`, and so on). A `true` in a profession entry means it is planned but not learned yet.

3. Run `node tools/refresh.mjs`. Log into that character once first, or the script will report them as not scanned.

## Publish

The site is the `main` branch of [github.com/jacobrozell/forever-tracker](https://github.com/jacobrozell/forever-tracker). GitHub Pages serves `index.html` from the root of that branch. The repo is public, so names, gold, and bag contents are visible to anyone with the link.

After a refresh you want online:

```bat
git add -A
git commit -m "Refresh roster from today's addon scan"
git push
```

The page usually updates within a minute. Confirm the build under the repo's Pages settings if the old page is still up.

## If the refresh fails

- **"node is not recognized"** — install Node.js, close the terminal, and try again.
- **"Couldn't find WoW Forever SavedVariables"** — log out of the game once, then set `WOW_SAVED` as shown above. The folder must contain `DataStore_Characters.lua`.
- **A character you just played did not change** — the game had not written the save yet. Log out or `/reload`, then run the script again. Also click **Reset to scan values** if the browser is still showing a number you typed.
- **Bags or items are missing** — open the bags, and the bank if you care about bank counts, then log out. Bagnon only records what that character has opened.
- **Gear, reputation, or the quest log is empty** — that character's Altoholic save has not been written yet. Log out or `/reload`, then refresh.
- **Completed quests are missing** — Questie was off for that character. Log out once with it enabled.
- **The command window flashes and closes** — run `node tools/refresh.mjs` from a terminal in this folder so you can read the error.
