# Where This Food (WTF)

A browser game: guess Singapore food places from their Google reviews and drop a pin on the map.

- **One shared puzzle per day** — everyone plays the same five places
- **5 rounds**, 100 points per round, **500 max**
- Overall **average rating** plus **5 real Google reviews** per round, chosen at random
- **6 optional hints** — 3 photos, nearby MRT, expected cost and a **Name hint**
- **3 guesses** per round
- **30 seconds free**, then −5 points every 30 seconds
- Each hint costs **−12 points**
- Correct on the 1st / 2nd / 3rd guess scores **100% / 70% / 40%** of the remaining points
- Wrong guesses flash the screen red; no distance feedback is shown
- **Skip Round** if you are stuck — reveals the answer and awards 0 points
- Map starts zoomed out to all of Singapore with panning disabled; only the clues panel scrolls

## Stack

- [Vite](https://vite.dev/) + TypeScript
- Google Maps JavaScript API + Places library
- No game engine — the map is the game board

## Local development

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
# put your key in .env
npm run dev
```

The map key is read only from `.env`; nothing is stored in the browser. If the variable is missing in local development, the app shows setup instructions. A deployed build with no key shows a configuration error instead of prompting players.

### Daily puzzle generation

The Google Places work happens once a day in GitHub Actions, not in every player's browser.
`.github/workflows/daily-puzzle.yml` runs `scripts/generateDailyPuzzle.mjs` at 11:50 PM SGT,
downloads each Place photo into `public/photos/`, writes local image paths and tomorrow's
puzzle to `public/daily-puzzle.json`, and commits the JSON plus images. The deploy workflow
then publishes the updated static site. The game resets at **12:00 AM SGT**, and a countdown
to that reset is shown in the top bar, menu, and summary.

This means player photo hints load static files from GitHub Pages instead of calling the
Places Photo endpoint on every reveal.

If the dated puzzle is missing or stale, the app loads `public/daily-puzzle-default.json`
instead and shows a prominent warning that daily puzzle generation failed and you are playing
the bundled default puzzle. If both files are unavailable, the app shows an error screen.

To generate a puzzle locally:

```bash
GOOGLE_MAPS_API_KEY=your_key npm run puzzle
# Generate the bundled fallback:
GOOGLE_MAPS_API_KEY=your_key npm run puzzle:default
# Windows PowerShell:
# $env:GOOGLE_MAPS_API_KEY='your_key'; npm run puzzle
```

### Google Cloud setup

1. Create a Google Cloud project and enable billing.
2. Enable **Maps JavaScript API** and **Places API (New)**.
3. Create a browser key restricted by **HTTP referrer**:
   - `http://localhost:5173/*`
   - `https://<your-github-username>.github.io/*`
4. Store that same key in the GitHub Actions secret `VITE_GOOGLE_MAPS_API_KEY`. The generator
   runs in headless Chrome from `http://localhost:5173`, so keep the localhost referrer in the
   key restriction for both local and Actions generation.
5. Optionally restrict the key to those two APIs.

If the generator fails with a Places quota or permission error, fix the key/project in the
Google Cloud console and re-run the **Generate daily puzzle** workflow manually. Until a fresh
dated puzzle is published, players see the default-puzzle warning.

## Build

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. Add the key as a repository secret named `VITE_GOOGLE_MAPS_API_KEY`
   (Settings → Secrets and variables → Actions). Both workflows use this same secret.
3. In Settings → Pages, set **Source** to **GitHub Actions**.
4. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds with the
   correct base path and deploys `dist/`.

The browser only loads Google Maps, `daily-puzzle.json` (or the bundled default), and the
committed photos in `public/photos/`. All Places calls happen in the scheduled generator, so
player traffic does not consume Places quota.

> **Terms warning:** committing Google Place photos rehosts Google Maps Content outside the
> Services, which Google's Maps Platform Terms prohibit except where expressly permitted.
> This project does it deliberately to avoid per-player photo charges; review that risk before
> publishing.

## How the score is calculated

```
base = 100
hintPenalty = hintsUsed × 12
timePenalty = elapsed <= 30s ? 0 : 5 × ceil((elapsed − 30) / 30)
attemptMultiplier = [1.0, 0.7, 0.4][attempt − 1]
score = clamp(round((base − hintPenalty − timePenalty) × attemptMultiplier), 0, 100)
```

The top bar shows the live potential score for the current round.

## Project layout

```
src/
  config.ts              game constants and hint definitions
  main.ts                entry point
  game/
    game.ts              screen flow, rounds, hints, scoring UI
    scoring.ts           score formula
    hints.ts             hint content builder
    time.ts              SGT date and next-puzzle countdown helpers
  map/
    init.ts              map creation
    pois.ts              POI click-to-guess, answer reveal
    style.ts             dark map style
  places/
    service.ts           Google Maps loader
    reviews.ts           review filtering and random selection
  data/
    mrt.ts               MRT station coordinates
    geo.ts               haversine helpers
  ui/
    utils.ts             escape/format/toast helpers
  styles.css             dark responsive UI
```

## Notes

- The generator picks a random coordinate inside a Singapore outline (not just the bounding
  box, which includes Johor), takes the 10 nearest food places, and requires Google's
  `SG` country component. It stores five playable places in `public/daily-puzzle.json`.
- The workflow runs before midnight SGT and writes tomorrow's date, so the new puzzle is ready
  at the 12:00 AM SGT reset. A missing/stale file falls back to `daily-puzzle-default.json`
  with a loud warning; players are never silently switched.
- Google Places returns **at most five review texts** per place, so the game shuffles all
  five usable reviews instead of pretending it can fetch 50.
- Photos, expected cost and the Name hint are randomised each round. The MRT hint shows the
  closest station by straight-line distance. Google does not label photos as menus or food,
  so photo hints are simply numbered.
- The map instance is reused across rounds, so a full game triggers one billable map load.
- Guessing costs no extra API calls: click the food place itself, and its Google place ID is
  used directly. Clicking empty map space asks for another click.
- Wrong guesses flash the screen red; the footer only shows your current pin.
- Running out of guesses **or skipping** keeps the map unobscured and leaves a green pin on
  the answer; the result card moves to the corner instead of covering the map.
- The summary offers no replay; a new puzzle arrives the next day.
- Photo hints point to committed static files under `public/photos/`, so they do not expire or
  create per-player Places Photo requests. The daily workflow overwrites the `daily-*.jpg`
  files each run; old versions remain in Git history.
