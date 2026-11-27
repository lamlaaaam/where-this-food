import type { HintId } from './config'

export interface ReviewData {
  author: string
  rating: number
  text: string
  relativeTime: string
  profilePhoto?: string
}

export interface PlaceData {
  placeId: string
  name: string
  address: string
  location: google.maps.LatLngLiteral
  rating?: number
  userRatingsTotal?: number
  countryCode?: string
  types: string[]
  photos: string[]
  reviews: ReviewData[]
}

export interface DailyPuzzle {
  date: string
  places: PlaceData[]
  source?: 'daily' | 'default'
  seed?: string
}

export interface Guess {
  placeId: string
  name: string
  location: google.maps.LatLngLiteral
}

export interface Hint {
  id: HintId
  label: string
  unlocked: boolean
  available: boolean
  content: string
}

export interface RoundScore {
  round: number
  score: number
  placeName: string
  skipped?: boolean
  attempts: number
  hintsUsed: number
  unusedHints: number
  bestDistanceMeters: number | null
  distanceScore: number
  hintBonus: number
}
