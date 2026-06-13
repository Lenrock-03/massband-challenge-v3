import Papa from 'papaparse'

// The CSV is imported as a raw string via Vite's ?raw suffix
import rawCsv from '../../data/jahrgangsliste.csv?raw'

let _students = null

/**
 * Returns the parsed student list as an array of name strings.
 * Cached after first call.
 */
export function getStudentList() {
  if (_students) return _students

  const result = Papa.parse(rawCsv.trim(), {
    header: false,
    skipEmptyLines: true,
  })

  _students = result.data
    .flat()
    .map(name => name.trim())
    .filter(Boolean)

  return _students
}
