import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

function Tabs({
  className,
  ...props
}) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props} />
  );
}

const tabsListVariants = cva(
  "text-muted-foreground inline-flex w-fit items-center justify-center",
  {
    variants: {
      variant: {
        underline: "border-b border-border gap-4",
        pill: "bg-muted h-9 rounded-md p-[3px] gap-1",
      },
    },
    defaultVariants: {
      variant: "underline",
    },
  }
)

const tabsTriggerVariants = cva(
  "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap text-sm font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:ring-[3px] transition-[color,box-shadow]",
  {
    variants: {
      variant: {
        underline:
          "border-b-2 border-transparent px-1 py-2.5 text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground",
        pill:
          "h-[calc(100%-1px)] rounded-md border border-transparent px-2 py-1 text-foreground dark:text-muted-foreground data-[state=active]:bg-background data-[state=active]:shadow-sm dark:data-[state=active]:bg-input/30 dark:data-[state=active]:border-input dark:data-[state=active]:text-foreground",
      },
    },
    defaultVariants: {
      variant: "underline",
    },
  }
)

const TabsListContext = React.createContext("underline")

function TabsList({
  className,
  variant = "underline",
  ...props
}) {
  return (
    <TabsListContext.Provider value={variant}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        className={cn(tabsListVariants({ variant }), className)}
        {...props} />
    </TabsListContext.Provider>
  );
}

function TabsTrigger({
  className,
  ...props
}) {
  const variant = React.useContext(TabsListContext)

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props} />
  );
}

function TabsContent({
  className,
  ...props
}) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props} />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
