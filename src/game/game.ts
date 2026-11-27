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
import { buildShareText, copyShareText } from './share'
import { averageScore, gameTotalDistribution, hasPlayedDate, loadStatsWithTotals, recordGameWithTotals } from './stats'

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

    this.validatePuzzle(puzzle, url.split('/').pop() ?? 'puzzle')
    return puzzle
  }

  private validatePuzzle(puzzle: DailyPuzzle, label: string): void {
    if (!puzzle || typeof puzzle !== 'object') throw new Error(`${label} is invalid.`)
    if (typeof puzzle.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(puzzle.date)) {
      throw new Error(`${label} has an invalid date.`)
    }
    if (!Array.isArray(puzzle.places) || puzzle.places.length < CONFIG.totalRounds) {
      throw new Error(`${label} is incomplete.`)
    }
    puzzle.places.forEach((place, i) => {
      if (!place || typeof place !== 'object') throw new Error(`${label} place ${i + 1} is invalid.`)
      if (typeof place.placeId !== 'string' || !place.placeId) throw new Error(`${label} place ${i + 1} missing placeId.`)
      if (typeof place.name !== 'string' || !place.name) throw new Error(`${label} place ${i + 1} missing name.`)
      if (typeof place.address !== 'string') throw new Error(`${label} place ${i + 1} missing address.`)
      if (!place.location || typeof place.location.lat !== 'number' || typeof place.location.lng !== 'number') {
        throw new Error(`${label} place ${i + 1} has invalid location.`)
      }
      if (!Array.isArray(place.photos) || !Array.isArray(place.reviews) || !Array.isArray(place.types)) {
        throw new Error(`${label} place ${i + 1} has invalid fields.`)
      }
    })
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
            <div class="hud-item accent"><span class="hud-label"><span class="hud-label-wide">This attempt</span><span class="hud-label-mobile">Score</span></span><span class="hud-value" id="hud-potential">—</span></div>
            <button class="hud-stats-btn" id="open-stats" type="button" aria-label="Open stats" title="Stats">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20v-11"/></svg>
            </button>
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
        <div class="sr-live" id="sr-live" aria-live="polite" aria-atomic="true"></div>
      </div>
    `
    document.getElementById('open-stats')?.addEventListener('click', () => this.showStatsModal())
  }

  private renderMenu(): void {
    this.setPlayingLayout(false)
    const screen = this.screen()
    const played = hasPlayedDate(this.puzzleDate)
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
              <div><strong>1 attempt</strong><p>Drop your pin carefully — you only get one shot per round.</p></div>
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
          <div class="menu-actions">
            <button class="btn primary large" id="start-game" type="button">${played ? 'Play again' : 'Start game'} <span>→</span></button>
            <button class="btn ghost" id="menu-stats" type="button">Stats</button>
          </div>
          ${played ? '<p class="fineprint played-note">You already played today. Replay is fine, but only your first finish counts for stats.</p>' : ''}
        </div>
      </section>
    `

    this.setText('hud-round', '—')
    this.setText('hud-total', '0')
    this.setText('hud-potential', '—')

    document.getElementById('start-game')?.addEventListener('click', () => this.startGame())
    document.getElementById('menu-stats')?.addEventListener('click', () => this.showStatsModal())
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
    if (skip) {
      skip.disabled = false
      skip.textContent = 'Skip Round'
      skip.dataset.mode = ''
    }
    const confirm = document.getElementById('confirm-guess') as HTMLButtonElement | null
    if (confirm) confirm.textContent = 'Confirm Guess'

    this.renderReviews()
    this.renderHints()
    this.interaction?.setEnabled(true)
    this.updateHud()
  }

  private renderReviews(): void {
    const place = this.currentPlace
    const container = document.getElementById('reviews')
    if (!place || !container) return

    const starReviews = reviewsForDisplay(place.reviews, place)

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
      .map(({ star, review }, index) => {
        const text = review.text.trim()
        const long = text.length > 220
        const preview = long ? `${text.slice(0, 220).trimEnd()}…` : text
        return `
          <article class="review">
            <div class="review-head">
              <span class="star-badge star-${star}">${star}★</span>
              <span class="review-author">${escapeHtml(review.author)}</span>
              <span class="review-time">${escapeHtml(review.relativeTime)}</span>
            </div>
            <p class="review-text" id="review-text-${index}">${escapeHtml(preview)}</p>
            ${
              long
                ? `<button class="review-more" type="button" data-review-toggle="${index}" data-full="${escapeHtml(text)}" data-preview="${escapeHtml(preview)}" aria-expanded="false" aria-controls="review-text-${index}">Show more</button>`
                : ''
            }
          </article>
        `
      })
      .join('')

    container.querySelectorAll<HTMLButtonElement>('[data-review-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = btn.dataset.reviewToggle
        const textEl = idx ? document.getElementById(`review-text-${idx}`) : null
        if (!textEl) return
        const expanded = btn.getAttribute('aria-expanded') === 'true'
        const full = btn.dataset.full ?? ''
        const preview = btn.dataset.preview ?? ''
        textEl.textContent = expanded ? preview : full
        btn.textContent = expanded ? 'Show more' : 'Show less'
        btn.setAttribute('aria-expanded', String(!expanded))
      })
    })
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
          action = `<button class="hint-btn" type="button" data-hint="${hint.id}" aria-label="Reveal ${escapeHtml(hint.label)}">Reveal</button>`
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

    container.querySelectorAll<HTMLImageElement>('.hint-photo img').forEach((img) => {
      img.tabIndex = 0
      img.role = 'button'
      img.setAttribute('aria-label', 'Open hint photo')
      const open = () => this.openLightbox(img.currentSrc || img.src, img.alt || 'Hint photo')
      img.addEventListener('click', open)
      img.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      })
    })
  }

  private handleHintClick(event: Event): void {
    const target = event.target as HTMLElement | null
    const button = target?.closest<HTMLButtonElement>('button[data-hint]')
    if (!button) return

    const skip = document.getElementById('skip-round') as HTMLButtonElement | null
    if (skip?.dataset.mode === 'confirm') {
      skip.dataset.mode = ''
      skip.textContent = 'Skip Round'
    }

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
    const skip = document.getElementById('skip-round') as HTMLButtonElement | null
    const pending = skip?.dataset.mode === 'confirm'
    if (!pending) {
      if (skip) {
        skip.dataset.mode = 'confirm'
        skip.textContent = 'Confirm skip?'
      }
      toast('Tap Confirm skip? to skip this round for 0 points.')
      this.announce('Skip selected. Confirm to skip this round.')
      return
    }
    if (skip) {
      skip.dataset.mode = ''
      skip.textContent = 'Skip Round'
    }
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
    this.announce(`Attempt scored ${attempt.score} points, ${formatDistance(attempt.distanceMeters)} away.`)

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
    if (confirm) {
      confirm.disabled = true
      confirm.textContent = 'Confirm Guess'
    }
    const skip = document.getElementById('skip-round') as HTMLButtonElement | null
    if (skip) {
      skip.disabled = true
      skip.textContent = 'Skip Round'
      skip.dataset.mode = ''
    }

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

    this.announce(skipped ? `Round skipped. Answer was ${place.name}.` : `Round complete. ${score} points. Answer was ${place.name}.`)
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
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${encodeURIComponent(place.placeId)}`

    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div class="modal-backdrop map-visible" id="result-modal" role="dialog" aria-modal="true" aria-label="Round result">
        <div class="modal ${good || perfect ? 'good' : 'bad'}">
          <div class="result-badge">${badge}</div>
          <h2>${title}</h2>
          <p class="result-place">
            ${lead}
            <strong>${escapeHtml(place.name)}</strong>
          </p>
          <p class="result-address">${escapeHtml(place.address)}</p>
          <a class="result-map-link" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>
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

    const nextBtn = document.getElementById('next-round') as HTMLButtonElement | null
    nextBtn?.focus()
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
    const stats = recordGameWithTotals(this.puzzleDate, this.totalScore, this.roundScores)
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
                        : `${formatDistance(round.bestDistanceMeters ?? 0)} · ${round.hintsUsed} hint${round.hintsUsed === 1 ? '' : 's'}`
                    }</span>
                    <span class="round-score">${round.score}</span>
                  </div>
                `,
              )
              .join('')}
          </div>
          <div class="summary-actions">
            <button class="btn primary large" id="share-results" type="button">Share results</button>
            <button class="btn ghost" id="summary-stats" type="button">Stats</button>
          </div>
          <p class="fineprint">Come back tomorrow for a new puzzle.</p>
          <p class="fineprint stats-mini">Streak: ${stats.currentStreak} · Avg: ${averageScore(stats)} · Best: ${stats.bestScore}</p>
        </div>
      </section>
    `

    this.setText('hud-round', `${CONFIG.totalRounds} / ${CONFIG.totalRounds}`)
    this.setText('hud-total', String(this.totalScore))
    this.setText('hud-potential', '—')
    this.announce(`Game complete. Final score ${this.totalScore} out of ${maxTotal}.`)

    document.getElementById('share-results')?.addEventListener('click', async () => {
      const text = buildShareText(this.puzzleDate, this.totalScore, this.roundScores)
      const ok = await copyShareText(text)
      toast(ok ? 'Results copied to clipboard.' : 'Could not copy results.')
      this.announce(ok ? 'Results copied to clipboard.' : 'Could not copy results.')
    })
    document.getElementById('summary-stats')?.addEventListener('click', () => this.showStatsModal())
  }

  private updateAttempts(): void {
    const element = document.getElementById('attempts')
    if (!element) return

    element.innerHTML = `<span>1 attempt</span>`
  }

  private updateGuessUi(guess: Guess | null): void {
    const info = document.getElementById('guess-info')
    const button = document.getElementById('confirm-guess') as HTMLButtonElement | null
    const skip = document.getElementById('skip-round') as HTMLButtonElement | null
    if (!info || !button) return

    if (skip?.dataset.mode === 'confirm') {
      skip.dataset.mode = ''
      skip.textContent = 'Skip Round'
    }

    if (guess) {
      const label = guess.name && guess.name !== 'Dropped pin' ? guess.name : 'Dropped pin'
      info.innerHTML =
        `<span class="guess-kicker">Your pin</span><strong>${escapeHtml(label)}</strong><span class="guess-hint">Move pin to adjust before confirming.</span>`
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

  private announce(message: string): void {
    const el = document.getElementById('sr-live')
    if (el) el.textContent = message
  }

  private showStatsModal(): void {
    const stats = loadStatsWithTotals()
    const dist = gameTotalDistribution(stats)
    const maxCount = Math.max(1, ...dist.map((d) => d.count))
    const avg = averageScore(stats)
    const body = `
      <div class="stats-grid">
        <div class="stat"><span class="stat-value">${stats.gamesPlayed}</span><span class="stat-label">Played</span></div>
        <div class="stat"><span class="stat-value">${stats.currentStreak}</span><span class="stat-label">Streak</span></div>
        <div class="stat"><span class="stat-value">${stats.maxStreak}</span><span class="stat-label">Max streak</span></div>
        <div class="stat"><span class="stat-value">${avg}</span><span class="stat-label">Avg score</span></div>
        <div class="stat"><span class="stat-value">${stats.bestScore}</span><span class="stat-label">Best</span></div>
      </div>
      <div class="stats-dist" aria-label="Score distribution">
        <h3>Score distribution</h3>
        ${dist
          .map(
            (d) => `
              <div class="dist-row">
                <span class="dist-label">${escapeHtml(d.label)}</span>
                <div class="dist-bar-wrap"><div class="dist-bar" style="width:${(d.count / maxCount) * 100}%"></div></div>
                <span class="dist-count">${d.count}</span>
              </div>`,
          )
          .join('')}
      </div>
    `
    this.showModal('Your stats', body)
  }

  private openLightbox(src: string, alt: string): void {
    document.getElementById('lightbox-modal')?.remove()
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div class="modal-backdrop" id="lightbox-modal" role="dialog" aria-modal="true" aria-label="Photo preview">
        <div class="modal lightbox-modal">
          <button class="modal-close" id="lightbox-close" type="button" aria-label="Close photo">×</button>
          <img class="lightbox-img" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />
        </div>
      </div>
      `,
    )
    const modal = document.getElementById('lightbox-modal')
    const close = () => {
      modal?.remove()
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    document.addEventListener('keydown', onKey)
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) close()
    })
    document.getElementById('lightbox-close')?.addEventListener('click', close)
    ;(document.getElementById('lightbox-close') as HTMLButtonElement | null)?.focus()
  }

  private showModal(title: string, bodyHtml: string): void {
    document.getElementById('app-modal')?.remove()
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div class="modal-backdrop" id="app-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="modal info-modal">
          <div class="modal-head">
            <h2>${escapeHtml(title)}</h2>
            <button class="modal-close" id="app-modal-close" type="button" aria-label="Close">×</button>
          </div>
          <div class="modal-body">${bodyHtml}</div>
        </div>
      </div>
      `,
    )
    const modal = document.getElementById('app-modal') as HTMLElement | null
    const closeBtn = document.getElementById('app-modal-close') as HTMLButtonElement | null
    const close = () => {
      modal?.remove()
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key === 'Tab' && modal) {
        const focusables = modal.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) close()
    })
    closeBtn?.addEventListener('click', close)
    closeBtn?.focus()
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}
