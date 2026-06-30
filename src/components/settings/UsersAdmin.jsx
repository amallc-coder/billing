// ============================================================================
// UsersAdmin — Users & Access. Lists every profile with an editable role and
// a tab-access checkbox tree (custom allowed_tabs, or null = role defaults),
// plus a "Create new user" form that calls the admin-create-user edge function.
//
// Profiles are loaded into local state via load() so we can refetch after each
// mutation (create / save) — useProfiles loads only once.
// ============================================================================
import { useEffect, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient'
import { Button, Spinner, Toast, EmptyState } from '../../components/ui/Primitives'
import { ROLES } from '../../lib/constants'
import { effectiveAllowedKeys, defaultAllowedKeys } from '../../lib/tabs'
import { useAuth } from '../../context/AuthContext'
import TabAccessTree from './TabAccessTree'

const cardStyle = {
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: 14,
  background: '#fff',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}
const labelStyle = {
  fontSize: 11.5,
  fontWeight: 650,
  color: 'var(--slate)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}
const hintStyle = { fontSize: 11.5, color: 'var(--muted)' }
const accessHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
}

// Surface a readable message from a functions.invoke error/response.
function readableFnError(error, data) {
  if (data && data.error) return String(data.error)
  if (error?.context) {
    const ctx = error.context
    if (typeof ctx === 'string') return ctx
    if (ctx?.error) return String(ctx.error)
    if (ctx?.message) return String(ctx.message)
  }
  return error?.message || 'Failed to create user.'
}

// ---------------------------------------------------------------------------
// One editable profile row.
// ---------------------------------------------------------------------------
function ProfileRow({ profile, isSelf, onSaved }) {
  const [role, setRole] = useState(profile.role)
  // null => use role defaults; array => custom access set
  const [custom, setCustom] = useState(
    Array.isArray(profile.allowed_tabs) ? profile.allowed_tabs : null,
  )
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const usingDefaults = custom == null
  // What the tree shows: the explicit custom set, or the effective defaults.
  const treeValue = usingDefaults
    ? effectiveAllowedKeys({ ...profile, role, allowed_tabs: null })
    : custom

  const onRoleChange = (next) => {
    if (isSelf && profile.role === 'admin' && next !== 'admin') {
      const ok = window.confirm(
        'You are about to remove your own admin access. You may lose access to Settings and user management. Continue?',
      )
      if (!ok) return
    }
    setRole(next)
  }

  const save = async () => {
    if (busy || !isSupabaseConfigured) return
    setBusy(true)
    setToast(null)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role, allowed_tabs: usingDefaults ? null : custom })
        .eq('id', profile.id)
      if (error) throw error
      setToast({ tone: 'good', msg: 'Saved.' })
      if (typeof onSaved === 'function') onSaved()
    } catch (err) {
      setToast({ tone: 'bad', msg: err?.message || 'Failed to save.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {profile.full_name || profile.email}
            {isSelf ? <span className="muted" style={{ fontWeight: 400 }}> (you)</span> : null}
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>{profile.email}</div>
        </div>
        <label className="field" style={{ minWidth: 160 }}>
          <span style={labelStyle}>Role</span>
          <select value={role} onChange={(e) => onRoleChange(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <div style={accessHeaderStyle}>
          <span style={labelStyle}>Tab access</span>
          {usingDefaults ? (
            <span style={hintStyle}>Using role defaults</span>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setCustom(null)}>
              Use role defaults
            </Button>
          )}
        </div>
        {role === 'admin' ? (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
            Admins see every tab; access can&apos;t be restricted.
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <TabAccessTree
              idPrefix={`u-${profile.id}`}
              value={treeValue}
              onChange={(next) => setCustom(next)}
            />
          </div>
        )}
      </div>

      {toast ? (
        <Toast tone={toast.tone} onClose={() => setToast(null)}>{toast.msg}</Toast>
      ) : null}

      <div className="row-wrap">
        {busy ? (
          <Spinner label="Saving…" />
        ) : (
          <Button variant="secondary" size="sm" onClick={save} disabled={!isSupabaseConfigured}>
            Save
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create new user form.
// ---------------------------------------------------------------------------
const EMPTY_FORM = { email: '', password: '', full_name: '', role: 'biller' }

function CreateUserForm({ onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [allowed, setAllowed] = useState(() => defaultAllowedKeys('biller'))
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }))

  const onRoleChange = (next) => {
    setForm((f) => ({ ...f, role: next }))
    // Reset the access tree to the new role's defaults.
    setAllowed(defaultAllowedKeys(next))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busy || !isSupabaseConfigured) return
    if (!form.email.trim() || !form.password) {
      setToast({ tone: 'bad', msg: 'Email and password are required.' })
      return
    }
    setBusy(true)
    setToast(null)
    try {
      const body = {
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        role: form.role,
        // Admins always get full access; otherwise send the chosen set.
        allowed_tabs: form.role === 'admin' ? null : allowed,
      }
      const { data, error } = await supabase.functions.invoke('admin-create-user', { body })
      if (error || data?.error) throw new Error(readableFnError(error, data))

      setToast({ tone: 'good', msg: `Created ${body.email}.` })
      setForm(EMPTY_FORM)
      setAllowed(defaultAllowedKeys('biller'))
      if (typeof onCreated === 'function') onCreated()
    } catch (err) {
      setToast({ tone: 'bad', msg: err?.message || 'Failed to create user.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form style={cardStyle} onSubmit={submit}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>Create new user</div>

      <div className="grid-2">
        <label className="field">
          <span style={labelStyle}>Email</span>
          <input
            type="email"
            autoComplete="off"
            value={form.email}
            onChange={(e) => set('email')(e.target.value)}
          />
        </label>
        <label className="field">
          <span style={labelStyle}>Password</span>
          <input
            type="text"
            autoComplete="off"
            value={form.password}
            onChange={(e) => set('password')(e.target.value)}
          />
        </label>
        <label className="field">
          <span style={labelStyle}>Full name</span>
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => set('full_name')(e.target.value)}
          />
        </label>
        <label className="field">
          <span style={labelStyle}>Role</span>
          <select value={form.role} onChange={(e) => onRoleChange(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <span style={labelStyle}>Tab access</span>
        {form.role === 'admin' ? (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
            Admins see every tab.
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <TabAccessTree idPrefix="new-user" value={allowed} onChange={setAllowed} />
          </div>
        )}
      </div>

      {toast ? (
        <Toast tone={toast.tone} onClose={() => setToast(null)}>{toast.msg}</Toast>
      ) : null}

      <div className="row-wrap">
        {busy ? (
          <Spinner label="Creating…" />
        ) : (
          <Button variant="primary" size="sm" type="submit" disabled={!isSupabaseConfigured}>
            Create user
          </Button>
        )}
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Top-level Users & Access section.
// ---------------------------------------------------------------------------
export default function UsersAdmin() {
  const { user } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, allowed_tabs')
      .order('full_name', { ascending: true })
    setProfiles(data ?? [])
    setError(err?.message ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Users &amp; Access</span>
      </div>

      <p className="page-sub muted" style={{ marginTop: 0, marginBottom: 14 }}>
        Manage roles and which tabs each person can see. Leave access on role defaults, or set a
        custom set per user. The Settings tab is admin-only and governed by role.
      </p>

      {!isSupabaseConfigured ? (
        <Toast tone="warn">Supabase isn&apos;t configured, so user management is unavailable.</Toast>
      ) : null}

      {error ? <Toast tone="bad">{error}</Toast> : null}

      <div style={{ marginBottom: 18 }}>
        <CreateUserForm onCreated={load} />
      </div>

      {loading ? (
        <Spinner label="Loading users…" />
      ) : profiles.length === 0 ? (
        <EmptyState title="No users found" hint="Create the first user above." />
      ) : (
        <div className="section">
          {profiles.map((p) => (
            <ProfileRow
              key={p.id}
              profile={p}
              isSelf={user?.id === p.id}
              onSaved={load}
            />
          ))}
        </div>
      )}
    </div>
  )
}
