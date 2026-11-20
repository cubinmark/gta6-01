# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/cubinmark/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/cubinmark/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

The entry for make.fun's “Make GTA 6” bounty. PALM CITY HEAT is an original 3D open-world crime game built with three.js (vendored) and vanilla JavaScript modules: a coastal city of seven-by-seven blocks with traffic and pedestrians, cars to enter and drive with arcade physics, a five-star wanted system with police pursuit and line-of-sight heat decay, and a three-mission story arc with cash rewards, a minimap HUD and localStorage saves. `main.ts` copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the kit's vendored `buildDossier`.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts   # then serve game/ with any static server and open index.html
```

## Controls

| Input | Action |
| --- | --- |
| **Enter** | Start the game from the menu |
| **W A S D** | Move on foot (relative to the camera). When driving: **W** accelerates, **S** brakes and reverses, **A** / **D** steer |
| **Shift** | Sprint on foot |
| **E** | Enter or exit the nearest car (an on-screen prompt appears when one is in reach) |
| **Space** | Handbrake while driving (also sharpens turns) |
| **Mouse** | Click the canvas to pointer-lock, then move the mouse to orbit the camera |
| **Q** or **←** / **→** | Rotate the camera without the mouse |
| **Mouse wheel** | Zoom the camera in and out |
| **P** or **Esc** | Pause / resume |
| **M** | Mute / unmute sound |

## Missions

The story arc is a chain of three jobs for fixer **Marisol Vega**. Between jobs, walk into the gold **M** marker at the Marina Garage to start the next one — one mission at a time, each with a cash reward, and your cash and progress persist in `localStorage`.

1. **First Wheels** — $500, 150-second timer. Take the teal coupe parked outside Marisol's garage and deliver a package to the drop point at the pier on the south shore; you have to arrive in the car.
2. **Hot Merchandise** — $900. Pick up a courier case across town and deliver it to Marisol's buyer downtown. The case is hot: grabbing it raises a 2-star wanted level, so expect Palm City PD on the way.
3. **The Getaway** — $1,500. Pick up Marisol's brother Tico at the pier — the pickup brings 3 stars — and get him to the Palms Hideout. The delivery only completes once you have lost the heat completely (0 stars), so break line of sight and let the wanted level decay before rolling in.

Finishing all three completes the story; Palm City stays open to roam afterwards.

---

<sub>Entered on [make.fun](https://make.fun/?ref=dnrr099a&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
