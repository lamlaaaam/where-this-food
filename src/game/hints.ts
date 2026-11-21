import { HINT_LABELS, HINT_ORDER, type HintId } from '../config'
import { formatDistance, haversineMeters, type GeoPoint } from '../data/geo'
import { MRT_STATIONS } from '../data/mrt'
import type { Hint, PlaceData } from '../types'
import { escapeHtml } from '../ui/utils'

interface NearbyMrt {
  point: GeoPoint
  distanceMeters: number
}

const CHEAP_TYPES = new Set([
  'bakery',
  'cafe',
  'coffee_shop',
  'food',
  'food_court',
  'hawker_center',
  'meal_delivery',
  'meal_takeaway',
  'snack_bar',
])

const MID_TYPES = new Set([
  'bistro',
  'deli',
  'diner',
  'noodle_shop',
  'restaurant',
  'steak_house',
])

const PRICEY_TYPES = new Set([
  'bar',
  'brewery',
  'brewpub',
  'cocktail_bar',
  'gastropub',
  'lounge_bar',
  'night_club',
  'pub',
  'wine_bar',
])

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function pickNearbyMrt(location: { lat: number; lng: number }): NearbyMrt | null {
  const closest = MRT_STATIONS.map((point) => ({
    point,
    distanceMeters: haversineMeters(location, point),
  }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 3)

  if (closest.length === 0) return null
  return closest[Math.floor(Math.random() * closest.length)]
}

function expectedCost(place: PlaceData): { low: number; high: number } {
  let baseLow = 12
  let baseHigh = 25

  if (place.types.some((type) => PRICEY_TYPES.has(type))) {
    baseLow = 25
    baseHigh = 45
  } else if (place.types.some((type) => CHEAP_TYPES.has(type))) {
    baseLow = 5
    baseHigh = 12
  } else if (place.types.some((type) => MID_TYPES.has(type))) {
    baseLow = 10
    baseHigh = 22
  }

  const low = baseLow + randomInt(0, 3)
  return { low, high: low + randomInt(5, Math.max(6, baseHigh - low)) }
}

function maskedAnswer(name: string): string {
  const chars = [...name]
  const letterIndices = chars
    .map((char, index) => (/[a-z]/i.test(char) ? index : -1))
    .filter((index) => index >= 0)

  if (letterIndices.length === 0) return name

  const revealCount = Math.min(
    letterIndices.length,
    Math.max(3, Math.round(letterIndices.length * 0.4)),
  )
  const revealed = new Set(shuffle(letterIndices).slice(0, revealCount))

  return chars
    .map((char, index) => {
      if (!/[a-z]/i.test(char)) return char
      return revealed.has(index) ? char.toUpperCase() : '_'
    })
    .join('')
}

export function buildHints(place: PlaceData): Hint[] {
  const photos = shuffle(place.photos)
  const mrt = pickNearbyMrt(place.location)

  return HINT_ORDER.map((id) => {
    const { content } = buildHint(id, place, photos, mrt)
    return {
      id,
      label: HINT_LABELS[id],
      unlocked: false,
      available: content.length > 0,
      content,
    }
  })
}

function buildHint(
  id: HintId,
  place: PlaceData,
  photos: string[],
  mrt: NearbyMrt | null,
): { content: string } {
  switch (id) {
    case 'photo1':
      return photoHint(photos[0], 'photo-one')
    case 'photo2':
      return photoHint(photos[1], 'photo-two')
    case 'photo3':
      return photoHint(photos[2], 'photo-three')
    case 'mrt':
      return mrt
        ? {
            content: `<p class="hint-big">${escapeHtml(mrt.point.name)} MRT</p><p class="hint-sub">${formatDistance(
              mrt.distanceMeters,
            )} away</p>`,
          }
        : { content: '' }
    case 'cost': {
      const { low, high } = expectedCost(place)
      return {
        content: `<p class="hint-big">$${low}–$${high}</p><p class="hint-sub">Expected cost per person</p>`,
      }
    }
    case 'maskedAnswer':
      return {
        content: `<p class="hint-big masked-answer">${escapeHtml(
          maskedAnswer(place.name),
        )}</p><p class="hint-sub">Letters revealed at random</p>`,
      }
  }
}

function photoHint(url: string | undefined, className: string): { content: string } {
  if (!url) return { content: '' }

  return {
    content: `<figure class="hint-photo ${className}"><img src="${escapeHtml(
      url,
    )}" alt="Hint photo" loading="lazy" /></figure>`,
  }
}
