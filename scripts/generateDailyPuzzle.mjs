import { existsSync } from 'node:fs'
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? process.env.VITE_GOOGLE_MAPS_API_KEY
if (!API_KEY) {
  throw new Error('Missing GOOGLE_MAPS_API_KEY (or VITE_GOOGLE_MAPS_API_KEY).')
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const IS_DEFAULT = args.has('--default')

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
function singaporeDate(offsetDays = 0) {
  const shifted = new Date(Date.now() + SGT_OFFSET_MS + offsetDays * DAY_MS)
  return shifted.toISOString().slice(0, 10)
}

function addDays(date, offsetDays) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + offsetDays * DAY_MS).toISOString().slice(0, 10)
}

const WINDOW_DAYS = Math.max(1, Number(process.env.PUZZLE_WINDOW_DAYS ?? 3))
const START_DATE =
  process.env.PUZZLE_DATE ?? singaporeDate(Number(process.env.PUZZLE_DATE_OFFSET_DAYS ?? 0))
const DATES = IS_DEFAULT
  ? [START_DATE]
  : Array.from({ length: WINDOW_DAYS }, (_, index) => addDays(START_DATE, index))
const PHOTO_DIR = resolve(ROOT, 'public/photos')
const PUZZLE_DIR = resolve(ROOT, 'public/puzzles')
const DEFAULT_OUTPUT = resolve(ROOT, 'public/daily-puzzle-default.json')

const CONFIG = {
  seed: '',
  totalRounds: 5,
  coordinateAttempts: 3,
  localRadiusMeters: 12_000,
  wideRadiusMeters: 25_000,
  maxResultCount: 10,
  searchFoodTypes: [
    'restaurant',
    'cafe',
    'bakery',
    'bar',
    'meal_takeaway',
    'meal_delivery',
    'night_club',
  ],
  foodTypes: [
    'food',
    'acai_shop',
    'bagel_shop',
    'bar_and_grill',
    'bistro',
    'brewery',
    'brewpub',
    'cafeteria',
    'cake_shop',
    'candy_store',
    'cat_cafe',
    'chocolate_factory',
    'chocolate_shop',
    'cocktail_bar',
    'coffee_roastery',
    'coffee_shop',
    'coffee_stand',
    'confectionery',
    'deli',
    'dessert_shop',
    'diner',
    'dog_cafe',
    'donut_shop',
    'food_court',
    'gastropub',
    'hookah_bar',
    'hot_dog_stand',
    'ice_cream_shop',
    'irish_pub',
    'juice_shop',
    'kebab_shop',
    'lounge_bar',
    'noodle_shop',
    'pastry_shop',
    'pizza_delivery',
    'pub',
    'salad_shop',
    'sandwich_shop',
    'snack_bar',
    'sports_bar',
    'steak_house',
    'tea_house',
    'vineyard',
    'wine_bar',
    'winery',
  ],
  nonFoodTypes: [
    'bed_and_breakfast',
    'budget_japanese_inn',
    'campground',
    'camping_cabin',
    'cottage',
    'extended_stay_hotel',
    'farmstay',
    'guest_house',
    'hostel',
    'hotel',
    'inn',
    'japanese_inn',
    'lodging',
    'mobile_home_park',
    'motel',
    'private_guest_room',
    'resort_hotel',
    'rv_park',
    'convenience_store',
    'department_store',
    'food_store',
    'grocery_store',
    'health_food_store',
    'hypermarket',
    'market',
    'shopping_mall',
    'supermarket',
    'warehouse_store',
    'wholesaler',
    'airport',
    'bus_station',
    'car_dealer',
    'car_repair',
    'car_wash',
    'gas_station',
    'parking',
    'subway_station',
    'tour_agency',
    'tourist_information_center',
    'train_station',
    'transit_station',
    'travel_agency',
    'aquarium',
    'banquet_hall',
    'casino',
    'cinema',
    'convention_center',
    'event_venue',
    'historical_landmark',
    'karaoke',
    'movie_theater',
    'museum',
    'place_of_worship',
    'stadium',
    'tourist_attraction',
    'wedding_venue',
    'zoo',
    'atm',
    'bank',
    'beauty_salon',
    'dentist',
    'doctor',
    'electrician',
    'fitness_center',
    'general_contractor',
    'gym',
    'hair_salon',
    'hospital',
    'insurance_agency',
    'laundry',
    'locksmith',
    'moving_company',
    'painter',
    'pharmacy',
    'plumber',
    'real_estate_agency',
    'school',
    'spa',
    'storage',
    'university',
    'veterinary_care',
  ],
  bounds: { minLat: 1.23, maxLat: 1.475, minLng: 103.6, maxLng: 104.05 },
  shape: [
    { lat: 1.45, lng: 103.78 },
    { lat: 1.455, lng: 103.815 },
    { lat: 1.435, lng: 103.855 },
    { lat: 1.425, lng: 103.895 },
    { lat: 1.41, lng: 103.94 },
    { lat: 1.395, lng: 103.985 },
    { lat: 1.375, lng: 104.0 },
    { lat: 1.35, lng: 103.965 },
    { lat: 1.3, lng: 103.925 },
    { lat: 1.265, lng: 103.87 },
    { lat: 1.245, lng: 103.825 },
    { lat: 1.27, lng: 103.765 },
    { lat: 1.295, lng: 103.63 },
    { lat: 1.33, lng: 103.67 },
    { lat: 1.38, lng: 103.745 },
    { lat: 1.425, lng: 103.765 },
  ],
}

