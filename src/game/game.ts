import { CONFIG, type HintId } from '../config'
import { computeBreakdown, type ScoreBreakdown } from './scoring'
import { buildHints } from './hints'
import { DEMO_PLACES, pickDemoPlace } from '../data/demoPlaces'
import { describeCuisine } from '../places/service'
import { createMap } from '../map/init'
import { MapInteraction } from '../map/pois'
import { loadGoogleMaps, PlacesApi, PlacesError } from '../places/service'
import { reviewsByStar } from '../places/reviews'
import { selectAnswerPlace } from '../places/selection'
import type { Guess, Hint, PlaceData, RoundScore } from '../types'
import { escapeHtml, formatClock, toast } from '../ui/utils'

const KEY_STORAGE = 'wtf-google-maps-key'

export class Game {
  private readonly root: HTMLElement
  private apiKey = ''

  private roundIndex = 0
  private totalScore = 0
  private roundScores: RoundScore[] = []
  private readonly usedPlaceIds = new Set<string>()

  private map: google.maps.Map | null = null
  private api: PlacesApi | null = null
  private interaction: MapInteraction | null = null

  private currentPlace: PlaceData | null = null
  private hints: Hint[] = []
  private attempts = 1
  private startedAt = 0
  private timerId: number | null = null
  private roundOver = false
  private loading = false
  private demoMode = false
  private demoReason = ''

  constructor(root: HTMLElement) {
    this.root = root
    window.addEventListener('resize', this.handleResize)
  }

  boot(): void {
    this.apiKey = this.readApiKey()
    this.renderShell()
    this.renderMenu()
  }

  private readonly handleResize = (): void => {
    if (this.map) google.maps.event.trigger(this.map, 'resize')
  }

  private readApiKey(): string {
    try {
      const stored = window.localStorage.getItem(KEY_STORAGE)
      if (stored) return stored
    } catch {
      // Ignore storage access errors.
    }
    return import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''
  }

