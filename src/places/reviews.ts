import type { ReviewData } from '../types'

export interface StarReview {
  star: number
  review?: ReviewData
}

/** Pick at most one review for each star rating, from 5 down to 1. */
export function reviewsByStar(reviews: ReviewData[]): StarReview[] {
  return [5, 4, 3, 2, 1].map((star) => ({
    star,
    review: reviews.find((review) => Math.round(review.rating) === star),
  }))
}
