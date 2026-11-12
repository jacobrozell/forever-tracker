# Forever Tracker

A local page for the Alliance roster on WoW: Forever. Levels, gold, skills, bags, and bags inventory come from the addon save files. Notes, talent plans, and profession routes stay in the page.

## Refresh after you play

1. Log out of the game, or type `/reload`. WoW only writes the save files then.
2. Double-click `refresh.bat` (or run `node tools/refresh.mjs`).
3. Open `index.html`. If you had typed over a level or skill, click **Reset to scan values**.

The script reads Altoholic's DataStore files and Bagnon's BagBrother file under the WoW Forever `WTF\Account\...\SavedVariables` folder. It does not copy those files into this folder.

Auction House prices stay as they were on the last full Auctionator scan. That database is stored in a binary format the script does not read. After a new auction scan, ask to fold the new prices in.

Keg Kenobi and Sneaky Gnomes show up after you log into each of them once with Altoholic and Bagnon enabled.

## Publish

This folder is the GitHub Pages site. After a refresh:

```bat
git add -A
git commit -m "Refresh roster from today's addon scan"
git push
```

The live page is the `index.html` on the `main` branch.
