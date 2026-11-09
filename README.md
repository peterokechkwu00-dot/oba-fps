# Frontline: Oba — browser multiplayer FPS

A Call of Duty–style, first-person, free-for-all shooter that runs in the browser.
Friends join the same match just by opening the server's URL.

Maps are stylised corners of Anambra. The default is **"Oba, Anambra"**, the busy junction
town on the Onitsha–Owerri road: a tarred main road and roundabout, roadside shops, **Oba Motor
Park**, **Oba Market**, Oba Plaza, a filling station, a church, red earth and palms. After each
round, players vote for the next map:

- **Onitsha Main Market** — dense market lanes, stalls, warehouses and a Niger Bridge backdrop
- **Nnewi Industrial** — auto-parts yard, factory sheds, containers, cranes and catwalks
- **Awka Barracks** — a military compound with sandbags, watchtowers, bunkers, trucks and a perimeter wall

Key buildings on every map are **enterable**: hollow wall segments with door and window openings,
interior rooms, floors and ceilings, stairs up to upper floors and roofs, and simple cover (tables,
shelves, counters, crates). You can see and shoot through windows and doors; walls still stop bullets.
A few pickups sit inside. Bots stay on the ground floor so they do not get stuck on stairs.

Most textures, signboards and sounds are generated in code. Third-person soldiers use a bundled Mixamo glTF.

## Run locally

```bash
npm install
npm start            # http://localhost:3000  (PORT env var overrides)
```

Open `http://localhost:3000`, enter a callsign, click **DEPLOY**, then click the game to lock the mouse.
Other people on your network can join at `http://<your-ip>:3000`.

| Env var        | Default | Meaning                                                |
|----------------|---------|--------------------------------------------------------|
| `PORT`         | 3000    | HTTP/WebSocket port                                    |
| `BOTS`         | 3       | Server-side AI bots (they only move while a human is on) |
| `WIN_KILLS`    | 20      | Kills needed to win a round                            |
| `MAP`          | `oba`   | Starting map id (`oba`, `onitsha`, `nnewi`, `awka`)    |
| `VOTE_MS`      | 15000   | Map-vote window after a round, in milliseconds         |
| `MED_RESPAWN`  | 20000   | Medkit respawn time (ms)                               |
| `ARM_RESPAWN`  | 30000   | Armour vest respawn time (ms)                          |
| `AMMO_RESPAWN` | 15000   | Ammo crate respawn time (ms)                           |

## Controls

| Key | Action |
|-----|--------|
| WASD | Move |
| Mouse | Look |
| Space | Jump |
| Shift | Sprint |
| Left click | Shoot (automatic rifle, 600 rpm) |
| Right click | Aim down sights |
| R | Reload (30-round mag, 150 reserve, max 270) |
| Tab (hold) | Scoreboard (+ voice mute buttons) |
| T or Enter | Text chat (Enter sends, Esc cancels) |
| V | Mute / unmute your microphone (voice is open-mic by default) |

### On a phone or tablet
After you tap **DEPLOY**, on-screen controls appear (no mouse lock). Rotate to landscape if you can — there is a dismissable hint.

| Control | Action |
|---------|--------|
| Left half of the screen | Virtual joystick appears under your thumb. Move to walk; push the stick far forward to sprint |
| Drag on the right half | Look around |
| **FIRE** (hold) | Shoot. You can drag on FIRE to look while shooting |
| **AIM** | Aim down sights (toggle) |
| **JUMP** / **R** | Jump / reload |
| **CHAT** / **🎤** / **TAB** | Type a message, mute your mic, open the scoreboard |

The page blocks scrolling, pinch-zoom and pull-to-refresh. On phones the renderer uses a lower pixel ratio and lighter shadows so it stays smooth.
| Esc | Release mouse |

## Communication
- **Text chat**: press T or Enter to type. Messages are sent over the game WebSocket with your name and shown
  in a chat box on the bottom left that fades out. Each message is capped at 120 characters and shown as
  plain text, so HTML in a message does nothing. You can send at most one message every 0.6 s and 6 per 10 s.
  Join and leave notices also appear in the chat box.
- **Voice chat**: every player connects directly to every other player (WebRTC peer-to-peer audio). The game
  WebSocket carries the connection setup, and Google's public STUN servers help players find each other.
  Voice is **open-mic by default**: the browser asks for microphone permission right after you click
  DEPLOY, and from then on everyone can hear you. Press **V** to mute or unmute yourself. An on-screen
  badge shows your mic status (🎤 on / 🔇 muted / ⚠️ blocked). If you deny the mic, you can still hear
  everyone else. Voice-activity detection lights the 🔊 icon on name tags and in the scoreboard only while
  someone is actually speaking. Press Esc to open the scoreboard/settings, where you can turn your mic
  on or off, set the voice volume, and mute individual players.