const FIELDS = [
  'id',
  'displayName',
  'addressComponents',
  'location',
  'types',
  'primaryType',
  'formattedAddress',
  'photos',
  'reviews',
  'rating',
  'userRatingCount',
]

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ]
  const executablePath = candidates.find((path) => path && existsSync(path))
  if (!executablePath) {
    throw new Error('No Chrome/Edge executable found. Set CHROME_PATH to your browser binary.')
  }
  return executablePath
}

async function startLocalServer() {
  const html = '<!doctype html><html><head><meta charset="utf-8" /></head><body>Generating puzzle…</body></html>'
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(html)
  })
  await new Promise((resolveListen) => server.listen(5173, resolveListen))
  return server
}

async function generateInBrowser(page, apiKey, seed) {
  return page.evaluate(
    async ({ key, fields, config }) => {
      await new Promise((resolveScript, rejectScript) => {
        const script = document.createElement('script')
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`
        script.async = true
        script.onload = () => resolveScript()
        script.onerror = () => rejectScript(new Error('Could not load the Maps JavaScript API.'))
        document.head.appendChild(script)
      })

      const placesLibrary = await google.maps.importLibrary('places')
      const PlaceClass = placesLibrary.Place ?? google.maps.places.Place
      if (!PlaceClass) throw new Error('Places API (New) is not available for this key.')

      const foodTypes = new Set([...config.searchFoodTypes, ...config.foodTypes])
      const nonFoodTypes = new Set(config.nonFoodTypes)
      const { bounds, shape } = config

      function seedFromString(value) {
        let hash = 2166136261
        for (const char of value) {
          hash ^= char.charCodeAt(0)
          hash = Math.imul(hash, 16777619)
        }
        return hash >>> 0
      }

      function mulberry32(seed) {
        let value = seed
        return () => {
          value = (value + 0x6d2b79f5) >>> 0
          let next = Math.imul(value ^ (value >>> 15), 1 | value)
          next ^= next + Math.imul(next ^ (next >>> 7), 61 | next)
          return ((next ^ (next >>> 14)) >>> 0) / 4294967296
        }
      }

      const random = mulberry32(seedFromString(config.seed))

      function insidePolygon(point) {
        let inside = false
        for (let i = 0, j = shape.length - 1; i < shape.length; j = i, i += 1) {
          const a = shape[i]
          const b = shape[j]
          const crosses =
            a.lat > point.lat !== b.lat > point.lat &&
            point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng
          if (crosses) inside = !inside
        }
        return inside
      }

      function randomPointInSingapore() {
        for (let attempt = 0; attempt < 500; attempt += 1) {
          const point = {
            lat: bounds.minLat + random() * (bounds.maxLat - bounds.minLat),
            lng: bounds.minLng + random() * (bounds.maxLng - bounds.minLng),
          }
          if (insidePolygon(point)) return point
        }
        return { lat: 1.3521, lng: 103.8198 }
      }

      function normalize(value) {
        return value
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      }

      function usableReviews(reviews, placeName) {
        const name = normalize(placeName)
        return (reviews ?? []).filter((review) => {
          const text = normalize(review.text ?? '')
          return text.length > 0 && (!name || !text.includes(name))
        })
      }

      function isFoodPlace(types) {
        if (!types.length) return false
        if (types.some((type) => nonFoodTypes.has(type))) return false
        return types.some((type) => foodTypes.has(type) || type.endsWith('_restaurant'))
      }

      function isSingaporePlace(place) {
        const { lat, lng } = place.location
        if (lat < bounds.minLat || lat > bounds.maxLat || lng < bounds.minLng || lng > bounds.maxLng) {
          return false
        }
        const country = place.countryCode?.trim().toUpperCase()
        return country === 'SG' || country === 'SINGAPORE'
      }

      function toPlaceData(place) {
        if (!place?.id || !place.location) return null

        const types = [...(place.types ?? [])]
        if (place.primaryType && !types.includes(place.primaryType)) {
          types.unshift(place.primaryType)
        }

        const photos =
          place.photos
            ?.map((photo) => {
              try {
                return photo.getURI({ maxWidth: 600 })
              } catch {
                return null
              }
            })
            .filter(Boolean)
            .slice(0, 3) ?? []

        const reviews = (place.reviews ?? [])
          .map((review) => ({
            author: review.authorAttribution?.displayName || 'Google user',
            rating: review.rating ?? 0,
            text: review.text || '',
            relativeTime: review.relativePublishTimeDescription || '',
            profilePhoto: review.authorAttribution?.photoURI || undefined,
          }))
          .filter((review) => review.text.length > 0)

        return {
          placeId: place.id,
          name: place.displayName || 'Unknown place',
          address: place.formattedAddress || '',
          location: { lat: place.location.lat(), lng: place.location.lng() },
          rating: place.rating ?? undefined,
          userRatingsTotal: place.userRatingCount ?? undefined,
          countryCode: place.addressComponents?.find((component) =>
            component.types.includes('country'),
          )?.shortText,
          types,
          photos,
          reviews,
        }
      }

      const places = []
      const usedIds = new Set()

      for (let round = 0; round < config.totalRounds; round += 1) {
        let selected = null
        const summaries = []

        for (let attempt = 0; attempt < config.coordinateAttempts; attempt += 1) {
          const center = randomPointInSingapore()
          const radius =
            attempt < config.coordinateAttempts - 1
              ? config.localRadiusMeters
              : config.wideRadiusMeters

          let response
          try {
            response = await PlaceClass.searchNearby({
              fields,
              locationRestriction: { center, radius },
              includedTypes: config.searchFoodTypes,
              maxResultCount: config.maxResultCount,
              rankPreference: 'DISTANCE',
              language: 'en',
            })
          } catch (error) {
            const detail = error?.message ?? String(error)
            throw new Error(`Nearby Search failed: ${detail}`)
          }

          const results = (response.places ?? [])
            .map(toPlaceData)
            .filter(Boolean)
            .filter((place) => !usedIds.has(place.placeId))
            .filter((place) => isFoodPlace(place.types) && isSingaporePlace(place))
            .sort((a, b) => (b.userRatingsTotal ?? 0) - (a.userRatingsTotal ?? 0))

          for (const candidate of results.slice(0, config.maxResultCount)) {
            if (usableReviews(candidate.reviews, candidate.name).length >= 5) {
              selected = candidate
              break
            }
          }

          summaries.push(
            selected
              ? `selected "${selected.name}"`
              : `${results.length} places in round ${attempt + 1}`,
          )
          if (selected) break
        }

        if (!selected) {
          throw new Error(
            `Round ${round + 1}: no Singapore food place with 5 usable reviews (${summaries.join('; ')}).`,
          )
        }

        places.push(selected)
        usedIds.add(selected.placeId)
      }

      return places
    },
    { key: apiKey, fields: FIELDS, config: { ...CONFIG, seed } },
  )
}

function outputFor(date) {
  return IS_DEFAULT ? DEFAULT_OUTPUT : resolve(PUZZLE_DIR, `${date}.json`)
}

function photoPrefixFor(date) {
  return IS_DEFAULT ? 'default' : date
}

async function downloadPhotos(photoTargets) {
  const maxConcurrent = 2
  const entries = [...photoTargets.entries()]

  for (let i = 0; i < entries.length; i += maxConcurrent) {
    const batch = entries.slice(i, i + maxConcurrent)
    await Promise.all(
      batch.map(async ([url, target]) => {
        let lastError
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await fetch(url)
            if (!response.ok) {
              throw new Error(`Photo download failed (${response.status}): ${url}`)
            }
            const buffer = await response.arrayBuffer()
            await writeFile(target, Buffer.from(buffer))
            return
          } catch (error) {
            lastError = error
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
            }
          }
        }
        throw new Error(`Failed to download ${url} after 3 attempts: ${lastError.message}`)
      }),
    )
  }

  const missing = [...photoTargets.values()].filter((target) => !existsSync(target))
  if (missing.length > 0) {
    throw new Error(`Missing ${missing.length} downloaded photo(s).`)
  }
}

async function generatePuzzle(page, date) {
  const output = outputFor(date)
  if (!IS_DEFAULT && existsSync(output)) {
    console.log(`Skipping ${date}: ${output} already exists`)
    return
  }

  const seed = IS_DEFAULT ? 'default' : date
  const places = await generateInBrowser(page, API_KEY, seed)
  const prefix = photoPrefixFor(date)

  // Download the Place photos once during generation and serve them as static
  // files. The JSON then contains local paths instead of Google photo URLs,
  // so players never trigger a Place Photos request.
  const photoTargets = new Map()
  places.forEach((place, round) => {
    place.photos = place.photos.map((url, index) => {
      const filename = `${prefix}-${String(round + 1).padStart(2, '0')}-${String(
        index + 1,
      ).padStart(2, '0')}.jpg`
      photoTargets.set(url, resolve(PHOTO_DIR, filename))
      return `photos/${filename}`
    })
  })

  await mkdir(PHOTO_DIR, { recursive: true })
  await downloadPhotos(photoTargets)

  const puzzle = {
    source: IS_DEFAULT ? 'default' : 'daily',
    date,
    seed,
    places,
  }

  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(puzzle, null, 2)}\n`)
  console.log(`Wrote ${output} (${places.length} places, ${photoTargets.size} photos)`)
  for (const place of places) console.log(`  ${place.name}`)
}

async function pruneWindow(dates) {
  if (IS_DEFAULT) return

  const keep = new Set(dates)
  await mkdir(PUZZLE_DIR, { recursive: true })
  await mkdir(PHOTO_DIR, { recursive: true })
  let removed = 0

  for (const file of await readdir(PUZZLE_DIR)) {
    const match = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(file)
    if (match && !keep.has(match[1])) {
      await unlink(resolve(PUZZLE_DIR, file))
      removed += 1
    }
  }

  for (const file of await readdir(PHOTO_DIR)) {
    const match = /^(\d{4}-\d{2}-\d{2})-/.exec(file)
    if (match && !keep.has(match[1])) {
      await unlink(resolve(PHOTO_DIR, file))
      removed += 1
    }
  }

  if (removed > 0) {
    console.log(`Pruned ${removed} file(s) outside ${dates[0]}..${dates.at(-1)}`)
  }
}

async function main() {
  console.log(`Puzzle window: ${DATES[0]}..${DATES.at(-1)} (${DATES.length} day(s))`)

  const datesToGenerate = IS_DEFAULT
    ? DATES
    : DATES.filter((date) => !existsSync(outputFor(date)))

  if (datesToGenerate.length === 0) {
    await pruneWindow(DATES)
    console.log(`All ${DATES.length} puzzles already exist for ${DATES[0]}..${DATES.at(-1)}`)
    return
  }

  const server = await startLocalServer()
  let browser

  try {
    browser = await puppeteer.launch({
      executablePath: findChrome(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    const page = await browser.newPage()
    await page.setCacheEnabled(false)
    page.setDefaultTimeout(180_000)
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(`[browser] ${message.text()}`)
    })
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })

    for (const date of datesToGenerate) {
      await generatePuzzle(page, date)
    }

    await pruneWindow(DATES)
  } finally {
    await browser?.close()
    await new Promise((resolveClose) => server.close(resolveClose))
  }
}

await main()
