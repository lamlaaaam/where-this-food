import type { ReviewData } from '../types'

export interface StarReview {
  star: number
  review: ReviewData
}

function normalize(value: string): string {
  return value
    .toLowerCase()
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

/** Reviews that reveal the answer by naming the place are not usable clues. */
export function isReviewUsable(review: ReviewData, placeName: string): boolean {
  const name = normalize(placeName)
  if (!name) return true
  return normalize(review.text).length > 0 && !normalize(review.text).includes(name)
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
