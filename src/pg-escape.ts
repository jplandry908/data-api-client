'use strict'

/**
 * PostgreSQL identifier and literal escaping utilities
 *
 * This is an internal implementation that provides the same functionality as the
 * pg-escape package, but without requiring external file dependencies (reserved.txt).
 * This ensures the library works correctly with bundlers and in AWS Lambda environments.
 */

/**
 * PostgreSQL reserved words that require quoting when used as identifiers.
 * Source: https://www.postgresql.org/docs/current/sql-keywords-appendix.html
 * Plus AWS Aurora/Redshift specific keywords.
 */
const POSTGRES_RESERVED_WORDS = new Set([
  'aes128',
  'aes256',
  'all',
  'allowoverwrite',
  'analyse',
  'analyze',
  'and',
  'any',
  'array',
  'as',
  'asc',
  'authorization',
  'backup',
  'between',
  'binary',
  'blanksasnull',
  'both',
  'bytedict',
  'case',
  'cast',
  'check',
  'collate',
  'column',
  'constraint',
  'create',
  'credentials',
  'cross',
  'current_date',
  'current_time',
  'current_timestamp',
  'current_user',
  'current_user_id',
  'default',
  'deferrable',
  'deflate',
  'defrag',
  'delta',
  'delta32k',
  'desc',
  'disable',
  'distinct',
  'do',
  'else',
  'emptyasnull',
  'enable',
  'encode',
  'encrypt',
  'encryption',
  'end',
  'except',
  'explicit',
  'false',
  'for',
  'foreign',
  'freeze',
  'from',
  'full',
  'globaldict256',
  'globaldict64k',
  'grant',
  'group',
  'gzip',
  'having',
  'identity',
  'ignore',
  'ilike',
  'in',
  'initially',
  'inner',
  'intersect',
  'into',
  'is',
  'isnull',
  'join',
  'leading',
  'left',
  'like',
  'limit',
  'localtime',
  'localtimestamp',
  'lun',
  'luns',
  'lzo',
  'lzop',
  'minus',
  'mostly13',
  'mostly32',
  'mostly8',
  'natural',
  'new',
  'not',
  'notnull',
  'null',
  'nulls',
  'off',
  'offline',
  'offset',
  'old',
  'on',
  'only',
  'open',
  'or',
  'order',
  'outer',
  'overlaps',
  'parallel',
  'partition',
  'percent',
  'placing',
  'primary',
  'raw',
  'readratio',
  'recover',
  'references',
  'rejectlog',
  'resort',
  'restore',
  'right',
  'select',
  'session_user',
  'similar',
  'some',
  'sysdate',
  'system',
  'table',
  'tag',
  'tdes',
  'text255',
  'text32k',
  'then',
  'to',
  'top',
  'trailing',
  'true',
  'truncatecolumns',
  'union',
  'unique',
  'user',
  'using',
  'verbose',
  'wallet',
  'when',
  'where',
  'with',
  'without'
])

/**
 * Check if an identifier is valid (doesn't need quoting).
 * A valid unquoted identifier:
 * - Starts with a letter (a-z) or underscore
 * - Contains only letters, digits, underscores, or dollar signs
 * - Is not a reserved word
 *
 * @param id - The identifier to check
 * @returns true if the identifier doesn't need quoting
 */
function isValidIdentifier(id: string): boolean {
  // Check if it's a reserved word (case-insensitive)
  if (POSTGRES_RESERVED_WORDS.has(id.toLowerCase())) {
    return false
  }

  // Check if it matches the pattern for valid identifiers
  return /^[a-z_][a-z0-9_$]*$/i.test(id)
}

/**
 * Quote an identifier by wrapping it in double quotes and escaping any internal quotes.
 *
 * @param id - The identifier to quote
 * @returns The quoted identifier
 */
function quoteIdentifier(id: string): string {
  // Escape any double quotes by doubling them
  const escaped = id.replace(/"/g, '""')
  return `"${escaped}"`
}

/**
 * Escape a PostgreSQL identifier (table name, column name, etc.).
 * If the identifier is valid and not a reserved word, it's returned as-is.
 * Otherwise, it's wrapped in double quotes with internal quotes escaped.
 *
 * @param val - The identifier to escape
 * @returns The escaped identifier
 * @throws Error if val is null or undefined
 */
export function ident(val: string): string {
  if (val == null) {
    throw new Error('identifier required')
  }

  return isValidIdentifier(val) ? val : quoteIdentifier(val)
}

/**
 * Escape a PostgreSQL literal value (for use in SQL strings).
 * Handles:
 * - null → NULL
 * - arrays → (val1, val2, ...)
 * - strings → 'escaped string' or E'escaped string' (with backslashes)
 *
 * @param val - The value to escape
 * @returns The escaped literal
 */
export function literal(val: any): string {
  // Handle null
  if (val == null) {
    return 'NULL'
  }

  // Handle arrays
  if (Array.isArray(val)) {
    const escapedValues = val.map(literal)
    return `(${escapedValues.join(', ')})`
  }

  // Handle strings
  const str = String(val)

  // Check if the string contains backslashes
  const hasBackslash = str.indexOf('\\') !== -1

  // Add E prefix if there are backslashes (PostgreSQL escape string syntax)
  const prefix = hasBackslash ? 'E' : ''

  // Escape single quotes by doubling them
  let escaped = str.replace(/'/g, "''")

  // Escape backslashes by doubling them
  if (hasBackslash) {
    escaped = escaped.replace(/\\/g, '\\\\')
  }

  return `${prefix}'${escaped}'`
}
