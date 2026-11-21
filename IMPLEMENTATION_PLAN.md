# Where This Food — Implementation Plan

## Summary
A browser game: guess Singapore food places from Google reviews, then drop pins on
Google Maps. One shared puzzle per day, five rounds, 100 points per round, 500 total.
Deployed to GitHub Pages.

Stack: **Vite 8 + TypeScript + Google Maps JavaScript API**. Places data is generated
once daily by a GitHub Actions script; no game engine — the map is the game board.

## Key decisions
- Data: Places API (New) via the Maps JavaScript API in headless Chrome, run by a scheduled
  GitHub Actions workflow and written to `public/daily-puzzle.json`.
- The puzzle resets at **12:00 AM SGT**. The workflow runs at 11:50 PM SGT and generates the
  next day's puzzle so it is ready at the reset.
- If the dated puzzle is missing or stale, load `public/daily-puzzle-default.json` and show a
  prominent warning that daily puzzle generation failed and the player is on the default puzzle.
- If both files are missing/invalid, show an error screen. There is no silent demo mode.
- Map: Google Maps JS API with clickable POIs and a browser-restricted key.
- Place selection: generated once per day, filtered to Singapore food places with usable reviews.
- Hints: −12 points each.
- Leaderboard/multiplayer: deferred to a later version.

## Prerequisites
- Google Cloud project with billing enabled.
- Enable **Maps JavaScript API** and **Places API (New)**.
- Browser API key restricted by HTTP referrer:
  - `http://localhost:5173/*`
  - `https://<username>.github.io/*`
- The same key stored as the Actions secret `VITE_GOOGLE_MAPS_API_KEY`. The generator runs in
  headless Chrome from `http://localhost:5173`, so the localhost referrer must stay allowed.
- Node 20.19+ / 22.12+ and Chrome/Edge available locally for puzzle generation.

## Architecture
```
src/
  main.ts                bootstrap
  config.ts              constants, hint labels/order
  types.ts               shared types (including DailyPuzzle)
  game/
    game.ts              screen flow, rounds, attempts, hints, HUD, fallback warning
    scoring.ts           score formula + breakdown
    hints.ts             hint content from place data + bundled geo data
    time.ts              SGT date and next-puzzle countdown helpers
  map/
    init.ts              map creation
    pois.ts              POI click, guess/answer markers
    style.ts             dark map style
  places/
    service.ts           Google Maps loader
    reviews.ts           review filtering and random five-review selection
  data/
    mrt.ts               MRT station coordinates
    geo.ts               haversine + Singapore bounds
  ui/
    utils.ts             escape, clock formatting, toast
  styles.css             responsive dark UI
scripts/
  generateDailyPuzzle.mjs  headless-Chrome Places generator (daily + default)
public/
  daily-puzzle.json        generated dated puzzle
  daily-puzzle-default.json committed fallback puzzle
.github/workflows/
  daily-puzzle.yml       commits the generated puzzle before midnight SGT
  deploy.yml             builds and deploys the static site
```

## Game flow
1. **Boot**: read the map key from `VITE_GOOGLE_MAPS_API_KEY`, fetch `daily-puzzle.json`,
   validate its SGT date, and fall back to `daily-puzzle-default.json` with a warning if needed.
2. **Menu**: rules, puzzle date, default-puzzle warning (when applicable), Start button, and
   countdown to the next 12:00 AM SGT reset. Google Maps is loaded only when Start is pressed.
3. **Round**: read the answer for this round from the loaded puzzle, render reviews, start the
   timer, enable the map.
4. **Guessing**: click the food place POI itself; empty-map clicks are rejected. Confirm a
   guess; 3 attempts. Wrong guesses flash the screen red with no distance text.
5. **Result**: correct/incorrect, score breakdown, map reveal.
6. **Summary** after 5 rounds: total /500, per-round rows, “Come back tomorrow”, countdown.

The countdown is shown in the HUD throughout play. When the page is idle (menu/summary), a
midnight SGT rollover reloads the page so the new puzzle is fetched automatically. An active
round is not interrupted.

## Timer and scoring
- No hard time limit.
- First 30 seconds are penalty-free (hints still apply).
- After 30 seconds: −5 points per 30-second block.
- Attempt multipliers: 1st = 100%, 2nd = 70%, 3rd = 40%.
- Formula:

