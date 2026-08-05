import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  required?: boolean
}

export function DocumentNumberAutocomplete({ value, onChange, suggestions, required }: Props) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const query = value.trim().toLowerCase()
  const filtered = query === ""
    ? suggestions.slice(0, 8)
    : suggestions.filter((s) => s.toLowerCase().includes(query)).slice(0, 8)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || filtered.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % filtered.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length)
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault()
      onChange(filtered[activeIndex])
      setOpen(false)
      setActiveIndex(-1)
    } else if (e.key === "Escape") {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <Label htmlFor="doc-number">
        Document Number {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          id="doc-number"
          ref={inputRef}
          placeholder="e.g. INV-2026-001"
          className="pl-9"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          required={required}
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
            <ul className="max-h-60 overflow-y-auto p-1">
              {filtered.map((name, idx) => (
                <li
                  key={name}
                  role="option"
                  aria-selected={idx === activeIndex}
                  className={cn(
                    "flex cursor-pointer items-center rounded-sm px-3 py-2 text-sm outline-none transition-colors",
                    idx === activeIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onChange(name)
                    setOpen(false)
                    setActiveIndex(-1)
                    inputRef.current?.focus()
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
