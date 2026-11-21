import { HINT_LABELS, HINT_ORDER, type HintId } from '../config'
import { formatDistance, nearestPoint } from '../data/geo'
import { LANDMARKS } from '../data/landmarks'
import { MRT_STATIONS } from '../data/mrt'
import type { Hint, PlaceData } from '../types'
import { escapeHtml } from '../ui/utils'

export function buildHints(place: PlaceData): Hint[] {
  const mrt = nearestPoint(place.location, MRT_STATIONS)
  const landmark = nearestPoint(place.location, LANDMARKS)

  return HINT_ORDER.map((id) => {
    const hint = buildHint(id, place, mrt, landmark)
    return {
      id,
      label: HINT_LABELS[id],
      unlocked: false,
      available: hint.content.length > 0,
      content: hint.content,
    }
  })
}

type Nearest = ReturnType<typeof nearestPoint>

function buildHint(
  id: HintId,
  place: PlaceData,
  mrt: Nearest,
  landmark: Nearest,
): { content: string } {
  switch (id) {
    case 'placePhoto':
      return photoHint(place.photos[0], 'The place', 'place-photo')
    case 'mrt':
      return mrt
        ? {
            content: `<p class="hint-big">${escapeHtml(mrt.point.name)} MRT</p><p class="hint-sub">${formatDistance(
              mrt.distanceMeters,
            )} away</p>`,
          }
        : { content: '' }
    case 'landmark':
      return landmark
        ? {
            content: `<p class="hint-big">${escapeHtml(
              landmark.point.name,
            )}</p><p class="hint-sub">${formatDistance(landmark.distanceMeters)} away</p>`,
          }
        : { content: '' }
    case 'menuPhoto':
      return photoHint(place.photos[1], 'Menu', 'menu-photo')
    case 'foodPhoto':
      return photoHint(place.photos[2], 'The food', 'food-photo')
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
