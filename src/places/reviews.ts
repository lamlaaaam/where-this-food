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

/** Reviews that reveal the answer by naming the place are not usable clues. */
export function isReviewUsable(review: ReviewData, placeName: string): boolean {
  const name = normalize(placeName)
  if (!name) return true
  return !normalize(review.text).includes(name)
}

export function usableReviews(reviews: ReviewData[], placeName: string): ReviewData[] {
  return reviews.filter((review) => isReviewUsable(review, placeName))
}

/**
 * Build the review cards for a round.
 *
 * Google returns at most 5 reviews per place, and they often do not cover all
 * five star ratings. Prefer one review per star from 5★ down to 1★, then fill
 * any remaining slots with other usable reviews from the same place. Every
 * card keeps its real star rating, and no placeholder/"missing review" cards
 * are shown.
 */
export function reviewsForDisplay(reviews: ReviewData[], placeName: string): StarReview[] {
  const eligible = usableReviews(reviews, placeName)
  const slots: StarReview[] = []
  const used = new Set<ReviewData>()

  for (const star of [5, 4, 3, 2, 1]) {
    if (slots.length >= 5) break
    const match = eligible.find(
      (review) => !used.has(review) && Math.round(review.rating) === star,
    )
    if (match) {
      used.add(match)
      slots.push({ star, review: match })
    }
  }

  for (const review of eligible) {
    if (slots.length >= 5) break
    if (used.has(review)) continue
    used.add(review)
    slots.push({ star: Math.round(review.rating), review })
  }

  return slots
}
