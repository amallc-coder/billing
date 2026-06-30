// ============================================================================
// CommentThread — realtime, threaded comment list for a claim plus the
// composer. Top-level comments render in chronological order with their replies
// nested beneath them (one level of nesting, .comment.reply).
//
// Realtime: we subscribe to INSERTs on claim_comments for this claim so new
// comments (including from other users) appear without a refresh. Inserts are
// deduped by id, since our own optimistic-but-actually-server insert may also
// echo back through the channel.
//
// Attachments: we store the storage *path* in attachment_url (not a signed
// URL). Signed URLs from a private bucket expire, so persisting one would rot.
// We render attachment links that mint a fresh signed URL on click. A row whose
// attachment_url already looks like an http(s) URL is opened directly (back-
// compat / external links).
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, ATTACHMENTS_BUCKET } from '../../lib/supabaseClient'
import { relativeTime } from '../../lib/format'
import { Spinner, EmptyState } from '../../components/ui/Primitives'
import { splitMentions, reconcileMentions } from './mentions'
import CommentComposer from './CommentComposer'

const SIGNED_URL_TTL = 60 * 60 * 24 * 7 // 7 days

// Render a comment body with @mentions highlighted.
function CommentBody({ body, mentionIds, byId }) {
  const mentionedProfiles = (mentionIds || []).map((id) => byId[id]).filter(Boolean)
  const segments = splitMentions(body, mentionedProfiles)
  return (
    <div className="comment-body">
      {segments.map((seg, i) =>
        seg.mention ? (
          <span className="mention" key={i}>{seg.text}</span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </div>
  )
}

function AttachmentLink({ url }) {
  if (!url) return null
  const isHttp = /^https?:\/\//i.test(url)
  const name = url.split('/').pop()

  async function open(e) {
    if (isHttp) return // let the anchor navigate
    e.preventDefault()
    const { data, error } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(url, SIGNED_URL_TTL)
    if (error || !data?.signedUrl) {
      alert('Could not open attachment — it may have been removed.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  return (
    <div className="comment-attach">
      📎 <a href={isHttp ? url : '#'} target="_blank" rel="noopener noreferrer" onClick={open}>
        {name || 'attachment'}
      </a>
    </div>
  )
}

function Comment({ comment, byId, nameOf, canEdit, onReply, isReply }) {
  return (
    <div className={`comment ${isReply ? 'reply' : ''}`}>
      <div className="comment-head">
        <span className="comment-author">{nameOf(comment.user_id)}</span>
        <span className="muted" style={{ fontSize: 11.5 }}>{relativeTime(comment.created_at)}</span>
      </div>
      <CommentBody body={comment.body} mentionIds={comment.mentions} byId={byId} />
      <AttachmentLink url={comment.attachment_url} />
      {canEdit && !isReply ? (
        <div className="comment-actions">
          <button className="link" onClick={() => onReply(comment)}>Reply</button>
        </div>
      ) : null}
    </div>
  )
}

export default function CommentThread({ claimId, claim, canEdit, user, profiles, byId, nameOf }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [replyingTo, setReplyingTo] = useState(null)
  const [error, setError] = useState(null)

  // Dedupe helper for both the initial load and realtime inserts.
  const upsert = useCallback((incoming) => {
    setComments((prev) => {
      const map = new Map(prev.map((c) => [c.id, c]))
      for (const c of incoming) map.set(c.id, c)
      return Array.from(map.values()).sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at),
      )
    })
  }, [])

  // Initial load + realtime subscription, re-run when the claim changes.
  useEffect(() => {
    let active = true
    setLoading(true)
    setComments([])
    setReplyingTo(null)

    supabase
      .from('claim_comments')
      .select('id, claim_id, user_id, body, parent_id, attachment_url, mentions, created_at')
      .eq('claim_id', claimId)
      .order('created_at', { ascending: true })
      .then(({ data, error: err }) => {
        if (!active) return
        if (err) setError(err.message)
        else upsert(data ?? [])
        setLoading(false)
      })

    const channel = supabase
      .channel('claim-comments:' + claimId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'claim_comments', filter: 'claim_id=eq.' + claimId },
        (payload) => {
          if (!active) return
          upsert([payload.new])
        },
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [claimId, upsert])

  // Group into top-level comments and their replies.
  const threads = useMemo(() => {
    const tops = comments.filter((c) => !c.parent_id)
    const repliesByParent = new Map()
    for (const c of comments) {
      if (c.parent_id) {
        const arr = repliesByParent.get(c.parent_id) || []
        arr.push(c)
        repliesByParent.set(c.parent_id, arr)
      }
    }
    // Orphan replies (parent not loaded) are surfaced at top level so they
    // aren't lost.
    const topIds = new Set(tops.map((t) => t.id))
    const orphans = comments.filter((c) => c.parent_id && !topIds.has(c.parent_id))
    return { tops: [...tops, ...orphans].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)), repliesByParent }
  }, [comments])

  // Submit a new comment (with optional attachment + mention notifications).
  async function handleSubmit({ body, recordedIds, file, parentId }) {
    setError(null)

    // 1) Upload the attachment first (if any) and store its path.
    let attachmentPath = null
    if (file) {
      const path = `${claimId}/${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .upload(path, file)
      if (upErr) {
        setError('Attachment upload failed: ' + upErr.message)
        throw upErr
      }
      attachmentPath = path
    }

    // 2) Reconcile mention ids against the final body so deleted mentions drop.
    const mentions = reconcileMentions(recordedIds, body, byId)

    // 3) Insert the comment.
    const { data: inserted, error: insErr } = await supabase
      .from('claim_comments')
      .insert({
        claim_id: claimId,
        user_id: user.id,
        body,
        parent_id: parentId,
        attachment_url: attachmentPath,
        mentions,
      })
      .select('id, claim_id, user_id, body, parent_id, attachment_url, mentions, created_at')
      .single()

    if (insErr) {
      setError('Could not post comment: ' + insErr.message)
      throw insErr
    }

    // Show it immediately (realtime will dedupe the echo).
    upsert([inserted])

    // 4) Notify mentioned users (never the author).
    const targets = mentions.filter((id) => id !== user.id)
    if (targets.length > 0) {
      const authorName = nameOf(user.id)
      const rows = targets.map((uid) => ({
        user_id: uid,
        claim_id: claimId,
        comment_id: inserted.id,
        kind: 'mention',
        body: `${authorName} mentioned you on claim ${claim?.source_claim_id ?? ''}`.trim(),
      }))
      // Best-effort; a failure here shouldn't block the comment.
      const { error: notifErr } = await supabase.from('notifications').insert(rows)
      if (notifErr) console.warn('notification insert failed', notifErr.message)
    }
  }

  return (
    <section>
      <div className="drawer-section-title">Conversation</div>

      {error ? (
        <div className="toast toast-bad" style={{ marginBottom: 10 }}>
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <Spinner label="Loading conversation…" />
      ) : threads.tops.length === 0 ? (
        <EmptyState title="No comments yet" hint="Start the conversation — @mention a teammate to loop them in." />
      ) : (
        <div className="comment-list" style={{ marginBottom: 14 }}>
          {threads.tops.map((c) => (
            <div key={c.id}>
              <Comment
                comment={c}
                byId={byId}
                nameOf={nameOf}
                canEdit={canEdit}
                onReply={setReplyingTo}
                isReply={false}
              />
              {(threads.repliesByParent.get(c.id) || []).map((r) => (
                <Comment
                  key={r.id}
                  comment={r}
                  byId={byId}
                  nameOf={nameOf}
                  canEdit={canEdit}
                  onReply={setReplyingTo}
                  isReply
                />
              ))}
            </div>
          ))}
        </div>
      )}

      <CommentComposer
        canEdit={canEdit}
        profiles={profiles}
        authorId={user?.id}
        replyingTo={replyingTo}
        nameOf={nameOf}
        onCancelReply={() => setReplyingTo(null)}
        onSubmit={handleSubmit}
      />
    </section>
  )
}
