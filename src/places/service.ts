import { Loader } from '@googlemaps/js-api-loader'
import { haversineMeters } from '../data/geo'
import type { PlaceData, ReviewData } from '../types'

export type PlaceResult = google.maps.places.PlaceResult

const DETAIL_FIELDS = [
  'place_id',
  'name',
  'geometry',
  'photos',
  'reviews',
  'types',
  'rating',
  'user_ratings_total',
  'formatted_address',
  'vicinity',
  'url',
]

const FOOD_TYPES = new Set([
  'restaurant',
  'cafe',
  'bakery',
  'bar',
  'food',
  'meal_takeaway',
  'meal_delivery',
  'night_club',
])

const GENERIC_TYPES = new Set([
  'restaurant',
  'food',
  'point_of_interest',
  'establishment',
  'store',
  'meal_takeaway',
  'meal_delivery',
])

export class PlacesError extends Error {
  constructor(
    message: string,
    readonly status: string,
  ) {
    super(message)
    this.name = 'PlacesError'
  }
}

function placesFailure(status: string): PlacesError {
  switch (status) {
    case 'REQUEST_DENIED':
      return new PlacesError(
        'Google Places denied the request. The key may be a Maps Demo Key, or the Places API may not be enabled for it.',
        status,
      )
    case 'OVER_QUERY_LIMIT':
      return new PlacesError('Google Places quota exceeded for this key.', status)
    case 'INVALID_REQUEST':
      return new PlacesError('Google Places rejected the request.', status)
    default:
      return new PlacesError(`Google Places request failed (${status}).`, status)
  }
}

let loaderPromise: Promise<typeof google> | null = null

export function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (!loaderPromise) {
    const loader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['places'],
    })
    loaderPromise = loader.load().catch((error: unknown) => {
      // Allow the player to retry with a different key.
      loaderPromise = null
      throw error
    })
  }
  return loaderPromise
}

export class PlacesApi {
  private readonly service: google.maps.places.PlacesService
  private readonly cache = new Map<string, PlaceResult>()

  constructor(map: google.maps.Map) {
    this.service = new google.maps.places.PlacesService(map)
  }

  nearbyRestaurants(
    center: google.maps.LatLngLiteral,
    radiusMeters: number,
  ): Promise<PlaceResult[]> {
    return new Promise((resolve, reject) => {
      this.service.nearbySearch(
        { location: center, radius: radiusMeters, type: 'restaurant' },
        (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            resolve(results)
          } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            resolve([])
          } else {
            reject(placesFailure(status))
          }
        },
      )
    })
  }

  nearestRestaurants(
    location: google.maps.LatLngLiteral,
    radiusMeters: number,
  ): Promise<PlaceResult[]> {
    return new Promise((resolve, reject) => {
      this.service.nearbySearch(
        {
          location,
          type: 'restaurant',
          rankBy: google.maps.places.RankBy.DISTANCE,
        },
        (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            const nearby = results.filter((result) => {
              const point = result.geometry?.location
              if (!point) return false
              return (
                haversineMeters(location, { lat: point.lat(), lng: point.lng() }) <=
                radiusMeters
              )
            })
            resolve(nearby)
          } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            resolve([])
          } else {
            reject(placesFailure(status))
          }
        },
      )
    })
  }

  details(placeId: string): Promise<PlaceResult> {
    const cached = this.cache.get(placeId)
    if (cached) return Promise.resolve(cached)

    return new Promise((resolve, reject) => {
      this.service.getDetails(
        { placeId, fields: DETAIL_FIELDS },
        (result, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && result) {
            this.cache.set(placeId, result)
            resolve(result)
          } else {
            reject(placesFailure(status))
          }
        },
      )
    })
  }
}

export function isFoodPlace(types: string[] | undefined): boolean {
  return (types ?? []).some((type) => FOOD_TYPES.has(type))
}

export function describeCuisine(types: string[]): string {
  const cuisines = types
    .filter((type) => !GENERIC_TYPES.has(type))
    .map(humanizeType)
    .filter(Boolean)
    .slice(0, 3)

  return cuisines.length > 0 ? cuisines.join(' · ') : 'Restaurant'
}

function humanizeType(type: string): string {
  return type
    .replace(/_restaurant$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export function toPlaceData(place: PlaceResult): PlaceData {
  const location = place.geometry?.location
  if (!location) throw new Error('Place is missing a location')

  return {
    placeId: place.place_id ?? '',
    name: place.name ?? 'Unknown place',
    address: place.formatted_address ?? place.vicinity ?? '',
    location: { lat: location.lat(), lng: location.lng() },
    rating: place.rating,
    userRatingsTotal: place.user_ratings_total,
    types: place.types ?? [],
    photos: photoUrls(place),
    reviews: (place.reviews ?? []).map(toReviewData),
  }
}

function toReviewData(review: google.maps.places.PlaceReview): ReviewData {
  return {
    author: review.author_name || 'Google user',
    rating: review.rating ?? 0,
    text: review.text || '',
    relativeTime: review.relative_time_description || '',
    profilePhoto: review.profile_photo_url,
  }
}

function photoUrls(place: PlaceResult, maxWidth = 1000): string[] {
  return (place.photos ?? []).map((photo) =>
    photo.getUrl({ maxWidth, maxHeight: maxWidth }),
  )
}
