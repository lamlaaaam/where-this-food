export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
