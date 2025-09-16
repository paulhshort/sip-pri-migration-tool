import { describe, it, expect, beforeEach, vi } from 'vitest'

let mockQuery: ReturnType<typeof vi.fn>

vi.mock('@/lib/db', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}))

import { getConfiguredSipBinding } from '@/lib/shadowdb'

describe('getConfiguredSipBinding', () => {
  beforeEach(() => {
    mockQuery = vi.fn()
  })

  it('returns normalized binding details when record exists', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          baseinformation_name: 'TestBinding',
          baseinformation_contactipaddress: ' 10.10.10.10 ',
          baseinformation_proxyipaddress: null,
          baseinformation_mediaipaddress: ' ',
          baseinformation_additionalinboundcontactipaddresses: '192.168.1.1, 192.168.1.2;192.168.1.3',
          baseinformation_sipusername: ' binding_user ',
        },
      ],
    })

    const result = await getConfiguredSipBinding('TestBinding')
    expect(result).not.toBeNull()
    expect(result?.contactIp).toBe('10.10.10.10')
    expect(result?.proxyIp).toBeUndefined()
    expect(result?.mediaIp).toBeUndefined()
    expect(result?.additionalInboundIps).toEqual(['192.168.1.1', '192.168.1.2', '192.168.1.3'])
    expect(result?.sipUsername).toBe('binding_user')
  })

  it('returns null when no matching rows are found', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    const result = await getConfiguredSipBinding('missing')
    expect(result).toBeNull()
  })

  it('throws when binding name is empty', async () => {
    await expect(getConfiguredSipBinding('   ')).rejects.toThrow('Binding name is required')
  })
})