  private renderSetup(error?: string): void {
    this.root.innerHTML = `
      <div class="setup">
        <div class="setup-card">
          <span class="brand-mark large">WTF</span>
          <h1>Where This Food</h1>
          <p class="lede">Add a Google Maps API key to start guessing Singapore food places.</p>
          ${
            error
              ? `<p class="setup-error">${escapeHtml(error)}</p>`
              : ''
          }
          <form id="key-form" class="key-form">
            <label for="key-input">Google Maps API key</label>
            <input id="key-input" type="password" autocomplete="off" placeholder="AIza…" />
            <button class="btn primary" type="submit">Save &amp; play</button>
          </form>
          <p class="fineprint">
            The key is stored in this browser only. Enable the Maps JavaScript API and Places API,
            then restrict the key by HTTP referrer (localhost and your GitHub Pages domain).
          </p>
        </div>
      </div>
    `

    const form = document.getElementById('key-form') as HTMLFormElement | null
    const input = document.getElementById('key-input') as HTMLInputElement | null
    const button = form?.querySelector<HTMLButtonElement>('button[type="submit"]')

    form?.addEventListener('submit', (event) => {
      event.preventDefault()
      const key = input?.value.trim() ?? ''
      if (!key) return

      try {
        window.localStorage.setItem(KEY_STORAGE, key)
      } catch {
        // The key still works for this session.
      }

      this.apiKey = key
      this.demoMode = false
      this.demoReason = ''
      if (button) {
        button.disabled = true
        button.textContent = 'Loading…'
      }

      void loadGoogleMaps(key)
        .then(() => {
          this.renderShell()
          this.renderMenu()
          void this.startGame()
        })
        .catch(() => {
          if (button) {
            button.disabled = false
            button.textContent = 'Save & play'
          }
          const errorElement = document.querySelector('.setup-error')
          const message =
            'Could not load Google Maps with that key. Check the key restrictions and enabled APIs.'
          if (errorElement) {
            errorElement.textContent = message
          } else {
            form?.insertAdjacentHTML(
              'beforebegin',
              `<p class="setup-error">${escapeHtml(message)}</p>`,
            )
          }
        })
    })
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
            <div class="hud-item"><span class="hud-label">Round</span><span class="hud-value" id="hud-round">—</span></div>
            <div class="hud-item"><span class="hud-label">Total</span><span class="hud-value" id="hud-total">0</span></div>
            <div class="hud-item"><span class="hud-label">Time</span><span class="hud-value" id="hud-time">0:00</span></div>
            <div class="hud-item accent"><span class="hud-label">This round</span><span class="hud-value" id="hud-potential">—</span></div>
          </div>
        </header>
        <main id="screen" class="screen"></main>
      </div>
    `
  }

  private renderMenu(): void {
    this.stopTimer()
    const screen = this.screen()
    screen.innerHTML = `
      <section class="menu">
        <div class="menu-glow"></div>
        <div class="menu-card">
          <p class="eyebrow">Singapore food guessing game</p>
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
              <span class="rule-icon">💡</span>
              <div><strong>6 hints, −12 pts each</strong><p>Photos, nearest MRT, landmark and cuisine — use them wisely.</p></div>
            </li>
            <li>
              <span class="rule-icon">📍</span>
              <div><strong>3 guesses</strong><p>Tap a restaurant on the map to snap your pin. First try scores best.</p></div>
            </li>
            <li>
              <span class="rule-icon">⏱️</span>
              <div><strong>30 seconds free</strong><p>Answer fast for full points. After 30s, lose 5 pts every 30s.</p></div>
            </li>
          </ul>
          <button class="btn primary large" id="start-game" type="button">Start game <span>→</span></button>
          <p class="fineprint">Max 100 points per round · 500 total</p>
        </div>
      </section>
    `

    this.setText('hud-round', '—')
    this.setText('hud-total', '0')
    this.setText('hud-time', '0:00')
    this.setText('hud-potential', '—')

    document.getElementById('start-game')?.addEventListener('click', () => this.startGame())
  }

  private async startGame(): Promise<void> {
    if (!this.apiKey) {
      this.renderSetup()
      return
    }

    try {
      await loadGoogleMaps(this.apiKey)
    } catch {
      this.renderSetup(
        'Could not load Google Maps. Check that the key is valid and that the Maps JavaScript API and Places API are enabled.',
      )
      return
    }

    this.roundIndex = 0
    this.totalScore = 0
    this.roundScores = []
    this.usedPlaceIds.clear()
    void this.startRound()
  }

  private async startRound(): Promise<void> {
    this.stopTimer()
    this.roundOver = false
    this.loading = true
    this.attempts = 1
    this.currentPlace = null
    this.hints = []
    this.startedAt = 0
    this.map = null
    this.api = null
    this.interaction = null

    const screen = this.screen()
    screen.innerHTML = `
      <section class="play">
        <div class="panel reviews-panel">
          <div class="panel-head">
            <h2>What people say</h2>
            <span class="badge" id="review-count">Loading…</span>
          </div>
          <div class="place-cuisine" id="place-cuisine" hidden></div>
          <div class="demo-notice" id="demo-notice" hidden></div>
          <div class="reviews" id="reviews">
            <div class="skeleton"></div>
            <div class="skeleton"></div>
            <div class="skeleton"></div>
          </div>
          <div class="panel-head hints-head">
            <h2>Hints</h2>
            <span class="hint-note">−${CONFIG.hintCost} pts each</span>
          </div>
          <div class="hints" id="hints"></div>
        </div>
        <div class="panel map-panel">
          <div class="map-wrap">
            <div class="map" id="map"></div>
            <div class="attempts" id="attempts"></div>
          </div>
          <div class="map-footer">
            <div class="guess-info" id="guess-info">
              <span class="guess-kicker">Drop a pin</span>
              <span>Tap a restaurant on the map to choose your guess.</span>
            </div>
            <button class="btn primary" id="confirm-guess" type="button" disabled>Confirm guess</button>
          </div>
        </div>
      </section>
    `

    this.updateAttempts()
    this.updateHud()
    document
      .getElementById('confirm-guess')
      ?.addEventListener('click', () => this.handleConfirm())
    document
      .getElementById('hints')
      ?.addEventListener('click', (event) => this.handleHintClick(event))

    await nextFrame()

    const mapElement = document.getElementById('map')
    if (!mapElement) return

    this.map = createMap(mapElement)
    this.api = new PlacesApi(this.map)
    this.interaction = new MapInteraction(this.map, this.api, {
      onGuessChange: (guess) => this.updateGuessUi(guess),
      onMessage: toast,
    })
    if (this.demoMode) this.interaction.setDemoPlaces(DEMO_PLACES)
    this.interaction.setEnabled(false)

    void this.loadPlace()
  }

  private async loadPlace(): Promise<void> {
    if (this.demoMode) {
      this.renderDemoNotice(this.demoReason)
      this.loadDemoPlace()
      return
    }

    if (!this.api) return

    this.loading = true
    this.renderReviewsLoading()

    try {
      const place = await selectAnswerPlace(this.api, this.usedPlaceIds)
      this.applyPlace(place)
    } catch (error) {
      this.enterDemoMode(error)
    }
  }

  private applyPlace(place: PlaceData): void {
    this.currentPlace = place
    this.usedPlaceIds.add(place.placeId)
    this.hints = buildHints(place)
    this.loading = false

    this.renderReviews()
    this.renderHints()
    this.interaction?.setEnabled(true)
    this.startedAt = Date.now()
    this.startTimer()
    this.updateHud()
  }

  private enterDemoMode(error: unknown): void {
    this.demoMode = true
    this.demoReason =
      error instanceof PlacesError
        ? `${error.message} Switched to bundled demo places so you can keep playing.`
        : 'Google Places is unavailable. Switched to bundled demo places so you can keep playing.'

    this.interaction?.setDemoPlaces(DEMO_PLACES)
    this.renderDemoNotice(this.demoReason)
    this.loadDemoPlace()
  }

  private loadDemoPlace(): void {
    const place = pickDemoPlace(this.usedPlaceIds)
    if (!place) {
      this.loading = false
      this.renderLoadError('No more demo places left. Restart the game to play again.')
      return
    }
    this.applyPlace(place)
  }

  private renderDemoNotice(message: string): void {
    const element = document.getElementById('demo-notice')
    if (!element) return
    element.hidden = false
    element.innerHTML = `<strong>Demo mode</strong><span>${escapeHtml(message)}</span>`
  }

  private renderReviewsLoading(): void {
    const container = document.getElementById('reviews')
    if (!container) return
    container.innerHTML = `
      <div class="skeleton"></div>
      <div class="skeleton"></div>
      <div class="skeleton"></div>
    `
    this.setText('review-count', 'Loading…')
  }

  private renderLoadError(message: string): void {
    const container = document.getElementById('reviews')
    if (!container) return
    container.innerHTML = `
      <div class="load-error">
        <p>${escapeHtml(message)}</p>
        <button class="btn ghost" id="retry-load" type="button">Try another place</button>
      </div>
    `
    document.getElementById('retry-load')?.addEventListener('click', () => {
      void this.loadPlace()
    })
  }

  private renderReviews(): void {
    const place = this.currentPlace
    const container = document.getElementById('reviews')
    if (!place || !container) return

    const starReviews = reviewsByStar(place.reviews)
    const count = place.reviews.length
    this.setText('review-count', `${count} review${count === 1 ? '' : 's'}`)

    // Show cuisine type
    const cuisineEl = document.getElementById('place-cuisine')
    if (cuisineEl) {
      const cuisine = describeCuisine(place.types)
      cuisineEl.hidden = false
      cuisineEl.innerHTML = `<span class="cuisine-label">Cuisine</span><span class="cuisine-value">${escapeHtml(cuisine)}</span>`
    }

    container.innerHTML = starReviews
      .map(({ star, review }) => {
        if (!review) {
          return `
            <article class="review empty">
              <div class="review-head">
                <span class="star-badge star-${star} dim">${star}★</span>
                <span class="review-author">No ${star}-star review</span>
              </div>
              <p class="review-text muted">Google did not return a ${star}-star review for this place.</p>
            </article>
          `
        }

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
          action = `<button class="hint-btn" type="button" data-hint="${hint.id}">Reveal <span>−${CONFIG.hintCost}</span></button>`
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

  private handleConfirm(): void {
    if (this.roundOver || this.loading || !this.currentPlace || !this.interaction) return

    const guess = this.interaction.getGuess()
    if (!guess) {
      toast('Pick a place on the map first.')
      return
    }

    if (guess.placeId === this.currentPlace.placeId) {
      this.finishRound(true)
      return
    }

    if (this.attempts < CONFIG.maxAttempts) {
      this.attempts += 1
      this.interaction.clearGuess()
      this.updateAttempts()
      this.updateHud()
      const remaining = CONFIG.maxAttempts - this.attempts + 1
      toast(`Not quite — try another spot. ${remaining} guess${remaining === 1 ? '' : 'es'} left.`)
      return
    }

    this.finishRound(false)
  }

  private finishRound(correct: boolean): void {
    const place = this.currentPlace
    if (!place) return

    const elapsed = this.elapsedSeconds()
    const hintsUsed = this.hintsUsed()
    const breakdown = computeBreakdown({
      elapsedSeconds: elapsed,
      hintsUsed,
      attemptIndex: this.attempts - 1,
    })
    const score = correct ? breakdown.score : 0

    this.stopTimer()
    this.roundOver = true
    this.loading = false
    this.interaction?.setEnabled(false)
    this.interaction?.revealAnswer(place)

    const confirm = document.getElementById('confirm-guess') as HTMLButtonElement | null
    if (confirm) confirm.disabled = true

    if (correct) {
      this.totalScore += score
      this.setText('hud-total', String(this.totalScore))
    }
    this.setText('hud-potential', String(score))
    this.setText('hud-time', formatClock(elapsed))

    this.roundScores.push({
      round: this.roundIndex + 1,
      score,
      placeName: place.name,
      correct,
      attempts: this.attempts,
      hintsUsed,
      elapsedSeconds: Math.round(elapsed),
    })

    this.showResult(correct, breakdown, place, score)
  }

  private showResult(
    correct: boolean,
    breakdown: ScoreBreakdown,
    place: PlaceData,
    score: number,
  ): void {
    document.getElementById('result-modal')?.remove()

    const isLast = this.roundIndex === CONFIG.totalRounds - 1
    const multiplier = Math.round(breakdown.attemptMultiplier * 100)

    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div class="modal-backdrop" id="result-modal">
        <div class="modal ${correct ? 'good' : 'bad'}">
          <div class="result-badge">${correct ? '✓' : '✕'}</div>
          <h2>${correct ? 'Nailed it!' : 'Out of guesses'}</h2>
          <p class="result-place">
            ${correct ? 'You found' : 'The answer was'}
            <strong>${escapeHtml(place.name)}</strong>
          </p>
          <p class="result-address">${escapeHtml(place.address)}</p>
          ${
            correct
              ? `
                <div class="breakdown">
                  <div><span>Base</span><span>${breakdown.base}</span></div>
                  <div><span>Hints × ${this.hintsUsed()}</span><span>−${breakdown.hintPenalty}</span></div>
                  <div><span>Time</span><span>−${breakdown.timePenalty}</span></div>
                  <div><span>Attempt ${this.attempts}</span><span>×${multiplier}%</span></div>
                  <div class="total"><span>Round score</span><span>${score}</span></div>
                </div>
              `
              : `<p class="result-note">No points this round — but now you know the spot.</p>`
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
    this.stopTimer()
    const screen = this.screen()
    const maxTotal = CONFIG.totalRounds * CONFIG.maxRoundScore
    const message =
      this.totalScore >= 450
        ? 'Hawker legend. You know this island by heart.'
        : this.totalScore >= 350
          ? 'Serious foodie energy. Very impressive.'
          : this.totalScore >= 200
            ? 'Solid run — a few more laps around Singapore and you are unstoppable.'
            : 'Every great food journey starts somewhere. Try again?'

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
                  <div class="round-row ${round.correct ? 'good' : 'bad'}">
                    <span class="round-num">R${round.round}</span>
                    <span class="round-name">${escapeHtml(round.placeName)}</span>
                    <span class="round-meta">${round.hintsUsed} hint${round.hintsUsed === 1 ? '' : 's'} · ${round.attempts} ${round.attempts === 1 ? 'try' : 'tries'}</span>
                    <span class="round-score">${round.score}</span>
                  </div>
                `,
              )
              .join('')}
          </div>
          <button class="btn primary large" id="play-again" type="button">Play again <span>↻</span></button>
        </div>
      </section>
    `

    this.setText('hud-round', `${CONFIG.totalRounds} / ${CONFIG.totalRounds}`)
    this.setText('hud-total', String(this.totalScore))
    this.setText('hud-potential', '—')

    document.getElementById('play-again')?.addEventListener('click', () => this.startGame())
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
      info.innerHTML = `<span class="guess-kicker">Your pin</span><strong>${escapeHtml(guess.name)}</strong>`
      button.disabled = this.roundOver
    } else {
      info.innerHTML =
        '<span class="guess-kicker">Drop a pin</span><span>Tap a restaurant on the map to choose your guess.</span>'
      button.disabled = true
    }
  }

  private updateHud(): void {
    const elapsed = this.elapsedSeconds()

    this.setText('hud-round', `${Math.min(this.roundIndex + 1, CONFIG.totalRounds)} / ${CONFIG.totalRounds}`)
    this.setText('hud-total', String(this.totalScore))
    this.setText('hud-time', formatClock(elapsed))

    if (this.roundOver) return

    if (this.currentPlace) {
      const score = computeBreakdown({
        elapsedSeconds: elapsed,
        hintsUsed: this.hintsUsed(),
        attemptIndex: this.attempts - 1,
      }).score
      this.setText('hud-potential', String(score))
    } else {
      this.setText('hud-potential', '—')
    }
  }

  private startTimer(): void {
    this.stopTimer()
    this.timerId = window.setInterval(() => this.updateHud(), 1000)
  }

  private stopTimer(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId)
      this.timerId = null
    }
  }

  private elapsedSeconds(): number {
    if (this.startedAt === 0) return 0
    return (Date.now() - this.startedAt) / 1000
  }

  private hintsUsed(): number {
    return this.hints.filter((hint) => hint.unlocked).length
  }

  private screen(): HTMLElement {
    const screen = document.getElementById('screen')
    if (!screen) throw new Error('Screen element is missing')
    return screen
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
