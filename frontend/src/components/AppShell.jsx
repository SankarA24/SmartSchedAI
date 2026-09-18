import { Link, useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, LogOut, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";

/**
 * Shared application frame: left sidebar (brand, navigation, theme toggle,
 * logout) plus a main content area. Used by every authenticated page so all
 * three portals share one look.
 *
 * Props:
 *  - brand:   { title, subtitle, icon? }         icon is a lucide component
 *  - nav:     [{ id, label, path, icon, badge? }] badge is an optional number
 *  - onLogout?: () => void                       defaults to clearing storage
 *  - children: page content
 */
export function AppShell({ brand, nav = [], onLogout, children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggle } = useTheme();

  const BrandIcon = brand?.icon || CalendarDays;

  const handleLogout = () => {
    if (onLogout) return onLogout();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  };

  const isActive = (path) => location.pathname === path;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar (desktop) */}
      <aside className="print:hidden sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3 px-5 pt-6 pb-5">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BrandIcon className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{brand?.title || "SmartSchedAI"}</div>
            {brand?.subtitle && (
              <div className="truncate text-xs text-muted-foreground">{brand.subtitle}</div>
            )}
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.id || item.path}
                to={item.path}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm transition-colors duration-150",
                  active
                    ? "border-primary bg-sidebar-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                )}
              >
                {Icon && <Icon className="size-4 shrink-0" />}
                <span className="truncate">{item.label}</span>
                {item.badge > 0 && (
                  <span className="ml-auto rounded-md bg-primary/12 px-1.5 text-xs font-medium tabular-nums text-primary">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-0.5 border-t border-sidebar-border px-3 py-3">
          <button
            type="button"
            onClick={toggle}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-foreground"
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            <span>{isDark ? "Light mode" : "Dark mode"}</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut className="size-4" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact header (mobile) */}
        <header className="print:hidden sticky top-0 z-20 flex items-center gap-2 overflow-x-auto border-b border-border bg-background/95 px-3 py-2 backdrop-blur-sm lg:hidden">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BrandIcon className="size-4" />
          </div>
          <nav className="flex flex-1 items-center gap-1">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.id || item.path}
                  to={item.path}
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors duration-150",
                    active
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {Icon && <Icon className="size-4" />}
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={toggle}
            aria-label="Toggle theme"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Log out"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LogOut className="size-4" />
          </button>
        </header>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Small page header used at the top of every page body. */
export function PageHeader({ title, description, actions }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1>{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Standalone theme toggle for pages outside the shell (for example Login). */
export function ThemeToggle({ className }) {
  const { isDark, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground",
        className
      )}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export default AppShell;
