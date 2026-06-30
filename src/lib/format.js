// ============================================================================
// Formatting helpers — currency, dates, aging, timely-filing countdown.
// ============================================================================

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export const money = (n) => usd.format(Number(n) || 0)
export const money0 = (n) => usd0.format(Number(n) || 0)

// Compact form for big top-line cards: $1.2M / $34.5K
export function moneyShort(n) {
  const v = Number(n) || 0
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return usd0.format(v)
}

export const number = (n) => new Intl.NumberFormat('en-US').format(Number(n) || 0)
export const percent = (n, digits = 1) =>
  `${((Number(n) || 0) * 100).toFixed(digits)}%`

const MS_PER_DAY = 86_400_000

function toDate(d) {
  if (!d) return null
  const parsed = d instanceof Date ? d : new Date(d)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatDate(d) {
  const date = toDate(d)
  if (!date) return '—'
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(d) {
  const date = toDate(d)
  if (!date) return '—'
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Whole days from `from` to `to` (today by default). Positive = `to` is later.
export function daysUntil(d, from = new Date()) {
  const date = toDate(d)
  if (!date) return null
  return Math.round((date.getTime() - toDate(from).getTime()) / MS_PER_DAY)
}

export function daysSince(d, from = new Date()) {
  const n = daysUntil(d, from)
  return n == null ? null : -n
}

// Human countdown to a timely-filing deadline.
export function filingCountdown(deadline) {
  const n = daysUntil(deadline)
  if (n == null) return { label: '—', tone: 'muted', days: null }
  if (n < 0) return { label: `Expired ${Math.abs(n)}d ago`, tone: 'bad', days: n }
  if (n === 0) return { label: 'Due today', tone: 'bad', days: 0 }
  if (n <= 30) return { label: `${n}d left`, tone: 'bad', days: n }
  if (n <= 60) return { label: `${n}d left`, tone: 'warn', days: n }
  return { label: `${n}d left`, tone: 'muted', days: n }
}

export function relativeTime(d) {
  const n = daysSince(d)
  if (n == null) return '—'
  if (n === 0) return 'today'
  if (n === 1) return 'yesterday'
  if (n < 30) return `${n}d ago`
  if (n < 365) return `${Math.round(n / 30)}mo ago`
  return `${Math.round(n / 365)}y ago`
}
