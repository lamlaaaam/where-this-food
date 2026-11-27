import { CONFIG, type HintId } from '../config'
import {
  bestAttempt,
  computeRoundBreakdown,
  scoreAttempt,
  type AttemptScore,
  type RoundBreakdown,
} from './scoring'
import { buildHints } from './hints'
import { loadGoogleMaps } from '../places/service'
import { createMap } from '../map/init'
import { MapInteraction } from '../map/pois'
import { reviewsForDisplay } from '../places/reviews'
import { formatDistance, haversineMeters } from '../data/geo'
import type { DailyPuzzle, Guess, Hint, PlaceData, RoundScore } from '../types'
import { escapeHtml, toast } from '../ui/utils'
import { puzzleNumber, singaporeDate } from './date'

export class Game {
  private readonly root: HTMLElement
  private apiKey = ''

  private roundIndex = 0
  private totalScore = 0
  private roundScores: RoundScore[] = []
  private dailyPlaces: PlaceData[] = []
  private puzzleDate = ''
  private usingDefaultPuzzle = false
  private puzzleFailureReason = ''

  private map: google.maps.Map | null = null
  private mapElement: HTMLElement | null = null
  private interaction: MapInteraction | null = null

  private currentPlace: PlaceData | null = null
  private hints: Hint[] = []
  private attempts = 1
  private attemptScores: AttemptScore[] = []
  private attemptScoreTimerId: number | null = null
  private roundOver = false
  private loading = false

  constructor(root: HTMLElement) {
    this.root = root
    window.addEventListener('resize', this.handleResize)
  }

  async boot(): Promise<void> {
    this.apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''
    if (!this.apiKey) {
      this.renderKeyProblem()
      return
    }

    this.renderShell()

    try {
      await this.loadPuzzleWithFallback()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.renderPuzzleError(message)
      return
    }
    this.renderPuzzleWarning()
    this.renderMenu()
  }

  private readonly handleResize = (): void => {
    if (this.map) google.maps.event.trigger(this.map, 'resize')
  }

  private async loadPuzzleWithFallback(): Promise<void> {
    let dailyError = ''
    try {
      await this.loadDailyPuzzle()
      return
    } catch (error) {
      dailyError = this.errorMessage(error)
    }

    try {
      await this.loadDefaultPuzzle()
      this.usingDefaultPuzzle = true
      this.puzzleFailureReason = dailyError
    } catch (error) {
      throw new Error(
        `${dailyError} A default puzzle is also unavailable: ${this.errorMessage(error)}`,
      )
    }
  }

  private async loadDailyPuzzle(): Promise<void> {
    const today = singaporeDate()
    const url = `${import.meta.env.BASE_URL}puzzles/${today}.json`
    const puzzle = await this.fetchPuzzle(url)

    if (puzzle.source === 'default') {
      throw new Error('The daily puzzle file is a default puzzle.')
    }
    if (puzzle.date !== today) {
      throw new Error(`Today's puzzle is not available (expected ${today} SGT).`)
    }
    this.applyPuzzle(puzzle)
  }

  private async loadDefaultPuzzle(): Promise<void> {
    const url = `${import.meta.env.BASE_URL}daily-puzzle-default.json`
    const puzzle = await this.fetchPuzzle(url)
    this.applyPuzzle(puzzle)
  }

  /**
   * The page can stay open across midnight SGT. Re-check the date when a game
   * starts so the player always gets the puzzle for the current day.
   */
  private async ensurePuzzleForToday(): Promise<void> {
    if (this.puzzleDate === singaporeDate()) return

    try {
      await this.loadDailyPuzzle()
      this.usingDefaultPuzzle = false
      this.puzzleFailureReason = ''
    } catch (error) {
      const dailyError = this.errorMessage(error)
      let fallbackLoaded = false
      try {
        await this.loadDefaultPuzzle()
        fallbackLoaded = true
      } catch {
        // Keep the previously loaded puzzle if the fallback is unavailable.
      }
      this.usingDefaultPuzzle = fallbackLoaded
      this.puzzleFailureReason = fallbackLoaded ? dailyError : ''
    }

    this.renderPuzzleWarning()
  }

