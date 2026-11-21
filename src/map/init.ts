import { CONFIG } from '../config'
import { SINGAPORE_BOUNDS_LITERAL } from '../data/geo'
import { DARK_MAP_STYLE } from './style'

export function createMap(element: HTMLElement): google.maps.Map {
  const map = new google.maps.Map(element, {
    center: CONFIG.singaporeCenter,
    zoom: 10,
    styles: DARK_MAP_STYLE,
    clickableIcons: true,
    gestureHandling: 'greedy',
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    rotateControl: false,
    zoomControl: true,
    backgroundColor: '#10161d',
    restriction: {
      latLngBounds: SINGAPORE_BOUNDS_LITERAL,
      // Keep Malaysia and other neighbouring areas completely hidden.
      strictBounds: true,
    },
  })

  // Fit the whole country, then zoom out one more level so the viewport is
  // wider than Singapore and strict bounds stop all panning at the start.
  map.fitBounds(SINGAPORE_BOUNDS_LITERAL, 0)
  const fittedZoom = map.getZoom()
  if (typeof fittedZoom === 'number') {
    map.setZoom(Math.max(0, fittedZoom - 1))
  }

  return map
}
