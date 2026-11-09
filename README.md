# Frontline: Oba — browser multiplayer FPS

A Call of Duty–style, first-person, free-for-all shooter that runs in the browser.
Friends join the same match just by opening the server's URL. The map is **"Oba, Anambra"**, a
stylised version of the busy junction town on the Onitsha–Owerri road: the tarred main road with a
roundabout junction, roadside shops with colourful signboards, **Oba Motor Park** (yellow keke and
danfo buses), **Oba Market** (stalls and umbrellas), Oba Plaza, a filling station, a church, red-earth
patches, zinc fences and palm trees.

Everything (textures, signboards, sounds) is generated in code. There are no external assets.

## Run locally

```bash
npm install
npm start            # http://localhost:3000  (PORT env var overrides)
```

Open `http://localhost:3000`, enter a callsign, click **DEPLOY**, then click the game to lock the mouse.
Other people on your network can join at `http://<your-ip>:3000`.

| Env var     | Default | Meaning                                                |
|-------------|---------|--------------------------------------------------------|
| `PORT`      | 3000    | HTTP/WebSocket port                                    |
| `BOTS`      | 3       | Server-side AI bots (they only move while a human is on) |
| `WIN_KILLS` | 20      | Kills needed to win a round                            |

## Controls

| Key | Action |
|-----|--------|
| WASD | Move |
| Mouse | Look |
| Space | Jump |
| Shift | Sprint |
| Left click | Shoot (automatic rifle, 600 rpm) |
| Right click | Aim down sights |
| R | Reload (30-round mag, 150 reserve) |
| Tab (hold) | Scoreboard |
| Esc | Release mouse |

## Rules
100 HP. A body shot does 25, a headshot does 50. You respawn after 3 s at the safest spawn point.
The first player to 20 kills wins the round. Scores reset 8 s later.

## Architecture
- `server.js`: Express serves `public/` and Three.js (`/vendor/three`), with a `ws` WebSocket server on `/ws`.
  The server owns players, health, kills/deaths, respawns, rounds and bots, and broadcasts snapshots at 20 Hz.
  Clients send their position at 30 Hz. Hits are raycast on the client, then validated on the server:
  the shot origin must be near the shooter, the ray must pass close to the target's last known position,
  there must be no wall in between, and the fire rate is limited.
- `public/shared/map.js`: the map layout, collision boxes and constants, shared by server and client.
- `public/world.js`: builds the 3D scene and canvas textures (signboards, keke, danfo, palms…).
- `public/avatar.js`: soldier models for other players, with name tags and hitboxes.
- `public/audio.js`: WebAudio-synthesised sound effects.
- `public/main.js`: input, movement and collision, shooting, interpolation, HUD.

## Tests
```bash
PORT=3100 BOTS=0 npm start &   # a bot-free server for deterministic testing
PORT=3100 npm test             # 2 headless socket clients: join, move, shoot, damage, kill, respawn, headshot, wall check
```

## Deploy to Render
1. Push this folder to a GitHub/GitLab repo.
2. In Render: **New → Blueprint**, pick the repo. `render.yaml` sets up a free Node web service
   (`npm install` / `npm start`, health check `/health`). Render provides `PORT` automatically.
3. Share the `https://<name>.onrender.com` URL. WebSockets work over `wss://` automatically.

Note: free Render services sleep after about 15 minutes of no traffic. The first visit after that takes
roughly 30–60 s to wake up.
