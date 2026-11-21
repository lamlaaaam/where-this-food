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
    pois.ts              POI click, snap-to-nearest, guess/answer markers
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
4. **Guessing**: click a restaurant POI to snap the pin, or click empty space to snap to
   the nearest restaurant within 120 m. Confirm a guess; 3 attempts.
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
Cuisine type is always visible in the clues panel (derived from `place.types` with generic
types filtered out), so it is not a paid hint.

| Hint | Source |
| --- | --- |
| Photo of the place | random photo from `place.photos` |
| Nearby MRT | randomly chosen from the 3 closest stations in `data/mrt.ts` |
| Another photo | a second random photo from `place.photos` |

Google does not label photos as menus or food, so those unreliable hints were removed.
Missing photos disable a hint (no penalty).

## Place selection
- `Place.searchNearby()` around several Singapore centres, radius 25 km.
- Keep places with `user_ratings_total >= 5`, food types, and coordinates inside the
  Singapore bounding box.
- Shuffle the busier eligible candidates so repeat games pick different places.
- Fetch details; require 5 usable reviews that do not name the place (Google returns at most 5).
- Shuffle the usable reviews before showing them; stars are informational only.
- Remember used place IDs so a round never repeats a place.

## Map interaction
- `clickableIcons: true`; the `click` event's `placeId` is used to fetch the POI.
- Non-food POIs and places outside Singapore are rejected with a toast.
- Empty click: `Place.searchNearby()` with `rankPreference: DISTANCE` and a 120 m snap radius.
- Correct/incorrect finish reveals the answer with a green marker and info window.

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
- Live Places calls cost money; up to 6 shuffled candidates are inspected per round.
- Google returns at most 5 review texts per place, so places with fewer usable reviews are
  skipped in favour of places that can fill all five slots.
- The key is visible in the built bundle, so referrer restrictions are essential.
- Maps Demo Key works for the map but not Places; demo mode covers that gap.
