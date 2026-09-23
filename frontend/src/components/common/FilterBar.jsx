import { Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function FilterBar({ filters = [], onChange, onReset, right }) {
  const handleChange = (id, value) => {
    onChange?.(id, value)
  }

  return (
    <div className="flex flex-col gap-3 border-b border-border bg-card px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="flex flex-1 flex-wrap items-end gap-3">
        {filters.map((filter) => (
          <div key={filter.id} className="flex min-w-[10rem] flex-col gap-1.5">
            {filter.label ? (
              <Label htmlFor={`filter-${filter.id}`} className="text-xs text-muted-foreground">
                {filter.label}
              </Label>
            ) : null}
            {filter.type === "select" ? (
              <Select
                value={filter.value ?? ""}
                onValueChange={(value) => handleChange(filter.id, value)}
              >
                <SelectTrigger id={`filter-${filter.id}`} className="w-full sm:w-44">
                  <SelectValue placeholder={filter.placeholder ?? "All"} />
                </SelectTrigger>
                <SelectContent>
                  {(filter.options ?? []).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id={`filter-${filter.id}`}
                  value={filter.value ?? ""}
                  placeholder={filter.placeholder ?? "Search"}
                  onChange={(event) => handleChange(filter.id, event.target.value)}
                  className="w-full pl-8 sm:w-52"
                />
              </div>
            )}
          </div>
        ))}
        {onReset ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="gap-1.5 text-muted-foreground"
          >
            <X className="size-3.5" />
            Reset
          </Button>
        ) : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  )
}

export default FilterBar
