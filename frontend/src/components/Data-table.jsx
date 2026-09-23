

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/common/EmptyState"
import { Search, Filter, MoreHorizontal } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export function DataTable({
  data,
  columns,
  searchKey,
  loading = false,
  onEdit,
  onDelete,
  onView,
  entityName = "courses",
  empty,
}) {
  const [searchTerm, setSearchTerm] = useState("")
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState("asc")

  // Filter by search
  const filteredData = data.filter((item) => {
    if (!searchTerm || !searchKey) return true
    const value = item[searchKey]
    return String(value).toLowerCase().includes(searchTerm.toLowerCase())
  })

  // Sort data
  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortColumn) return 0
    const aValue = String(a[sortColumn] || "")
    const bValue = String(b[sortColumn] || "")
    if (sortDirection === "asc") return aValue.localeCompare(bValue)
    else return bValue.localeCompare(aValue)
  })

  const handleSort = (column) => {
    if (sortColumn === column) setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-full max-w-sm rounded-xl" />
          <Skeleton className="h-12 w-28 rounded-xl" />
        </div>
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder={`Search ${entityName}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-12 h-12 rounded-xl"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-12 px-6 rounded-xl"
        >
          <Filter className="h-4 w-4 mr-2" />
          Filter
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={`text-muted-foreground font-semibold py-4 px-6 ${
                    column.sortable ? "cursor-pointer transition-colors" : ""
                  }`}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className="flex items-center gap-2">
                    {column.label}
                    {column.sortable && sortColumn === column.key && (
                      <span className="text-primary font-bold text-sm">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </TableHead>
              ))}
              {(onEdit || onDelete || onView) && (
                <TableHead className="w-[80px] text-muted-foreground font-semibold py-4 px-6">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="py-4 px-6">
                  {empty ? (
                    <EmptyState {...empty} />
                  ) : (
                    <EmptyState
                      icon={Search}
                      title={`No ${entityName} found`}
                      description={
                        searchTerm ? `No results for "${searchTerm}".` : undefined
                      }
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              sortedData.map((item) => (
                <TableRow
                  key={item._id}
                  className="group"
                >
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className="py-4 px-6 text-foreground transition-colors"
                    >
                      {column.render ? column.render(item) : String(item[column.key] || "")}
                    </TableCell>
                  ))}
                  {(onEdit || onDelete || onView) && (
                    <TableCell className="py-4 px-6">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-10 w-10 p-0 text-muted-foreground hover:text-foreground rounded-xl transition-colors"
                          >
                            <MoreHorizontal className="h-5 w-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="rounded-xl"
                        >
                          {onView && (
                            <DropdownMenuItem
                              onClick={() => onView(item)}
                              className="rounded-lg"
                            >
                              View
                            </DropdownMenuItem>
                          )}
                          {onEdit && (
                            <DropdownMenuItem
                              onClick={() => onEdit(item)}
                              className="rounded-lg"
                            >
                              Edit
                            </DropdownMenuItem>
                          )}
                          {onDelete && (
                            <DropdownMenuItem
                              onClick={() => onDelete(item)}
                              className="text-destructive focus:text-destructive rounded-lg"
                            >
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground bg-card px-4 py-2 rounded-xl border border-border">
          Showing <span className="text-primary font-semibold">{sortedData.length}</span> of{" "}
          <span className="text-primary font-semibold">{data.length}</span> {entityName}
          {searchTerm && (
            <span className="text-foreground">
              {" "}
              for "<span className="text-primary font-medium">{searchTerm}</span>"
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
