import { CONFIG } from '../config'
import { isInSingapore } from '../data/geo'
import type { PlaceData } from '../types'
import { hasEnoughUsableReviews, usableReviews } from './reviews'
import { isFoodPlace, PlacesApi } from './service'

const SEARCH_CENTERS = [
  CONFIG.singaporeCenter,
  { lat: 1.28, lng: 103.84 }, // CBD / south
  { lat: 1.32, lng: 103.88 }, // central east
  { lat: 1.35, lng: 103.94 }, // east
  { lat: 1.31, lng: 103.76 }, // west
  { lat: 1.38, lng: 103.85 }, // north
  { lat: 1.27, lng: 103.82 }, // Sentosa / south-west
]

function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /quota|exceeded|RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT/i.test(message)
}

export async function selectAnswerPlace(
  api: PlacesApi,
  usedPlaceIds: Set<string>,
): Promise<PlaceData> {
  const centers = shuffle([...SEARCH_CENTERS]).slice(0, 2)
  let lastError: unknown = null
  let totalResults = 0
  let totalCandidates = 0
  let inspected = 0
  let maxReviews = 0
  let sample = ''

  for (const center of centers) {
    let results: PlaceData[]
    try {
      results = await api.nearbyRestaurants(center, CONFIG.answerSearchRadiusMeters)
    } catch (error) {
      lastError = error
      if (isQuotaError(error)) throw error
      continue
    }

    totalResults += results.length

    // Prefer busy places, but do not require userRatingCount: some responses
    // omit it, and a place with reviews is still playable.
    const eligibleCandidates = results
      .filter(
        (place) =>
          Boolean(place.placeId) &&
          !usedPlaceIds.has(place.placeId) &&
          isFoodPlace(place.types) &&
          isInSingapore(place.location),
      )
      .sort((a, b) => (b.userRatingsTotal ?? 0) - (a.userRatingsTotal ?? 0))

    // Stay among the busier places, but randomise which of them get inspected
    // so repeat games do not unfold the same way.
    const candidates = shuffle(eligibleCandidates.slice(0, 20))

    totalCandidates += candidates.length

    for (const candidate of candidates.slice(0, CONFIG.maxCandidatesToInspect)) {
      inspected += 1
      try {
        const place = await api.details(candidate.placeId)
        if (!isFoodPlace(place.types)) {
          console.warn('[Places] Skipping non-food detail result:', place.name, place.types)
          continue
        }
        const eligible = usableReviews(place.reviews, place.name)
        maxReviews = Math.max(maxReviews, eligible.length)
        if (!sample) {
          sample =
            ` sample: "${place.name}" id=${place.placeId} ` +
            `rating=${place.rating} ratings=${place.userRatingsTotal} ` +
            `photos=${place.photos.length} reviews=${eligible.length}`
        }

        // Google returns at most 5 reviews. Require all five to be usable so
        // every round can show five real, non-spoiling reviews.
        if (hasEnoughUsableReviews(place.reviews, place.name)) {
          return place
        }
      } catch (error) {
        lastError = error
        if (isQuotaError(error)) throw error
        // Try the next candidate.
      }
    }
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : ''
  throw new Error(
    `Google Places returned no Singapore food place with 5 usable reviews ` +
      `(results: ${totalResults}, candidates: ${totalCandidates}, ` +
      `inspected: ${inspected}, max reviews: ${maxReviews})${sample}${detail}.`,
  )
}

export function shuffle<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[items[index], items[swapIndex]] = [items[swapIndex], items[index]]
  }
  return items
}
