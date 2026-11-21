export const CONFIG = {
  totalRounds: 5,
  maxAttempts: 3,
  maxRoundScore: 100,
  hintCost: 12,
  freeTimeSeconds: 30,
  timePenaltyPerBlock: 5,
  timeBlockSeconds: 30,
  singaporeCenter: { lat: 1.3521, lng: 103.8198 },
  answerSearchRadiusMeters: 25_000,
  guessSnapRadiusMeters: 120,
  maxCandidatesToInspect: 6,
} as const

export const HINT_LABELS = {
  photo1: 'Photo 1',
  photo2: 'Photo 2',
  photo3: 'Photo 3',
  mrt: 'Nearby MRT',
  cost: 'Expected cost',
  maskedAnswer: 'Blanked-out answer',
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
