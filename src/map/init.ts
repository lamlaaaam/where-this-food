import { CONFIG } from '../config'
import { SINGAPORE_BOUNDS_LITERAL } from '../data/geo'
import { DARK_MAP_STYLE } from './style'

export function createMap(element: HTMLElement): google.maps.Map {
  return new google.maps.Map(element, {
    center: CONFIG.singaporeCenter,
    zoom: 11.2,
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
      strictBounds: false,
    },
  })
}
