[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/cffilham-jpg/makefun-gta6-01-r6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/cffilham-jpg/makefun-gta6-01-r6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Bay — An Open-World Crime Story

**Solmar Bay** is a browser open-world crime game built with three.js for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01). You play Ray
Delgado, a newcomer who rolls into a sun-soaked coastal city with $150 and a
name to make. Vera Kline runs the garage on Marina Row — and she has work for a
driver who doesn't ask questions.

## The city

Solmar Bay is a full 3D coastal city: a road grid of drivable streets, a marina
with open water, sandy beaches, palm-lined sidewalks, and blocks of buildings
under a bright sky. Traffic flows through the streets, pedestrians walk the
sidewalks, and the sun follows you so the shadows stay crisp wherever you go.

## What you can do

- **Run six story missions** for Vera — steal cars, make deliveries, and take
  jobs that pay cash and push the story forward.
- **Steal and drive cars** — eight vehicle types, from the Bay Cab taxi and
  Harbor Van to the Falcon GT sports car and the V8 Bruiser muscle car, each
  with its own speed, acceleration, and handling.
- **Fight back** — four weapons (P9 Pistol, K9 SMG, M870 Scatter shotgun, and
  AR-7 Carbine), switchable with keys 1–4, with mouse aim, reloads, and
  health + armor to manage.
- **Outrun the SBPD** — a five-star wanted system: patrol cars and foot cops
  escalate with every star, and breaking line of sight is the only way to cool
  the heat down. Get busted or wasted and you wake up at St. Marina.
- **Explore freely** — no mission is required to enjoy the city. Drive the
  coast road, lose the cops, and see how far $150 takes you.

## Presentation

- Live HUD with cash, objective tracker, wanted stars, in-game clock, health
  and armor bars, speedometer, and a real-time minimap.
- Synthesized sound effects and music (no audio files needed) — press `M` to
  mute.
- Save system: progress autosaves and can be continued from the title screen.

## Controls

| Key | Action |
| --- | ------ |
| WASD | Move / drive |
| Mouse | Look & aim |
| Click | Shoot |
| E | Steal / enter car |
| 1–4 | Switch weapon |
| R | Reload |
| Space | Jump / handbrake |
| Shift | Sprint |
| Esc | Pause |
| M | Mute |

## How to run it

No build step and no dependencies — just Node.js (v22+):

```sh
node serve.ts
```

Then open <http://localhost:8080> in your browser. (`node serve.ts --port <n>`
serves on a different port.)

The game is the static `game/` directory served by the tiny standard-library
server in `serve.ts`; everything (three.js included) is vendored locally, so it
also runs from any static file server.

## Bounty

This entry was built for the **gta6-01** bounty on make.fun:
<https://make.fun/bounty/gta6-01>

Want to enter bounties with your own AI agent? Join with my referral link:
<https://make.fun/r/fpna5aje> (code: `fpna5aje`)
