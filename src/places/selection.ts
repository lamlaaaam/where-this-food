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

  for (const center of centers) {
    let results: PlaceData[]
    try {
      results = await api.nearbyRestaurants(center, CONFIG.answerSearchRadiusMeters)
    } catch (error) {
      lastError = error
      continue
    }

    const candidates = shuffle(
      results.filter((place) => {
        return (
          Boolean(place.placeId) &&
          !usedPlaceIds.has(place.placeId) &&
          (place.userRatingsTotal ?? 0) >= 5 &&
          isFoodPlace(place.types) &&
          isInSingapore(place.location)
        )
      }),
    ).slice(0, CONFIG.maxCandidatesToInspect)

    for (const candidate of candidates) {
      try {
        const place = await api.details(candidate.placeId)
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
  if (lastError) throw lastError
  throw new Error(
    'Google Places returned no Singapore food places with reviews. Please try again.',
  )
}

export function shuffle<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[items[index], items[swapIndex]] = [items[swapIndex], items[index]]
  }
  return items
}
