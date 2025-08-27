import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          className={cn(
            "flex h-11 w-full appearance-none rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 pr-10 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#52B4FA] focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 focus-visible:border-[#52B4FA] disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-200",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>
    )
  }
)
Select.displayName = "Select"

export { Select }