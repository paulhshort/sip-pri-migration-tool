'use client'

import { useEffect, useState, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, CheckCircle2, Database, FileText } from 'lucide-react'

type ProgressStep = {
  id: string
  label: string
  status: 'pending' | 'loading' | 'completed' | 'error'
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  description?: string
}

interface ProgressIndicatorProps {
  isVisible: boolean
  onComplete?: () => void
}

const INITIAL_STEPS: ProgressStep[] = [
  {
    id: 'connect',
    label: 'Connecting to ShadowDB',
    status: 'pending',
    icon: Database,
    description: 'Establishing database connection'
  },
  {
    id: 'query',
    label: 'Querying PBX Lines',
    status: 'pending',
    icon: Database,
    description: 'Searching for directory numbers'
  },
  {
    id: 'ranges',
    label: 'Finding DID Ranges',
    status: 'pending',
    icon: Database,
    description: 'Pattern matching for related ranges'
  },
  {
    id: 'generate',
    label: 'Generating CSV Files',
    status: 'pending',
    icon: FileText,
    description: 'Creating Metaswitch and NetSapiens files'
  }
]


export function ProgressIndicator({ isVisible, onComplete }: ProgressIndicatorProps) {
  const [steps, setSteps] = useState<ProgressStep[]>(INITIAL_STEPS.map(s => ({ ...s })))

  const [currentStep, setCurrentStep] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)

  // Update elapsed time while visible
  useEffect(() => {
    if (!isVisible) return

    const start = Date.now()
    setElapsedTime(0)

    const interval = setInterval(() => {
      setElapsedTime(Date.now() - start)
    }, 100)

    return () => clearInterval(interval)
  }, [isVisible])

  // Keep latest onComplete in a ref to avoid re-triggering effect
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  // Simulate progress steps when becoming visible
  useEffect(() => {
    if (!isVisible) {
      // Reset when not visible
      setSteps(INITIAL_STEPS.map(s => ({ ...s })))
      setCurrentStep(0)
      setElapsedTime(0)
      return
    }

    let cancelled = false

    const run = async () => {
      const stepDurations = [1000, 1500, 2000, 1000] // Approximate durations

      for (let i = 0; i < INITIAL_STEPS.length && !cancelled; i++) {
        // Mark current step as loading
        setSteps(prev => prev.map((step, index) => ({
          ...step,
          status: index === i ? 'loading' : index < i ? 'completed' : 'pending'
        })))
        setCurrentStep(i)

        // Wait for step duration (this would be replaced with actual API calls)
        await new Promise(resolve => setTimeout(resolve, stepDurations[i]))

        if (cancelled) return

        // Mark current step as completed
        setSteps(prev => prev.map((step, index) => ({
          ...step,
          status: index <= i ? 'completed' : 'pending'
        })))
      }

      if (!cancelled) {
        setTimeout(() => {
          onCompleteRef.current?.()
        }, 500)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [isVisible])

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    if (minutes > 0) {
      return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`
    }
    return `${seconds}s`
  }

  const getStepIcon = (step: ProgressStep) => {
    const IconComponent = step.icon

    if (step.status === 'loading') {
      return <Loader2 className="h-4 w-4 animate-spin text-[#52B4FA]" />
    } else if (step.status === 'completed') {
      return <CheckCircle2 className="h-4 w-4 text-green-400" />
    } else {
      return <IconComponent className="h-4 w-4 text-gray-500" />
    }
  }

  if (!isVisible) return null

  return (
    <Card className="border-[#52B4FA]/20 bg-[#52B4FA]/5">
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-white">Generating CSV Files</h3>
            <div className="text-sm text-gray-400">
              {formatTime(elapsedTime)}
            </div>
          </div>

          <div className="space-y-3">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  step.status === 'loading'
                    ? 'bg-[#52B4FA]/10 border border-[#52B4FA]/30'
                    : step.status === 'completed'
                    ? 'bg-green-500/10'
                    : 'bg-gray-800/30'
                }`}
              >
                <div className="flex-shrink-0">
                  {getStepIcon(step)}
                </div>
                <div className="flex-1">
                  <div className={`font-medium ${
                    step.status === 'loading' ? 'text-[#52B4FA]' :
                    step.status === 'completed' ? 'text-green-400' : 'text-gray-400'
                  }`}>
                    {step.label}
                  </div>
                  {step.description && (
                    <div className="text-sm text-gray-500 mt-1">
                      {step.description}
                    </div>
                  )}
                </div>
                {step.status === 'loading' && (
                  <div className="text-xs text-gray-400">
                    Processing...
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 bg-gray-800 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#52B4FA] to-green-400 transition-all duration-500 ease-out"
              style={{
                width: `${((currentStep + 1) / steps.length) * 100}%`
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}