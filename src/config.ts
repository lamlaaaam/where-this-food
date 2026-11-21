export const CONFIG = {
  totalRounds: 5,
  maxAttempts: 3,
  maxRoundScore: 100,
  hintCost: 12,
  freeTimeSeconds: 30,
  timePenaltyPerBlock: 5,
  timeBlockSeconds: 30,
  singaporeCenter: { lat: 1.3521, lng: 103.8198 },
  singaporeZoom: 11.2,
  answerSearchRadiusMeters: 25_000,
  guessSnapRadiusMeters: 120,
  maxCandidatesToInspect: 6,
} as const

export const HINT_LABELS = {
  placePhoto: 'Photo of the place',
  mrt: 'Nearby MRT',
  foodPhoto: 'Another photo',
} as const

export type HintId = keyof typeof HINT_LABELS

export const HINT_ORDER: HintId[] = ['placePhoto', 'mrt', 'foodPhoto']
