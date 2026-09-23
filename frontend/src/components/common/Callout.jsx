import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

/**
 * Thin wrapper over ui/alert.jsx. `tone` maps 1:1 onto the alert's own
 * variants rather than redefining colours here.
 *
 * Props: { tone='info', title?, icon?, children }
 */
export function Callout({ tone = "info", title, icon, children }) {
  const Icon = icon;

  return (
    <Alert variant={tone}>
      {Icon && <Icon />}
      {title && <AlertTitle>{title}</AlertTitle>}
      {children && <AlertDescription>{children}</AlertDescription>}
    </Alert>
  );
}

export default Callout;
