# Where This Food (WTF)

A browser game: guess Singapore food places from their Google reviews and drop a pin on the map.

- **5 rounds**, 100 points per round, **500 max**
- Overall **average rating** plus **5 real Google reviews** per round, chosen at random
- **6 optional hints** — 3 photos, nearby MRT, expected cost and a **Name hint**
- **3 guesses** per round
- **30 seconds free**, then −5 points every 30 seconds
- Each hint costs **−12 points**
- Correct on the 1st / 2nd / 3rd guess scores **100% / 70% / 40%** of the remaining points
- Failed guesses show how far off you were, with flavour text by distance
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

The key is read only from `.env`; nothing is stored in the browser. If the variable is missing, the app shows setup instructions instead of the menu.

### Demo mode (no billing required)

The **Maps Demo Key** from Google lets you try the game without a billing account, but it
does **not** include Places API (New) reviews or photos. The game detects this and
automatically falls back to **bundled demo places** — you can still play all 5 rounds with
real reviews, photos, nearby-MRT hints, and map guessing. A notice appears at the top
of the clues panel when demo mode is active.

### Google Cloud setup (full experience)

1. Create a Google Cloud project and enable billing.
2. Enable **Maps JavaScript API** and **Places API (New)**.
3. Create an API key and restrict it by **HTTP referrer**:
   - `http://localhost:5173/*`
   - `https://<your-github-username>.github.io/*`
4. Optionally restrict the key to those two APIs.

If you see **“Google Places quota exceeded for this key”**, the exhausted metric is likely
`SearchNearbyRequest` (reviews and photos are fetched together in one nearby search) or
`GetPlaceRequest` / Places Photos. In the Google Cloud console for the project shown in the
error, go to **APIs & Services → Quotas**, search for that metric, and request an increase for
the **per day** limit. Also confirm billing is active and that you are using the intended
project/key. The game automatically switches to bundled demo places until the quota resets,
so gameplay continues without interruptions.

## Build

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. Add the key as a repository secret named `VITE_GOOGLE_MAPS_API_KEY`
   (Settings → Secrets and variables → Actions).
3. In Settings → Pages, set **Source** to **GitHub Actions**.
4. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds with the
   correct base path and deploys `dist/`.

The game runs entirely in the browser. Place selection and details are fetched live
from Google Places, so the key must allow the GitHub Pages referrer.

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
  map/
    init.ts              map creation
    pois.ts              click-to-guess, snapping, answer reveal
    style.ts             dark map style
  places/
    service.ts           Google Maps loader + Places wrappers
    selection.ts         pick an answer place with enough reviews
    reviews.ts           review filtering and random selection
  data/
    mrt.ts               MRT station coordinates
    geo.ts               haversine helpers
  ui/
    utils.ts             escape/format/toast helpers
  styles.css             dark responsive UI
```

## Notes

- Each round picks a random coordinate inside a Singapore outline (not just the bounding
  box, which includes Johor), takes the 10 nearest food places, and requires Google's
  `SG` country component. Reviews and photos are returned in the same nearby search and are
  never cached, so there are no per-candidate detail calls. Only the highest-review-count
  playable place is used. A rolling place history keeps playthroughs different.
- Google Places returns **at most five review texts** per place, so the game shuffles all
  five usable reviews instead of pretending it can fetch 50.
- Photos, MRT stations, expected cost and the Name hint are randomised each round. Google
  does not label photos as menus or food, so photo hints are simply numbered.
- Review-free nearby searches used for map snapping are deduplicated by a **session-only,
  in-memory cache**. It needs no server, so it works on GitHub Pages; nothing is written to
  browser storage, no review text is cached, and reloading starts fresh.
- The map instance is reused across rounds, so a full game triggers one billable map load.
- Wrong-guess distance appears only in the permanent map footer — no toast or result-modal
  duplicate.
- Running out of guesses **or skipping** keeps the map unobscured and leaves a green pin on
  the answer; the result card moves to the corner instead of covering the map.
- Clicking a restaurant POI on the map snaps the pin to it. Clicking empty map space
  snaps to the nearest restaurant within 120 m.
- Photos come from Google Places and are displayed at runtime; they are not stored.
