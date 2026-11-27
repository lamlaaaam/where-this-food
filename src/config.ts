export const CONFIG = {
  totalRounds: 5,
  maxAttempts: 2,
  maxRoundScore: 100,
  maxDistanceScore: 88,
  distanceDecayMeters: 2000,
  unusedHintBonus: 2,
  perfectDistanceMeters: 50,
  singaporeCenter: { lat: 1.3521, lng: 103.8198 },
  answerSearchRadiusMeters: 25_000,
  // Random Singapore points to try before falling back to demo mode.
  answerCoordinateAttempts: 3,
  maxCandidatesToInspect: 10,
} as const

export const HINT_LABELS = {
  photo1: 'Photo 1',
  photo2: 'Photo 2',
  photo3: 'Photo 3',
  mrt: 'Nearby MRT',
  cost: 'Expected cost',
  maskedAnswer: 'Name hint',
} as const

export type HintId = keyof typeof HINT_LABELS

export const HINT_ORDER: HintId[] = [
  'photo1',
  'photo2',
  'photo3',
  'mrt',
  'cost',
  'maskedAnswer',
]