  private async fetchPuzzle(url: string): Promise<DailyPuzzle> {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`Could not load ${url.split('/').pop()} (HTTP ${response.status}).`)
    }

    let puzzle: DailyPuzzle
    try {
      puzzle = (await response.json()) as DailyPuzzle
    } catch {
      throw new Error(`${url.split('/').pop()} is not valid JSON.`)
    }

    if (!puzzle?.date || !Array.isArray(puzzle.places) || puzzle.places.length < CONFIG.totalRounds) {
      throw new Error(`${url.split('/').pop()} is incomplete.`)
    }
    return puzzle
  }

  private applyPuzzle(puzzle: DailyPuzzle): void {
    this.puzzleDate = puzzle.date
    this.dailyPlaces = puzzle.places

    const puzzleHud = document.getElementById('hud-puzzle')
    if (puzzleHud) puzzleHud.textContent = `#${puzzleNumber(puzzle.date)}`
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private renderPuzzleWarning(): void {
    const warning = document.getElementById('puzzle-warning')
    const detail = document.getElementById('puzzle-warning-detail')
    if (!warning) return

    warning.hidden = !this.usingDefaultPuzzle
    if (detail) {
      detail.textContent = this.puzzleFailureReason
        ? `${this.puzzleFailureReason} You are playing the default puzzle generated on ${this.puzzleDate}.`
        : `You are playing the default puzzle generated on ${this.puzzleDate}.`
    }
  }

  private renderPuzzleError(message: string): void {
    this.root.innerHTML = `
      <div class="setup">
        <div class="setup-card">
          <span class="brand-mark large">WTF</span>
          <h1>Today's puzzle is unavailable</h1>
          <p class="setup-error">${escapeHtml(message)}</p>
          <p class="fineprint">The daily puzzle is generated once a day. Please check back later.</p>
        </div>
      </div>
    `
  }

  private renderSetup(error?: string): void {
    this.root.innerHTML = `
      <div class="setup">
        <div class="setup-card">
          <span class="brand-mark large">WTF</span>
          <h1>Where This Food</h1>
          <p class="lede">Add your Google Maps API key to <code>.env</code> and restart the app.</p>
          ${
            error
              ? `<p class="setup-error">${escapeHtml(error)}</p>`
              : ''
          }
          <pre class="env-example">VITE_GOOGLE_MAPS_API_KEY=your_key_here</pre>
          <p class="fineprint">
            Enable the Maps JavaScript API and Places API (New), then restrict the key by HTTP
            referrer (localhost and your GitHub Pages domain). Keys are read only from
            <code>.env</code> — nothing is stored in the browser.
          </p>
        </div>
      </div>
    `
  }

  private renderKeyProblem(error?: string): void {
    if (import.meta.env.DEV) {
      this.renderSetup(error)
      return
    }
    this.renderConfigurationError(error)
  }

  private renderConfigurationError(error?: string): void {
    this.root.innerHTML = `
      <div class="setup">
        <div class="setup-card">
          <span class="brand-mark large">WTF</span>
          <h1>Game configuration error</h1>
          <p class="lede">This build is missing its Google Maps configuration.</p>
          ${
            error
              ? `<p class="setup-error">${escapeHtml(error)}</p>`
              : ''
          }
          <p class="fineprint">Please check back later. No action is needed from players.</p>
        </div>
      </div>
    `
  }

  private renderShell(): void {
    this.root.innerHTML = `
      <div class="app">
        <header class="topbar">
          <div class="brand">
            <span class="brand-mark">WTF</span>
            <span class="brand-text">Where This Food<small>Singapore edition</small></span>
          </div>
          <div class="hud">
            <div class="hud-item"><span class="hud-label">Puzzle</span><span class="hud-value" id="hud-puzzle">#${puzzleNumber(singaporeDate())}</span></div>
            <div class="hud-item"><span class="hud-label">Round</span><span class="hud-value" id="hud-round">—</span></div>
            <div class="hud-item"><span class="hud-label">Total</span><span class="hud-value" id="hud-total">0</span></div>
            <div class="hud-item accent"><span class="hud-label"><span class="hud-label-wide">Best attempt</span><span class="hud-label-mobile">Best</span></span><span class="hud-value" id="hud-potential">—</span></div>
          </div>
        </header>
        <div class="puzzle-warning" id="puzzle-warning" hidden>
          <span class="puzzle-warning-icon" aria-hidden="true">⚠️</span>
          <div>
            <strong>Daily puzzle generation failed — default puzzle in use</strong>
            <span id="puzzle-warning-detail"></span>
          </div>
        </div>
        <main id="screen" class="screen"></main>
      </div>
    `
  }

  private renderMenu(): void {
    this.setPlayingLayout(false)
    const screen = this.screen()
    screen.innerHTML = `
      <section class="menu">
        <div class="menu-glow"></div>
        <div class="menu-card">
          ${
            this.usingDefaultPuzzle
              ? `<div class="menu-warning">
                  <strong>⚠️ Daily puzzle generation failed</strong>
                  <span>You are playing a default generated puzzle from ${escapeHtml(this.puzzleDate)}. Today's shared puzzle could not be loaded.</span>
                </div>`
              : ''
          }
          <p class="eyebrow">Puzzle #${puzzleNumber(
            this.puzzleDate,
          )} · ${
            this.usingDefaultPuzzle ? 'Default puzzle' : 'Daily puzzle'
          } · ${escapeHtml(this.puzzleDate)} SGT</p>
          <h1>Where <em>This</em><br />Food?</h1>
          <p class="lede">
            Five places. Five reviews each. Drop a pin and prove you know your island.
          </p>
          <ul class="rules">
            <li>
              <span class="rule-icon">🍽️</span>
              <div><strong>5 rounds</strong><p>Each round hides a Singapore food place behind its Google reviews.</p></div>
            </li>
            <li>
              <span class="rule-icon">📍</span>
              <div><strong>2 attempts</strong><p>Your best attempt is used for the round.</p></div>
            </li>
            <li>
              <span class="rule-icon">🎯</span>
              <div><strong>Distance</strong><p>Closer pins score more. Up to 88 points per attempt.</p></div>
            </li>
            <li>
              <span class="rule-icon">💡</span>
              <div><strong>Hints are free · unused hints earn points</strong><p>Every hint you leave unused adds +${CONFIG.unusedHintBonus} to your round score.</p></div>
            </li>
          </ul>
          <button class="btn primary large" id="start-game" type="button">Start game <span>→</span></button>
        </div>
      </section>
    `

    this.setText('hud-round', '—')
    this.setText('hud-total', '0')
    this.setText('hud-potential', '—')

    document.getElementById('start-game')?.addEventListener('click', () => this.startGame())
  }

  private async startGame(): Promise<void> {
    if (!this.apiKey) {
      this.renderKeyProblem()
      return
    }

    await this.ensurePuzzleForToday()

    try {
      await loadGoogleMaps(this.apiKey)
    } catch {
      this.renderKeyProblem(
        'Could not load Google Maps. Check that the key is valid and that the Maps JavaScript API is enabled.',
      )
      return
    }

    this.roundIndex = 0
    this.totalScore = 0
    this.roundScores = []
    void this.startRound()
  }

  private async startRound(): Promise<void> {
    this.roundOver = false
    this.loading = true
    this.attempts = 1
    this.attemptScores = []
    this.currentPlace = null
    this.hints = []

    this.setPlayingLayout(true)
    const screen = this.screen()
    screen.innerHTML = `
      <section class="play">
        <div class="panel reviews-panel">
          <div class="place-rating" id="place-rating" hidden></div>
          <div class="reviews" id="reviews">
            <div class="skeleton"></div>
            <div class="skeleton"></div>
            <div class="skeleton"></div>
          </div>
          <div class="panel-head hints-head">
            <h2>Hints</h2>
            <span class="hint-note">+${CONFIG.unusedHintBonus} per unused hint</span>
          </div>
          <div class="hints" id="hints"></div>
        </div>
        <div class="panel map-panel">
          <div class="map-wrap">
            <div class="map" id="map"></div>
            <div class="attempts" id="attempts"></div>
            <div class="attempt-scores" id="attempt-scores"></div>
            <div class="attempt-popup" id="attempt-popup" hidden></div>
          </div>
          <div class="map-footer">
            <div class="guess-info" id="guess-info">
              <span class="guess-kicker">Drop a pin</span>
              <span>Tap anywhere on the map to guess.</span>
            </div>
            <div class="map-actions">
              <button class="btn ghost" id="skip-round" type="button" disabled>Skip Round</button>
              <button class="btn primary" id="confirm-guess" type="button" disabled>Confirm Guess</button>
            </div>
          </div>
        </div>
      </section>
    `

    this.updateAttempts()
    this.updateHud()
    document
      .getElementById('confirm-guess')
      ?.addEventListener('click', () => this.handleConfirm())
    document.getElementById('skip-round')?.addEventListener('click', () => this.skipRound())
    document
      .getElementById('hints')
      ?.addEventListener('click', (event) => this.handleHintClick(event))

    await nextFrame()

    const placeholder = document.getElementById('map')
    const mapWrap = screen.querySelector('.map-wrap')
    if (!placeholder || !mapWrap) return

    // Reuse the same Map object across rounds so a full game only triggers one
    // billable map load. Moving its container is enough; just trigger a resize.
    let map = this.map
    if (map && this.mapElement) {
      placeholder.replaceWith(this.mapElement)
      const reusableMap = map
      requestAnimationFrame(() => google.maps.event.trigger(reusableMap, 'resize'))
    } else {
      this.mapElement = placeholder
      map = createMap(placeholder)
      this.map = map
    }

    if (!this.interaction) {
      this.interaction = new MapInteraction(map, {
        onGuessChange: (guess) => this.updateGuessUi(guess),
      })
    }
    this.interaction.resetForRound()
    this.interaction.setEnabled(false)

    this.loadRoundPlace()
  }

  private loadRoundPlace(): void {
    const place = this.dailyPlaces[this.roundIndex]
    if (!place) {
      this.renderPuzzleError("Today's puzzle is missing a round.")
      return
    }
    this.applyPlace(place)
  }

  private applyPlace(place: PlaceData): void {
    this.currentPlace = place
    this.hints = buildHints(place)
    this.attempts = 1
    this.attemptScores = []
    this.hideAttemptScore()
    this.loading = false

    const skip = document.getElementById('skip-round') as HTMLButtonElement | null
    if (skip) skip.disabled = false

    this.renderReviews()
    this.renderHints()
    this.interaction?.setEnabled(true)
    this.updateHud()
  }

  private renderReviews(): void {
    const place = this.currentPlace
    const container = document.getElementById('reviews')
    if (!place || !container) return

    const starReviews = reviewsForDisplay(place.reviews, place.name)

    // Show the place's overall average rating from Google.
    const ratingEl = document.getElementById('place-rating')
    if (ratingEl && place.rating !== undefined) {
      const rounded = Math.max(0, Math.min(5, Math.round(place.rating)))
      const stars = '★'.repeat(rounded) + '☆'.repeat(5 - rounded)
      ratingEl.hidden = false
      ratingEl.innerHTML =
        `<span class="rating-score">${place.rating.toFixed(1)}</span>` +
        `<span class="rating-stars">${stars}</span>` +
        `<span class="rating-label">Average rating</span>`
    }

    container.innerHTML = starReviews
      .map(({ star, review }) => {
        return `
          <article class="review">
            <div class="review-head">
              <span class="star-badge star-${star}">${star}★</span>
              <span class="review-author">${escapeHtml(review.author)}</span>
              <span class="review-time">${escapeHtml(review.relativeTime)}</span>
            </div>
            <p class="review-text">${escapeHtml(review.text)}</p>
          </article>
        `
      })
      .join('')
  }

  private renderHints(): void {
    const container = document.getElementById('hints')
    if (!container) return

    container.innerHTML = this.hints
      .map((hint) => {
        const classes = [
          'hint',
          hint.unlocked ? 'unlocked' : '',
          hint.available ? '' : 'unavailable',
        ]
          .filter(Boolean)
          .join(' ')

        let action: string
        if (hint.unlocked) {
          action = '<span class="hint-tag">Revealed</span>'
        } else if (hint.available) {
          action = `<button class="hint-btn" type="button" data-hint="${hint.id}">Reveal</button>`
        } else {
          action = '<span class="hint-tag muted">Not available</span>'
        }

        return `
          <div class="${classes}">
            <div class="hint-head">
              <span class="hint-label">${escapeHtml(hint.label)}</span>
              ${action}
            </div>
            ${hint.unlocked ? `<div class="hint-content">${hint.content}</div>` : ''}
          </div>
        `
      })
      .join('')
  }

  private handleHintClick(event: Event): void {
    const target = event.target as HTMLElement | null
    const button = target?.closest<HTMLButtonElement>('button[data-hint]')
    if (!button) return

    const id = button.dataset.hint as HintId | undefined
    if (!id) return

    this.unlockHint(id)
  }

  private unlockHint(id: HintId): void {
    if (this.roundOver) return

    const hint = this.hints.find((item) => item.id === id)
    if (!hint || hint.unlocked || !hint.available) return

    hint.unlocked = true
    this.renderHints()
    this.updateHud()
  }

  private skipRound(): void {
    if (this.roundOver || this.loading || !this.currentPlace) return
    this.finishRound(true)
  }

  private handleConfirm(): void {
    if (this.roundOver || this.loading || !this.currentPlace || !this.interaction) return

    const guess = this.interaction.getGuess()
    if (!guess) {
      toast('Drop a pin on the map first.')
      return
    }

    const attempt = scoreAttempt({
      attempt: this.attempts,
      distanceMeters: haversineMeters(guess.location, this.currentPlace.location),
    })
    this.attemptScores.push(attempt)
    this.interaction.commitAttempt(this.attempts)
    this.showAttemptScore(attempt)
    this.updateAttempts()
    this.updateHud()

    if (this.attempts < CONFIG.maxAttempts) {
      this.attempts += 1
      return
    }

    this.finishRound()
  }

  private attemptScoreMarkup(attempt: AttemptScore): string {
    return (
      `<span class="attempt-score-kicker">Attempt ${attempt.attempt}</span>` +
      `<strong>${attempt.score} pts</strong>` +
      `<span>${formatDistance(attempt.distanceMeters)} · ${attempt.distanceScore} distance</span>`
    )
  }

  private showAttemptScore(attempt: AttemptScore): void {
    const popup = document.getElementById('attempt-popup')
    if (!popup) return

    if (this.attemptScoreTimerId !== null) {
      window.clearTimeout(this.attemptScoreTimerId)
      this.attemptScoreTimerId = null
    }

    popup.innerHTML = this.attemptScoreMarkup(attempt)
    popup.hidden = false

    // Pop up in the middle of the map, then add it to the list in the corner.
    this.attemptScoreTimerId = window.setTimeout(() => {
      const list = document.getElementById('attempt-scores')
      if (list) {
        const card = document.createElement('div')
        card.className = 'attempt-score'
        card.innerHTML = this.attemptScoreMarkup(attempt)
        list.appendChild(card)
      }
      popup.hidden = true
      this.attemptScoreTimerId = null
    }, 900)
  }

  private hideAttemptScore(): void {
    if (this.attemptScoreTimerId !== null) {
      window.clearTimeout(this.attemptScoreTimerId)
      this.attemptScoreTimerId = null
    }
    const popup = document.getElementById('attempt-popup')
    if (popup) popup.hidden = true
    const list = document.getElementById('attempt-scores')
    if (list) list.replaceChildren()
  }

  private finishRound(skipped = false): void {
    const place = this.currentPlace
    if (!place) return

    const hintsUsed = this.hintsUsed()
    const unusedHints = this.unusedHints()
    const breakdown = skipped
      ? null
      : computeRoundBreakdown(this.attemptScores, unusedHints)
    const score = breakdown?.score ?? 0

    this.roundOver = true
    this.loading = false
    this.interaction?.setEnabled(false)
    this.interaction?.revealAnswer(place)

    const confirm = document.getElementById('confirm-guess') as HTMLButtonElement | null
    if (confirm) confirm.disabled = true
    const skip = document.getElementById('skip-round') as HTMLButtonElement | null
    if (skip) skip.disabled = true

    this.totalScore += score
    this.setText('hud-total', String(this.totalScore))
    this.setText('hud-potential', String(breakdown?.best.score ?? 0))

    this.roundScores.push({
      round: this.roundIndex + 1,
      score,
      placeName: place.name,
      skipped,
      attempts: skipped ? 0 : this.attemptScores.length,
      hintsUsed,
      unusedHints,
      bestDistanceMeters: breakdown?.best.distanceMeters ?? null,
      distanceScore: breakdown?.best.distanceScore ?? 0,
      hintBonus: breakdown?.hintBonus ?? 0,
    })

    this.showResult(breakdown, place, skipped)
  }

  private showResult(breakdown: RoundBreakdown | null, place: PlaceData, skipped: boolean): void {
    document.getElementById('result-modal')?.remove()

    const isLast = this.roundIndex === CONFIG.totalRounds - 1
    const perfect =
      breakdown !== null && breakdown.best.distanceMeters <= CONFIG.perfectDistanceMeters
    const good = breakdown !== null && breakdown.score >= 50
    const title = skipped
      ? 'Round skipped'
      : perfect
        ? 'Pin-perfect!'
        : good
          ? 'Strong round'
          : 'Round complete'
    const badge = skipped ? '→' : perfect ? '✓' : '📍'
    const lead = skipped ? 'You skipped. The answer was' : 'The answer was'
    const note = skipped
      ? 'Skipping scores 0 and forfeits the unused-hint bonus. The green pin shows the answer.'
      : 'No attempts were recorded. The green pin shows the answer.'
    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div class="modal-backdrop map-visible" id="result-modal">
        <div class="modal ${good || perfect ? 'good' : 'bad'}">
          <div class="result-badge">${badge}</div>
          <h2>${title}</h2>
          <p class="result-place">
            ${lead}
            <strong>${escapeHtml(place.name)}</strong>
          </p>
          <p class="result-address">${escapeHtml(place.address)}</p>
          ${
            breakdown
              ? `
                <div class="breakdown">
                  <div><span>Best attempt</span><span>${breakdown.best.attempt} of ${this.attemptScores.length}</span></div>
                  <div><span>Distance</span><span>${formatDistance(breakdown.best.distanceMeters)} · ${breakdown.best.distanceScore} pts</span></div>
                  <div><span>Unused hints</span><span>${breakdown.unusedHints} × ${CONFIG.unusedHintBonus} = +${breakdown.hintBonus}</span></div>
                  <div class="total"><span>Round score</span><span>${breakdown.score} / ${CONFIG.maxRoundScore}</span></div>
                </div>
              `
              : `<p class="result-note">${note}</p>`
          }
          <button class="btn primary large" id="next-round" type="button">
            ${isLast ? 'See final score' : 'Next round'}
          </button>
        </div>
      </div>
    `,
    )

    document.getElementById('next-round')?.addEventListener('click', () => {
      document.getElementById('result-modal')?.remove()
      if (isLast) {
        this.renderSummary()
      } else {
        this.roundIndex += 1
        void this.startRound()
      }
    })
  }

  private renderSummary(): void {
    this.setPlayingLayout(false)
    const screen = this.screen()
    const maxTotal = CONFIG.totalRounds * CONFIG.maxRoundScore
    const message =
      this.totalScore >= 450
        ? 'Hawker legend. You know this island by heart.'
        : this.totalScore >= 350
          ? 'Serious foodie energy. Very impressive.'
          : this.totalScore >= 200
            ? 'Solid run — a few more laps around Singapore and you are unstoppable.'
            : 'Every great food journey starts somewhere. Come back tomorrow!'

    screen.innerHTML = `
      <section class="summary">
        <div class="summary-card">
          <p class="eyebrow">Final score</p>
          <div class="final-score">${this.totalScore}<span>/${maxTotal}</span></div>
          <p class="summary-message">${escapeHtml(message)}</p>
          <div class="round-list">
            ${this.roundScores
              .map(
                (round) => `
                  <div class="round-row ${!round.skipped && round.score >= 50 ? 'good' : 'bad'}">
                    <span class="round-num">R${round.round}</span>
                    <span class="round-name">${escapeHtml(round.placeName)}</span>
                    <span class="round-meta">${
                      round.skipped
                        ? 'Skipped'
                        : `${formatDistance(round.bestDistanceMeters ?? 0)} · ${round.hintsUsed} hint${round.hintsUsed === 1 ? '' : 's'} · ${round.attempts} ${round.attempts === 1 ? 'try' : 'tries'}`
                    }</span>
                    <span class="round-score">${round.score}</span>
                  </div>
                `,
              )
              .join('')}
          </div>
          <button class="btn primary large" type="button" disabled>Come back tomorrow</button>
        </div>
      </section>
    `

    this.setText('hud-round', `${CONFIG.totalRounds} / ${CONFIG.totalRounds}`)
    this.setText('hud-total', String(this.totalScore))
    this.setText('hud-potential', '—')
  }

  private updateAttempts(): void {
    const element = document.getElementById('attempts')
    if (!element) return

    const dots = Array.from(
      { length: CONFIG.maxAttempts },
      (_, index) => `<i class="${index < this.attempts ? 'used' : ''}"></i>`,
    ).join('')

    element.innerHTML = `<span>Attempt ${this.attempts} of ${CONFIG.maxAttempts}</span><span class="dots">${dots}</span>`
  }

  private updateGuessUi(guess: Guess | null): void {
    const info = document.getElementById('guess-info')
    const button = document.getElementById('confirm-guess') as HTMLButtonElement | null
    if (!info || !button) return

    if (guess) {
      info.innerHTML =
        `<span class="guess-kicker">Your pin</span><strong>${escapeHtml(guess.name)}</strong>`
      button.disabled = this.roundOver
    } else {
      info.innerHTML =
        '<span class="guess-kicker">Drop a pin</span>' +
        '<span>Tap anywhere on the map to guess.</span>'
      button.disabled = true
    }
  }

  private updateHud(): void {
    this.setText('hud-round', `${Math.min(this.roundIndex + 1, CONFIG.totalRounds)} / ${CONFIG.totalRounds}`)
    this.setText('hud-total', String(this.totalScore))

    if (this.roundOver) return

    if (this.currentPlace) {
      this.setText('hud-potential', String(bestAttempt(this.attemptScores)?.score ?? 0))
    } else {
      this.setText('hud-potential', '—')
    }
  }

  private hintsUsed(): number {
    return this.hints.filter((hint) => hint.unlocked).length
  }

  private unusedHints(): number {
    return this.hints.filter((hint) => hint.available && !hint.unlocked).length
  }

  private screen(): HTMLElement {
    const screen = document.getElementById('screen')
    if (!screen) throw new Error('Screen element is missing')
    return screen
  }

  private setPlayingLayout(playing: boolean): void {
    document.querySelector('.app')?.classList.toggle('is-playing', playing)
  }

  private setText(id: string, value: string): void {
    const element = document.getElementById(id)
    if (element) element.textContent = value
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}
