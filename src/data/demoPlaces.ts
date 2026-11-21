import type { PlaceData, ReviewData } from '../types'

/**
 * Bundled sample data used when Google Places is unavailable — for example with
 * the Maps Demo Key, which does not include user-generated reviews or photos.
 * The map itself still uses the real Google Maps JavaScript API.
 */

const REVIEWS: ReviewData[] = [
  {
    author: 'Wei Ling',
    rating: 5,
    text: 'Absolutely worth the queue. The flavours are spot on and the portions are generous. I keep coming back for more.',
    relativeTime: '2 weeks ago',
  },
  {
    author: 'Daniel Tan',
    rating: 4,
    text: 'Solid meal and friendly staff. It gets crowded at lunch, but the food arrives quickly and the prices are fair.',
    relativeTime: 'a month ago',
  },
  {
    author: 'Priya S.',
    rating: 3,
    text: 'Decent food and average prices. Nothing spectacular, but it is reliable when you are in the area.',
    relativeTime: '2 months ago',
  },
  {
    author: 'Marcus Lim',
    rating: 2,
    text: 'Waited ages for a table and the food arrived lukewarm. The queue system could be a lot better.',
    relativeTime: '3 months ago',
  },
  {
    author: 'Anonymous',
    rating: 1,
    text: 'Long wait, rude service, and my order was wrong. Not coming back in a hurry.',
    relativeTime: '5 months ago',
  },
]

function photo(label: string, color: string, emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#0b0f14"/></linearGradient></defs><rect width="800" height="520" fill="url(#g)"/><text x="400" y="250" font-size="96" text-anchor="middle">${emoji}</text><text x="400" y="350" font-family="sans-serif" font-size="34" fill="white" text-anchor="middle">${label}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function makePlace(input: {
  placeId: string
  name: string
  address: string
  lat: number
  lng: number
  types: string[]
  color: string
}): PlaceData {
  return {
    placeId: input.placeId,
    name: input.name,
    address: input.address,
    location: { lat: input.lat, lng: input.lng },
    rating: 4.3,
    userRatingsTotal: 1200,
    types: input.types,
    photos: [
      photo('Photo of the place', input.color, '🏬'),
      photo('Menu', input.color, '📋'),
      photo('The food', input.color, '🍜'),
    ],
    reviews: REVIEWS,
  }
}

export const DEMO_PLACES: PlaceData[] = [
  makePlace({
    placeId: 'demo-maxwell',
    name: 'Maxwell Food Centre',
    address: '1 Kadayanallur St, Singapore 069184',
    lat: 1.2803,
    lng: 103.8448,
    types: ['restaurant', 'food', 'hawker_center'],
    color: '#b45309',
  }),
  makePlace({
    placeId: 'demo-lau-pa-sat',
    name: 'Lau Pa Sat',
    address: '18 Raffles Quay, Singapore 048582',
    lat: 1.2807,
    lng: 103.8504,
    types: ['restaurant', 'food', 'hawker_center'],
    color: '#0f766e',
  }),
  makePlace({
    placeId: 'demo-newton',
    name: 'Newton Food Centre',
    address: '500 Clemenceau Ave N, Singapore 229495',
    lat: 1.3121,
    lng: 103.8388,
    types: ['restaurant', 'food', 'seafood_restaurant'],
    color: '#b91c1c',
  }),
  makePlace({
    placeId: 'demo-old-airport',
    name: 'Old Airport Road Food Centre',
    address: '51 Old Airport Rd, Singapore 390051',
    lat: 1.308,
    lng: 103.885,
    types: ['restaurant', 'food', 'hawker_center'],
    color: '#7c3aed',
  }),
  makePlace({
    placeId: 'demo-changi-village',
    name: 'Changi Village Hawker Centre',
    address: '2 Changi Village Rd, Singapore 500002',
    lat: 1.3895,
    lng: 103.986,
    types: ['restaurant', 'food', 'malaysian_restaurant'],
    color: '#0369a1',
  }),
  makePlace({
    placeId: 'demo-tiong-bahru',
    name: 'Tiong Bahru Market',
    address: '30 Seng Poh Rd, Singapore 168898',
    lat: 1.2856,
    lng: 103.8322,
    types: ['restaurant', 'food', 'hawker_center'],
    color: '#a16207',
  }),
  makePlace({
    placeId: 'demo-tekka',
    name: 'Tekka Centre',
    address: '665 Buffalo Rd, Singapore 210665',
    lat: 1.3066,
    lng: 103.85,
    types: ['restaurant', 'food', 'indian_restaurant'],
    color: '#c2410c',
  }),
  makePlace({
    placeId: 'demo-east-coast',
    name: 'East Coast Lagoon Food Village',
    address: '1220 East Coast Parkway, Singapore 468960',
    lat: 1.307,
    lng: 103.935,
    types: ['restaurant', 'food', 'seafood_restaurant'],
    color: '#1d4ed8',
  }),
  makePlace({
    placeId: 'demo-adam-road',
    name: 'Adam Road Food Centre',
    address: '2 Adam Rd, Singapore 289876',
    lat: 1.324,
    lng: 103.814,
    types: ['restaurant', 'food', 'malaysian_restaurant'],
    color: '#4d7c0f',
  }),
  makePlace({
    placeId: 'demo-jurong-west',
    name: 'Jurong West Hawker Centre',
    address: '91 Jurong West St 91, Singapore 640960',
    lat: 1.34,
    lng: 103.7,
    types: ['restaurant', 'food', 'chinese_restaurant'],
    color: '#be123c',
  }),
  makePlace({
    placeId: 'demo-geylang-serai',
    name: 'Geylang Serai Market',
    address: '1 Geylang Serai, Singapore 402001',
    lat: 1.317,
    lng: 103.897,
    types: ['restaurant', 'food', 'malay_restaurant'],
    color: '#15803d',
  }),
  makePlace({
    placeId: 'demo-amoy',
    name: 'Amoy Street Food Centre',
    address: '7 Maxwell Rd, Singapore 069111',
    lat: 1.279,
    lng: 103.847,
    types: ['restaurant', 'food', 'hawker_center'],
    color: '#9a3412',
  }),
  makePlace({
    placeId: 'demo-chinatown-complex',
    name: 'Chinatown Complex',
    address: '335 Smith St, Singapore 050335',
    lat: 1.282,
    lng: 103.843,
    types: ['restaurant', 'food', 'chinese_restaurant'],
    color: '#a21caf',
  }),
  makePlace({
    placeId: 'demo-golden-mile',
    name: 'Golden Mile Food Centre',
    address: '505 Beach Rd, Singapore 199583',
    lat: 1.303,
    lng: 103.863,
    types: ['restaurant', 'food', 'hawker_center'],
    color: '#0e7490',
  }),
  makePlace({
    placeId: 'demo-zion',
    name: 'Zion Riverside Food Centre',
    address: '70 Zion Rd, Singapore 247792',
    lat: 1.29,
    lng: 103.831,
    types: ['restaurant', 'food', 'hawker_center'],
    color: '#b45309',
  }),
]

export function pickDemoPlace(usedPlaceIds: Set<string>): PlaceData | null {
  const available = DEMO_PLACES.filter((place) => !usedPlaceIds.has(place.placeId))
  if (available.length === 0) return null
  return available[Math.floor(Math.random() * available.length)]
}

export function demoPlaceById(placeId: string): PlaceData | undefined {
  return DEMO_PLACES.find((place) => place.placeId === placeId)
}
