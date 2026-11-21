import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
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

const DATE =
  process.env.PUZZLE_DATE ?? singaporeDate(Number(process.env.PUZZLE_DATE_OFFSET_DAYS ?? 0))
const OUTPUT = resolve(
  ROOT,
  process.env.PUZZLE_OUTPUT ??
    (IS_DEFAULT ? 'public/daily-puzzle-default.json' : 'public/daily-puzzle.json'),
)
const SEED = process.env.PUZZLE_SEED ?? (IS_DEFAULT ? 'default' : DATE)

const CONFIG = {
  seed: SEED,
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

async function generateInBrowser(page, apiKey) {
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
                return photo.getURI({ maxWidth: 1000 })
              } catch {
                return null
              }
            })
            .filter(Boolean) ?? []

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
    { key: apiKey, fields: FIELDS, config: CONFIG },
  )
}

async function main() {
  const server = await startLocalServer()
  let browser

  try {
    browser = await puppeteer.launch({
      executablePath: findChrome(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    const page = await browser.newPage()
    page.setDefaultTimeout(180_000)
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(`[browser] ${message.text()}`)
    })
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })

    const places = await generateInBrowser(page, API_KEY)
    const puzzle = {
      source: IS_DEFAULT ? 'default' : 'daily',
      date: DATE,
      seed: SEED,
      places,
    }

    await mkdir(dirname(OUTPUT), { recursive: true })
    await writeFile(OUTPUT, `${JSON.stringify(puzzle, null, 2)}\n`)
    console.log(`Wrote ${OUTPUT} (${places.length} places)`)
    for (const place of places) console.log(`  ${place.name}`)
  } finally {
    await browser?.close()
    await new Promise((resolveClose) => server.close(resolveClose))
  }
}

await main()
