import { CONFIG } from '../config'
import { DARK_MAP_STYLE } from './style'

export function createMap(element: HTMLElement): google.maps.Map {
  return new google.maps.Map(element, {
    center: CONFIG.singaporeCenter,
    zoom: CONFIG.singaporeZoom,
    styles: DARK_MAP_STYLE,
    clickableIcons: true,
    gestureHandling: 'greedy',
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    rotateControl: false,
    zoomControl: true,
    backgroundColor: '#10161d',
  })
}
