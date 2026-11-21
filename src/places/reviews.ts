import type { ReviewData } from '../types'

export interface StarReview {
  star: number
  review?: ReviewData
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Reviews that reveal the answer by naming the place are not usable clues. */
export function isReviewUsable(review: ReviewData, placeName: string): boolean {
  const name = normalize(placeName)
  if (!name) return true
  return !normalize(review.text).includes(name)
}

export function usableReviews(reviews: ReviewData[], placeName: string): ReviewData[] {
  return reviews.filter((review) => isReviewUsable(review, placeName))
}

/** Pick at most one review for each star rating, from 5 down to 1. */
export function reviewsByStar(reviews: ReviewData[], placeName?: string): StarReview[] {
  const eligible = placeName ? usableReviews(reviews, placeName) : reviews
  return [5, 4, 3, 2, 1].map((star) => ({
    star,
    review: eligible.find((review) => Math.round(review.rating) === star),
  }))
}
