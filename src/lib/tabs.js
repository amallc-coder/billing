// ============================================================================
// Tab / sub-tab registry + per-user access control.
//
// Access model: profiles.allowed_tabs is either null (derive defaults from the
// user's role) or an explicit array of tab/sub-tab keys the user may see.
// Admins always see everything (so they can't lock themselves out).
// ============================================================================

export const TAB_TREE = [
  {
    key: 'dashboard',
    label: 'Analytics',
    sub: [
      { key: 'dashboard.overview', label: 'Overview' },
      { key: 'dashboard.aging', label: 'Aging' },
      { key: 'dashboard.payers', label: 'Payers' },
      { key: 'dashboard.subsidiary', label: 'Subsidiary' },
      { key: 'dashboard.serviceline', label: 'Service Line' },
      { key: 'dashboard.denials', label: 'Denials' },
      { key: 'dashboard.timely', label: 'Timely Filing' },
      { key: 'dashboard.productivity', label: 'Biller Productivity' },
      { key: 'dashboard.kpis', label: 'KPIs' },
    ],
  },
  { key: 'worklist', label: 'Worklist', sub: [] },
  { key: 'upload', label: 'Upload', requiresEdit: true, sub: [] },
  {
    key: 'settings',
    label: 'Settings',
    adminOnly: true,
    sub: [
      { key: 'settings.scoring', label: 'Scoring' },
      { key: 'settings.curve', label: 'Collection Curve' },
      { key: 'settings.payers', label: 'Payer Classification' },
      { key: 'settings.users', label: 'Users & Access' },
    ],
  },
]

// Flattened list of every assignable key (tabs + sub-tabs), excluding the
// admin-only Settings tree which is governed by role, not assignment.
export const ASSIGNABLE_TABS = TAB_TREE.filter((t) => !t.adminOnly)

export function allKeys(includeAdmin = true) {
  const out = []
  for (const t of TAB_TREE) {
    if (t.adminOnly && !includeAdmin) continue
    out.push(t.key)
    for (const s of t.sub || []) out.push(s.key)
  }
  return out
}

// Defaults when allowed_tabs is null.
export function defaultAllowedKeys(role) {
  const dash = ['dashboard', ...TAB_TREE[0].sub.map((s) => s.key)]
  if (role === 'admin') return allKeys(true)
  if (role === 'biller') return [...dash, 'worklist', 'upload']
  return [...dash, 'worklist'] // viewer
}

export function effectiveAllowedKeys(profile) {
  if (!profile) return []
  if (profile.role === 'admin') return allKeys(true)
  const custom = Array.isArray(profile.allowed_tabs) ? profile.allowed_tabs : null
  return custom && custom.length ? custom : defaultAllowedKeys(profile.role)
}

export function canAccess(profile, key) {
  return effectiveAllowedKeys(profile).includes(key)
}

// Main tabs a user can see (respects role gates + assigned access).
export function visibleTabs(profile, { canEdit } = {}) {
  const keys = effectiveAllowedKeys(profile)
  return TAB_TREE.filter((t) => {
    if (t.adminOnly && profile?.role !== 'admin') return false
    if (t.requiresEdit && !canEdit) return false
    return keys.includes(t.key)
  })
}

// Sub-tabs of a tab a user can see.
export function visibleSubTabs(profile, tabKey) {
  const tab = TAB_TREE.find((t) => t.key === tabKey)
  if (!tab) return []
  const keys = effectiveAllowedKeys(profile)
  return (tab.sub || []).filter((s) => keys.includes(s.key))
}
