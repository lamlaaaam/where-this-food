import { CONFIG } from '../config'
import { isInSingapore } from '../data/geo'
import type { Guess, PlaceData } from '../types'
import { isFoodPlace, type PlacesApi } from '../places/service'
import { escapeHtml } from '../ui/utils'

interface MapInteractionCallbacks {
  onGuessChange: (guess: Guess | null) => void
  onMessage: (message: string) => void
}

export class MapInteraction {
  private readonly map: google.maps.Map
  private readonly api: PlacesApi
  private readonly callbacks: MapInteractionCallbacks
  private guessMarker: google.maps.Marker | null = null
  private answerMarker: google.maps.Marker | null = null
  private answerInfo: google.maps.InfoWindow | null = null
  private currentGuess: Guess | null = null
  private enabled = false
  private requestToken = 0

  constructor(
    map: google.maps.Map,
    api: PlacesApi,
    callbacks: MapInteractionCallbacks,
  ) {
    this.map = map
    this.api = api
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

  clearGuess(): void {
    this.requestToken += 1
    this.guessMarker?.setMap(null)
    this.guessMarker = null
    this.currentGuess = null
    this.callbacks.onGuessChange(null)
  }

  resetForRound(): void {
    this.clearGuess()
    this.answerMarker?.setMap(null)
    this.answerMarker = null
    this.answerInfo?.close()
    this.answerInfo = null
    this.map.setCenter(CONFIG.singaporeCenter)
    this.map.setZoom(CONFIG.singaporeZoom)
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

    this.map.panTo(place.location)
    this.map.setZoom(16)
  }

  private async handleMapClick(event: google.maps.MapMouseEvent): Promise<void> {
    if (!this.enabled) return

    const token = ++this.requestToken
    const iconEvent = event as google.maps.IconMouseEvent

    if (iconEvent.placeId) {
      iconEvent.stop()
      try {
        const details = await this.api.details(iconEvent.placeId)
        if (token !== this.requestToken) return

        if (!isFoodPlace(details.types)) {
          this.callbacks.onMessage('That is not a food place — pick a restaurant, cafe or hawker spot.')
          return
        }

        const location = details.geometry?.location
        if (!location || !details.place_id) return

        if (!isInSingapore({ lat: location.lat(), lng: location.lng() })) {
          this.callbacks.onMessage('This round is Singapore only — pick a local food place.')
          return
        }

        this.setGuess({
          placeId: details.place_id,
          name: details.name ?? 'Selected place',
          location: { lat: location.lat(), lng: location.lng() },
        })
      } catch {
        this.callbacks.onMessage('Could not load that place. Try another one.')
      }
      return
    }

    const latLng = event.latLng
    if (!latLng) return

    try {
      const results = await this.api.nearestRestaurants(
        { lat: latLng.lat(), lng: latLng.lng() },
        CONFIG.guessSnapRadiusMeters,
      )
      if (token !== this.requestToken) return

      const nearest = results.find((result) => {
        const point = result.geometry?.location
        return point && isInSingapore({ lat: point.lat(), lng: point.lng() })
      })
      const location = nearest?.geometry?.location
      if (!nearest?.place_id || !location) {
        this.callbacks.onMessage('No food place nearby — tap a restaurant on the map.')
        return
      }

      this.setGuess({
        placeId: nearest.place_id,
        name: nearest.name ?? 'Selected place',
        location: { lat: location.lat(), lng: location.lng() },
      })
    } catch {
      this.callbacks.onMessage('Could not snap to a place. Try tapping a restaurant.')
    }
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