```
base = 100
hintPenalty = hintsUsed × 12
timePenalty = elapsed <= 30 ? 0 : 5 × ceil((elapsed − 30) / 30)
attemptMultiplier = [1.0, 0.7, 0.4][attempt − 1]
score = clamp(round((base − hintPenalty − timePenalty) × attemptMultiplier), 0, 100)
```

The HUD shows the live potential score and updates every second and on hint use.

## Hints
| Hint | Source |
| --- | --- |
| Photo 1 / 2 / 3 | three random photos from `place.photos` |
| Nearby MRT | closest station by straight-line distance in `data/mrt.ts` |
| Expected cost | type-based SGD range with random jitter per round |
| Name hint | ~40% of the place name's letters revealed at random |

Google does not label photos as menus or food, so the photo hints use neutral numbers.
Missing photos disable those hints (no penalty).

## Place selection
- Pick a uniform random coordinate inside a rough Singapore mainland/Sentosa polygon, so
  northern bounding-box points in Johor are never generated.
- `Place.searchNearby()` with `rankPreference: DISTANCE` returns the 10 nearest food places;
  start with a 12 km radius and widen to 25 km for sparse random points.
- Request rating, review count, address components, reviews and photos on this search only;
  no per-candidate detail calls.
- Keep only places whose Google country component is `SG`, then sort by review count and take
  the highest-ranked playable place.
- Require 5 usable reviews that do not name the place. Google Places returns at most 5 review
  texts per place, so a 50-review pool is not available from this API.
- Shuffle the usable reviews before showing them; stars are informational only.
- The generator persists 5 distinct places for the whole shared daily puzzle.

## Map interaction
- `clickableIcons: true`; the `click` event's `placeId` is used directly as the guess.
- Empty-map clicks show a prompt instead of causing a billable nearby search.
- No extra Places calls are made while guessing; only answer selection uses the API.
- Initial view uses the Singapore bounding box; no snapping of misplaced pins.
- Correct/incorrect/skipped finish reveals the answer with a green marker and info window.
- Wrong guesses flash the screen red; no distance, toast or result-modal popup is shown.
- After three wrong guesses **or a skip**, the result card moves to the corner with a
  transparent overlay so the green answer pin and its info window remain visible.
- Skipping a round records a 0-point result and is labelled as skipped in the summary.

## Static puzzle data
- `public/daily-puzzle.json` is committed by the workflow and served as a static asset.
- `public/daily-puzzle-default.json` is a committed fallback generated once with the same
  script (`npm run puzzle:default`).
- Review text is copied from Google Places into these JSON files. Verify Google's current
  caching/redistribution terms before shipping publicly.
- Place photos are downloaded during generation and committed under `public/photos/`; the JSON
  stores local paths only. Player photo hints therefore load static files, not Google endpoints.
- Rehosting Google Place photos is not expressly permitted by Google's terms; this is a
  deliberate cost trade-off and carries a compliance risk.

## Deployment
- `.github/workflows/deploy.yml` builds on push to `main`.
- `.github/workflows/daily-puzzle.yml` generates and commits the next SGT day's puzzle.
- Secrets: `VITE_GOOGLE_MAPS_API_KEY` (browser key, Maps JavaScript only) and `PLACES_API_KEY`
  (generator key, Maps JavaScript + Places API (New)).
- `VITE_BASE_PATH=/<repo-name>/` for project pages.
- GitHub Pages source: **GitHub Actions**.

## Risks / notes
- Daily Places usage is bounded: roughly 15 nearby searches per day for five rounds, plus up
  to 50 photo downloads during generation. Player traffic does not call Places selection APIs
  or Place Photos endpoints.
- Google returns at most 5 review texts per place, so places with fewer usable reviews are
  skipped in favour of places that can fill all five slots.
- The key is visible in the built bundle, so referrer restrictions are essential. Earlier
  commits also embedded it in photo URLs inside the puzzle JSON; rotate that key.
- If generation fails, the previous dated file becomes stale at midnight SGT and players see
  the default-puzzle warning until the workflow is fixed and re-run.
