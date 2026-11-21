export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function starString(rating: number): string {
  const rounded = Math.max(0, Math.min(5, Math.round(rating)))
  return '★'.repeat(rounded) + '☆'.repeat(5 - rounded)
}

let toastTimer: number | undefined

export function toast(message: string): void {
  let element = document.querySelector<HTMLDivElement>('.toast')
  if (!element) {
    element = document.createElement('div')
    element.className = 'toast'
    document.body.appendChild(element)
  }

  element.textContent = message
  element.classList.add('visible')

  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    element?.classList.remove('visible')
  }, 2600)
}
