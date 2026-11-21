# Where This Food (WTF)

A browser game: guess Singapore food places from their Google reviews and drop a pin on the map.

- **5 rounds**, 100 points per round, **500 max**
- One review per star rating (1★–5★) as your clue
- **6 optional hints** — place photo, nearest MRT, nearest landmark, cuisine, menu photo, food photo
- **3 guesses** per round
- **30 seconds free**, then −5 points every 30 seconds
- Each hint costs **−12 points**
- Correct on the 1st / 2nd / 3rd guess scores **100% / 70% / 40%** of the remaining points

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

If you do not want to create a `.env`, press **Start game** without a key — a setup screen lets you paste one. It is stored in `localStorage` for that browser only.

### Demo mode (no billing required)

The **Maps Demo Key** from Google lets you try the game without a billing account, but it
does **not** include Places API (New) reviews or photos. The game detects this and
automatically falls back to **bundled demo places** — you can still play all 5 rounds with
real reviews, photos, MRT/landmark hints, and map guessing. A notice appears at the top
of the clues panel when demo mode is active.

### Google Cloud setup (full experience)

1. Create a Google Cloud project and enable billing.
2. Enable **Maps JavaScript API** and **Places API (New)**.
3. Create an API key and restrict it by **HTTP referrer**:
   - `http://localhost:5173/*`
   - `https://<your-github-username>.github.io/*`
4. Optionally restrict the key to those two APIs.

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
    reviews.ts           one review per star
  data/
    mrt.ts               MRT station coordinates
    landmarks.ts         landmark coordinates
    geo.ts               haversine helpers
  ui/
    utils.ts             escape/format/toast helpers
  styles.css             dark responsive UI
```

## Notes

- Place selection uses `nearbySearch` around Singapore and keeps places with at least
  5 reviews and at least 3 distinct star ratings, so the clue panel is usually full.
- Clicking a restaurant POI on the map snaps the pin to it. Clicking empty map space
  snaps to the nearest restaurant within 120 m.
- Photos come from Google Places and are displayed at runtime; they are not stored.
