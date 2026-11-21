import { CONFIG } from '../config'

export interface ScoreInput {
  elapsedSeconds: number
  hintsUsed: number
  /** 0-based attempt index the guess is being made on. */
  attemptIndex: number
}

export interface ScoreBreakdown {
  base: number
  hintPenalty: number
  timePenalty: number
  attemptMultiplier: number
  score: number
}

const ATTEMPT_MULTIPLIERS = [1, 0.7, 0.4]

export function computeBreakdown(input: ScoreInput): ScoreBreakdown {
  const { elapsedSeconds, hintsUsed, attemptIndex } = input
  const base = CONFIG.maxRoundScore
  const hintPenalty = hintsUsed * CONFIG.hintCost
  const timePenalty =
    elapsedSeconds <= CONFIG.freeTimeSeconds
      ? 0
      : CONFIG.timePenaltyPerBlock *
        Math.ceil((elapsedSeconds - CONFIG.freeTimeSeconds) / CONFIG.timeBlockSeconds)
  const attemptMultiplier =
    ATTEMPT_MULTIPLIERS[Math.min(Math.max(attemptIndex, 0), ATTEMPT_MULTIPLIERS.length - 1)]

  const raw = (base - hintPenalty - timePenalty) * attemptMultiplier
  const score = Math.max(0, Math.min(base, Math.round(raw)))

  return { base, hintPenalty, timePenalty, attemptMultiplier, score }
}

export function computeScore(input: ScoreInput): number {
  return computeBreakdown(input).score
}
