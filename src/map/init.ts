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

  // Let Google pick the zoom that fits the whole country in the current panel.
  map.fitBounds(SINGAPORE_BOUNDS_LITERAL, 24)

  return map
}
