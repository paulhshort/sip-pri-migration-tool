"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import Fuse from "fuse.js"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface SipBindingComboboxProps {
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function SipBindingCombobox({
  value,
  onValueChange,
  placeholder = "Select a SIP binding...",
  className,
}: SipBindingComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [bindings, setBindings] = React.useState<string[]>([])
  const [filteredBindings, setFilteredBindings] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")

  const fuse = React.useMemo(
    () => new Fuse(bindings, {
      threshold: 0.3,
      includeScore: true,
      shouldSort: true,
    }),
    [bindings]
  )

  React.useEffect(() => {
    const fetchBindings = async () => {
      setLoading(true)
      try {
        const response = await fetch('/api/bindings')
        if (response.ok) {
          const data = await response.json()
          setBindings(data.bindings || [])
          setFilteredBindings(data.bindings || [])
        } else {
          console.error('Failed to fetch bindings:', response.statusText)
        }
      } catch (error) {
        console.error('Error fetching bindings:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchBindings()
  }, [])

  const handleSearch = React.useCallback((search: string) => {
    setSearchValue(search)
    
    if (!search.trim()) {
      setFilteredBindings(bindings)
      return
    }

    const results = fuse.search(search)
    setFilteredBindings(results.map(result => result.item))
  }, [bindings, fuse])

  const selectedBinding = bindings.find(binding => binding === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between bg-gray-800 border-gray-600 text-white hover:bg-gray-700",
            !value && "text-gray-400",
            className
          )}
        >
          {selectedBinding || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0 bg-gray-800 border-gray-600" align="start">
        <Command className="bg-gray-800">
          <CommandInput 
            placeholder="Search bindings..." 
            className="text-white border-0 focus:ring-0"
            value={searchValue}
            onValueChange={handleSearch}
          />
          <CommandList className="max-h-60">
            {loading ? (
              <CommandEmpty className="text-gray-400">Loading bindings...</CommandEmpty>
            ) : filteredBindings.length === 0 ? (
              <CommandEmpty className="text-gray-400">No bindings found.</CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredBindings.map((binding) => (
                  <CommandItem
                    key={binding}
                    value={binding}
                    onSelect={(currentValue) => {
                      onValueChange(currentValue === value ? "" : binding)
                      setOpen(false)
                      setSearchValue("")
                    }}
                    className="text-white hover:bg-gray-700 cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 text-blue-400",
                        value === binding ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {binding}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}