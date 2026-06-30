// ============================================================================
// Payer-type classification from a payer name.
//   guessPayerTypeFromName() — instant deterministic guess (well-known payers)
//   classifyPayerNames()     — AI classification via the classify-payer-type
//                              edge function, with the deterministic guess as a
//                              fallback for anything the model can't resolve.
// ============================================================================
import { supabase } from './supabaseClient'

const HINTS = [
  { type: 'medicare', re: /\bmedicare\b|\bmcr\b|\bmcare\b|\brailroad medicare\b/i },
  { type: 'medicaid', re: /\bmedicaid\b|\bmcd\b|\bmcaid\b|medi-?cal|healthy blue|peachstate|wellcare|amerigroup|molina|caresource/i },
  { type: 'self_pay', re: /self\s*-?\s*pay|\bpatient\b|\bguarantor\b|\bcash\b|uninsured/i },
  {
    type: 'commercial',
    re: /commercial|\bbcbs\b|blue\s*cross|blue\s*shield|anthem|aetna|cigna|united\s*health|uhc|humana|kaiser|tricare|\bppo\b|\bhmo\b|\bepo\b|optum|oscar|carefirst/i,
  },
]

export function guessPayerTypeFromName(name) {
  const s = String(name || '').trim()
  if (!s) return ''
  for (const h of HINTS) if (h.re.test(s)) return h.type
  return '' // unknown — leave for the AI pass
}

const VALID = ['commercial', 'medicare', 'medicaid', 'self_pay', 'other']

// Classify a list of distinct payer names. Returns { [name]: payer_type }.
// Tries the deterministic guess first; only the leftovers are sent to the model.
export async function classifyPayerNames(names) {
  const unique = Array.from(new Set((names || []).map((n) => String(n || '').trim()).filter(Boolean)))
  const result = {}
  const unresolved = []

  for (const n of unique) {
    const g = guessPayerTypeFromName(n)
    if (g) result[n] = g
    else unresolved.push(n)
  }

  if (unresolved.length === 0) return { result, usedAi: false, aiError: null }

  try {
    const { data, error } = await supabase.functions.invoke('classify-payer-type', {
      body: { names: unresolved },
    })
    if (error) throw error
    const map = data?.classifications || {}
    for (const n of unresolved) {
      const t = String(map[n] || '').toLowerCase()
      result[n] = VALID.includes(t) ? t : 'other'
    }
    return { result, usedAi: true, aiError: null }
  } catch (err) {
    // AI unavailable (e.g. ANTHROPIC_API_KEY not set) — default leftovers to 'other'.
    for (const n of unresolved) result[n] = 'other'
    return { result, usedAi: false, aiError: err?.message || 'AI classification unavailable' }
  }
}
