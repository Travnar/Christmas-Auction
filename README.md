# Christmas Auction: site + live game

## What's in the folder

| File | What it is |
| --- | --- |
| `index.html` | Landing page: Join button and How it works (host screen is not linked; open `host.html` directly) |
| `rules.html` | Full public rules (gifts, auctioning, advantages, games) |
| `advantages.html` | Detailed list of every advantage |
| `play.html` / `play.js` | Player screen: join, wallet, add gifts, past announcements |
| `host.html` / `host.js` | Host control room: party gifts, announcements, games (trivia), players |
| `app.js` | Shared code and the data store (demo or Firebase) |
| `firebase-config.js` | Switch between demo mode and your Firebase project |
| `database.rules.json` | Security rules to paste into Firebase |
| `style.css`, `decor.js` | The 90s look |

## The rules in short

The full text is in `rules.html`. The game screens are built to run these rules.

**Gifts**
- The group agrees on a spending limit per player. Each guest brings any number of gifts that add up to that limit
  (for example, at $20: one $20 gift, or 4 x $5, or $10 + $5 + $3 + $1 + $1).
- Bring a mix of exposed and hidden gifts. The host can add extra hidden gifts for risk; they can be very
  valuable or White Elephants.
- Small gifts like candy can go last as a money sink for players with leftover money.
- Never share what is in a hidden gift.

**Auctioning**
- Everyone starts with the same amount of auction money, and can earn more from mini-games.
- Gifts are drawn at random.
- Bids are whole dollars and raise by at least $1. Going once, twice, sold.
- The auctioneer may bid while auctioning, or have another player bid for them.

**Advantages** (bought at auction or found hidden around the party; the host may seal some in envelopes)

| Advantage | Effect |
| --- | --- |
| Wet Bandits Plot | Collect $5 from every other player |
| You Shot Your Eye Out! | Next round, a player you choose turns around and can't hear the bidding |
| Clark's Christmas Bonus | One bid counts double against other bids, but you pay only what you bid |
| The Grinch's Sack | Steal a gift from another player's pile. A stolen gift is locked and can't be stolen again |
| Kevin's Booby Trap | Wastes a Steal aimed at your pile. Keep it secret until you're targeted |
| Naughty List | One player can't bid on the gift currently up |
| Ralphie's Decoder Pin | Peek inside one hidden gift before you bid |
| Bailey's Bailout | Take $10 from the bank |

**Games** (earn extra auction money): Saran Wrap Ball (money and advantages per layer), Christmas Trivia between
rounds, and games like Cards Against Humanity.

## 1. Try it first (demo mode, no setup)

`firebase-config.js` ships with `demo: true`. In demo mode all data lives in one browser, and each
browser tab acts as a different person.

1. Open `host.html` and click **Create a new room**.
2. Open `play.html?room=THECODE` in two more tabs of the same browser and join with different names.
3. Add gifts from the player tabs and watch them appear in the host's Gift Pool. Send an announcement.

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
- **Announcements:** the newest message scrolls across everyone's banner. Older ones stay listed under Past Announcements on each player's screen.
- **Games:** Christmas movie trivia is built into the host screen's Games section.
- **Gift pool:** guests register each gift on their phone, with a description or marked hidden (no description needed). The host screen lists every gift added. The auction itself is run out loud.
- **After the party:** click **Delete this room** to remove everything.

## Known limits

- The host sets the starting auction money (default $100) and the gift cap (default $10) when creating a room. The gift cap is shown to players as a guide; gifts have no prices, so it isn't enforced.
- Built for a few dozen guests, not for public use.
- Tested here in demo mode (one host and two players). It has not been run against a live Firebase project,
  so do a quick dry run with two phones before the party. If the Firebase library version in `app.js`
  (`FB_VER`) is ever retired, update it to a current version.
