import { CONFIG } from '../config'
import type { RoundScore } from '../types'

export interface GameStats {
  gamesPlayed: number
  currentStreak: number
  maxStreak: number
  bestScore: number
  totalScore: number
  roundScores: number[]
  lastPlayedDate: string | null
  lastCompletedDate: string | null
}

const STATS_KEY = 'wtf-stats-v1'
const PLAYED_KEY = 'wtf-played-v1'

function emptyStats(): GameStats {
  return {
    gamesPlayed: 0,
    currentStreak: 0,
    maxStreak: 0,
    bestScore: 0,
    totalScore: 0,
    roundScores: [],
    lastPlayedDate: null,
    lastCompletedDate: null,
  }
}

function dayDiff(a: string, b: string): number {
  const aa = Date.parse(`${a}T00:00:00Z`)
  const bb = Date.parse(`${b}T00:00:00Z`)
  if (Number.isNaN(aa) || Number.isNaN(bb)) return Number.NaN
  return Math.round((bb - aa) / 86_400_000)
}

export function loadStats(): GameStats {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    if (!raw) return emptyStats()
    const parsed = JSON.parse(raw) as Partial<GameStats>
    return { ...emptyStats(), ...parsed, roundScores: Array.isArray(parsed.roundScores) ? parsed.roundScores.filter((n): n is number => typeof n === 'number') : [] }
  } catch {
    return emptyStats()
  }
}

export function saveStats(stats: GameStats): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats))
  } catch {
    // ignore storage failures
  }
}

export function hasPlayedDate(date: string): boolean {
  try {
    const raw = localStorage.getItem(PLAYED_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) && parsed.includes(date)
  } catch {
    return false
  }
}

function markPlayedDate(date: string): void {
  try {
    const raw = localStorage.getItem(PLAYED_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    const dates = Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string') : []
    if (!dates.includes(date)) dates.push(date)
    dates.sort()
    while (dates.length > 120) dates.shift()
    localStorage.setItem(PLAYED_KEY, JSON.stringify(dates))
  } catch {
    // ignore
  }
}

export function recordGame(date: string, totalScore: number, rounds: RoundScore[]): GameStats {
  const stats = loadStats()
  if (hasPlayedDate(date)) return stats

  stats.gamesPlayed += 1
  stats.totalScore += totalScore
  stats.bestScore = Math.max(stats.bestScore, totalScore)
  stats.roundScores.push(...rounds.map((r) => r.score))

  if (stats.lastCompletedDate) {
    const diff = dayDiff(stats.lastCompletedDate, date)
    if (diff === 1) stats.currentStreak += 1
    else if (diff === 0) { /* no-op */ }
    else stats.currentStreak = 1
  } else {
    stats.currentStreak = 1
  }
  stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak)
  stats.lastPlayedDate = date
  stats.lastCompletedDate = date

  markPlayedDate(date)
  saveStats(stats)
  return stats
}

export function averageScore(stats: GameStats): number {
  if (stats.gamesPlayed === 0) return 0
  return Math.round(stats.totalScore / stats.gamesPlayed)
}

export function scoreDistribution(): { label: string; count: number }[] {
  return []
}

export interface StatsWithTotals extends GameStats {
  gameTotals: number[]
}

export function loadStatsWithTotals(): StatsWithTotals {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    if (!raw) return { ...emptyStats(), gameTotals: [] }
    const parsed = JSON.parse(raw) as Partial<StatsWithTotals>
    return {
      ...emptyStats(),
      ...parsed,
      roundScores: Array.isArray(parsed.roundScores) ? parsed.roundScores.filter((n): n is number => typeof n === 'number') : [],
      gameTotals: Array.isArray(parsed.gameTotals) ? parsed.gameTotals.filter((n): n is number => typeof n === 'number') : [],
    }
  } catch {
    return { ...emptyStats(), gameTotals: [] }
  }
}

export function recordGameWithTotals(date: string, totalScore: number, rounds: RoundScore[]): StatsWithTotals {
  const stats = loadStatsWithTotals()
  if (hasPlayedDate(date)) return stats

  stats.gamesPlayed += 1
  stats.totalScore += totalScore
  stats.bestScore = Math.max(stats.bestScore, totalScore)
  stats.roundScores.push(...rounds.map((r) => r.score))
  stats.gameTotals.push(totalScore)

  if (stats.lastCompletedDate) {
    const diff = dayDiff(stats.lastCompletedDate, date)
    stats.currentStreak = diff === 1 ? stats.currentStreak + 1 : diff === 0 ? stats.currentStreak : 1
  } else {
    stats.currentStreak = 1
  }
  stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak)
  stats.lastPlayedDate = date
  stats.lastCompletedDate = date

  markPlayedDate(date)
  saveStats(stats)
  return stats
}

export function gameTotalDistribution(stats: StatsWithTotals): { label: string; count: number }[] {
  const max = CONFIG.totalRounds * CONFIG.maxRoundScore
  const buckets = [
    { label: '0-99', min: 0, max: 99 },
    { label: '100-199', min: 100, max: 199 },
    { label: '200-299', min: 200, max: 299 },
    { label: '300-399', min: 300, max: 399 },
    { label: '400-449', min: 400, max: 449 },
    { label: `450-${max}`, min: 450, max: max },
  ]
  return buckets.map((b) => ({
    label: b.label,
    count: stats.gameTotals.filter((s) => s >= b.min && s <= b.max).length,
  }))
}