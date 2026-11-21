import { CONFIG } from '../config'
import { isInSingapore } from '../data/geo'
import type { PlaceData } from '../types'
import { isFoodPlace, type PlaceResult, toPlaceData } from './service'
import type { PlacesApi } from './service'

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
    let results: PlaceResult[]
    try {
      results = await api.nearbyRestaurants(center, CONFIG.answerSearchRadiusMeters)
    } catch (error) {
      lastError = error
      continue
    }

    const candidates = shuffle(
      results.filter((result) => {
        const location = result.geometry?.location
        if (!location) return false
        return (
          Boolean(result.place_id) &&
          !usedPlaceIds.has(result.place_id as string) &&
          (result.user_ratings_total ?? 0) >= 5 &&
          isFoodPlace(result.types) &&
          isInSingapore({ lat: location.lat(), lng: location.lng() })
        )
      }),
    ).slice(0, CONFIG.maxCandidatesToInspect)

    for (const candidate of candidates) {
      const placeId = candidate.place_id
      if (!placeId) continue

      try {
        const details = await api.details(placeId)
        const place = toPlaceData(details)
        const distinctRatings = new Set(place.reviews.map((review) => Math.round(review.rating)))

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
