'use client'

import { useState } from 'react'
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
import { Download, Loader2, Database, FileText, CheckCircle2, ArrowRight, RefreshCw } from 'lucide-react'

const formSchema = z.object({
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

export function MigrationForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showToast, setShowToast] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error' | 'info'
  }>({ show: false, message: '', type: 'info' })

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    control
  } = useForm<FormData>({
    resolver: zodResolver(formSchema)
  })

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true)
    setError(null)
    setResult(null)
    setShowToast({ show: true, message: 'Connecting to ShadowDB...', type: 'info' })

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
      setShowToast({ 
        show: true, 
        message: `Successfully generated ${result.summary.totalNumbers} phone numbers!`, 
        type: 'success' 
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(errorMsg)
      if (!showToast.show) {
        setShowToast({ show: true, message: errorMsg, type: 'error' })
      }
    } finally {
      setIsSubmitting(false)
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
              <CardTitle className="flex items-center gap-3">
                <Database className="h-6 w-6 text-[#52B4FA]" />
                Migration Configuration
              </CardTitle>
              <CardDescription>
                Enter the migration details to generate CSV files for Metaswitch and NetSapiens systems
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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