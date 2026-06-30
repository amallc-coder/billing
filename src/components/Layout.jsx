import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLE_BY_VALUE } from '../lib/constants'
import NotificationsBell from './NotificationsBell'

export default function Layout() {
  const { profile, role, signOut } = useAuth()
  const name = profile?.full_name ?? profile?.email ?? 'User'

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <span className="app-logo">AM</span>
          <span className="app-title">Claims Recovery</span>
        </div>

        <nav className="app-nav">
          <NavLink to="/claims-recovery" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="cat-dot" />
            Dashboard
          </NavLink>
        </nav>

        <div className="app-header-right">
          <span className="synced">
            <span className="dot" />
            Live
          </span>
          <NotificationsBell />
          <div className="user-chip">
            <span className="user-name">{name}</span>
            <span className="user-role">{ROLE_BY_VALUE[role]?.label ?? role ?? '—'}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
