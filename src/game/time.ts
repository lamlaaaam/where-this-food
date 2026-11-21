const SGT_OFFSET_MS = 8 * 60 * 60 * 1000

/** Calendar date in Singapore (UTC+8; Singapore has no DST). */
export function singaporeDate(now = Date.now()): string {
  return new Date(now + SGT_OFFSET_MS).toISOString().slice(0, 10)
}

/** Timestamp of the next 12:00 AM SGT, as a Unix epoch value. */
export function nextSingaporeMidnight(now = Date.now()): number {
  const sgt = new Date(now + SGT_OFFSET_MS)
  const nextSgtMidnight = Date.UTC(
    sgt.getUTCFullYear(),
    sgt.getUTCMonth(),
    sgt.getUTCDate() + 1,
  )
  return nextSgtMidnight - SGT_OFFSET_MS
}

export function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}
