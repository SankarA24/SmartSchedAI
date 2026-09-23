import { Toaster as Sonner } from "sonner"

import { useTheme } from "@/lib/theme"

const Toaster = ({
  ...props
}) => {
  const { isDark } = useTheme();

  return (
    <Sonner
      theme={isDark ? "dark" : "light"}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "bg-card text-card-foreground border-border",
        },
      }}
      {...props} />
  );
}

export { Toaster }
