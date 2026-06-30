import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BRAND, ROLE_BY_VALUE } from '../lib/constants'
import NotificationsBell from './NotificationsBell'

export default function Layout() {
  const { profile, role, signOut } = useAuth()

  return (
    <div className="app-shell">
      <header className="app-header" style={{ background: BRAND.navy }}>
        <div className="app-header-left">
          <span className="app-logo" style={{ color: BRAND.navy }}>AM</span>
          <span className="app-title">Claims Recovery</span>
        </div>

        <nav className="app-nav">
          <NavLink to="/claims-recovery" className={({ isActive }) => (isActive ? 'active' : '')}>
            Dashboard
          </NavLink>
        </nav>

        <div className="app-header-right">
          <NotificationsBell />
          <div className="user-chip">
            <span className="user-name">{profile?.full_name ?? profile?.email ?? 'User'}</span>
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
