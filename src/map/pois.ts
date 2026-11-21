import { CONFIG } from '../config'
import type { Guess, PlaceData } from '../types'
import { escapeHtml } from '../ui/utils'

interface MapInteractionCallbacks {
  onGuessChange: (guess: Guess | null) => void
  onMessage: (message: string) => void
}

export class MapInteraction {
  private readonly map: google.maps.Map
  private readonly callbacks: MapInteractionCallbacks
  private guessMarker: google.maps.Marker | null = null
  private answerMarker: google.maps.Marker | null = null
  private answerInfo: google.maps.InfoWindow | null = null
  private currentGuess: Guess | null = null
  private enabled = false
  private demoMode = false
  private demoPlaces: PlaceData[] = []
  private demoMarkers: google.maps.Marker[] = []

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

  /** Switch to bundled demo places when Google Places is unavailable. */
  setDemoPlaces(places: PlaceData[]): void {
    this.demoMode = true
    this.demoPlaces = places
    this.addDemoMarkers()
  }

  getGuess(): Guess | null {
    return this.currentGuess
  }

  clearGuess(): void {
    this.guessMarker?.setMap(null)
    this.guessMarker = null
    this.currentGuess = null
    this.callbacks.onGuessChange(null)
  }

  resetForRound(): void {
    this.clearGuess()
    this.clearDemoMarkers()
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
    })
    this.answerInfo.open({ map: this.map, anchor: this.answerMarker })

    this.clearDemoMarkers()
    this.map.panTo(place.location)
    this.map.setZoom(16)
  }

  private async handleMapClick(event: google.maps.MapMouseEvent): Promise<void> {
    if (!this.enabled) return

    if (this.demoMode) {
      if (!this.currentGuess) {
        this.callbacks.onMessage('Click an orange demo place marker to guess.')
      }
      return
    }

    const iconEvent = event as google.maps.IconMouseEvent
    if (!iconEvent.placeId) {
      this.callbacks.onMessage('Click the food place itself on the map to guess.')
      return
    }
    iconEvent.stop()

    const latLng = event.latLng
    if (!latLng) return

    // No API call: the clicked POI already gives us the place ID, and the click
    // position is close enough to the POI for distance feedback.
    this.setGuess({
      placeId: iconEvent.placeId,
      name: 'Selected food place',
      location: { lat: latLng.lat(), lng: latLng.lng() },
    })
  }

  private addDemoMarkers(): void {
    this.clearDemoMarkers()

    this.demoMarkers = this.demoPlaces.map((place) => {
      const marker = new google.maps.Marker({
        map: this.map,
        position: place.location,
        title: place.name,
        zIndex: 5,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#ff7a1a',
          fillOpacity: 0.9,
          strokeColor: '#fff4ea',
          strokeWeight: 2,
        },
      })

      marker.addListener('click', () => {
        if (!this.enabled) return
        this.setGuess({
          placeId: place.placeId,
          name: place.name,
          location: place.location,
        })
      })

      return marker
    })
  }

  private clearDemoMarkers(): void {
    this.demoMarkers.forEach((marker) => marker.setMap(null))
    this.demoMarkers = []
  }

  private setGuess(guess: Guess): void {
    this.currentGuess = guess

    if (!this.guessMarker) {
      this.guessMarker = new google.maps.Marker({
        map: this.map,
        zIndex: 10,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#ff7a1a',
          fillOpacity: 1,
          strokeColor: '#fff4ea',
          strokeWeight: 3,
        },
      })
    }

    this.guessMarker.setPosition(guess.location)
    this.guessMarker.setTitle(guess.name)
    this.callbacks.onGuessChange(guess)
  }
}
