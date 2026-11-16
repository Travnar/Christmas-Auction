# Christmas Auction: project handoff

Everything needed to continue this project in another Claude session or terminal that can edit files directly.
Local copy of the site lives in `C:\Users\Travis Zillmer\Downloads\xmas-auction-site` (a static site meant for GitHub Pages).

---

## 1. The game (current rules)

A Christmas gift exchange inspired by Survivor and the "survivor auction".

- **Gifts:** each player brings any number of gifts that add up to $20 total (for example 1 x $20, 4 x $5, or $10 + $5 + 5 x $1). The host also contributes extra wrapped items, and guests are encouraged to bring a few wrapped extras for variety.
- **Money:** every player starts with **$200** of auction money. It has no value after the party, so it must be spent.
- **Auction:** gifts are drawn at random and sold one at a time to the highest bidder. Wrapped gifts are auctioned blind with one clue ("soft", "edible", "under $5"). Win cap: 3 gifts per player. A final "Last Call" round sells everything left.
- **Benefits (sealed envelopes, bid on like gifts):** Double Bid (bid counts double against others, winner pays only their bid), Steal, Shield, Block, Peek, Bank Heist, plus some Duds.
- **Idol-style Steal/Shield:** a Steal can be played any time (during bidding or the final steal phase). The thief names target and gift. A Shield revealed at that moment wastes the Steal. A stolen gift is "locked" and can't be stolen again. If stolen from, you pick a replacement from the thief's pile. An unplayed Steal turns into $10 in Last Call.
- **Hidden idols:** a few (3 to 5) printed idol cards are hidden around the party (towel, under a mug, in a book, etc.). The finder keeps it secret. The host-only hiding spots and the hint ladder are NOT in this repo (see section 7).
- **Cash earners:** the Saran Wrap Ball (roll doubles to unwrap with oven mitts; prizes are cash, benefits and jokes) and Christmas Trivia ($30 / $20 / $10 for the top three per round).
- **Flow (about 2 hours):** welcome, auction round 1, Saran Wrap Ball, auction round 2, trivia, auction round 3 + Last Call, steal phase.

## 2. Tech overview

- Pure static site: HTML, CSS and vanilla JS. No build step, no framework, no npm.
- Hosted on GitHub Pages (or Cloudflare Pages / Netlify). Live sync uses Firebase (Realtime Database + anonymous auth), called directly from the browser.
- **Two data modes**, switched in `firebase-config.js`:
  - `demo: true` (default): data lives in `localStorage` and syncs between tabs of the same browser via `BroadcastChannel`. Each tab gets its own fake user id from `sessionStorage`, so one browser can play host plus several players. Nothing is shared between devices.
  - `demo: false`: Firebase. Needs the config filled in.
- Look: gaudy 90s Christmas (candy-cane stripes, blinking bulbs, WordArt title, beveled buttons, marquee, hit counter, snow, sparkle trail). Motion effects respect `prefers-reduced-motion`. App pages (`play`, `host`) use `<body data-calm>` to skip snow and sparkles.

## 3. File inventory

| File | Purpose |
| --- | --- |
| `index.html` | Landing page: big "Join the game" button at the top, "How it works" below, link to rules |
| `rules.html` | Full public rules, nav with Home link |
| `play.html` / `play.js` | Player screen |
| `host.html` / `host.js` | Host control room (not linked from the homepage; go to `host.html`) |
| `app.js` | Shared helpers + the store (`window.Xmas`): demo store, Firebase store, `el()`, `money()`, `ls`, audio beep, demo banner |
| `firebase-config.js` | `window.XMAS_CONFIG = { demo, firebase: {...} }` |
| `database.rules.json` | Realtime Database security rules to paste in the Firebase console |
| `style.css` | Shared styles (90s look + app components) |
| `decor.js` | Bulbs, snow (skipped on `data-calm` pages), sparkle trail |
| `README.md` | Setup steps for the user |

## 4. Store API (`app.js`)

`Xmas.connect()` resolves to a store with `{ mode, uid, newKey(), set(p,v), update(p,obj), push(p,v)->key, remove(p), get(p), on(p,cb)->unsubscribe }`. Paths are slash-separated like Firebase. `update` accepts multi-path keys with `null` to delete. Firebase SDK (v10.12.2, constant `FB_VER`) is loaded by dynamic `import()` from `gstatic.com`. All user-supplied text is rendered with `textContent` through `Xmas.el(...)`, never `innerHTML`.

## 5. Data model (`rooms/{CODE}/...`)

| Path | Contents | Written by |
| --- | --- | --- |
| `meta` | `{hostUid, created}` | host, once |
| `players/{uid}` | `{name, balance, joined}` (balance starts at 200) | player creates once, host adjusts balance |
| `item` | `{id, name, clue, open, ts, giftId?, hidden?, soldTo?, price?}` current auction item | host |
| `bids/{uid}` | `{amount, itemId, ts}` | player (rules cap bid at their balance, item must be open) |
| `sold/{key}` | `{item, winnerUid, winnerName, price, ts, giftId?}` | host |
| `gifts/{key}` | `{ownerUid, hidden, desc? (absent when hidden), status: pool/up/sold, soldTo?, ts}` | player or host adds; host updates status; owner can remove while status is pool |
| `announce/all/{key}` | `{text, kind: hint/alert/info, ts}` | host |
| `announce/direct/{uid}/{key}` | same, readable only by that player | host |
| `cards/{uid}/{key}` | `{name, desc, used, ts}` | host gives; player can only flip `used` to true |
| `events/{key}` | `{from, name, text, ts}` card plays, host-readable only | player |

