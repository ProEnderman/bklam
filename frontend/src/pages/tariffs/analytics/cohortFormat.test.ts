import { describe, it, expect } from 'vitest'
import { formatCohortCellValue } from './cohortFormat'

describe('formatCohortCellValue', () => {
  it('returns "—" for null', () => {
    expect(formatCohortCellValue(null)).toBe('—')
  })

  it('returns "—" for undefined', () => {
    expect(formatCohortCellValue(undefined)).toBe('—')
  })

  it('returns "0.0%" for 0 (not empty)', () => {
    expect(formatCohortCellValue(0)).toBe('0.0%')
  })

  it('formats all percentages with 1 decimal', () => {
    expect(formatCohortCellValue(4.2)).toBe('4.2%')
    expect(formatCohortCellValue(100)).toBe('100.0%')
    expect(formatCohortCellValue(15)).toBe('15.0%')
  })
})
