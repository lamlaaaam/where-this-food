export interface GeoPoint {
  name: string
  lat: number
  lng: number
}

/** Rough bounding box around mainland Singapore and Sentosa. */
export const SINGAPORE_BOUNDS = {
  minLat: 1.23,
  maxLat: 1.475,
  minLng: 103.6,
  maxLng: 104.05,
} as const

export function isInSingapore(point: { lat: number; lng: number }): boolean {
  return (
    point.lat >= SINGAPORE_BOUNDS.minLat &&
    point.lat <= SINGAPORE_BOUNDS.maxLat &&
    point.lng >= SINGAPORE_BOUNDS.minLng &&
    point.lng <= SINGAPORE_BOUNDS.maxLng
  )
}

const EARTH_RADIUS_M = 6_371_000

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function nearestPoint<T extends GeoPoint>(
  origin: { lat: number; lng: number },
  points: readonly T[],
): { point: T; distanceMeters: number } | null {
  let best: { point: T; distanceMeters: number } | null = null

  for (const point of points) {
    const distanceMeters = haversineMeters(origin, point)
    if (!best || distanceMeters < best.distanceMeters) {
      best = { point, distanceMeters }
    }
  }

  return best
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}
