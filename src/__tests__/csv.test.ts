import { describe, it, expect } from 'vitest'
import { expandRanges, normalizeNumber, generateFileName } from '@/lib/csv'
import { DidRange } from '@/lib/db'

describe('CSV utilities', () => {
  describe('expandRanges', () => {
    it('should expand single number range', () => {
      const ranges: DidRange[] = [
        {
          rangesize: 1,
          firstdirectorynumber: '5867315347',
          lastdirectorynumber: null,
          firstcode: null,
          lastcode: null,
        }
      ]
      
      const result = expandRanges(ranges)
      expect(result).toEqual(['5867315347'])
    })
    
    it('should expand multi-number range', () => {
      const ranges: DidRange[] = [
        {
          rangesize: 3,
          firstdirectorynumber: '5867315347',
          lastdirectorynumber: '5867315349',
          firstcode: null,
          lastcode: null,
        }
      ]
      
      const result = expandRanges(ranges)
      expect(result).toEqual(['5867315347', '5867315348', '5867315349'])
    })
    
    it('should handle multiple ranges', () => {
      const ranges: DidRange[] = [
        {
          rangesize: 2,
          firstdirectorynumber: '1000',
          lastdirectorynumber: null,
          firstcode: null,
          lastcode: null,
        },
        {
          rangesize: 2,
          firstdirectorynumber: '2000',
          lastdirectorynumber: null,
          firstcode: null,
          lastcode: null,
        }
      ]
      
      const result = expandRanges(ranges)
      expect(result).toEqual(['1000', '1001', '2000', '2001'])
    })
    
    it('should deduplicate overlapping ranges', () => {
      const ranges: DidRange[] = [
        {
          rangesize: 3,
          firstdirectorynumber: '1000',
          lastdirectorynumber: null,
          firstcode: null,
          lastcode: null,
        },
        {
          rangesize: 3,
          firstdirectorynumber: '1001',
          lastdirectorynumber: null,
          firstcode: null,
          lastcode: null,
        }
      ]
      
      const result = expandRanges(ranges)
      expect(result).toEqual(['1000', '1001', '1002', '1003'])
    })
    
    it('should handle invalid ranges gracefully', () => {
      const ranges: DidRange[] = [
        {
          rangesize: 0,
          firstdirectorynumber: '1000',
          lastdirectorynumber: null,
          firstcode: null,
          lastcode: null,
        },
        {
          rangesize: 2,
          firstdirectorynumber: 'invalid',
          lastdirectorynumber: null,
          firstcode: null,
          lastcode: null,
        },
        {
          rangesize: 2,
          firstdirectorynumber: '2000',
          lastdirectorynumber: null,
          firstcode: null,
          lastcode: null,
        }
      ]
      
      const result = expandRanges(ranges)
      expect(result).toEqual(['2000', '2001'])
    })
  })
  
  describe('normalizeNumber', () => {
    it('should strip non-digit characters', () => {
      expect(normalizeNumber('(248) 687-7799')).toBe('2486877799')
      expect(normalizeNumber('248-687-7799')).toBe('2486877799')
      expect(normalizeNumber('248.687.7799')).toBe('2486877799')
      expect(normalizeNumber('2486877799')).toBe('2486877799')
      expect(normalizeNumber('+1-248-687-7799')).toBe('12486877799')
    })
    
    it('should handle empty and invalid inputs', () => {
      expect(normalizeNumber('')).toBe('')
      expect(normalizeNumber('abc')).toBe('')
      expect(normalizeNumber('---')).toBe('')
    })
  })
  
  describe('generateFileName', () => {
    it('should generate metaswitch filename', () => {
      const filename = generateFileName('metaswitch', 'Test Binding')
      expect(filename).toMatch(/^metaswitch_test_binding_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.csv$/)
    })
    
    it('should generate netsapiens filename', () => {
      const filename = generateFileName('netsapiens', 'Henry Ford Hospital Det - SIP')
      expect(filename).toMatch(/^netsapiens_henry_ford_hospital_det___sip_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.csv$/)
    })
    
    it('should handle special characters in binding name', () => {
      const filename = generateFileName('metaswitch', 'Test@#$%^&*()Binding')
      expect(filename).toMatch(/^metaswitch_test_________binding_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.csv$/)
    })
  })
})