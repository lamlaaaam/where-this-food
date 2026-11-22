import { CONFIG } from '../config'

export interface AttemptInput {
  attempt: number
  distanceMeters: number
  elapsedSeconds: number
}

export interface AttemptScore {
  attempt: number
  distanceMeters: number
  elapsedSeconds: number
  distanceScore: number
  speedScore: number
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
 * ~100 m is worth almost the full 70 points; 1 km is about 42; 5 km is about 6.
 */
export function scoreAttempt(input: AttemptInput): AttemptScore {
  const distanceMeters = Math.max(0, input.distanceMeters)
  const elapsedSeconds = Math.max(0, input.elapsedSeconds)
  const distanceScore = Math.round(
    CONFIG.maxDistanceScore * Math.exp(-distanceMeters / CONFIG.distanceDecayMeters),
  )
  const speedRatio = Math.max(0, 1 - elapsedSeconds / CONFIG.speedWindowSeconds)
  const speedScore = Math.round(CONFIG.maxSpeedScore * speedRatio)

  return {
    attempt: input.attempt,
    distanceMeters,
    elapsedSeconds,
    distanceScore,
    speedScore,
    score: Math.min(CONFIG.maxRoundScore, distanceScore + speedScore),
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
