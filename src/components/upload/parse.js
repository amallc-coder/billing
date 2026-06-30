// ============================================================================
// File parsing — turns an uploaded CSV/XLSX File into { headers, rows }.
//   headers : array of source column names (strings, in source order)
//   rows    : array of plain objects keyed by source header (all string values)
// ============================================================================
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

const CSV_EXT = /\.csv$/i
const XLSX_EXT = /\.(xlsx|xls)$/i

export function isSupportedFile(file) {
  return !!file && (CSV_EXT.test(file.name) || XLSX_EXT.test(file.name))
}

// Build the ordered header list from a set of row objects. Papa gives us
// `meta.fields`; SheetJS does not, so we derive headers from the union of keys
// across the parsed rows (preserving first-seen order).
function headersFromRows(rows) {
  const seen = []
  const set = new Set()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!set.has(key)) {
        set.add(key)
        seen.push(key)
      }
    }
  }
  return seen
}

function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = (results.data || []).filter(
          (r) => r && Object.keys(r).length > 0,
        )
        const headers =
          results.meta && results.meta.fields && results.meta.fields.length
            ? results.meta.fields.filter((h) => h != null && h !== '')
            : headersFromRows(rows)
        resolve({ headers, rows })
      },
      error: (err) => reject(err),
    })
  })
}

async function parseXlsx(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const firstSheetName = wb.SheetNames[0]
  if (!firstSheetName) return { headers: [], rows: [] }
  const sheet = wb.Sheets[firstSheetName]
  // raw:false → dates/numbers come back as strings; defval:'' → no missing keys.
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
  const headers = headersFromRows(rows)
  return { headers, rows }
}

// Returns a promise of { headers, rows }. Throws on unsupported types.
export async function parseFile(file) {
  if (!file) throw new Error('No file provided.')
  if (CSV_EXT.test(file.name)) return parseCsv(file)
  if (XLSX_EXT.test(file.name)) return parseXlsx(file)
  throw new Error('Unsupported file type. Please upload a .csv, .xlsx or .xls file.')
}
