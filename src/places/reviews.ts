import type { ReviewData } from '../types'

export interface StarReview {
  star: number
  review: ReviewData
}

const GENERIC_NAME_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'bistro',
  'cafe',
  'cafeteria',
  'canteen',
  'center',
  'centre',
  'co',
  'company',
  'cuisine',
  'deli',
  'diner',
  'dining',
  'eatery',
  'food',
  'for',
  'in',
  'ltd',
  'of',
  'on',
  'place',
  'pte',
  'restaurant',
  'resto',
  'sg',
  'shop',
  'singapore',
  'stall',
  'store',
  'the',
  'to',
  'by',
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

/** Reviews that reveal the answer by naming the place are not usable clues. */
export function isReviewUsable(review: ReviewData, placeName: string): boolean {
  const text = normalize(review.text)
  if (text.length === 0) return false

  const phrases = namePhrases(placeName)
  if (phrases.length === 0) return true

  return !phrases.some((phrase) => text.includes(phrase))
}

export function usableReviews(reviews: ReviewData[], placeName: string): ReviewData[] {
  return reviews.filter((review) => isReviewUsable(review, placeName))
}

export function hasEnoughUsableReviews(
  reviews: ReviewData[],
  placeName: string,
  needed = 5,
): boolean {
  return usableReviews(reviews, placeName).length >= needed
}

/**
 * Pick up to five random, usable reviews. Star ratings are informational only —
 * the round does not require one review per star.
 */
export function reviewsForDisplay(reviews: ReviewData[], placeName: string): StarReview[] {
  return shuffle(usableReviews(reviews, placeName))
    .slice(0, 5)
    .map((review) => ({ star: Math.round(review.rating), review }))
}
