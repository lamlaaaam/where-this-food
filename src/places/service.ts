import { Loader } from '@googlemaps/js-api-loader'

let loaderPromise: Promise<typeof google> | null = null

/** Load only the Maps JavaScript API; Places data now comes from the daily puzzle. */
export function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (!loaderPromise) {
    loaderPromise = new Loader({ apiKey, version: 'weekly' })
      .load()
      .catch((error: unknown) => {
        loaderPromise = null
        throw error
      })
  }
  return loaderPromise
}
