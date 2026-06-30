// ============================================================================
// CommentComposer — textarea with @mention autocomplete + optional attachment.
//
// Mention flow: as the user types "@query", we surface a menu of matching
// profiles. Selecting one inserts "@Full Name " into the body and records that
// profile id. On submit, the parent reconciles recorded ids against the final
// text so deleted mentions are dropped.
//
// The composer is disabled for viewers (canEdit === false). Replies are
// indicated by `replyingTo` (a comment object) which the parent sets via the
// "Reply" action; clearing it returns to a top-level comment.
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Primitives'
import { activeMentionQuery, matchProfiles, applyMention, mentionLabel } from './mentions'

export default function CommentComposer({
  canEdit,
  profiles,
  authorId,
  replyingTo,
  nameOf,
  onCancelReply,
  onSubmit,
}) {
  const [body, setBody] = useState('')
  const [recordedIds, setRecordedIds] = useState([])
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Mention menu state.
  const [menu, setMenu] = useState(null) // { query, start, matches }
  const [activeIdx, setActiveIdx] = useState(0)

  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  // Recompute the mention menu from the caret position.
  function refreshMenu(text, caret) {
    const q = activeMentionQuery(text, caret)
    if (!q) {
      setMenu(null)
      return
    }
    const matches = matchProfiles(profiles, q.query, { excludeId: authorId })
    if (matches.length === 0) {
      setMenu(null)
      return
    }
    setMenu({ ...q, matches })
    setActiveIdx(0)
  }

  function handleChange(e) {
    const text = e.target.value
    setBody(text)
    refreshMenu(text, e.target.selectionStart ?? text.length)
  }

  function pickMention(profile) {
    const el = textareaRef.current
    const caret = el ? el.selectionStart : body.length
    const start = menu ? menu.start : caret
    const { text, caret: nextCaret } = applyMention(body, start, caret, profile)
    setBody(text)
    setRecordedIds((ids) => (ids.includes(profile.id) ? ids : [...ids, profile.id]))
    setMenu(null)
    // Restore focus + caret after React re-renders.
    requestAnimationFrame(() => {
      if (el) {
        el.focus()
        el.setSelectionRange(nextCaret, nextCaret)
      }
    })
  }

  function handleKeyDown(e) {
    if (menu && menu.matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => (i + 1) % menu.matches.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => (i - 1 + menu.matches.length) % menu.matches.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pickMention(menu.matches[activeIdx])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMenu(null)
        return
      }
    }
    // Cmd/Ctrl+Enter submits.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
  }

  async function submit() {
    if (submitting) return
    const trimmed = body.trim()
    if (!trimmed && !file) return
    setSubmitting(true)
    try {
      await onSubmit({
        body: trimmed,
        recordedIds,
        file,
        parentId: replyingTo?.id ?? null,
      })
      // Reset on success.
      setBody('')
      setRecordedIds([])
      setFile(null)
      setMenu(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      onCancelReply?.()
    } finally {
      setSubmitting(false)
    }
  }

  // Close the mention menu on outside click.
  useEffect(() => {
    function onDocClick(e) {
      if (!textareaRef.current) return
      if (!e.target.closest?.('.composer')) setMenu(null)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  if (!canEdit) {
    return (
      <div className="toast toast-info">
        <span>You have view-only access. Billers and admins can post to the conversation.</span>
      </div>
    )
  }

  return (
    <div className="composer">
      {replyingTo ? (
        <div className="row spread" style={{ fontSize: 12 }}>
          <span className="muted">
            Replying to <strong>{nameOf(replyingTo.user_id)}</strong>
          </span>
          <button className="link" onClick={onCancelReply}>Cancel reply</button>
        </div>
      ) : null}

      {menu && menu.matches.length > 0 ? (
        <div className="mention-menu">
          {menu.matches.map((p, i) => (
            <div
              key={p.id}
              className={`mention-option ${i === activeIdx ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                pickMention(p)
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <div style={{ fontWeight: 650 }}>{mentionLabel(p)}</div>
              {p.email ? <div className="muted" style={{ fontSize: 11.5 }}>{p.email}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      <textarea
        ref={textareaRef}
        value={body}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={replyingTo ? 'Write a reply… use @ to mention a teammate' : 'Add a comment… use @ to mention a teammate'}
        style={{ minHeight: 64 }}
      />

      <div className="row spread">
        <div className="row" style={{ gap: 8 }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            📎 Attach
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <span className="row" style={{ gap: 6, fontSize: 12 }}>
              <span className="mono nowrap" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {file.name}
              </span>
              <button className="link" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}>
                remove
              </button>
            </span>
          ) : null}
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={submit}
          disabled={submitting || (!body.trim() && !file)}
        >
          {submitting ? 'Posting…' : replyingTo ? 'Reply' : 'Comment'}
        </Button>
      </div>
    </div>
  )
}
