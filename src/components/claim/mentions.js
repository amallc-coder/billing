// ============================================================================
// mentions.js — helpers to parse, render, and reconcile @mentions in comment
// bodies. A mention is written into the body as "@Full Name" while the composer
// separately tracks which profile id each inserted name maps to. On submit we
// keep only the ids whose name token still appears in the final text.
// ============================================================================

// Display token for a profile (name preferred, email fallback).
export function mentionLabel(profile) {
  if (!profile) return ''
  return profile.full_name || profile.email || 'someone'
}

// The literal text we insert for a mention: "@Full Name".
export function mentionToken(profile) {
  return `@${mentionLabel(profile)}`
}

// Escape a string for safe use inside a RegExp.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Does the body still literally contain this profile's "@Name" token?
// Used to drop ids the user typed but then deleted before submitting.
export function bodyMentions(body, profileId, byId) {
  const p = byId?.[profileId]
  if (!p) return false
  const token = mentionToken(p)
  return body.includes(token)
}

// Given the recorded id list and the final body, return the ids that are still
// referenced in the text (deduped). `byId` maps id -> profile.
export function reconcileMentions(recordedIds, body, byId) {
  const seen = new Set()
  const out = []
  for (const id of recordedIds || []) {
    if (seen.has(id)) continue
    if (bodyMentions(body, id, byId)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

// Detect an in-progress "@query" immediately before the caret. Returns
// { query, start } where start is the index of the '@', or null if the caret
// is not currently inside a mention token. We only trigger when '@' begins a
// word (start of string or preceded by whitespace) and the query has no
// newline; the query may legitimately contain spaces (names do), so we cap it.
export function activeMentionQuery(text, caret) {
  const upto = text.slice(0, caret)
  // Find the last '@' that starts a word.
  const at = upto.lastIndexOf('@')
  if (at === -1) return null
  if (at > 0 && !/\s/.test(upto[at - 1])) return null
  const query = upto.slice(at + 1)
  // Bail if the query spans a newline or has grown unreasonably long.
  if (/\n/.test(query) || query.length > 40) return null
  return { query, start: at }
}

// Filter profiles for the autocomplete menu by name/email substring.
export function matchProfiles(profiles, query, { excludeId, limit = 6 } = {}) {
  const q = (query || '').trim().toLowerCase()
  const list = (profiles || []).filter((p) => p.id !== excludeId)
  if (!q) return list.slice(0, limit)
  return list
    .filter((p) => {
      const name = (p.full_name || '').toLowerCase()
      const email = (p.email || '').toLowerCase()
      return name.includes(q) || email.includes(q)
    })
    .slice(0, limit)
}

// Replace the active "@query" (from `start` to `caret`) with "@Name " and
// return { text, caret } for the new value. Trailing space lets the user keep
// typing past the mention.
export function applyMention(text, start, caret, profile) {
  const token = mentionToken(profile)
  const before = text.slice(0, start)
  const after = text.slice(caret)
  const insert = `${token} `
  const next = before + insert + after
  return { text: next, caret: (before + insert).length }
}

// Render a comment body into React-ready segments, marking mention tokens so
// the caller can wrap them in a highlighted <span className="mention">.
// We match "@Name" against the set of known mentioned profile names so we only
// highlight real mentions (not stray '@' characters). `mentionedProfiles` is an
// array of profile objects (resolved from the comment's stored mention ids).
export function splitMentions(body, mentionedProfiles) {
  const text = body || ''
  const labels = (mentionedProfiles || [])
    .map((p) => mentionLabel(p))
    .filter(Boolean)
    // Longest first so "@Jane Doe" wins over "@Jane".
    .sort((a, b) => b.length - a.length)

  if (labels.length === 0) return [{ text, mention: false }]

  const pattern = new RegExp(
    '@(' + labels.map(escapeRegExp).join('|') + ')',
    'g',
  )

  const segments = []
  let last = 0
  let m
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), mention: false })
    segments.push({ text: m[0], mention: true })
    last = m.index + m[0].length
  }
  if (last < text.length) segments.push({ text: text.slice(last), mention: false })
  return segments
}
