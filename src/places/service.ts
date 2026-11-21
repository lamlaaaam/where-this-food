import { Loader } from '@googlemaps/js-api-loader'
import { haversineMeters, isInSingapore } from '../data/geo'
import type { PlaceData, ReviewData } from '../types'

/**
 * Places API (New) field masks.
 * Only request what the game actually uses to keep requests cheap.
 */
const DETAIL_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'photos',
  'reviews',
  'types',
  'rating',
  'userRatingCount',
]

// Keep searches on the cheaper Pro SKU; rating/ratings are fetched for the
// chosen place only. Results stay in prominence order.
const SEARCH_FIELDS = ['id', 'displayName', 'location', 'types']

/**
 * Types allowed in an `includedTypes` request parameter (Table A of the
 * Places API place-types reference). Table B values such as `food` may only
 * appear in responses — sending one makes searchNearby fail with
 * INVALID_ARGUMENT.
 */
const SEARCH_FOOD_TYPES = [
  'restaurant',
  'cafe',
  'bakery',
  'bar',
  'meal_takeaway',
  'meal_delivery',
  'night_club',
]

/** Types used to recognize food results, including response-only values. */
const FOOD_TYPES = new Set([...SEARCH_FOOD_TYPES, 'food'])

const GENERIC_TYPES = new Set([
  'restaurant',
  'food',
  'point_of_interest',
  'establishment',
  'store',
  'meal_takeaway',
  'meal_delivery',
  'night_club',
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

function errorStatus(error: unknown): string {
  if (error instanceof PlacesError) return error.status

  if (error && typeof error === 'object') {
    const candidate = (error as { status?: unknown; code?: unknown; name?: unknown }).status ??
      (error as { status?: unknown; code?: unknown; name?: unknown }).code ??
      (error as { status?: unknown; code?: unknown; name?: unknown }).name
    if (typeof candidate === 'string' && candidate.length > 0) return candidate.toUpperCase()
  }

  const message = error instanceof Error ? error.message : String(error)
  const match = message.match(
    /\b(REQUEST_DENIED|PERMISSION_DENIED|OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED|INVALID_REQUEST|INVALID_ARGUMENT|NOT_FOUND)\b/,
  )
  return match?.[1] ?? 'UNKNOWN'
}

function errorDetail(error: unknown): string {
  const message =
    error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : error instanceof Error
        ? error.message
        : ''
  return message.replace(/\s+/g, ' ').slice(0, 200)
}

function placesFailure(error: unknown): PlacesError {
  const status = errorStatus(error)
  const detail = errorDetail(error)
  console.error('[Places] request failed:', error)

  switch (status) {
    case 'REQUEST_DENIED':
    case 'PERMISSION_DENIED':
      return new PlacesError(
        'Google Places denied the request. Check that Places API (New) is enabled for this key and that billing is configured.',
        status,
      )
    case 'OVER_QUERY_LIMIT':
    case 'RESOURCE_EXHAUSTED':
      return new PlacesError(
        `Google Places quota exceeded for this key (${status}${detail ? `: ${detail}` : ''}). Check the Google Cloud Quotas page and billing for Places API (New) / Maps JavaScript Places usage.`,
        status,
      )
    case 'INVALID_REQUEST':
    case 'INVALID_ARGUMENT':
      return new PlacesError(
        `Google Places rejected the request${detail ? ` (${detail})` : ''}.`,
        status,
      )
    case 'NOT_FOUND':
      return new PlacesError('Google Places could not find that place.', status)
    default:
      return new PlacesError(`Google Places request failed (${status}).`, status)
  }
}

async function callPlaces<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request()
  } catch (error) {
    throw placesFailure(error)
  }
}

let loaderPromise: Promise<typeof google> | null = null
let placeClassPromise: Promise<typeof google.maps.places.Place> | null = null

/** Load the Maps JavaScript API with the new Places library. */
export function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (!loaderPromise) {
    const loader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['places'],
    })

    loaderPromise = loader
      .load()
      .then(async () => {
        await getPlaceClass()
        return google
      })
      .catch((error: unknown) => {
        loaderPromise = null
        placeClassPromise = null
        throw error
      })
  }
  return loaderPromise
}