- **Limitation:** there is no TURN server, so players behind strict NATs (some mobile carriers and corporate
  networks) may not hear each other. Add a TURN server (e.g. coturn, or Twilio/Metered) to `ICE_SERVERS` in
  `public/comms.js` to fix this. Voice is not positional, and a mesh works best for about 8 or fewer talkers.

## Weapon
The first-person rifle is built in code from many parts: receiver, dust cover, rail-mounted red dot, barrel,
gas tube, front sight, ported muzzle brake, quad-rail handguard, curved bakelite magazine, pistol grip,
trigger and guard, wooden stock, charging handle, selector and rivets. It uses PBR materials
(gunmetal/polymer/wood) with wear textures generated in code. It is lit by its own lights and environment map
and drawn in a separate pass so it never clips into walls. It has sway, bob, recoil kick and recovery,
aim-down-sights through the red dot, a reload animation (the mag drops out, goes back in, then the charging
handle is racked) and a star-shaped muzzle flash. Other players carry a lower-detail version of the same rifle.

## Players
Other players (including bots) are drawn as a rigged soldier, not a box figure. The mesh is the
**Mixamo “Vanguard”** character shipped with the [three.js](https://threejs.org/) examples
(`examples/models/gltf/Soldier.glb`, three.js r170), cloned per player with `SkeletonUtils.clone` so
each one has its own skeleton and animation mixer. Idle, walk and run clips are blended by speed;
strafing leans the hips; aim pitch is applied on the spine, neck and head after the mixer update;
firing gives a short upper-body recoil; jumping uses a tucked-leg pose; dying plays a fall to the
ground. The same procedural rifle is parented to the right-hand bone. Each soldier gets a camo tint
from their player colour, plus a small coloured vest plate and helmet band so they stay readable at
a distance. The model already includes a helmet visor. Name tags and the 🔊 speaking icon sit above
the head bone; the head hitbox follows that bone so headshots stay lined up.

The character and its animations come from [Mixamo](https://www.mixamo.com/) and are used under
Adobe Mixamo’s terms (they may be included in games). three.js itself is MIT-licensed. A short
licence note is in `public/models/LICENSE.txt`.

On phones the soldiers share the one loaded model, skip per-mesh shadows and use the same lower
pixel ratio / lighter map shadows as the rest of the client.


## Accounts, progress and shop

You can still **DEPLOY as a guest** with just a callsign. Guests cannot buy cosmetics.

Create an account (username + password, optional email) in the menu to save progress and use the shop. Sessions are an httpOnly cookie.

- **Progress** — total kills, deaths, wins, matches, XP and level are stored per account. A kill is worth 50 XP; winning a round is worth 200 XP. Level goes up every 250 XP.
- **Leaderboard** — the top 20 accounts by XP.
- **Shop** — cosmetic only: soldier camo (Olive Field is free; Green Eagles, Desert Tan, Urban Grey, Ankara Pattern, Gold), rifle skins (Standard Issue is free; Carbon, Green-White-Green, Gold) and name-tag colours (Crimson is free). Prices are ₦500–₦2,000. Equip/unequip is validated on the server and the equipped look is sent to other players.

### Payments (Paystack)

Checkout is [Paystack Standard](https://paystack.com/docs/payments/accept-payments): the server initializes the transaction, the player is redirected to Paystack, then the server verifies the payment with `/transaction/verify` **and** a webhook at `/api/paystack/webhook` (HMAC SHA512 of the raw body, `x-paystack-signature`). The item is granted only after a successful verification. Repeats of the same reference are idempotent. Amounts are in kobo.

If `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` are not set, the shop shows **Payments coming soon**. A DEV-only fake-purchase path exists for local testing (`ALLOW_DEV_PURCHASES=1` and not production) and is disabled in production.

**To take real (or test) payments, Peter needs to:**

1. Create a Paystack account at [paystack.com](https://paystack.com/) and complete business verification for live charges (test payments work before that).
2. Open **Settings → API Keys & Webhooks** (or Developer settings) in the Paystack dashboard.
3. Copy the **test** secret and public keys first. Set them as environment variables on the Render web service `oba-fps`:
   - `PAYSTACK_SECRET_KEY` — `sk_test_…` then later `sk_live_…`
   - `PAYSTACK_PUBLIC_KEY` — `pk_test_…` then later `pk_live_…`
   - Optional: `PUBLIC_URL` = `https://oba-fps.onrender.com`
4. Paste this webhook URL into Paystack (test mode, then live mode):  
   `https://oba-fps.onrender.com/api/paystack/webhook`
5. Switch to live keys only after a test purchase works. Paystack's standard rate on local cards is typically 1.5% + ₦100 per transaction (capped; international cards are higher — check the current [Paystack pricing](https://paystack.com/pricing) page).

This repository does not include any Paystack keys.

### Database

Accounts need PostgreSQL. On Render we use a **Free** Postgres instance named `oba-fps-db` in Frankfurt, wired to the web service as `DATABASE_URL` (internal URL). Locally, if `DATABASE_URL` is unset, the server uses an in-memory database (PGlite) so `npm test` and `npm start` still work.

**Free Render Postgres limits (official docs):** 1 GB storage, one free database per workspace, **expires 30 days after creation**, then a 14-day grace period to upgrade before the database and its data are deleted. No backups, no managed pooling, may restart or have maintenance at any time. For real players, upgrade to a paid plan (from about $6–19/month) before expiry or progress and purchases will be lost.

## Rules
100 HP. A body shot does 25, a headshot does 50. Armour absorbs about two-thirds of each hit (up to the
armour you have left); leftover damage goes to health. After 5 seconds without taking damage, health
regenerates at about 10 HP per second, up to 100. You respawn after 3 s at the safest spawn point, with
armour reset to 0.

Walk over pickups to take them (this also works on a phone). A **medkit** restores 50 HP (cap 100) and
respawns in about 20 s. An **armour vest** adds 50 armour (cap 100), is rarer, and respawns in about 30 s.
An **ammo crate** adds 90 reserve rounds (cap 270) and respawns in about 15 s. You only pick one up if it
can actually help you. Bots will also walk over useful ground pickups.

The first player to 20 kills wins the round. A 15-second end screen then lets everyone vote (tap or click,
three options — the maps you are not already on). The map with the most votes loads for the next round;
a tie is broken at random. The current map name is shown in the HUD, the menu and the scoreboard.

## Architecture
- `server.js`: Express serves `public/` and Three.js (`/vendor/three`), with a `ws` WebSocket server on `/ws`.
  The server owns players, health, armour, reserve ammo, pickups, kills/deaths, respawns, rounds, map rotation
  and bots, and broadcasts snapshots at 20 Hz. Clients send their position at 30 Hz. Hits are raycast on the
  client, then validated on the server: the shot origin must be near the shooter, the ray must pass close to
  the target's last known position, there must be no wall in between, and the fire rate is limited.
- `public/shared/maps.js`: registry of every map, loaded by id. Each map owns its collision boxes, spawns,
  pickups, enterable interiors and bot-navigable layout.
- `public/shared/interior.js`: helper that hollows a building into walls, floors, stairs, props and lights.
- `public/shared/map-oba.js`, `map-onitsha.js`, `map-nnewi.js`, `map-awka.js`: the four arenas.
- `public/shared/layout.js`: shared helpers and gameplay constants.
- `public/world.js`: builds (and rebuilds) the 3D scene and canvas textures for the active map.
- `public/pickups.js`: floating medkit, vest and ammo-crate models.
- `public/avatar.js`: rigged third-person soldiers (glTF + animation mixer), name tags and hitboxes.
- `public/models/Soldier.glb`: Mixamo Vanguard character (see `public/models/LICENSE.txt`).
- `public/audio.js`: WebAudio-synthesised sound effects.
- `public/weapon.js`: the procedural rifle (high and low detail) and the muzzle flash texture.
- `public/comms.js`: text chat and WebRTC voice chat.
- `public/main.js`: input, movement and collision, shooting, interpolation, HUD, map vote.

## Tests
```bash
PORT=3100 BOTS=0 npm start &   # a bot-free server for deterministic testing
PORT=3100 npm test             # join, move, shoot, damage, kill, respawn, headshot, wall check,
                               # chat, rate limit, voice signalling, plus map data, pickups, armour,
                               # regen, map vote and per-map collision
```

The extra pickup / vote checks start their own short-lived server (with shorter timers) so they stay
fast and do not depend on the `PORT=3100` process.

## Deploy to Render
1. Push this folder to a GitHub/GitLab repo.
2. In Render: **New → Blueprint**, pick the repo. `render.yaml` sets up a free Node web service
   (`npm install` / `npm start`, health check `/health`). Render provides `PORT` automatically.
3. Share the `https://<name>.onrender.com` URL. WebSockets work over `wss://` automatically.

Note: free Render services sleep after about 15 minutes of no traffic. The first visit after that takes
roughly 30–60 s to wake up.
