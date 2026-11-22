import { CONFIG } from '../config'
import type { Guess, PlaceData } from '../types'
import { escapeHtml } from '../ui/utils'

interface MapInteractionCallbacks {
  onGuessChange: (guess: Guess | null) => void
}

// Built on demand: google.maps is only available after the API has loaded.
function guessIcon(): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 10,
    fillColor: '#ff7a1a',
    fillOpacity: 1,
    strokeColor: '#fff4ea',
    strokeWeight: 3,
  }
}

function attemptIcon(): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 9,
    fillColor: '#ff7a1a',
    fillOpacity: 0.85,
    strokeColor: '#fff4ea',
    strokeWeight: 2,
  }
}

export class MapInteraction {
  private readonly map: google.maps.Map
  private readonly callbacks: MapInteractionCallbacks
  private currentGuess: Guess | null = null
  private guessMarker: google.maps.Marker | null = null
  private attemptMarkers: google.maps.Marker[] = []
  private answerMarker: google.maps.Marker | null = null
  private answerInfo: google.maps.InfoWindow | null = null
  private enabled = false

  constructor(map: google.maps.Map, callbacks: MapInteractionCallbacks) {
    this.map = map
    this.callbacks = callbacks

    map.addListener('click', (event: google.maps.MapMouseEvent) => {
      void this.handleMapClick(event)
    })
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  getGuess(): Guess | null {
    return this.currentGuess
  }

  clearCurrentGuess(): void {
    this.guessMarker?.setMap(null)
    this.guessMarker = null
    this.currentGuess = null
    this.callbacks.onGuessChange(null)
  }

  resetForRound(): void {
    this.clearCurrentGuess()
    for (const marker of this.attemptMarkers) marker.setMap(null)
    this.attemptMarkers = []
    this.answerMarker?.setMap(null)
    this.answerMarker = null
    this.answerInfo?.close()
    this.answerInfo = null
    this.map.setCenter(CONFIG.singaporeCenter)
    this.map.setZoom(11.2)
  }

  revealAnswer(place: PlaceData): void {
    this.answerMarker?.setMap(null)
    this.answerMarker = new google.maps.Marker({
      map: this.map,
      position: place.location,
      title: place.name,
      zIndex: 20,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 11,
        fillColor: '#22c55e',
        fillOpacity: 1,
        strokeColor: '#eafff2',
        strokeWeight: 3,
      },
    })

    this.answerInfo?.close()
    this.answerInfo = new google.maps.InfoWindow({
      content: `<div class="map-info"><strong>${escapeHtml(place.name)}</strong><span>${escapeHtml(
        place.address,
      )}</span></div>`,
      disableAutoPan: true,
    })
    this.answerInfo.open({ map: this.map, anchor: this.answerMarker })

    // Frame the answer together with every dropped pin so nothing is hidden.
    const bounds = new google.maps.LatLngBounds()
    bounds.extend(place.location)
    for (const marker of this.attemptMarkers) {
      const position = marker.getPosition()
      if (position) bounds.extend(position)
    }
    this.map.fitBounds(bounds, 70)
    google.maps.event.addListenerOnce(this.map, 'bounds_changed', () => {
      if ((this.map.getZoom() ?? 0) > 16) this.map.setZoom(16)
    })
  }

  private handleMapClick(event: google.maps.MapMouseEvent): void {
    if (!this.enabled) return

    const latLng = event.latLng
    if (!latLng) return

    // A pin can be dropped anywhere; clicking a POI is optional. Stopping the
    // icon event prevents Google's own info window from covering the map.
    const iconEvent = event as google.maps.IconMouseEvent
    if (iconEvent.placeId) iconEvent.stop()

    this.setGuess({
      placeId: iconEvent.placeId ?? '',
      name: 'Dropped pin',
      location: { lat: latLng.lat(), lng: latLng.lng() },
    })
  }

  private setGuess(guess: Guess): void {
    this.currentGuess = guess

    if (!this.guessMarker) {
      this.guessMarker = new google.maps.Marker({
        map: this.map,
        zIndex: 15,
        title: 'Your pin',
        icon: guessIcon(),
      })
    }
    this.guessMarker.setPosition(guess.location)
    this.callbacks.onGuessChange(guess)
  }

  /** Keeps the current pin on the map as a permanent attempt marker. */
  commitAttempt(attemptNumber: number): void {
    if (!this.currentGuess) return

    const marker = this.guessMarker ??
      new google.maps.Marker({
        map: this.map,
        zIndex: 10,
        icon: attemptIcon(),
      })
    marker.setMap(this.map)
    marker.setTitle(`Attempt ${attemptNumber}`)
    marker.setIcon(attemptIcon())
    marker.setZIndex(10)
    this.attemptMarkers.push(marker)

    this.guessMarker = null
    this.currentGuess = null
    this.callbacks.onGuessChange(null)
  }
}
