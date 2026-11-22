# Where This Food (WTF)

[▶ Play the live game](https://lamlaaaam.github.io/where-this-food/)

A daily browser game: guess Singapore food places from their Google reviews, then drop a pin on the map.

## How to play

- **One shared puzzle per day** — everyone gets the same 5 places, resets at 12:00 AM SGT.
- **5 rounds**, max 100 points each, 500 total.
- **3 attempts per round** — drop a pin anywhere on the map. Your best attempt counts.
- **Distance + speed scoring** — closer and faster = more points (up to 88 per attempt).
- **6 hints available** — 3 photos, nearby MRT, expected cost, name hint. Unused hints give **+2 points each**.
- **Skip round** — reveals the answer, scores 0, forfeits hint bonus.

## Scoring

```
distanceScore = 70 × exp(-distance / 2000)    // ~70 at 50 m, 42 at 1 km, 6 at 5 km
speedScore    = 18 × max(0, 1 - time / 60)     // 18 at 0 s, 9 at 30 s, 0 at 60 s
attemptScore  = distanceScore + speedScore     // max 88
hintBonus     = unusedHints × 2
roundScore    = min(100, bestAttemptScore + hintBonus)
```

The top bar shows your current best attempt score live.

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

The generator runs once daily at 23:50 SGT (GitHub Actions), downloads photos, writes `public/daily-puzzle.json` + images, and commits. If generation fails, players see the bundled default puzzle with a warning. Re-run the workflow manually if needed.

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
    scoring.ts           distance/speed/hint bonus formula
    hints.ts             hint content from place data
    time.ts              SGT date & countdown
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
    utils.ts             escape/format/toast
  styles.css             responsive dark UI
scripts/
  generateDailyPuzzle.mjs  daily puzzle + photo downloader
.github/workflows/
  daily-puzzle.yml        scheduled generator
  deploy.yml              build & deploy to Pages
```

## Notes

- Photos are downloaded during generation and served from `public/photos/` — no per-player API calls.
- Map instance is reused across all 5 rounds → 1 billable map load per game.
- Clicking a food place uses its Google Place ID; empty map space prompts again.
- Wrong guesses flash red; out of guesses/skip keeps map visible with green answer pin.
- Generator restricts to Singapore (`SG` country component); no Johor/Johor Bahru places.
- Google Places returns max 5 reviews per place — all 5 are used and shuffled.