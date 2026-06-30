// ============================================================================
// TabAccessTree — a compact checkbox tree built from ASSIGNABLE_TABS (the
// non-admin tabs + their sub-tabs). Used by UsersAdmin to edit a profile's
// custom allowed_tabs array. The Settings tree is admin-only and excluded
// upstream (ASSIGNABLE_TABS already drops it), so it never appears here.
//
// Props:
//   value    — array of checked keys (tab + sub-tab keys)
//   onChange — (nextKeys) => void
//   idPrefix — unique string so checkbox ids don't collide across rows
// ============================================================================
import { ASSIGNABLE_TABS } from '../../lib/tabs'

const treeStyles = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  group: { display: 'flex', flexDirection: 'column', gap: 4 },
  parent: { display: 'flex', alignItems: 'center', gap: 7, fontWeight: 650, fontSize: 13 },
  subWrap: { display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 22, marginTop: 2 },
  sub: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--slate)' },
  box: { width: 14, height: 14, margin: 0, flex: '0 0 auto', cursor: 'pointer' },
}

export default function TabAccessTree({ value = [], onChange, idPrefix = 'tab' }) {
  const checked = new Set(value || [])

  const emit = (next) => {
    if (typeof onChange === 'function') onChange(Array.from(next))
  }

  const toggleTab = (tab) => {
    const next = new Set(checked)
    if (next.has(tab.key)) {
      // Unchecking a parent removes the parent and all its sub-tabs.
      next.delete(tab.key)
      for (const s of tab.sub || []) next.delete(s.key)
    } else {
      next.add(tab.key)
    }
    emit(next)
  }

  const toggleSub = (tab, subKey) => {
    const next = new Set(checked)
    if (next.has(subKey)) {
      next.delete(subKey)
    } else {
      next.add(subKey)
      next.add(tab.key) // a checked sub-tab implies its parent is accessible
    }
    emit(next)
  }

  return (
    <div style={treeStyles.wrap}>
      {ASSIGNABLE_TABS.map((tab) => {
        const parentChecked = checked.has(tab.key)
        return (
          <div key={tab.key} style={treeStyles.group}>
            <label style={treeStyles.parent}>
              <input
                type="checkbox"
                style={treeStyles.box}
                checked={parentChecked}
                onChange={() => toggleTab(tab)}
                id={`${idPrefix}-${tab.key}`}
              />
              <span>{tab.label}</span>
            </label>

            {tab.sub && tab.sub.length > 0 ? (
              <div style={treeStyles.subWrap}>
                {tab.sub.map((s) => (
                  <label key={s.key} style={treeStyles.sub}>
                    <input
                      type="checkbox"
                      style={treeStyles.box}
                      checked={checked.has(s.key)}
                      onChange={() => toggleSub(tab, s.key)}
                      id={`${idPrefix}-${s.key}`}
                    />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
