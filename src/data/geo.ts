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

/** LatLngBoundsLiteral for Google Maps restriction. */
export const SINGAPORE_BOUNDS_LITERAL: google.maps.LatLngBoundsLiteral = {
  north: 1.475,
  south: 1.23,
  east: 104.05,
  west: 103.6,
}

export function isInSingapore(point: { lat: number; lng: number }): boolean {
  return (
    point.lat >= SINGAPORE_BOUNDS.minLat &&
    point.lat <= SINGAPORE_BOUNDS.maxLat &&
    point.lng >= SINGAPORE_BOUNDS.minLng &&
    point.lng <= SINGAPORE_BOUNDS.maxLng
  )
}

/**
 * Rough mainland Singapore + Sentosa outline. The bounding box alone includes
 * Johor across the Causeway, so random answer points are sampled inside this.
 */
const SINGAPORE_SHAPE: ReadonlyArray<{ lat: number; lng: number }> = [
  { lat: 1.45, lng: 103.78 },
  { lat: 1.455, lng: 103.815 },
  { lat: 1.435, lng: 103.855 },
  { lat: 1.425, lng: 103.895 },
  { lat: 1.41, lng: 103.94 },
  { lat: 1.395, lng: 103.985 },
  { lat: 1.375, lng: 104.0 },
  { lat: 1.35, lng: 103.965 },
  { lat: 1.3, lng: 103.925 },
  { lat: 1.265, lng: 103.87 },
  { lat: 1.245, lng: 103.825 },
  { lat: 1.27, lng: 103.765 },
  { lat: 1.295, lng: 103.63 },
  { lat: 1.33, lng: 103.67 },
  { lat: 1.38, lng: 103.745 },
  { lat: 1.425, lng: 103.765 },
]

function insidePolygon(
  point: { lat: number; lng: number },
  polygon: ReadonlyArray<{ lat: number; lng: number }>,
): boolean {
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    const crosses =
      a.lat > point.lat !== b.lat > point.lat &&
      point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng

    if (crosses) inside = !inside
  }

  return inside
}

/** Uniform random point inside mainland Singapore, excluding Johor. */
export function randomPointInSingapore(): google.maps.LatLngLiteral {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const point = {
      lat:
        SINGAPORE_BOUNDS.minLat +
        Math.random() * (SINGAPORE_BOUNDS.maxLat - SINGAPORE_BOUNDS.minLat),
      lng:
        SINGAPORE_BOUNDS.minLng +
        Math.random() * (SINGAPORE_BOUNDS.maxLng - SINGAPORE_BOUNDS.minLng),
    }

    if (insidePolygon(point, SINGAPORE_SHAPE)) return point
  }

  return { lat: 1.3521, lng: 103.8198 }
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
