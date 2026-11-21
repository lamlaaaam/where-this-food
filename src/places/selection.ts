import { CONFIG } from '../config'
import { isInSingapore } from '../data/geo'
import type { PlaceData } from '../types'
import { isFoodPlace, PlacesApi } from './service'

const SEARCH_CENTERS = [
  CONFIG.singaporeCenter,
  { lat: 1.32, lng: 103.85 },
  { lat: 1.38, lng: 103.75 },
  { lat: 1.35, lng: 103.95 },
]

export async function selectAnswerPlace(
  api: PlacesApi,
  usedPlaceIds: Set<string>,
): Promise<PlaceData> {
  const centers = shuffle([...SEARCH_CENTERS])
  let fallback: PlaceData | null = null
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
      continue
    }

    totalResults += results.length

    // Prefer busy places, but do not require userRatingCount: some responses
    // omit it, and a place with reviews is still playable.
    const candidates = results
      .filter(
        (place) =>
          Boolean(place.placeId) &&
          !usedPlaceIds.has(place.placeId) &&
          isFoodPlace(place.types) &&
          isInSingapore(place.location),
      )
      .sort((a, b) => (b.userRatingsTotal ?? 0) - (a.userRatingsTotal ?? 0))

    totalCandidates += candidates.length

    for (const candidate of candidates.slice(0, CONFIG.maxCandidatesToInspect)) {
      inspected += 1
      try {
        const place = await api.details(candidate.placeId)
        maxReviews = Math.max(maxReviews, place.reviews.length)
        if (!sample) {
          sample =
            ` sample: "${place.name}" id=${place.placeId} ` +
            `rating=${place.rating} ratings=${place.userRatingsTotal} ` +
            `photos=${place.photos.length} reviews=${place.reviews.length}`
        }
        const distinctRatings = new Set(
          place.reviews.map((review) => Math.round(review.rating)),
        )

        if (place.reviews.length >= 5 && distinctRatings.size >= 3) {
          return place
        }
        if (!fallback && place.reviews.length >= 3) {
          fallback = place
        }
      } catch (error) {
        lastError = error
        // Try the next candidate.
      }
    }

    if (fallback) return fallback
  }

  if (fallback) return fallback

  const detail = lastError instanceof Error ? `: ${lastError.message}` : ''
  throw new Error(
    `Google Places returned no usable Singapore food place with reviews ` +
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
