# Where This Food — Implementation Plan

## Summary
A browser game: guess Singapore food places from Google reviews, then drop pins on
Google Maps. One shared puzzle per day, five rounds, 100 points per round, 500 total.
Deployed to GitHub Pages.

Stack: **Vite 8 + TypeScript + Google Maps JavaScript API**. Places data is generated
once daily by a GitHub Actions script; no game engine — the map is the game board.

## Key decisions
- Data: Places API (New) via the Maps JavaScript API in headless Chrome, run by a scheduled
  GitHub Actions workflow and written to `public/puzzles/YYYY-MM-DD.json`.
- The puzzle resets at **12:00 AM SGT**. The workflow runs daily at 00:07 SGT and maintains a
  sliding five-day window (today + next four days). Existing days are skipped, so a delayed
  scheduled run does not block the current day's puzzle.
- The browser reads the current SGT date at runtime and fetches that day's puzzle file, so a
  static build does not need to be rebuilt each day.
- If the dated puzzle is missing, load `public/daily-puzzle-default.json` and show a
  prominent warning that daily puzzle generation failed and the player is on the default puzzle.
- If both files are missing/invalid, show an error screen. There is no silent demo mode.
- Map: Google Maps JS API with clickable POIs and a browser-restricted key.
- Place selection: generated once per day, filtered to Singapore food places with usable reviews.
- Hints: each unused hint earns +2 points for the round.
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
    date.ts              SGT date and puzzle-number helpers
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
    utils.ts             escape and toast helpers
  styles.css             responsive dark UI
scripts/
  generateDailyPuzzle.mjs  headless-Chrome Places generator (five-day window + default)
public/
  puzzles/                 generated dated puzzles
  daily-puzzle-default.json committed fallback puzzle
.github/workflows/
  daily-puzzle.yml       commits the generated five-day puzzle window
  deploy.yml             builds and deploys the static site
```

## Game flow
1. **Boot**: read the map key from `VITE_GOOGLE_MAPS_API_KEY`, compute the current SGT date,
   fetch `puzzles/YYYY-MM-DD.json`, and fall back to `daily-puzzle-default.json` with a warning
   if needed.
2. **Menu**: rules, puzzle date, default-puzzle warning (when applicable), and Start button.
   Google Maps is loaded only when Start is pressed.
3. **Round**: read the answer for this round from the loaded puzzle, render reviews, enable
   the map.
4. **Guessing**: click the food place POI itself; empty-map clicks are rejected. Confirm a
   guess; 2 attempts. Wrong guesses flash the screen red with no distance text.
5. **Result**: correct/incorrect, distance score breakdown, map reveal.
6. **Summary** after 5 rounds: total /500, per-round rows, “Come back tomorrow”.

## Scoring
- Each attempt is scored only by distance; there is no timer or speed component.
- Best of the two attempts is used for the round.
- Formula:

```
distanceScore = 88 × exp(-distance / 2000)    // ~88 at 50 m, 53 at 1 km, 7 at 5 km
attemptScore  = distanceScore                 // max 88
hintBonus     = unusedHints × 2
roundScore    = min(100, bestAttemptScore + hintBonus)
```

The HUD shows the live potential score and updates on each attempt and hint use.

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
- After both guesses **or a skip**, the result card moves to the corner with a transparent
  overlay so the green answer pin and its info window remain visible.
- Skipping a round records a 0-point result and is labelled as skipped in the summary.

## Static puzzle data
- `public/puzzles/YYYY-MM-DD.json` files are committed by the workflow and served as static
  assets. The workflow keeps today plus the next four days and prunes older files.
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
- `.github/workflows/daily-puzzle.yml` generates and commits the five-day SGT puzzle window.
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
- Because future puzzles are generated ahead of time, a failed or delayed scheduled run does
  not immediately break the current day. If the window is exhausted, players see the
  default-puzzle warning until the workflow is fixed and re-run.
