import { HINT_LABELS, HINT_ORDER, type HintId } from '../config'
import { formatDistance, haversineMeters, type GeoPoint } from '../data/geo'
import { MRT_STATIONS } from '../data/mrt'
import type { Hint, PlaceData } from '../types'
import { escapeHtml } from '../ui/utils'

interface NearbyMrt {
  point: GeoPoint
  distanceMeters: number
}

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
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

export function buildHints(place: PlaceData): Hint[] {
  const photos = shuffle(place.photos)
  const mrt = pickNearbyMrt(place.location)

  return HINT_ORDER.map((id) => {
    const { content } = buildHint(id, photos, mrt)
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
  photos: string[],
  mrt: NearbyMrt | null,
): { content: string } {
  switch (id) {
    case 'placePhoto':
      return photoHint(photos[0], 'The place', 'place-photo')
    case 'mrt':
      return mrt
        ? {
            content: `<p class="hint-big">${escapeHtml(mrt.point.name)} MRT</p><p class="hint-sub">${formatDistance(
              mrt.distanceMeters,
            )} away</p>`,
          }
        : { content: '' }
    case 'foodPhoto':
      return photoHint(photos[1], 'Another photo', 'another-photo')
  }
}

function photoHint(
  url: string | undefined,
  label: string,
  className: string,
): { content: string } {
  if (!url) return { content: '' }

  return {
    content: `<figure class="hint-photo ${className}"><img src="${escapeHtml(
      url,
    )}" alt="${escapeHtml(label)}" loading="lazy" /><figcaption>${escapeHtml(
      label,
    )}</figcaption></figure>`,
  }
}
