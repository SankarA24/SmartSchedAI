import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChatbotFab } from "@/components/common/ChatbotFab";

const SIDEBAR_STORAGE_KEY = "shell.sidebar";

/** localStorage throws in private browsing / blocked-cookie contexts. */
function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed) {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    /* storage unavailable */
  }
}

/**
 * Shared application frame: collapsible left sidebar (brand, grouped
 * navigation, quick actions) plus a sticky header and a main content area.
 * Used by every authenticated page so all three portals share one look.
 *
 * Props (everything but `children` is optional; the defaults reproduce the
 * original brand/nav/onLogout-only behaviour):
 *  - brand:        { title, subtitle, icon? }             icon is a lucide component
 *  - nav:          [{ id, label, path, icon, badge?, section? }]
 *  - quickActions: [{ id, label, path, icon }]            rendered as a "Quick Actions" group
 *  - header:       { notifications?, onNotificationsClick?, settingsPath?, actions? }
 *  - collapsible:  boolean (default true)                 collapse state kept in localStorage
 *  - chatbot:      { context } | truthy                   renders <ChatbotFab/> when present
 *  - onLogout?:    () => void                             defaults to clearing storage
 *  - children:     page content
 */
export function AppShell({
  brand,
  nav = [],
  quickActions = [],
  header = {},
  collapsible = true,
  chatbot = null,
  onLogout,
  children,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggle } = useTheme();

  const [collapsed, setCollapsed] = useState(() => (collapsible ? readCollapsed() : false));
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile panel whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const BrandIcon = brand?.icon || CalendarDays;

  const {
    notifications,
    onNotificationsClick,
    settingsPath,
    actions: headerActions,
  } = header || {};

  const handleLogout = () => {
    if (onLogout) return onLogout();
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    } catch {
      /* storage unavailable */
    }
    navigate("/login", { replace: true });
  };

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      writeCollapsed(next);
      return next;
    });
  };

  const isActive = (path) => location.pathname === path;

  // Nav items may declare a `section`; everything else lands under
  // "Navigation". Quick actions always form the trailing group.
  const groups = useMemo(() => {
    const ordered = [];
    const bySection = new Map();
    for (const item of nav) {
      const label = item.section || "Navigation";
      if (!bySection.has(label)) {
        const group = { label, items: [] };
        bySection.set(label, group);
        ordered.push(group);
      }
      bySection.get(label).items.push(item);
    }
    if (quickActions.length > 0) {
      ordered.push({ label: "Quick Actions", items: quickActions });
    }
    return ordered;
  }, [nav, quickActions]);

  const showNotifications = typeof notifications === "number" || Boolean(onNotificationsClick);
  const notificationCount = typeof notifications === "number" ? notifications : 0;

  const renderNavItem = (item, isCollapsed) => {
    const Icon = item.icon;
    const active = isActive(item.path);
    const badge = typeof item.badge === "number" ? item.badge : 0;

    const link = (
      <Link
        to={item.path}
        aria-current={active ? "page" : undefined}
        title={isCollapsed ? item.label : undefined}
        className={cn(
          "relative flex items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm transition-colors duration-150",
          isCollapsed && "justify-center px-0",
          active
            ? "border-primary bg-sidebar-accent font-medium text-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        )}
      >
        {Icon && <Icon className="size-4 shrink-0" />}
        {isCollapsed ? (
          <span className="sr-only">{item.label}</span>
        ) : (
          <span className="truncate">{item.label}</span>
        )}
        {badge > 0 &&
          (isCollapsed ? (
            <span className="absolute top-1.5 right-2 size-2 rounded-full bg-primary" />
          ) : (
            <span className="ml-auto rounded-md bg-primary/12 px-1.5 text-xs font-medium tabular-nums text-primary">
              {badge}
            </span>
          ))}
      </Link>
    );

    const key = item.id || item.path;

    if (!isCollapsed) return <div key={key}>{link}</div>;

    return (
      <Tooltip key={key}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  };

  const renderSidebarBody = (isCollapsed, { showCollapseToggle = true } = {}) => (
    <>
      <div
        className={cn(
          "flex items-center gap-3 px-5 pt-6 pb-5",
          isCollapsed && "justify-center px-0"
        )}
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <BrandIcon className="size-4" />
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{brand?.title || "SmartSchedAI"}</div>
            {brand?.subtitle && (
              <div className="truncate text-xs text-muted-foreground">{brand.subtitle}</div>
            )}
          </div>
        )}
      </div>

      <nav className={cn("flex-1 overflow-y-auto px-3 pb-3", isCollapsed && "px-2")}>
        {groups.map((group, index) => (
          <div
            key={group.label}
            className={cn("space-y-0.5", index > 0 && isCollapsed && "mt-3")}
          >
            {!isCollapsed && (
              <div className="px-3 py-2 text-[11px] tracking-wide text-muted-foreground uppercase">
                {group.label}
              </div>
            )}
            {group.items.map((item) => renderNavItem(item, isCollapsed))}
          </div>
        ))}
      </nav>

      {collapsible && showCollapseToggle && (
        <div className={cn("border-t border-sidebar-border px-3 py-3", isCollapsed && "px-2")}>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-foreground",
              isCollapsed && "justify-center px-0"
            )}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="size-4 shrink-0" />
            ) : (
              <PanelLeftClose className="size-4 shrink-0" />
            )}
            {!isCollapsed && <span>Collapse</span>}
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar (desktop) */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex print:hidden",
          collapsible && collapsed ? "w-20" : "w-72"
        )}
      >
        {renderSidebarBody(collapsible && collapsed)}
      </aside>

      {/* Sidebar (mobile) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-72"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Portal navigation and quick actions
          </SheetDescription>
          {renderSidebarBody(false, { showCollapseToggle: false })}
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur-sm print:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground lg:hidden"
          >
            <Menu className="size-4" />
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BrandIcon className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {brand?.title || "SmartSchedAI"}
              </div>
              {brand?.subtitle && (
                <div className="truncate text-xs text-muted-foreground">{brand.subtitle}</div>
              )}
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {headerActions}

            <button
              type="button"
              onClick={toggle}
              aria-label="Toggle theme"
              className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
            >
              {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>

            {showNotifications && (
              <button
                type="button"
                onClick={onNotificationsClick}
                aria-label={
                  notificationCount > 0
                    ? `Notifications, ${notificationCount} unread`
                    : "Notifications"
                }
                className="relative flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
              >
                <Bell className="size-4" />
                {notificationCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-white tabular-nums">
                    {notificationCount > 9 ? "9+" : notificationCount}
                  </span>
                )}
              </button>
            )}

            {settingsPath && (
              <Link
                to={settingsPath}
                aria-label="Settings"
                className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
              >
                <Settings className="size-4" />
              </Link>
            )}

            <button
              type="button"
              onClick={handleLogout}
              aria-label="Log out"
              className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">{children}</div>
        </main>
      </div>

      {chatbot && <ChatbotFab context={chatbot?.context} />}
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
