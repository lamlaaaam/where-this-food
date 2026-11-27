import { CONFIG } from '../config'

export interface AttemptInput {
  attempt: number
  distanceMeters: number
}

export interface AttemptScore {
  attempt: number
  distanceMeters: number
  distanceScore: number
  score: number
}

export interface RoundBreakdown {
  best: AttemptScore
  unusedHints: number
  hintBonus: number
  score: number
}

/**
 * Distance uses a smooth exponential decay, similar to GeoGuessr. A pin within
 * ~100 m is worth almost the full 88 points; 1 km is about 53; 5 km is about 7.
 */
export function scoreAttempt(input: AttemptInput): AttemptScore {
  const distanceMeters = Math.max(0, input.distanceMeters)
  const distanceScore = Math.round(
    CONFIG.maxDistanceScore * Math.exp(-distanceMeters / CONFIG.distanceDecayMeters),
  )

  return {
    attempt: input.attempt,
    distanceMeters,
    distanceScore,
    score: Math.min(CONFIG.maxRoundScore, distanceScore),
  }
}

export function bestAttempt(attempts: readonly AttemptScore[]): AttemptScore | null {
  return attempts.reduce<AttemptScore | null>(
    (best, attempt) => (!best || attempt.score > best.score ? attempt : best),
    null,
  )
}

export function computeRoundBreakdown(
  attempts: readonly AttemptScore[],
  unusedHints: number,
): RoundBreakdown | null {
  const best = bestAttempt(attempts)
  if (!best) return null

  const hintBonus = Math.max(0, unusedHints) * CONFIG.unusedHintBonus
  return {
    best,
    unusedHints: Math.max(0, unusedHints),
    hintBonus,
    score: Math.min(CONFIG.maxRoundScore, best.score + hintBonus),
  }
}
