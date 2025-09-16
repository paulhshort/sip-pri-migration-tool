'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Toast } from '@/components/ui/toast'
import { SipBindingCombobox } from '@/components/sip-binding-combobox'
import { ProgressIndicator } from '@/components/progress-indicator'
import { Download, Loader2, Database, FileText, CheckCircle2, ArrowRight, RefreshCw, Save, Trash, Keyboard } from 'lucide-react'

const formSchema = z.object({
  migrationType: z.enum(['sip-trunk', 'pri'], {
    message: 'Please select a migration type'
  }),
  binding: z.string().min(1, 'Binding name is required'),
  domain: z.string().min(1, 'Domain is required'),
  trunk: z.string().min(1, 'SIP Trunk name is required'),
  account: z.string().min(1, 'Account number is required'),
  location: z.enum(['Chicago', 'Phoenix', 'Ashburn'], {
    message: 'Please select a server location'
  })
})

type FormData = z.infer<typeof formSchema>

type GenerateResponse = {
  summary: {
    pbxLines: number
    didRanges: number
    totalNumbers: number
  }
  files: {
    metaswitch: string
    netsapiens: string
  }
}

type BindingInsight =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | {
      status: 'found'
      details: {
        contactIp?: string
        proxyIp?: string
        mediaIp?: string
        additionalInboundIps: string[]
        sipUsername?: string
      }
    }

type DomainInsight =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'found'; total: number }

type PhoneNumberSummary = {
  number: string
  application?: string
  translationDestinationUser?: string
  translationDestinationHost?: string
  enabled?: 'yes' | 'no'
}

type PhoneNumberInsight =
  | { status: 'idle'; numbers: PhoneNumberSummary[] }
  | { status: 'loading'; numbers: PhoneNumberSummary[] }
  | { status: 'error'; numbers: PhoneNumberSummary[]; message: string }
  | { status: 'loaded'; numbers: PhoneNumberSummary[] }

