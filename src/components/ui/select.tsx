"use client"

import * as React from "react"
import { cn } from "cn"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu"

// Radix's own Select never placed its popup in this setup: the content mounted off-screen with no
// coordinates (both the item-aligned and the popper strategy), so nothing appeared when a trigger was
// clicked. The same primitives that back the dropdown menu do position correctly, so this select is
// built on them and keeps the same public API as the shadcn component.

type SelectContextValue = {
  value: string
  setValue: (value: string) => void
  disabled: boolean
}

const SelectContext = React.createContext<SelectContextValue | null>(null)

function useSelectContext(component: string) {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error(`<${component}> must be rendered inside <Select>`)
  return context
}

function Select({
  value,
  defaultValue = "",
  onValueChange,
  name,
  disabled = false,
  children,
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  name?: string
  disabled?: boolean
  children: React.ReactNode
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue)
  const current = value ?? uncontrolled

  const context = React.useMemo<SelectContextValue>(
    () => ({
      value: current,
      disabled,
      setValue: (next: string) => {
        setUncontrolled(next)
        onValueChange?.(next)
      },
    }),
    [current, disabled, onValueChange]
  )

  return (
    <SelectContext.Provider value={context}>
      <DropdownMenu>
        {children}
        {name ? <input type="hidden" name={name} value={current} readOnly /> : null}
      </DropdownMenu>
    </SelectContext.Provider>
  )
}

function SelectTrigger({
  className,
  size = "default",
  disabled: disabledProp,
  children,
  ...props
}: React.ComponentProps<"button"> & { size?: "sm" | "default" }) {
  const { disabled } = useSelectContext("SelectTrigger")

  return (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        data-slot="select-trigger"
        data-size={size}
        disabled={disabled || disabledProp}
        className={cn(
          "flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="size-4 opacity-50" />
      </button>
    </DropdownMenuTrigger>
  )
}

function SelectContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot="select-content"
      className={cn("max-h-72 min-w-[8rem] overflow-y-auto", className)}
      {...props}
    >
      {children}
    </DropdownMenuContent>
  )
}

function SelectItem({
  value,
  className,
  children,
}: {
  value: string
  className?: string
  children: React.ReactNode
}) {
  const { value: current, setValue } = useSelectContext("SelectItem")

  return (
    <DropdownMenuItem
      data-slot="select-item"
      data-state={current === value ? "checked" : "unchecked"}
      onSelect={() => setValue(value)}
      className={cn("gap-2", className)}
    >
      <span className="flex-1 truncate">{children}</span>
      {current === value ? <CheckIcon className="size-4" /> : null}
    </DropdownMenuItem>
  )
}

/** Renders the current selection inside the trigger: the value is always known to the caller, so the
 * trigger never depends on a popup having been opened to know what to display. */
function SelectValue({
  className,
  children,
  placeholder,
}: {
  className?: string
  children?: React.ReactNode
  placeholder?: React.ReactNode
}) {
  return (
    <span data-slot="select-value" className={cn("line-clamp-1", className)}>
      {children ?? placeholder}
    </span>
  )
}

function SelectLabel({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <span
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
    >
      {children}
    </span>
  )
}

function SelectGroup({ children }: { children?: React.ReactNode }) {
  return <div data-slot="select-group">{children}</div>
}

function SelectSeparator() {
  return <div data-slot="select-separator" className="pointer-events-none -mx-1 my-1 h-px bg-border" />
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
