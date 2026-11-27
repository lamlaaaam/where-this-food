import { CONFIG } from '../config'
import { puzzleNumber } from './date'
import type { RoundScore } from '../types'

function roundEmoji(round: RoundScore): string {
  if (round.skipped) return '⬛'
  if (round.score >= 90) return '🟩'
  if (round.score >= 70) return '🟨'
  if (round.score >= 40) return '🟧'
  return '🟥'
}

export function buildShareText(date: string, totalScore: number, rounds: RoundScore[]): string {
  const maxTotal = CONFIG.totalRounds * CONFIG.maxRoundScore
  const num = puzzleNumber(date)
  const grid = rounds.map(roundEmoji).join('')
  const details = rounds
    .map((r) => {
      if (r.skipped) return `R${r.round}: skip`
      const dist = r.bestDistanceMeters == null ? '?' : r.bestDistanceMeters < 1000 ? `${Math.round(r.bestDistanceMeters)}m` : `${(r.bestDistanceMeters / 1000).toFixed(1)}km`
      return `R${r.round}: ${r.score} (${dist})`
    })
    .join(' | ')
  return `Where This Food #${num} ${totalScore}/${maxTotal}\n${grid}\n${details}`
}

export async function copyShareText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fallback below
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}