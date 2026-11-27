import type { ReviewData } from '../types'

export interface StarReview {
  star: number
  review: ReviewData
}

const GENERIC_NAME_WORDS = new Set([
  'a', 'an', 'and', 'at', 'bistro', 'cafe', 'cafeteria', 'canteen', 'center', 'centre',
  'co', 'company', 'cuisine', 'deli', 'diner', 'dining', 'eatery', 'food', 'for', 'in',
  'ltd', 'of', 'on', 'place', 'pte', 'restaurant', 'resto', 'sg', 'shop', 'singapore',
  'stall', 'store', 'the', 'to', 'by',
])

const GENERIC_LOCATION_WORDS = new Set([
  'avenue', 'ave', 'blk', 'block', 'building', 'central', 'close', 'crescent', 'drive',
  'dr', 'east', 'floor', 'jalan', 'lane', 'level', 'lorong', 'mall', 'north', 'plaza',
  'rd', 'road', 'south', 'square', 'st', 'street', 'unit', 'west',
])

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

function namePhrases(placeName: string): string[] {
  const normalized = normalize(placeName)
  if (!normalized) return []

  const tokens = normalized.split(' ').filter(Boolean)
  const phrases = new Set<string>([normalized])

  const distinctive = tokens.filter((token) => !GENERIC_NAME_WORDS.has(token))
  if (distinctive.length >= 2) {
    const joined = distinctive.join(' ')
    if (joined.length >= 5) phrases.add(joined)
    for (let size = 2; size <= Math.min(3, distinctive.length); size += 1) {
      for (let i = 0; i <= distinctive.length - size; i += 1) {
        const phrase = distinctive.slice(i, i + size).join(' ')
        if (phrase.length >= 5) phrases.add(phrase)
      }
    }
  } else if (distinctive.length === 1 && distinctive[0].length >= 5) {
    phrases.add(distinctive[0])
  }

  return [...phrases]
}

function addressLeakPhrases(address?: string): string[] {
  if (!address) return []
  const normalized = normalize(address)
  if (!normalized) return []
  const parts = normalized.split(' ').filter(
    (word) =>
      word.length >= 4 &&
      !/^\d+$/.test(word) &&
      !GENERIC_NAME_WORDS.has(word) &&
      !GENERIC_LOCATION_WORDS.has(word),
  )
  const phrases = new Set<string>()
  for (const part of parts) {
    if (part.length >= 5) phrases.add(part)
  }
  for (let i = 0; i < parts.length - 1; i += 1) {
    const phrase = `${parts[i]} ${parts[i + 1]}`
    if (phrase.length >= 6) phrases.add(phrase)
  }
  return [...phrases]
}

function leakPhrases(place: { name: string; address?: string }): string[] {
  return [...new Set([...namePhrases(place.name), ...addressLeakPhrases(place.address)])]
}

function containsPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase))
}

function isLowSignalReview(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 24) return true
  const letters = (trimmed.match(/[a-zA-Z]/g) ?? []).length
  if (letters < 12) return true
  const words = normalize(trimmed).split(' ').filter(Boolean)
  return words.length < 4
}

export function redactReviewText(text: string, place: { name: string; address?: string }): string {
  const phrases = leakPhrases(place).sort((a, b) => b.length - a.length)
  let redacted = text
  for (const phrase of phrases) {
    const words = phrase.split(' ').filter(Boolean)
    if (words.length === 0) continue
    const pattern = words
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join("[\\s'’\"“”.,!?()\\-]+")
    redacted = redacted.replace(new RegExp(`\\b(${pattern})\\b`, 'gi'), '•••')
  }
  return redacted
}

/** Reviews that reveal the answer by naming the place are not usable clues. */
export function isReviewUsable(review: ReviewData, place: { name: string; address?: string }): boolean {
  const text = normalize(review.text)
  if (text.length === 0) return false
  const phrases = leakPhrases(place)
  if (phrases.length === 0) return true
  return !containsPhrase(text, phrases)
}

export function usableReviews(reviews: ReviewData[], place: { name: string; address?: string }): ReviewData[] {
  return reviews.filter((review) => isReviewUsable(review, place))
}

export function hasEnoughUsableReviews(
  reviews: ReviewData[],
  place: { name: string; address?: string },
  needed = 5,
): boolean {
  const strict = usableReviews(reviews, place).filter((r) => !isLowSignalReview(r.text))
  if (strict.length >= needed) return true
  // fallback: allow low-signal if they don't leak name
  return usableReviews(reviews, place).length >= needed
}

/**
 * Pick up to five random, usable reviews. Star ratings are informational only —
 * the round does not require one review per star. Redacts missed leaks as safety net.
 */
export function reviewsForDisplay(reviews: ReviewData[], place: { name: string; address?: string }): StarReview[] {
  const strict = usableReviews(reviews, place).filter((r) => !isLowSignalReview(r.text))
  const pool = strict.length >= 5 ? strict : usableReviews(reviews, place)
  return shuffle(pool)
    .slice(0, 5)
    .map((review) => ({
      star: Math.round(review.rating),
      review: { ...review, text: redactReviewText(review.text, place) },
    }))
}
