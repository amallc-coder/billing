import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { Spinner } from './components/ui/Primitives'
import Layout from './components/Layout'
import Login from './pages/Login'
import ClaimsRecovery from './pages/ClaimsRecovery'

function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div className="full-screen-center">
        <Spinner label="Loading…" />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const { session, loading } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={!loading && session ? <Navigate to="/claims-recovery" replace /> : <Login />}
      />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/claims-recovery" element={<ClaimsRecovery />} />
      </Route>
      <Route path="/" element={<Navigate to="/claims-recovery" replace />} />
      <Route path="*" element={<Navigate to="/claims-recovery" replace />} />
    </Routes>
  )
}
