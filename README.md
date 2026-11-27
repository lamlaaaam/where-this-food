# Where This Food (WTF)

[▶ Play the live game](https://lamlaaaam.github.io/where-this-food/)

A daily browser game: guess Singapore food places from their Google reviews, then drop a pin on the map.

## How to play

- **One shared puzzle per day** — everyone gets the same 5 places, resets at 12:00 AM SGT.
- **5 rounds**, max 100 points each, 500 total.
- **1 attempt per round** — drop a pin, confirm it, and make it count.
- **Distance scoring** — the closer your pin, the more points (up to 88 per attempt).
- **6 hints available** — 3 photos, nearby MRT, expected cost, name hint. Unused hints give **+2 points each**.
- **Skip round** — reveals the answer, scores 0, forfeits hint bonus.
- **Share & stats** — copy Wordle-style results and track local streak/score stats.

## Scoring

```
distanceScore = 88 × exp(-distance / 2000)    // ~88 at 50 m, 53 at 1 km, 7 at 5 km
attemptScore  = distanceScore
hintBonus     = unusedHints × 2
roundScore    = min(100, bestAttemptScore + hintBonus)
```

The top bar shows your current attempt score live.

## Local development

```bash
npm install
cp .env.example .env
# fill in VITE_GOOGLE_MAPS_API_KEY (browser key)
# optionally fill in GOOGLE_MAPS_API_KEY (generator key)
npm run dev
```

## Google Cloud setup (two keys)

| Key | Name | API restrictions | Referrers | GitHub secret |
|-----|------|------------------|-----------|---------------|
| Browser | `wtf-browser` | Maps JavaScript API only | `http://localhost:5173/*`, `https://*.github.io/*` | `VITE_GOOGLE_MAPS_API_KEY` |
| Generator | `wtf-generator` | Maps JavaScript + Places API (New) | `http://localhost:5173/*` (or none) | `PLACES_API_KEY` |

Set daily quotas to stay under free caps:
- Dynamic Maps: **300/day** (≈9,300/month < 10,000 free)
- Places API: **30/day** (generator only)

Add billing alerts at $5 and $20.

## Deploy to GitHub Pages

1. Push to GitHub.
2. Add secrets `VITE_GOOGLE_MAPS_API_KEY` and `PLACES_API_KEY` in Settings → Secrets → Actions.
3. Settings → Pages → Source: **GitHub Actions**.
4. Push to `main`; the deploy workflow builds and publishes `dist/`.

## Daily generation

The generator runs daily at 00:07 SGT (GitHub Actions) and maintains a sliding window of puzzles (default 3 days, configurable via `PUZZLE_WINDOW_DAYS`): today plus the next days. Each puzzle is stored as `public/puzzles/YYYY-MM-DD.json` with date-labelled photos under `public/photos/`. Days that already have a puzzle are skipped, and files outside the window are pruned. It also writes `public/puzzles/index.json` and a `public/puzzles/history.json` used to avoid repeating recent places.

The browser reads the current date at runtime (using the player's clock converted to SGT) and fetches that day's puzzle, so the site does not need a rebuild each day. Puzzle JSON is validated on load. If a puzzle is missing, players see the bundled default puzzle with a warning. Re-run the workflow manually if needed.

## Stack

- Vite + TypeScript
- Google Maps JavaScript API (no game engine)
- Static site on GitHub Pages

## Project structure

```
src/
  config.ts              constants & hint order
  main.ts                entry point
  game/
    game.ts              screen flow, rounds, hints, HUD
    scoring.ts           distance/hint bonus formula
    hints.ts             hint content from place data
    date.ts              SGT date & puzzle number
  map/
    init.ts              map creation
    pois.ts              click-to-guess, answer reveal
    style.ts             dark map style
  places/
    service.ts           Maps JS loader
    reviews.ts           review filtering & random pick
  data/
    mrt.ts               MRT station coords
    geo.ts               haversine helpers
  ui/
    utils.ts             escape/toast helpers
  styles.css             responsive dark UI
scripts/
  generateDailyPuzzle.mjs  five-day puzzle window + photo downloader
public/
  puzzles/               generated puzzles, named YYYY-MM-DD.json
  photos/                downloaded place photos
.github/workflows/
  daily-puzzle.yml        scheduled generator
  deploy.yml              build & deploy to Pages
```

