import { CONFIG } from '../config'
import { haversineMeters, isInSingapore } from '../data/geo'
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
  private demoMode = false
  private demoPlaces: PlaceData[] = []
  private demoMarkers: google.maps.Marker[] = []

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
      const latLng = event.latLng
      if (!latLng) return
      const nearest = this.nearestDemoPlace({ lat: latLng.lat(), lng: latLng.lng() })
      if (!nearest) {
        this.callbacks.onMessage('Tap one of the demo place markers to guess.')
        return
      }
      this.setGuess({
        placeId: nearest.placeId,
        name: nearest.name,
        location: nearest.location,
      })
      return
    }

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

  private nearestDemoPlace(point: { lat: number; lng: number }): PlaceData | null {
    let best: { place: PlaceData; distance: number } | null = null

    for (const place of this.demoPlaces) {
      const distance = haversineMeters(point, place.location)
      if (!best || distance < best.distance) {
        best = { place, distance }
      }
    }

    if (best && best.distance <= CONFIG.guessSnapRadiusMeters * 3) {
      return best.place
    }
    return null
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
