import { CONFIG } from '../config'
import { isInSingapore } from '../data/geo'
import type { PlaceData } from '../types'
import { usableReviews } from './reviews'
import { isFoodPlace, PlacesApi } from './service'

const SEARCH_CENTERS = [CONFIG.singaporeCenter, { lat: 1.32, lng: 103.85 }]

function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /quota|exceeded|RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT/i.test(message)
}

export async function selectAnswerPlace(
  api: PlacesApi,
  usedPlaceIds: Set<string>,
): Promise<PlaceData> {
  const centers = shuffle([...SEARCH_CENTERS])
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

        // The Places API returns at most 5 reviews total, so requiring every
        // star bucket is too strict. Accept places with enough usable,
        // non-spoiling reviews; prefer fuller star coverage.
        if (eligible.length >= 3) {
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