export function MigrationForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showToast, setShowToast] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error' | 'info'
  }>({ show: false, message: '', type: 'info' })
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false)
  const [bindingInsight, setBindingInsight] = useState<BindingInsight>({ status: 'idle' })
  const [domainInsight, setDomainInsight] = useState<DomainInsight>({ status: 'idle' })
  const [phoneNumberInsight, setPhoneNumberInsight] = useState<PhoneNumberInsight>({ status: 'idle', numbers: [] })

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    control,
    watch,
    setValue,
    getValues
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      migrationType: 'sip-trunk',
      binding: '',
      domain: '',
      trunk: '',
      account: '',
      location: undefined
    }
  })

  // Watch individual fields for auto-save (avoid object identity churn)
  const migrationTypeVal = watch('migrationType')
  const bindingVal = watch('binding')
  const domainVal = watch('domain')
  const trunkVal = watch('trunk')
  const accountVal = watch('account')
  const locationVal = watch('location')

  // Auto-save form values to localStorage when they actually change
  useEffect(() => {
    const values = {
      migrationType: migrationTypeVal,
      binding: bindingVal || '',
      domain: domainVal || '',
      trunk: trunkVal || '',
      account: accountVal || '',
      location: locationVal,
    }
    const hasAny = Object.values(values).some(v => (typeof v === 'string' ? v.length > 0 : Boolean(v)))
    if (hasAny) {
      localStorage.setItem('sip-pri-form-data', JSON.stringify(values))
      const iso = new Date().toISOString()
      localStorage.setItem('sip-pri-form-saved-at', iso)
      setLastSaved(new Date(iso))
    }
  }, [migrationTypeVal, bindingVal, domainVal, trunkVal, accountVal, locationVal])

  // Lookup binding details from ShadowDB with a small debounce
  useEffect(() => {
    const binding = (bindingVal || '').trim()
    if (!binding) {
      setBindingInsight({ status: 'idle' })
      return
    }

    let isCancelled = false
    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setBindingInsight({ status: 'loading' })
      try {
        const response = await fetch('/api/shadowdb/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ binding }),
          signal: controller.signal,
        })

        if (isCancelled) return

        if (response.status === 404) {
          setBindingInsight({ status: 'not-found' })
          return
        }

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          const message = (data as { error?: string }).error || 'Lookup failed'
          setBindingInsight({ status: 'error', message })
          return
        }

        const data = await response.json()
        if (binding !== (bindingVal || '').trim()) {
          return
        }

        setBindingInsight({
          status: 'found',
          details: {
            contactIp: data.contactIp,
            proxyIp: data.proxyIp,
            mediaIp: data.mediaIp,
            additionalInboundIps: Array.isArray(data.additionalInboundIps) ? data.additionalInboundIps : [],
            sipUsername: data.sipUsername,
          },
        })
      } catch (error) {
        if (isCancelled || (error as Error).name === 'AbortError') return
        setBindingInsight({ status: 'error', message: (error as Error).message })
      }
    }, 400)

    return () => {
      isCancelled = true
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [bindingVal])

  // Lookup NetSapiens domain existence (debounced)
  useEffect(() => {
    const domain = (domainVal || '').trim()
    if (!domain) {
      setDomainInsight({ status: 'idle' })
      setPhoneNumberInsight({ status: 'idle', numbers: [] })
      return
    }

    let isCancelled = false
    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setDomainInsight({ status: 'loading' })
      try {
        const response = await fetch(`/api/netsapiens/domains?domain=${encodeURIComponent(domain)}`, {
          signal: controller.signal,
        })

        if (isCancelled) return

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          const message = (data as { error?: string }).error || 'Domain lookup failed'
          setDomainInsight({ status: 'error', message })
          setPhoneNumberInsight({ status: 'idle', numbers: [] })
          return
        }

        const data = await response.json()
        if (domain !== (domainVal || '').trim()) {
          return
        }

        if (data.exists) {
          setDomainInsight({ status: 'found', total: data.total ?? 0 })
        } else {
          setDomainInsight({ status: 'not-found' })
          setPhoneNumberInsight({ status: 'idle', numbers: [] })
        }
      } catch (error) {
        if (isCancelled || (error as Error).name === 'AbortError') return
        setDomainInsight({ status: 'error', message: (error as Error).message })
        setPhoneNumberInsight({ status: 'idle', numbers: [] })
      }
    }, 400)

    return () => {
      isCancelled = true
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [domainVal])

  // Fetch phone numbers once domain lookup confirms existence
  useEffect(() => {
    const domain = (domainVal || '').trim()
    if (domainInsight.status !== 'found' || !domain) {
      return
    }

    let isCancelled = false
    const controller = new AbortController()

    const fetchNumbers = async () => {
      setPhoneNumberInsight({ status: 'loading', numbers: [] })
      try {
        const response = await fetch(`/api/netsapiens/phonenumbers?domain=${encodeURIComponent(domain)}`, {
          signal: controller.signal,
        })

        if (isCancelled) return

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          const message = (data as { error?: string }).error || 'Failed to fetch phone numbers'
          setPhoneNumberInsight({ status: 'error', numbers: [], message })
          return
        }

        const data = await response.json()
        if (domain !== (domainVal || '').trim()) {
          return
        }

        const numbers: PhoneNumberSummary[] = Array.isArray(data.phonenumbers)
          ? data.phonenumbers.map((entry: PhoneNumberSummary) => ({
              number: entry.number,
              application: entry.application,
              translationDestinationHost: entry.translationDestinationHost,
              translationDestinationUser: entry.translationDestinationUser,
              enabled: entry.enabled,
            }))
          : []

        setPhoneNumberInsight({ status: 'loaded', numbers })
      } catch (error) {
        if (isCancelled || (error as Error).name === 'AbortError') return
        setPhoneNumberInsight({ status: 'error', numbers: [], message: (error as Error).message })
      }
    }

    fetchNumbers()

    return () => {
      isCancelled = true
      controller.abort()
    }
  }, [domainInsight, domainVal])

  // Load saved form data on component mount
  useEffect(() => {
    const saved = localStorage.getItem('sip-pri-form-data')
    if (saved) {
      try {
        const parsedData = JSON.parse(saved)
        Object.keys(parsedData).forEach((key) => {
          if (parsedData[key] !== undefined && parsedData[key] !== null) {
            setValue(key as keyof FormData, parsedData[key])
          }
        })
        const savedAt = localStorage.getItem('sip-pri-form-saved-at')
        if (savedAt) setLastSaved(new Date(savedAt))
      } catch (error) {
        console.error('Failed to load saved form data:', error)
      }
    }
  }, [setValue])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + Enter to submit
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!isSubmitting && !result) {
          handleSubmit(onSubmit)()
        }
      }
      
      // Ctrl/Cmd + R to reset form
      if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        event.preventDefault()
        handleReset()
      }

      // Escape to close results
      if (event.key === 'Escape' && result) {
        event.preventDefault()
        handleReset()
      }

      // Ctrl/Cmd + / to show shortcuts
      if ((event.ctrlKey || event.metaKey) && event.key === '/') {
        event.preventDefault()
        setShowKeyboardShortcuts(!showKeyboardShortcuts)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSubmitting, result, showKeyboardShortcuts, handleSubmit])

  // Clear form data
  const clearFormData = () => {
    localStorage.removeItem('sip-pri-form-data')
    localStorage.removeItem('sip-pri-form-saved-at')
    setLastSaved(null)
    reset()
    setShowToast({ show: true, message: 'Form cleared', type: 'info' })
  }

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true)
    setShowProgress(true)
    setError(null)
    setResult(null)
    setShowToast({ show: true, message: 'Starting CSV generation...', type: 'info' })

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json()
        const errorMsg = errorData.error || 'Failed to generate CSVs'
        setError(errorMsg)
        setShowToast({ show: true, message: errorMsg, type: 'error' })
        throw new Error(errorMsg)
      }

      const result: GenerateResponse = await response.json()
      setResult(result)
      
      // Add to generation history
      const historyRecord = {
        binding: data.binding,
        domain: data.domain,
        trunk: data.trunk,
        timestamp: new Date().toISOString(),
        metaswitchFile: result.files.metaswitch.split('=')[1],
        netsapiensFile: result.files.netsapiens.split('=')[1],
        totalNumbers: result.summary.totalNumbers
      }

      // Add to history using global function
      if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).addToGenerationHistory) {
        ((window as unknown as Record<string, unknown>).addToGenerationHistory as (record: typeof historyRecord) => void)(historyRecord)
      }
      
      setShowToast({ 
        show: true, 
        message: `Successfully generated ${result.summary.totalNumbers} phone numbers!`, 
        type: 'success' 
      })
      
      // Clear saved form data after successful generation
      localStorage.removeItem('sip-pri-form-data')
      setLastSaved(null)
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(errorMsg)
      if (!showToast.show) {
        setShowToast({ show: true, message: errorMsg, type: 'error' })
      }
    } finally {
      setIsSubmitting(false)
      setShowProgress(false)
    }
  }

  const handleReset = () => {
    reset()
    setResult(null)
    setError(null)
    setShowToast({ show: false, message: '', type: 'info' })
  }

  return (
    <>
      {showToast.show && (
        <Toast 
          message={showToast.message} 
          type={showToast.type}
          onClose={() => setShowToast({ show: false, message: '', type: 'info' })}
        />
      )}
      
      <div className="space-y-8">
        
        {/* Progress Indicator */}
        <ProgressIndicator 
          isVisible={showProgress} 
          onComplete={() => setShowProgress(false)}
        />

        {/* Keyboard Shortcuts Help */}
        {showKeyboardShortcuts && (
          <Card className="border-[#52B4FA]/20 bg-[#52B4FA]/5">
            <CardHeader>
              <CardTitle className="text-[#52B4FA] flex items-center gap-2">
                <Keyboard className="h-5 w-5" />
                Keyboard Shortcuts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Submit form:</span>
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-xs">Ctrl + Enter</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Reset form:</span>
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-xs">Ctrl + R</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Close results:</span>
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-xs">Escape</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Toggle help:</span>
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-xs">Ctrl + /</kbd>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {result ? (
          <div className="space-y-6">
            {/* Success Summary */}
            <Card className="border-green-500/50 bg-green-500/5">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-green-400" />
                  <div>
                    <CardTitle className="text-green-400">Generation Complete!</CardTitle>
                    <CardDescription className="text-green-300/80">
                      CSV files have been successfully generated and are ready for download
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">{result.summary.pbxLines}</div>
                    <div className="text-sm text-green-300/80">PBX Lines</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">{result.summary.didRanges}</div>
                    <div className="text-sm text-green-300/80">DID Ranges</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">{result.summary.totalNumbers}</div>
                    <div className="text-sm text-green-300/80">Total Numbers</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Download Cards */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-[#52B4FA]/20 hover:border-[#52B4FA]/40 transition-colors group">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Database className="h-6 w-6 text-[#52B4FA]" />
                    <div>
                      <CardTitle className="text-lg">Metaswitch Import</CardTitle>
                      <CardDescription>PBX DID Range format for Metaswitch system</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button 
                    size="lg" 
                    className="w-full group-hover:shadow-lg transition-shadow" 
                    onClick={() => window.open(result.files.metaswitch, '_blank')}
                  >
                    <Download className="w-5 h-5 mr-2" />
                    Download Metaswitch CSV
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-[#52B4FA]/20 hover:border-[#52B4FA]/40 transition-colors group">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <FileText className="h-6 w-6 text-[#52B4FA]" />
                    <div>
                      <CardTitle className="text-lg">NetSapiens Import</CardTitle>
                      <CardDescription>Expanded individual numbers for SIP routing</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button 
                    size="lg" 
                    className="w-full group-hover:shadow-lg transition-shadow" 
                    onClick={() => window.open(result.files.netsapiens, '_blank')}
                  >
                    <Download className="w-5 h-5 mr-2" />
                    Download NetSapiens CSV
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Button variant="outline" size="lg" onClick={handleReset} className="w-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              Generate Another CSV
            </Button>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-3">
                    <Database className="h-6 w-6 text-[#52B4FA]" />
                    Migration Configuration
                  </CardTitle>
                  <CardDescription>
                    Enter the migration details to generate CSV files for Metaswitch and NetSapiens systems
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {lastSaved && (
                    <div className="flex items-center gap-1 text-xs text-green-400">
                      <Save className="h-3 w-3" />
                      Auto-saved
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearFormData}
                    className="text-gray-400 hover:text-red-400"
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowKeyboardShortcuts(!showKeyboardShortcuts)}
                    className="text-gray-400 hover:text-[#52B4FA]"
                  >
                    <Keyboard className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="migrationType">
                    Migration Type
                    <span className="text-[#52B4FA] ml-1">*</span>
                  </Label>
                  <Select id="migrationType" {...register('migrationType')}>
                    <option value="sip-trunk">SIP Trunk</option>
                    <option value="pri">PRI</option>
                  </Select>
                  <p className="text-xs text-gray-400">
                    Choose SIP Trunk to run the existing CSV workflow or PRI to enable Adtran automation steps
                  </p>
                  {errors.migrationType && (
                    <p className="text-sm text-red-400 flex items-center gap-1">
                      <span className="w-1 h-1 bg-red-400 rounded-full"></span>
                      {errors.migrationType.message}
                    </p>
                  )}
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="binding">
                      Metaswitch Configured SIP Binding
                      <span className="text-[#52B4FA] ml-1">*</span>
                    </Label>
                    <Controller
                      name="binding"
                      control={control}
                      render={({ field }) => (
                        <SipBindingCombobox
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder="Search and select a SIP binding..."
                        />
                      )}
                    />
                    <p className="text-xs text-gray-400">
                      Search through all SIP bindings configured in Metaswitch ShadowDB
                    </p>
                    {bindingInsight.status === 'loading' && (
                      <p className="text-xs text-gray-400 flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> Looking up binding details...
                      </p>
                    )}
                    {bindingInsight.status === 'not-found' && (
                      <p className="text-xs text-yellow-400">Binding not found in ShadowDB. Double-check the name.</p>
                    )}
                    {bindingInsight.status === 'error' && (
                      <p className="text-xs text-red-400">ShadowDB lookup failed: {bindingInsight.message}</p>
                    )}
                    {bindingInsight.status === 'found' && (
                      <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-3 text-xs text-gray-200 space-y-1">
                        {bindingInsight.details.contactIp && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Contact IP</span>
                            <span>{bindingInsight.details.contactIp}</span>
                          </div>
                        )}
                        {bindingInsight.details.sipUsername && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">SIP Username</span>
                            <span>{bindingInsight.details.sipUsername}</span>
                          </div>
                        )}
                        {bindingInsight.details.additionalInboundIps.length > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Additional IPs</span>
                            <span className="text-right max-w-[12rem] truncate" title={bindingInsight.details.additionalInboundIps.join(', ')}>
                              {bindingInsight.details.additionalInboundIps.join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    {errors.binding && (
                      <p className="text-sm text-red-400 flex items-center gap-1">
                        <span className="w-1 h-1 bg-red-400 rounded-full"></span>
                        {errors.binding.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="domain">
                      NetSapiens Domain
                      <span className="text-[#52B4FA] ml-1">*</span>
                    </Label>
                    <Input
                      id="domain"
                      placeholder="stlawrenceparish.com"
                      {...register('domain')}
                    />
                    <p className="text-xs text-gray-400">
                      The target domain for NetSapiens routing
                    </p>
                    {domainInsight.status === 'loading' && (
                      <p className="text-xs text-gray-400 flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> Checking domain in NetSapiens...
                      </p>
                    )}
                    {domainInsight.status === 'found' && (
                      <p className="text-xs text-green-400">
                        Domain already exists in NetSapiens ({domainInsight.total} record{domainInsight.total === 1 ? '' : 's'}).
                      </p>
                    )}
                    {domainInsight.status === 'not-found' && (
                      <p className="text-xs text-yellow-400">
                        Domain not found. It will need to be created before provisioning.
                      </p>
                    )}
                    {domainInsight.status === 'error' && (
                      <p className="text-xs text-red-400">Domain lookup failed: {domainInsight.message}</p>
                    )}
                    {errors.domain && (
                      <p className="text-sm text-red-400 flex items-center gap-1">
                        <span className="w-1 h-1 bg-red-400 rounded-full"></span>
                        {errors.domain.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="trunk">
                      NetSapiens SIP Trunk Name
                      <span className="text-[#52B4FA] ml-1">*</span>
                    </Label>
                    <Input
                      id="trunk"
                      placeholder="stlawrence"
                      {...register('trunk')}
                    />
                    <p className="text-xs text-gray-400">
                      The SIP trunk identifier for routing
                    </p>
                    {errors.trunk && (
                      <p className="text-sm text-red-400 flex items-center gap-1">
                        <span className="w-1 h-1 bg-red-400 rounded-full"></span>
                        {errors.trunk.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="account">
                      Customer Account Number
                      <span className="text-[#52B4FA] ml-1">*</span>
                    </Label>
                    <Input
                      id="account"
                      placeholder="11308"
                      {...register('account')}
                    />
                    <p className="text-xs text-gray-400">
                      The account number for billing and notes
                    </p>
                    {errors.account && (
                      <p className="text-sm text-red-400 flex items-center gap-1">
                        <span className="w-1 h-1 bg-red-400 rounded-full"></span>
                        {errors.account.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">
                    NetSapiens Preferred Server Location
                    <span className="text-[#52B4FA] ml-1">*</span>
                  </Label>
                  <Select id="location" {...register('location')}>
                    <option value="">Select server location</option>
                    <option value="Chicago">🏢 US Midwest (Chicago)</option>
                    <option value="Phoenix">🌵 US West (Phoenix)</option>
                    <option value="Ashburn">🏛️ US East (Ashburn)</option>
                  </Select>
                  <p className="text-xs text-gray-400">
                    Determines the PBX phone number for Metaswitch CSV
                  </p>
                  {errors.location && (
                    <p className="text-sm text-red-400 flex items-center gap-1">
                      <span className="w-1 h-1 bg-red-400 rounded-full"></span>
                      {errors.location.message}
                    </p>
                  )}
                </div>

                {domainInsight.status === 'found' && (
                  <div className="space-y-2">
                    <Label>Existing Phone Numbers</Label>
                    <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-3">
                      {phoneNumberInsight.status === 'loading' && (
                        <p className="text-xs text-gray-400 flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" /> Fetching phone numbers...
                        </p>
                      )}
                      {phoneNumberInsight.status === 'error' && (
                        <p className="text-xs text-red-400">Failed to load numbers: {phoneNumberInsight.message}</p>
                      )}
                      {phoneNumberInsight.status === 'loaded' && (
                        <div className="space-y-2">
                          {phoneNumberInsight.numbers.length === 0 ? (
                            <p className="text-xs text-gray-400">No numbers currently assigned to this domain.</p>
                          ) : (
                            <>
                              <p className="text-xs text-gray-400">
                                Showing up to 10 numbers already present in NetSapiens.
                              </p>
                              <ul className="space-y-1 text-xs text-gray-200 max-h-40 overflow-y-auto">
                                {phoneNumberInsight.numbers.slice(0, 10).map((entry) => (
                                  <li key={entry.number} className="flex justify-between gap-2 border-b border-white/5 pb-1 last:border-none last:pb-0">
                                    <span className="font-mono text-sm">{entry.number}</span>
                                    <span className="text-gray-400">
                                      {entry.application === 'to-user' ? `FXS ${entry.translationDestinationUser}` : entry.application === 'to-connection' ? 'Trunk' : 'Unassigned'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {error && (
                  <Card className="border-red-500/50 bg-red-500/10">
                    <CardContent className="pt-6">
                      <p className="text-red-400 text-sm flex items-center gap-2">
                        <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                        {error}
                      </p>
                    </CardContent>
                  </Card>
                )}

                <div className="pt-4">
                  <Button 
                    type="submit" 
                    disabled={isSubmitting} 
                    size="lg"
                    className="w-full"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Generating CSVs...
                      </>
                    ) : (
                      <>
                        Generate CSVs
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
