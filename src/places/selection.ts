import { CONFIG } from '../config'
import { randomPointInSingapore } from '../data/geo'
import type { PlaceData } from '../types'
import { usableReviews } from './reviews'
import { isFoodPlace, isSingaporePlace, PlacesApi } from './service'

const LOCAL_RADIUS_METERS = 12_000

function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /quota|exceeded|RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT/i.test(message)
}

/**
 * Pick a random point in Singapore, take the 10 nearest food places, and play
 * the one with the most reviews that can supply five non-spoiling review texts.
 * Reviews and photos arrive with the nearby search, so no extra detail calls
 * are needed for the candidates that are inspected.
 */
export async function selectAnswerPlace(
  api: PlacesApi,
  usedPlaceIds: Set<string>,
): Promise<PlaceData> {
  let lastError: unknown = null
  let totalResults = 0
  let totalCandidates = 0
  let inspected = 0
  let maxReviews = 0
  let sample = ''

  for (let attempt = 0; attempt < CONFIG.answerCoordinateAttempts; attempt += 1) {
    const center = randomPointInSingapore()
    const radiusMeters =
      attempt < CONFIG.answerCoordinateAttempts - 1
        ? LOCAL_RADIUS_METERS
        : CONFIG.answerSearchRadiusMeters

    let results: PlaceData[]
    try {
      results = await api.nearbyAnswerCandidates(center, radiusMeters)
    } catch (error) {
      lastError = error
      if (isQuotaError(error)) throw error
      continue
    }

    totalResults += results.length

    const candidates = results
      .filter(
        (place) =>
          Boolean(place.placeId) &&
          !usedPlaceIds.has(place.placeId) &&
          isFoodPlace(place.types) &&
          isSingaporePlace(place),
      )
      .sort((a, b) => (b.userRatingsTotal ?? 0) - (a.userRatingsTotal ?? 0))
      .slice(0, CONFIG.maxCandidatesToInspect)

    totalCandidates += candidates.length

    for (const candidate of candidates) {
      inspected += 1
      if (!isFoodPlace(candidate.types) || !isSingaporePlace(candidate)) {
        console.warn('[Places] Skipping ineligible search result:', candidate.name, candidate.types)
        continue
      }

      // Google returns at most five review texts per place, so all five must
      // be usable clues for a round to be playable.
      const eligible = usableReviews(candidate.reviews, candidate.name)
      maxReviews = Math.max(maxReviews, eligible.length)
      if (!sample) {
        sample =
          ` sample: "${candidate.name}" id=${candidate.placeId} ` +
          `rating=${candidate.rating} ratings=${candidate.userRatingsTotal} ` +
          `photos=${candidate.photos.length} reviews=${eligible.length}`
      }

      if (eligible.length >= 5) {
        return candidate
      }
    }
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : ''
  throw new Error(
    `Google Places returned no Singapore food place with 5 usable reviews ` +
      `(attempts: ${CONFIG.answerCoordinateAttempts}, results: ${totalResults}, ` +
      `candidates: ${totalCandidates}, inspected: ${inspected}, ` +
      `max reviews: ${maxReviews})${sample}${detail}.`,
  )
}
