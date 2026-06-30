// ============================================================================
// SettingsPanel — admin Settings module. Renders ONLY the section for the
// given `subTab`; the parent page owns the sub-tab navigation. Admin-only.
//
// Props:
//   subTab  — 'settings.scoring' | 'settings.curve' | 'settings.payers' | 'settings.users'
//             (defaults to 'settings.scoring' when undefined/unknown)
//   onMutate — called after changes that affect claims, so other tabs refresh.
// ============================================================================
import { useAuth } from '../../context/AuthContext'
import { EmptyState } from '../../components/ui/Primitives'
import ScoringSettings from './ScoringSettings'
import CurveSettings from './CurveSettings'
import PayerClassification from './PayerClassification'
import UsersAdmin from './UsersAdmin'

const SECTIONS = {
  'settings.scoring': ScoringSettings,
  'settings.curve': CurveSettings,
  'settings.payers': PayerClassification,
  'settings.users': UsersAdmin,
}

export default function SettingsPanel({ subTab, onMutate }) {
  const { isAdmin } = useAuth()

  if (!isAdmin) {
    return <EmptyState title="Admins only." hint="You don’t have access to settings." />
  }

  const Section = SECTIONS[subTab] || ScoringSettings
  return <Section onMutate={onMutate} />
}
