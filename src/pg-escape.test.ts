'use strict'

/**
 * Unit tests for PostgreSQL escape utilities
 */

import { describe, it, expect } from 'vitest'
import { ident, literal } from './pg-escape'

describe('pg-escape', () => {
  describe('ident()', () => {
    it('should return valid identifiers without quotes', () => {
      expect(ident('username')).toBe('username')
      expect(ident('table_name')).toBe('table_name')
      expect(ident('column123')).toBe('column123')
      expect(ident('_private')).toBe('_private')
      expect(ident('name$')).toBe('name$')
    })

    it('should quote reserved words (lowercase)', () => {
      expect(ident('select')).toBe('"select"')
      expect(ident('from')).toBe('"from"')
      expect(ident('where')).toBe('"where"')
      expect(ident('table')).toBe('"table"')
      expect(ident('user')).toBe('"user"') // 'user' is a PostgreSQL reserved word
      expect(ident('end')).toBe('"end"')
    })

    it('should quote reserved words (uppercase)', () => {
      expect(ident('SELECT')).toBe('"SELECT"')
      expect(ident('FROM')).toBe('"FROM"')
      expect(ident('WHERE')).toBe('"WHERE"')
      expect(ident('TABLE')).toBe('"TABLE"')
    })

    it('should quote reserved words (mixed case)', () => {
      expect(ident('Select')).toBe('"Select"')
      expect(ident('From')).toBe('"From"')
      expect(ident('Where')).toBe('"Where"')
    })

    it('should quote identifiers with spaces', () => {
      expect(ident('table name')).toBe('"table name"')
      expect(ident('column name')).toBe('"column name"')
    })

    it('should quote identifiers with special characters', () => {
      expect(ident('col-name')).toBe('"col-name"')
      expect(ident('col.name')).toBe('"col.name"')
      expect(ident('col@name')).toBe('"col@name"')
    })

    it('should escape double quotes in identifiers', () => {
      expect(ident('table"name')).toBe('"table""name"')
      expect(ident('col""umn')).toBe('"col""""umn"')
      expect(ident('"quoted"')).toBe('"""quoted"""')
    })

    it('should not quote mixed case identifiers (PostgreSQL will lowercase them)', () => {
      // Note: Mixed case identifiers match the valid pattern /^[a-z_][a-z0-9_$]*$/i
      // PostgreSQL will convert these to lowercase unless explicitly quoted in the SQL
      expect(ident('userId')).toBe('userId')
      expect(ident('tableName')).toBe('tableName')
      expect(ident('columnID')).toBe('columnID')
    })

    it('should quote identifiers starting with numbers', () => {
      expect(ident('123table')).toBe('"123table"')
      expect(ident('9column')).toBe('"9column"')
    })

    it('should throw error for null or undefined', () => {
      expect(() => ident(null as any)).toThrow('identifier required')
      expect(() => ident(undefined as any)).toThrow('identifier required')
    })

    it('should handle AWS-specific reserved words', () => {
      expect(ident('aes128')).toBe('"aes128"')
      expect(ident('aes256')).toBe('"aes256"')
      expect(ident('backup')).toBe('"backup"')
      expect(ident('credentials')).toBe('"credentials"')
      expect(ident('delta')).toBe('"delta"')
    })
  })

  describe('literal()', () => {
    it('should return NULL for null and undefined', () => {
      expect(literal(null)).toBe('NULL')
      expect(literal(undefined)).toBe('NULL')
    })

    it('should escape simple strings', () => {
      expect(literal('hello')).toBe("'hello'")
      expect(literal('world')).toBe("'world'")
      expect(literal('test123')).toBe("'test123'")
    })

    it('should escape single quotes', () => {
      expect(literal("it's")).toBe("'it''s'")
      expect(literal("can't")).toBe("'can''t'")
      expect(literal("'quoted'")).toBe("'''quoted'''")
    })

    it('should escape backslashes with E prefix', () => {
      expect(literal('back\\slash')).toBe("E'back\\\\slash'")
      expect(literal('path\\to\\file')).toBe("E'path\\\\to\\\\file'")
      expect(literal('\\')).toBe("E'\\\\'")
    })

    it('should handle strings with both quotes and backslashes', () => {
      expect(literal("it's\\bad")).toBe("E'it''s\\\\bad'")
      expect(literal("'test'\\path")).toBe("E'''test''\\\\path'")
    })

    it('should escape empty strings', () => {
      expect(literal('')).toBe("''")
    })

    it('should handle arrays of strings', () => {
      expect(literal(['a', 'b', 'c'])).toBe("('a', 'b', 'c')")
      expect(literal(['hello', 'world'])).toBe("('hello', 'world')")
    })

    it('should handle arrays with quoted strings', () => {
      expect(literal(["it's", "can't"])).toBe("('it''s', 'can''t')")
    })

    it('should handle arrays with backslashes', () => {
      expect(literal(['path\\to', 'file'])).toBe("(E'path\\\\to', 'file')")
    })

    it('should handle arrays with null values', () => {
      expect(literal(['a', null, 'c'])).toBe("('a', NULL, 'c')")
      expect(literal([null, null])).toBe('(NULL, NULL)')
    })

    it('should handle empty arrays', () => {
      expect(literal([])).toBe('()')
    })

    it('should handle nested arrays', () => {
      expect(literal([['a', 'b'], ['c', 'd']])).toBe("(('a', 'b'), ('c', 'd'))")
    })

    it('should convert non-string values to strings', () => {
      expect(literal(123)).toBe("'123'")
      expect(literal(true)).toBe("'true'")
      expect(literal(false)).toBe("'false'")
    })

    it('should handle special characters', () => {
      expect(literal('line\nbreak')).toBe("'line\nbreak'")
      expect(literal('tab\there')).toBe("'tab\there'")
      expect(literal('quote"mark')).toBe("'quote\"mark'")
    })

    it('should handle unicode characters', () => {
      expect(literal('hello 🌍')).toBe("'hello 🌍'")
      expect(literal('café')).toBe("'café'")
      expect(literal('日本語')).toBe("'日本語'")
    })
  })
})