Security model: the host (`meta.hostUid`) has write access to the whole room via a room-level `.write` rule. Players can only write their own player entry (once), their own bid, their own gifts, `used` on their own cards, and events. The Firebase `apiKey` in the page is not secret. The $200 start is hardcoded in both `play.js` and the rules, so change both together.

## 6. Features by screen

**Player (`play.html`)**: join with name + room code (or `?room=CODE` link), auto-resume on reload; wallet (LCD-style) and win count; **My gifts** (describe the gift, or tick Hidden, where hidden needs no description; remove while waiting; status shown); **My pile** (what they won); live bidding (+$1/+$5/+$10 or exact bid, high bid shown); My cards (Play asks for a target, records an event for the host); announcements feed with pop-up toast, vibration and a beep; recently sold list.

**Host (`host.html`)**: create or resume a room (resume only works from the same browser that created it), room code and copyable player link; **Auction**: gift pool (put up a specific gift or a random one, hidden gifts go up as "Mystery gift #N", an unsold gift returns to the pool), manual item entry, bid list with a x2 toggle for Double Bids, "own gift" and "3-win cap" and "can't afford" flags, Sell, Close bidding, No sale; **Announcements**: to everyone or one player, hint/alert/info, optional delay in minutes (timers only run while the host page stays open), quick alert buttons, and a **hint ladder** the host types in (stored only in the host's browser `localStorage`, with "send next hint"); sent log; **Players** table plus Pay/Charge wallet tool and Give-a-card tool (preset cards or custom name); Cards-played feed; delete the room at the end.

## 7. Things deliberately kept out of the code

- The idol hiding spots and the hint ladder text. They are secrets, and a public GitHub repo exposes every file. They live in the host-only Claude doc "Christmas Survivor Auction: Official Rules" and are typed into the host screen at party time.
- Keep it that way: never hardcode hints, idol locations or private gift notes in the repo.

## 8. Testing

- **Demo mode (no setup):** serve the folder (`python -m http.server 8000`, then `http://localhost:8000/host.html`). Create a room, then open `play.html?room=CODE` in two more tabs of the same browser and use the same address for all tabs. Put up an item, bid, sell, send an announcement, give a card, add gifts.
- The demo store was tested end to end with Playwright driving headless Chrome (one host page and two player pages in one browser context): join, gifts (visible, hidden, empty-visible rejected), pool, put up, bidding, sale, pile, announcements (everyone and direct), hint ladder, wallet pay, give and play a card, scheduling, no-sale returning the gift to the pool, host-added gift. No console errors. Worth recreating as a scripted test.
- **Not tested:** live Firebase (rules, auth, real-time sync across phones). Do a dry run with two phones before the party.
- Common confusion: "No party found with that code" almost always means demo mode with the host and player in different browsers or at different addresses (`localhost` vs `127.0.0.1`, different port). A demo bar at the top of the page confirms demo mode.

## 9. Known limits

- Win cap, steal resolution, Block, Peek and Bank Heist are enforced by the host manually (the app flags the 3-win cap but does not block it).
- Gifts have no price field, so the $20 total is not checked.
- Scheduled announcements need the host page open. No push notifications when a phone is locked.
- A host room can only be resumed from the same browser and device.
- No QR code yet. The host screen has a copyable link.
- `FB_VER` (Firebase SDK version in `app.js`) may need bumping if it is ever retired.
- `index.html` was just simplified (Join button + How it works only). The user's local folder may still hold the older version, so copy over the latest `index.html`.

## 10. Ideas not built yet

QR code for the join link; optional gift price with a running total toward $20; enforcing the 3-win cap with a host override; Peek and Block as in-app actions; a shared trivia buzzer; printable idol/benefit cards; custom domain (about $10 to $11 a year for a .com via Cloudflare or Porkbun); PWA install for push on iOS.

## 11. Hosting notes

GitHub Pages is free for static sites (soft limits around 100 GB/month bandwidth and 1 GB size), so scaling isn't a concern for a party. The Firebase free tier should cover one night. Firebase setup steps are in `README.md` (create project, add web app, enable Anonymous auth, add the `github.io` domain to authorized domains, create a Realtime Database, publish `database.rules.json`, set `demo: false`).

---

## Prompt to paste into the new session

```
I'm continuing a project: a static website (GitHub Pages) for my Christmas Auction party game. The full context is in HANDOFF.md in this folder; please read it first, then read README.md, app.js, play.js and host.js before changing anything.

Rules of the road:
- Edit files directly in this folder. Keep it a no-build static site with vanilla JS.
- Keep the gaudy 90s Christmas look, and keep motion effects respecting prefers-reduced-motion.
- Never put host-only secrets (idol hiding spots, hint text, private gift notes) in any file.
- Render user-typed text with textContent (Xmas.el), never innerHTML.
- If you change the data model, update database.rules.json and the table in HANDOFF.md.
- Demo mode (demo: true in firebase-config.js) must keep working so I can test locally with `python -m http.server 8000`.

First, please:
1. Confirm index.html is the simplified version (Join the game button on top, How it works below), and if not, make it so.
2. Run the demo-mode flow end to end (host + two players) and tell me anything broken.
3. Then wait for my next request.

What I want to work on next: <describe the next change here>
```
