# Christmas Auction: site + live game

## What's in the folder

| File | What it is |
| --- | --- |
| `index.html` | Landing page: Join button and How it works (host screen is not linked; open `host.html` directly) |
| `rules.html` | Full public rules |
| `play.html` / `play.js` | Player screen: join, wallet, live bidding, cards, announcements |
| `host.html` / `host.js` | Host control room: auction, wallets, cards, announcements, hint ladder |
| `app.js` | Shared code and the data store (demo or Firebase) |
| `firebase-config.js` | Switch between demo mode and your Firebase project |
| `database.rules.json` | Security rules to paste into Firebase |
| `style.css`, `decor.js` | The 90s look |

## 1. Try it first (demo mode, no setup)

`firebase-config.js` ships with `demo: true`. In demo mode all data lives in one browser, and each
browser tab acts as a different person.

1. Open `host.html` and click **Create a new room**.
2. Open `play.html?room=THECODE` in two more tabs of the same browser and join with different names.
3. Put up an item on the host tab, bid from the player tabs, and sell it. Send an announcement.

Demo mode does **not** sync between phones. For that you need Firebase (below).

## 2. Go live with Firebase (free tier)

1. Go to the Firebase console and create a project (Analytics is not needed).
2. **Add a web app** (the `</>` icon). Copy the config values it shows you into `firebase-config.js`
   (`apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`) and change `demo: true` to `demo: false`.
3. **Authentication** > Sign-in method > turn on **Anonymous**.
4. **Authentication** > Settings > Authorized domains > add `yourname.github.io` (your GitHub Pages domain).
5. **Realtime Database** > Create database (any region) > start in locked mode.
6. **Realtime Database** > Rules > paste the contents of `database.rules.json` > Publish.

The `apiKey` in the page is not a secret. The rules in step 6 are what keep guests out of each other's
cards and out of the host's controls.

## 3. Publish on GitHub Pages

Upload every file to a public repo, then Settings > Pages > deploy from the main branch.
Players open `https://yourname.github.io/yourrepo/play.html?room=CODE`.

## 4. Running the party

- **Host from one device** (a laptop or tablet) and keep that browser. A room can only be resumed
  from the browser that created it. Keep it plugged in and awake.
- **Share the room code or link** from the host screen. Anyone with the code can join, so don't post it publicly.
- **Hint ladder:** type your hints into the host screen. They are saved only in your browser, never in the
  site's files, so guests can't read them from the page source.
- **Scheduled announcements** only send while the host page stays open.
- **Gift pool:** guests register each gift on their phone, with a description or marked hidden (no description needed). Put gifts up one by one or pick a random one. Hidden gifts go up as "Mystery gift #N". A gift that's put up but not sold returns to the pool. You can add your own gifts too.
- **Cards:** give benefits and idol finds to players from the host screen. When a player plays one, it shows
  in the host's "Cards played" list so you can rule on it (steals, shields, blocks are resolved by you).
- **Money:** use Pay and Charge for the Saran Wrap Ball, trivia and Bank Heists.
- **Win cap:** the host screen flags anyone at 3 wins but doesn't block the sale.
- **After the party:** click **Delete this room** to remove everything.

## Known limits

- Players start with exactly $200. That number is also in the security rules, so change both together.
- Built for a few dozen guests, not for public use.
- Tested here in demo mode (one host and two players). It has not been run against a live Firebase project,
  so do a quick dry run with two phones before the party. If the Firebase library version in `app.js`
  (`FB_VER`) is ever retired, update it to a current version.
