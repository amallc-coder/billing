// ============================================================================
// Upload flow — 3-step wizard: Upload file → Map columns → Review & commit.
// Default export `UploadWizard`, prop: onCommitted() (called after a successful
// commit). Imports the shared foundation; module-specific styling is inline.
// ============================================================================
import { useMemo, useState } from 'react'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { BRAND } from '../../lib/constants'
import { Button, Card, EmptyState, Spinner, Toast } from '../../components/ui/Primitives'
import { parseFile, isSupportedFile } from './parse'
import { autoMatch, applyMapping, REQUIRED_FIELDS } from './mapping'
import ColumnMapper from './ColumnMapper'
import ValidationPreview from './ValidationPreview'
import CommitStep from './CommitStep'

const STEPS = [
  { id: 'upload', label: 'Upload file' },
  { id: 'map', label: 'Map columns' },
  { id: 'review', label: 'Review & commit' },
]

function StepIndicator({ stepIndex }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        marginBottom: 4,
      }}
    >
      {STEPS.map((step, i) => {
        const done = i < stepIndex
        const active = i === stepIndex
        const color = active ? BRAND.cyan : done ? BRAND.good : BRAND.slate
        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#fff',
                  background: color,
                }}
              >
                {done ? '✓' : i + 1}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  color: active ? BRAND.ink : BRAND.slate,
                }}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 ? (
              <span
                style={{
                  width: 28,
                  height: 2,
                  background: done ? BRAND.good : BRAND.line,
                  borderRadius: 2,
                }}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export default function UploadWizard({ onCommitted }) {
  const { user, canEdit } = useAuth()

  const [stepIndex, setStepIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const [filename, setFilename] = useState('')
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapping, setMapping] = useState({})

  // Recompute normalized rows + stats whenever mapping or rows change.
  const result = useMemo(() => {
    if (!rows.length) return null
    return applyMapping(rows, mapping)
  }, [rows, mapping])

  const mappedRequired = REQUIRED_FIELDS.every((k) => mapping[k])

  const resetAll = () => {
    setStepIndex(0)
    setFilename('')
    setHeaders([])
    setRows([])
    setMapping({})
    setError(null)
    setBusy(false)
  }

  const handleFile = async (file) => {
    if (!file) return
    if (!isSupportedFile(file)) {
      setError('Unsupported file. Please choose a .csv, .xlsx, or .xls file.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const parsed = await parseFile(file)
      if (!parsed.headers.length) {
        throw new Error('No columns were found in that file. Is the first row a header row?')
      }
      if (!parsed.rows.length) {
        throw new Error('That file has headers but no data rows.')
      }
      setFilename(file.name)
      setHeaders(parsed.headers)
      setRows(parsed.rows)
      setMapping(autoMatch(parsed.headers))
      setStepIndex(1)
    } catch (err) {
      setError(err?.message || 'Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  const onFileInputChange = (e) => {
    const file = e.target.files && e.target.files[0]
    handleFile(file)
    // Reset the input so re-selecting the same file fires change again.
    e.target.value = ''
  }

  // --- Hard gates ---------------------------------------------------------
  if (!isSupabaseConfigured) {
    return (
      <Card>
        <EmptyState
          title="Upload isn’t available yet"
          hint="Supabase isn’t configured in this environment, so imports can’t be saved. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then reload."
        />
      </Card>
    )
  }

  if (!canEdit) {
    return (
      <Card>
        <EmptyState
          title="You don’t have permission to import"
          hint="Importing claims requires a Biller or Admin role. Ask an administrator if you need upload access."
        />
      </Card>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Import claims</h2>
          <p className="page-sub muted">
            Bring unpaid claims into the worklist. We’ll match your columns and import the
            open AR for working — nothing here is counted as revenue.
          </p>
        </div>
        {stepIndex > 0 ? (
          <Button variant="secondary" size="sm" onClick={resetAll} disabled={busy}>
            Start over
          </Button>
        ) : null}
      </div>

      <Card>
        <StepIndicator stepIndex={stepIndex} />
        <div className="divider" />

        {error ? (
          <Toast tone="bad" onClose={() => setError(null)}>
            {error}
          </Toast>
        ) : null}

        {/* ---- Step 1: Upload file ---- */}
        {stepIndex === 0 ? (
          <div className="section">
            <div className="panel-title">Choose a file to import</div>
            <p className="muted" style={{ fontSize: 13 }}>
              Upload an unpaid-claims export as <strong>.csv</strong>, <strong>.xlsx</strong>, or{' '}
              <strong>.xls</strong>. The first row should be a header row. You’ll map columns and
              review before anything is committed.
            </p>

            {busy ? (
              <Spinner label="Reading file…" />
            ) : (
              <label
                className="panel"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                  padding: 32,
                  border: `2px dashed ${BRAND.line}`,
                  borderRadius: 12,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: 28 }}>📄</span>
                <span style={{ fontWeight: 650 }}>Click to choose a file</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  .csv, .xlsx, or .xls
                </span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={onFileInputChange}
                  style={{ display: 'none' }}
                />
              </label>
            )}
          </div>
        ) : null}

        {/* ---- Step 2: Map columns ---- */}
        {stepIndex === 1 ? (
          <>
            <ColumnMapper
              headers={headers}
              mapping={mapping}
              onChange={setMapping}
              filename={filename}
            />
            <div className="divider" />
            <div className="row-wrap">
              <Button variant="secondary" onClick={() => setStepIndex(0)}>
                Back
              </Button>
              <Button
                variant="primary"
                onClick={() => setStepIndex(2)}
                disabled={!mappedRequired}
              >
                Next — review
              </Button>
              {!mappedRequired ? (
                <span className="muted">Map all required fields to continue.</span>
              ) : null}
            </div>
          </>
        ) : null}

        {/* ---- Step 3: Review & commit ---- */}
        {stepIndex === 2 && result ? (
          <>
            <ValidationPreview result={result} />
            <div className="divider" />
            <CommitStep
              filename={filename}
              mapping={mapping}
              result={result}
              user={user}
              canEdit={canEdit}
              onCommitted={onCommitted}
            />
            <div className="divider" />
            <div className="row-wrap">
              <Button variant="secondary" onClick={() => setStepIndex(1)}>
                Back to mapping
              </Button>
            </div>
          </>
        ) : null}
      </Card>
    </div>
  )
}
