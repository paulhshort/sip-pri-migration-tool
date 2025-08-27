import * as React from "react"
import { CheckCircle, XCircle, AlertCircle, Info, X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ToastProps {
  title?: string
  message: string
  type?: 'success' | 'error' | 'warning' | 'info'
  onClose?: () => void
}

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
}

const styles = {
  success: "border-green-500/50 bg-green-500/10 text-green-400",
  error: "border-red-500/50 bg-red-500/10 text-red-400", 
  warning: "border-yellow-500/50 bg-yellow-500/10 text-yellow-400",
  info: "border-blue-500/50 bg-blue-500/10 text-blue-400",
}

export function Toast({ title, message, type = 'info', onClose }: ToastProps) {
  const Icon = icons[type]
  
  React.useEffect(() => {
    if (onClose) {
      const timer = setTimeout(onClose, 5000)
      return () => clearTimeout(timer)
    }
  }, [onClose])

  return (
    <div className={cn(
      "fixed top-4 right-4 max-w-md rounded-lg border p-4 shadow-lg transition-all duration-200 animate-in slide-in-from-top-1",
      styles[type]
    )}>
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          {title && <div className="font-semibold">{title}</div>}
          <div className="text-sm opacity-90">{message}</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}