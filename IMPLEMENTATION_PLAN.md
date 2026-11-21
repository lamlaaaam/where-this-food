# Where This Food — Implementation Plan

## Summary
A browser game: guess a Singapore food place from Google reviews, then drop a pin on
Google Maps. Five rounds, 100 points per round, 500 total. Single-player v1, deployed
to GitHub Pages.

Stack: **Vite 8 + TypeScript + Google Maps JavaScript API (Places library)**. No game
engine — the map is the game board.

## Key decisions
- Data: runtime Places API (New) via the Maps JavaScript `Place` class, with an HTTP-referrer-restricted key.
- Map: Google Maps JS API with clickable POIs.
- Place selection: live `Place.searchNearby()` filtered to Singapore food places with usable reviews.
- Hints: −12 points each.
- Leaderboard/multiplayer: deferred to a later version.

## Prerequisites
- Google Cloud project with billing enabled.
- Enable **Maps JavaScript API** and **Places API (New)**.
- API key restricted by HTTP referrer:
  - `http://localhost:5173/*`
  - `https://<username>.github.io/*`
- Node 20.19+ / 22.12+.

## Architecture
```
src/
  main.ts                bootstrap
  config.ts              constants, hint labels/order
  types.ts               shared types
  game/
    game.ts              screen flow, rounds, attempts, hints, HUD
    scoring.ts           score formula + breakdown
    hints.ts             hint content from place data + bundled geo data
  map/
    init.ts              map creation
    pois.ts              POI click, guess/answer markers
    style.ts             dark map style
  places/
    service.ts           Google Maps loader, Places API (New) Place class wrappers
    selection.ts         answer selection with review filter
    reviews.ts           review filtering and random five-review selection
  data/
    mrt.ts               MRT station coordinates
    geo.ts               haversine + Singapore bounds
  ui/
    utils.ts             escape, clock formatting, toast
  styles.css             responsive dark UI
```

## Game flow
1. **Boot**: read the key only from `VITE_GOOGLE_MAPS_API_KEY`; if it is missing, show a
   setup screen with `.env` instructions. Google Maps is only loaded when the player
   presses Start, so the first paint stays fast.
2. **Menu**: rules and Start button. An invalid key returns to the setup screen with an
   error; nothing is persisted in the browser.
3. **Round**: pick an answer place, render one review per star (1★–5★), start the timer,
   enable the map.
4. **Guessing**: click the food place POI itself; empty-map clicks are rejected. Confirm a
   guess; 3 attempts. Wrong guesses flash the screen red and show distance in the footer.
5. **Result**: correct/incorrect, score breakdown, map reveal.
6. **Summary** after 5 rounds: total /500, per-round rows, Play Again.

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
Cuisine type is free information in the clues panel (derived from `place.types` with generic
types filtered out). The row is hidden when Google only supplies a broad type such as
`restaurant`.

| Hint | Source |
| --- | --- |
| Photo 1 / 2 / 3 | three random photos from `place.photos` |
| Nearby MRT | randomly chosen from the 3 closest stations in `data/mrt.ts` |
| Expected cost | type-based SGD range with random jitter per round |
| Name hint | ~40% of the place name's letters revealed at random |

Google does not label photos as menus or food, so the photo hints use neutral numbers.
Missing photos disable those hints (no penalty).

## Place selection
- Pick a uniform random coordinate inside a rough Singapore mainland/Sentosa polygon, so
  northern bounding-box points in Johor are never generated.
- `Place.searchNearby()` with `rankPreference: DISTANCE` returns the 10 nearest food places;
  start with a 12 km radius and widen to 25 km for sparse random points.
- Request `userRatingCount` and `addressComponents` on this search only. Keep only places
  whose Google country component is `SG`, then sort by review count and take the
  highest-ranked playable place.
- Fetch details; require 5 usable reviews that do not name the place. Google Places returns
  at most 5 review texts per place, so a 50-review pool is not available from this API.
- Shuffle the usable reviews before showing them; stars are informational only.
- Remember a rolling 50-place history across playthroughs so each run gets different places.

## Map interaction
- `clickableIcons: true`; the `click` event's `placeId` is used directly as the guess.
- Empty-map clicks show a prompt instead of causing a billable nearby search.
- No extra Places calls are made while guessing; only answer selection uses the API.
- Initial view uses `fitBounds()` on the Singapore bounding box, then zooms out one extra
  level so strict bounds prevent panning until the player zooms in.
- Correct/incorrect/skipped finish reveals the answer with a green marker and info window.
- Failed guesses keep their distance and flavour text in the map footer; no toast or
  result-modal distance popup is shown.
- After three wrong guesses **or a skip**, the result card moves to the corner with a
  transparent overlay so the green answer pin and its info window remain visible.
- Skipping a round records a 0-point result and is labelled as skipped in the summary.

## Caching
- No Google Places data is cached. Reviews and photos are fetched fresh for each round, and
  nothing is written to browser storage, so the app works on static GitHub Pages.

## Deployment
- `.github/workflows/deploy.yml` builds on push to `main`.
- Secret: `VITE_GOOGLE_MAPS_API_KEY`.
- `VITE_BASE_PATH=/<repo-name>/` for project pages.
- GitHub Pages source: **GitHub Actions**.

## Demo mode fallback
When Places API (New) returns `REQUEST_DENIED` (e.g., Maps Demo Key or a key without Places
enabled) or a quota error, the game automatically switches to 15 bundled Singapore hawker
centres with hand-crafted reviews and SVG photos. The map still uses the real Google Maps
JavaScript API so the pin-dropping UX works. A "Demo mode" notice tells the player what
happened and includes the quota/billing guidance when available.

## Risks / notes
- Live Places calls cost money. Answer selection uses up to 3 nearby searches per round and
  reads reviews/photos from those responses instead of fetching full details per candidate.
  Guessing makes no Places calls, and one map instance is reused for the whole game.
- Google returns at most 5 review texts per place, so places with fewer usable reviews are
  skipped in favour of places that can fill all five slots.
- The key is visible in the built bundle, so referrer restrictions are essential.
- Maps Demo Key works for the map but not Places; demo mode covers that gap.
