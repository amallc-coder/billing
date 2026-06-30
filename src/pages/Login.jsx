import { useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { Button, Card, Field, Toast } from '../components/ui/Primitives'
import Logo from '../components/ui/Logo'

export default function Login() {
  const [mode, setMode] = useState('signin') // signin | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
        if (error) throw error
        setNotice('Account created. Check your email if confirmation is required, then sign in.')
        setMode('signin')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setError(err.message ?? 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <Card className="auth-card">
        <div className="auth-brand">
          <span className="auth-logo" style={{ background: 'var(--clay-bg)' }}>
            <Logo size={30} />
          </span>
          <div>
            <h1>Clinilytics Billing</h1>
            <p className="muted">Work unpaid claims. Recover pipeline revenue.</p>
          </div>
        </div>

        {!isSupabaseConfigured && (
          <Toast tone="warn">
            Supabase isn’t configured. Add <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code> and restart the dev server.
          </Toast>
        )}

        <form onSubmit={onSubmit} className="auth-form">
          {mode === 'signup' && (
            <Field label="Full name">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            </Field>
          )}
          <Field label="Email">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Password">
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </Field>

          {error && <Toast tone="bad" onClose={() => setError(null)}>{error}</Toast>}
          {notice && <Toast tone="good" onClose={() => setNotice(null)}>{notice}</Toast>}

          <Button type="submit" disabled={busy || !isSupabaseConfigured}>
            {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <p className="auth-switch">
          {mode === 'signup' ? 'Already have an account?' : 'Need an account?'}{' '}
          <button className="link" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
            {mode === 'signup' ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </Card>
    </div>
  )
}