async function getPlaceClass(): Promise<typeof google.maps.places.Place> {
  if (!placeClassPromise) {
    placeClassPromise = google.maps
      .importLibrary('places')
      .then((library) => {
        const placesLibrary = library as google.maps.PlacesLibrary
        const PlaceClass = placesLibrary.Place ?? google.maps.places.Place
        if (!PlaceClass) {
          throw new PlacesError('Google Places API (New) is not available.', 'UNKNOWN')
        }
        return PlaceClass
      })
      .catch((error: unknown) => {
        placeClassPromise = null
        throw placesFailure(error)
      })
  }
  return placeClassPromise
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

function toPlaceData(place: google.maps.places.Place): PlaceData {
  const location = place.location
  if (!location) throw new Error('Place is missing a location')

  const types = [...(place.types ?? [])]
  if (place.primaryType && !types.includes(place.primaryType)) {
    types.unshift(place.primaryType)
  }

  const photos =
    place.photos
      ?.map((photo) => {
        try {
          return photo.getURI({ maxWidth: 1000 })
        } catch (error) {
          console.warn('[Places] Could not get photo URI:', error)
          return null
        }
      })
      .filter((url): url is string => Boolean(url)) ?? []

  const reviews: ReviewData[] = (place.reviews ?? []).map((review) => ({
    author: review.authorAttribution?.displayName || 'Google user',
    rating: review.rating ?? 0,
    text: review.text || '',
    relativeTime: review.relativePublishTimeDescription || '',
    profilePhoto: review.authorAttribution?.photoURI || undefined,
  }))

  return {
    placeId: place.id,
    name: place.displayName || 'Unknown place',
    address: place.formattedAddress || '',
    location: { lat: location.lat(), lng: location.lng() },
    rating: place.rating ?? undefined,
    userRatingsTotal: place.userRatingCount ?? undefined,
    types,
    photos,
    reviews,
  }
}

/** Skip malformed search results instead of failing the whole request. */
function toPlaceDataSafe(place: google.maps.places.Place): PlaceData | null {
  try {
    return toPlaceData(place)
  } catch (error) {
    console.warn('[Places] Skipping incomplete place result:', error)
    return null
  }
}

export class PlacesApi {
  private readonly detailsCache = new Map<string, PlaceData>()

  async nearbyRestaurants(
    center: google.maps.LatLngLiteral,
    radiusMeters: number,
  ): Promise<PlaceData[]> {
    const PlaceClass = await getPlaceClass()

    const response = await callPlaces(() =>
      PlaceClass.searchNearby({
        fields: SEARCH_FIELDS,
        locationRestriction: { center, radius: radiusMeters },
        includedTypes: SEARCH_FOOD_TYPES,
        maxResultCount: 20,
        language: 'en',
      }),
    )

    return (response.places ?? [])
      .map(toPlaceDataSafe)
      .filter((place): place is PlaceData => Boolean(place))
      .filter((place) => isFoodPlace(place.types) && isInSingapore(place.location))
  }

  async nearestRestaurants(
    location: google.maps.LatLngLiteral,
    radiusMeters: number,
  ): Promise<PlaceData[]> {
    const PlaceClass = await getPlaceClass()

    const response = await callPlaces(() =>
      PlaceClass.searchNearby({
        fields: SEARCH_FIELDS,
        locationRestriction: { center: location, radius: radiusMeters },
        includedTypes: SEARCH_FOOD_TYPES,
        maxResultCount: 10,
        rankPreference: 'DISTANCE',
        language: 'en',
      }),
    )

    return (response.places ?? [])
      .map(toPlaceDataSafe)
      .filter((place): place is PlaceData => Boolean(place))
      .filter((place) => {
        return (
          isFoodPlace(place.types) &&
          haversineMeters(location, place.location) <= radiusMeters
        )
      })
  }

  async details(placeId: string): Promise<PlaceData> {
    const cached = this.detailsCache.get(placeId)
    if (cached) return cached

    const PlaceClass = await getPlaceClass()
    const place = await callPlaces(async () => {
      // Google's documented pattern: fetchFields() mutates this instance.
      const request = new PlaceClass({ id: placeId, requestedLanguage: 'en' })
      await request.fetchFields({ fields: DETAIL_FIELDS })
      return request
    })

    const data = toPlaceData(place)
    this.detailsCache.set(placeId, data)
    return data
  }
}
