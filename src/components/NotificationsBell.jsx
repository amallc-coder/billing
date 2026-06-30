import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { relativeTime } from '../lib/format'

// In-app notifications for @mentions / new comments / assignments.
// Subscribes to the user's notifications via Supabase Realtime.
export default function NotificationsBell() {
  const { user, isConfigured } = useAuth()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('notifications')
      .select('id, kind, body, read_at, created_at, claim_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setItems(data ?? [])
  }, [user])

  useEffect(() => {
    if (!isConfigured || !user) return
    load()
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [isConfigured, user, load])

  const unread = items.filter((n) => !n.read_at).length

  async function markAllRead() {
    if (!user || unread === 0) return
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null)
    load()
  }

  return (
    <div className="bell">
      <button
        className="bell-btn"
        onClick={() => {
          setOpen((o) => !o)
          if (!open) markAllRead()
        }}
        aria-label="Notifications"
      >
        🔔
        {unread > 0 && <span className="bell-dot">{unread}</span>}
      </button>
      {open && (
        <div className="bell-menu" onMouseLeave={() => setOpen(false)}>
          <div className="bell-head">Notifications</div>
          {items.length === 0 ? (
            <div className="bell-empty muted">Nothing yet.</div>
          ) : (
            items.map((n) => (
              <div key={n.id} className={`bell-item ${n.read_at ? '' : 'unread'}`}>
                <div className="bell-body">{n.body}</div>
                <div className="bell-time muted">{relativeTime(n.created_at)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
