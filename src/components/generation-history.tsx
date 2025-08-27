'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Clock, Trash2, RefreshCw } from 'lucide-react'

type GenerationRecord = {
  id: string
  binding: string
  domain: string
  trunk: string
  timestamp: string
  metaswitchFile: string
  netsapiensFile: string
  totalNumbers: number
}

export function GenerationHistory() {
  const [history, setHistory] = useState<GenerationRecord[]>([])
  const [isClearing, setIsClearing] = useState(false)

  // Load history from localStorage on component mount
  useEffect(() => {
    const stored = localStorage.getItem('sip-pri-generation-history')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setHistory(parsed)
      } catch (error) {
        console.error('Failed to parse history from localStorage:', error)
      }
    }
  }, [])

  // Add a new generation to history
  const addToHistory = (record: Omit<GenerationRecord, 'id'>) => {
    const newRecord: GenerationRecord = {
      ...record,
      id: Date.now().toString()
    }
    
    const updatedHistory = [newRecord, ...history].slice(0, 10) // Keep last 10 records
    setHistory(updatedHistory)
    localStorage.setItem('sip-pri-generation-history', JSON.stringify(updatedHistory))
  }

  // Clear all history
  const clearHistory = () => {
    setIsClearing(true)
    setTimeout(() => {
      setHistory([])
      localStorage.removeItem('sip-pri-generation-history')
      setIsClearing(false)
    }, 500)
  }

  // Download file
  const downloadFile = async (filename: string) => {
    try {
      const response = await fetch(`/api/download?file=${encodeURIComponent(filename)}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        window.URL.revokeObjectURL(url)
      } else {
        console.error('Download failed:', response.statusText)
      }
    } catch (error) {
      console.error('Download error:', error)
    }
  }

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString()
  }

  // Expose addToHistory function globally so it can be called from migration-form
  useEffect(() => {
    (window as unknown as Record<string, unknown>).addToGenerationHistory = addToHistory
  }, [addToHistory])

  if (history.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#52B4FA]" />
            Recent Generations
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={clearHistory}
            disabled={isClearing}
            className="text-gray-400 hover:text-red-400"
          >
            {isClearing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {history.map((record) => (
            <div
              key={record.id}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 border border-gray-700"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-white">{record.binding}</span>
                  <span className="text-xs text-gray-400">→</span>
                  <span className="text-sm text-[#52B4FA]">{record.domain}</span>
                </div>
                <div className="text-xs text-gray-400">
                  {formatTimestamp(record.timestamp)} • {record.totalNumbers} numbers
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadFile(record.metaswitchFile)}
                  className="text-gray-400 hover:text-white"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Metaswitch
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadFile(record.netsapiensFile)}
                  className="text-gray-400 hover:text-white"
                >
                  <Download className="h-4 w-4 mr-1" />
                  NetSapiens
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}